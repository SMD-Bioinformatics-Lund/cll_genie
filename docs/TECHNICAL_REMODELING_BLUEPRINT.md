# CLL Genie Technical Remodeling Blueprint

**Status:** production migration design  
**Repository reviewed:** `cll_genie`  
**Review date:** 2026-06-27  
**Primary compatibility constraint:** preserve the existing `vquest_results` document shape and values  

## Executive decision

Build a new CLL Genie application as a modular monolith with a decoupled React/TypeScript frontend, a FastAPI/Python backend, MongoDB 3.4 compatibility, a durable background worker, shared local artifact storage, and Nginx as the only externally exposed service. This is a greenfield codebase with functional parity: reuse verified behavior and data contracts, but do not copy the Flask routes, Jinja UI, static assets, or legacy class structure into the new application.

The recommended runtime is:

- React + TypeScript + Vite for the browser application.
- FastAPI + Pydantic for the HTTP API and OpenAPI contract.
- A MongoDB 3.4-compatible synchronous PyMongo driver isolated behind repository interfaces. Current PyMongo Async releases do not target MongoDB 3.4, so do not design the application around Motor or current async-driver-only features. FastAPI can run synchronous repository endpoints in its worker thread pool, and background jobs are synchronous naturally.
- A separate Python worker using the same domain/application package as the API. Celery with Redis is the conservative queue choice; Dramatiq is a smaller acceptable alternative.
- The existing local MongoDB 3.4 service as the system of record. MongoDB backup design is outside this application's scope because the database is already backed up by another organizational service.
- Shared local filesystem storage for uploaded Excel/QC files, raw IMGT ZIPs, extracted files, and versioned HTML/PDF report artifacts. API and worker containers mount the same host directory. Access still goes through an `ArtifactStore` interface so paths, authorization, checksums, and traversal protection remain centralized.
- Nginx as the sole ingress on port 80/443.

Do **not** split this workflow into independently deployed microservices initially. The workflow is cohesive, and premature service boundaries would add failure modes around clinical state transitions. MongoDB 3.4 does not provide multi-document transactions, change streams, or retryable writes, so correctness must come from idempotent commands, unique operation records, atomic single-document updates, compare-and-set revisions, and reconciliation tasks. Keep clear module boundaries so the IMGT worker or report renderer can be separated later without rewriting the domain.

The `vquest_results` collection can and should remain structurally unchanged. The new application should add only MongoDB 3.4-compatible indexes, application validation, atomic dotted-path updates, and separate collections for jobs, rules, reports, artifacts, counters, and audit events. None of those require rewriting an existing `vquest_results` document or keeping legacy application code.

---

# Section 1: Deep Code Logic & Existing Schema Analysis

## 1.1 Repository surface reviewed

The analysis covered:

- Flask initialization, configuration, logging, WSGI entry points, and extensions.
- Every application-owned Python module under `cll_genie/`.
- Current and legacy LymphoTrack registration scripts under `scripts/`.
- Jinja templates, application-owned JavaScript, and CSS/report layouts.
- Dockerfiles, Compose files, shell utilities, environment example, pre-commit configuration, and GitHub workflow.
- Both Extended JSON line fixtures in `.design/`.
- Generated/vendor assets were inventoried but not reverse-engineered: minified jQuery, Plotly, `sorttable.js`, generated JavaScript chunks/source maps, icons, and raster images do not define the server-side clinical workflow.

There is no automated test suite in the repository. `python -m compileall` succeeds, but that only proves syntactic import compilation, not runtime correctness.

## 1.2 Current application topology

The current system is a server-rendered Flask monolith:

```text
Browser
  -> Flask routes + Jinja templates
     -> synchronous pandas/openpyxl parsing
     -> synchronous IMGT HTTP POST
     -> PyMongo calls
     -> local filesystem ZIP/extracted files/HTML reports
MongoDB
  - cll_genie.samples
  - cll_genie.vquest_results
  - coyote.users
External filesystem
  - MiSeq run folders and SampleSheet.csv
  - LymphoTrack Dx Excel and QC files
External IMGT/V-QUEST web endpoint
Clarity
  - no programmatic integration exists in this repository
```

The web request that submits IMGT waits for the entire remote request, ZIP write, extraction, parsing, MongoDB write, and redirect. This couples browser availability to a remote service and makes retries ambiguous.

## 1.3 Sample registration and LymphoTrack result discovery

The active script is `scripts/register_lymphotrack_samples.py`. The `.old.py` file is a superseded implementation and should be retained only in Git history after behavior has been captured by tests.

### Run discovery

The active script:

1. Walks one level under `/data/MiSeq`.
2. Accepts run folders matching `YYMMDD_<instrument>_<run>_<flowcell>` using a strict regular expression.
3. Skips a run if `cll_genie.done` exists.
4. Processes a run only when both `RTAComplete.txt` and `cdm.done` exist.
5. Reads `SampleSheet.csv` and `Data/Intensities/BaseCalls/Stats/Stats.json`.
6. Writes a `cll_genie.done` marker after processing, including when no matching samples are found.

This marker-file protocol is an important operational contract. The new ingestion worker must preserve it during migration, but should write the marker only after a durable ingestion-run record reaches a terminal state.

### SampleSheet parsing

The active parser detects the header by requiring `Sample_ID`, `Description`, and `I7_Index_ID` on one line. It extracts `Instrument Type` from an earlier line. It accepts:

- Clinical IDs matching `\d{2}[A-Z]{2}\d{5}-SHM` at the beginning of `Sample_ID`.
- `POS-SHM`, `NEG-SHM`, and `IGHSHM-SHM` controls, with `-R<run_number>` appended to make the control name run-specific.

The Clarity ID is obtained with `Description.split("_")[1]`. This is brittle: malformed descriptions raise `IndexError`, and CSV is parsed with `str.split(",")`, so quoted commas are not handled. The replacement must use Python's `csv` module, preserve the accepted ID rules as configurable assay rules, and quarantine malformed rows instead of terminating a run.

### Demultiplex statistics

`Stats.json` is traversed through `ConversionResults[].DemuxResults[]`. Per-sample values are summed across lanes:

- `TRR` = sum of `NumberReads`.
- `TRB` = sum of `Yield`.

For controls, the run suffix is removed before looking up the Stats.json `SampleId`.

### Sample document creation

New sample documents contain identity, Clarity/run metadata, raw read/base counts, LymphoTrack availability/path flags, V-QUEST/report flags, QC values, and `date_added`. Controls additionally have `is_control: true`.

The sample fixture shows the QC fields initially as empty strings, while the update path writes numbers. This produces mixed BSON types. Preserve existing records, but validate all newly written QC fields as `number | null`; expose a read adapter that converts legacy `""` to `null`. A later, separately approved data-cleanup migration may normalize these fields.

### LymphoTrack file discovery

The updater queries samples where either `lymphotrack_excel` or `lymphotrack_qc` is false, recursively scans the configured results root, and finds:

- `.xls`, `.xlsx`, or `.xlsm` result workbooks.
- `.fastq_indexQ30.tsv` QC files.

It associates files by substring matching the sample ID in the full path, writes paths and status flags to the sample, parses `totalCount`, `countQ30`, and `indexQ30`, and creates `<file>.added` marker files.

Important defects to remove:

- A PyMongo cursor is consumed by `len(list(samples))` and then deep-copied/iterated; depending on cursor state, no samples may remain for update.
- File association is substring-based and can select the wrong sample when IDs overlap.
- The `.added` marker is created by `touch_file(excel_file)`, which appends `.added`; the naming is intentional but the helper name obscures it.
- The script reads `DB_HOST` and `DB_PORT` but `MongoDBConnection.connect()` constructs `MongoClient()` without using them.
- `Config.set_config()` refers to undefined class attributes.
- There is no unique ingestion key, checksum, provenance record, or transaction tying marker creation to database success.

The new ingestion module should identify files by an explicit filename parser, compute SHA-256 checksums, store provenance, and make processing idempotent using a unique `(run_id, sample_id, artifact_kind, checksum)` key.

## 1.4 LymphoTrack Excel parsing and sequence selection

The web application reads the `Merged Read Summary` sheet with `header=None`; the UI defaults to header row index `4`. Rows before that index become metadata by zipping column 0 to column 1. The next row becomes the column header.

The parser converts comma decimal separators to dots and coerces these fields to numeric values:

- `Rank`
- `Length`
- `Merge count`
- `% total reads`
- `Cumulative %`
- `Mutation rate to partial V-gene (%)`
- `V-coverage`

Filtering then applies:

1. `% total reads >= filtration_cutoff` (the cutoff is cast to `int`, preventing decimal cutoffs).
2. Optional exact `In-frame (Y/N)` match unless the UI value is `B` (both).
3. Optional exact `No Stop codon (Y/N)` match unless the UI value is `B`.

Selected rows are serialized into a semicolon/pipe-delimited string embedded in an HTML checkbox value:

```text
Seq<rank>_<sample>;sequence;merge_count;percent;in_frame;no_stop_codon
```

The next request reparses that browser-controlled string, builds FASTA, and later merges the statistics into IMGT output by sequence ID. This is tamper-prone and fragile when values contain delimiters. The new API must store a server-side `analysis_draft` with typed selected-sequence records and return only an opaque draft ID to the browser.

Required typed representation:

```json
{
  "sequence_id": "Seq1_26MD08532-SHM",
  "rank": 1,
  "nucleotide_sequence": "ACGT...",
  "merge_count": 1890814,
  "total_reads_percent": 71.29,
  "in_frame": true,
  "no_stop_codon": true,
  "source_artifact_id": "...",
  "source_row": 6
}
```

Validate alphabet, non-empty sequence, maximum length, unique sequence ID, numeric ranges, and that the selected record belongs to the sample and current user/session.

## 1.5 IMGT/V-QUEST integration

The UI exposes species/locus choices, molecule type, output files, reference directory settings, indel search, JunctionAnalysis mutation allowances, scFv analysis, and CLL subset search. The current payload fields are:

```text
species, receptorOrLocusType, moleculeType, sequences,
xv_summary, xv_IMGTgappedNt, xv_ntseq, xv_IMGTgappedAA,
xv_AAseq, xv_JUNCTION, xv_V_REGIONmuttable,
xv_V_REGIONmutstatsNt, xv_V_REGIONmutstatsAA,
xv_V_REGIONhotspots, xv_parameters, xv_scFv,
IMGTrefdirSet, IMGTrefdirAlleles, V_REGIONsearchIndel,
nbD_GENE, nbVmut, nbDmut, nbJmut, scfv, cllSubsetSearch,
inputType, outputType, resultType, xv_outputtype,
nb5V_REGIONignoredNt, nb3V_REGIONaddedNt, fileSequences
```

`selected_seqs_merging_rate` is local metadata and must never be sent to IMGT in the remodeled adapter.

The server posts form data synchronously to `https://www.imgt.org/IMGT_vquest/analysis` with a browser-like User-Agent and Referer. It has no connect/read timeout, retry policy, idempotency control, response size limit, TLS policy configuration, or circuit breaker. It logs the full payload, which includes patient sample identifiers and nucleotide sequences and is therefore inappropriate for ordinary application logs.

HTML responses are treated as error pages and parsed with regular expressions plus `requests-html`. Any non-error non-HTML response is assumed to be a ZIP. The ZIP is copied and extracted without explicit path traversal checks, member count limits, or uncompressed-size limits.

The new `ImgtVquestClient` must:

- Be isolated behind a port/interface so external protocol changes affect one adapter.
- Use explicit connect and read timeouts, bounded retries only for safe transport failures, exponential backoff with jitter, and a circuit breaker.
- Record a request fingerprint and job attempt, never the full sequences in ordinary logs.
- Validate status, media type, ZIP signature, maximum compressed/uncompressed size, member count, and safe extraction paths.
- Store the original ZIP immutably before parsing.
- Capture the submitted configuration, IMGT program version, reference release, timestamps, attempt count, and response checksum.
- Treat HTML as a structured remote error and sanitize server messages before display.
- Respect IMGT service terms, availability expectations, and any limits; these must be confirmed with the service owner before production automation is expanded.
- Use a replayable parser test corpus so an IMGT format change fails visibly rather than silently altering reports.

### IMGT output parsing

The application requires three ZIP members:

- `11_Parameters.txt`: tab-separated key/value parameters; `Date` and nucleotide-count lines are discarded.
- `1_Summary.txt`: tab-separated summary rows grouped by `Sequence ID`.
- `6_Junction.txt`: tab-separated junction rows grouped by `Sequence ID`.

Unnamed columns are dropped, empty strings become `None`, and each summary sequence is paired with the same ID in the junction table. The current code assumes every summary ID exists in junction results and keeps only the first row per group. Both assumptions must become explicit validations with a rejected/needs-review job state.

LymphoTrack-derived values are then appended to each sequence summary:

- `Merge Count`
- `Total Reads Per`
- `Inframe`
- `Stop Codon` (the inverse of `No Stop codon == Y`)

These exact field names and value types are part of the existing data contract and must remain unchanged in `vquest_results`.

## 1.6 Existing `vquest_results` schema

The two fixture documents agree with the write/read code. One document represents one sample and deliberately reuses the sample document's MongoDB `_id`:

```json
{
  "_id": "ObjectId(same as samples._id)",
  "name": "26MD08532-SHM",
  "results": {
    "submission_1": {
      "vquest_results": {
        "Seq1_26MD08532-SHM": {
          "summary": { "<IMGT summary columns>": "<typed values>" },
          "junction": { "<IMGT junction columns>": "<typed values>" }
        }
      },
      "vquest_parameters": { "<IMGT parameter label>": "<string value>" },
      "data_added": "BSON datetime",
      "results_zip_file": "/legacy/absolute/path/to/result.zip",
      "submission_comments": [
        {
          "id": "ObjectId",
          "text": "Swedish report conclusion text",
          "time_created": "BSON datetime",
          "author": "Full Name",
          "hidden": false,
          "hidden_by": "",
          "time_hidden": ""
        }
      ]
    }
  }
}
```

The fixture contains the full, verbatim IMGT labels in `summary` and `junction`, including spaces, apostrophes, parentheses, slashes, percent signs, and nullable fields. This is a valuable lossless representation of the upstream result, and normalizing these keys in place would create substantial compatibility risk for little benefit.

### Decision: keep the collection unchanged

No mandatory structural migration is justified. Preserve:

- `_id` equality with the sample `_id`.
- Top-level `name` and `results`.
- Dynamic `submission_N` keys.
- Dynamic per-sequence keys.
- `vquest_results`, `vquest_parameters`, `data_added`, `results_zip_file`, and `submission_comments` names.
- All verbatim IMGT summary/junction labels and current BSON scalar types.

The remodeled backend should use a compatibility repository that maps this document to typed domain objects without changing stored BSON.

### Required non-structural safeguards

1. Retain the intrinsic unique `_id` index and add a non-unique lookup index on `name`. Do not make `name` unique because duplicate sample names are explicitly supported by the current worklist.
2. Update only the affected path, for example `$set: {"results.submission_2": submission_doc}`. Never fetch and rewrite the entire `results` object.
3. Update comment elements with a targeted MongoDB 3.4 positional `$` update. Never fetch and rewrite every submission and comment, and do not use newer `arrayFilters` syntax.
4. Allocate `submission_N` atomically using a separate `submission_counters` collection, initialized from existing maximum submission numbers. Do not infer the next number from dictionary insertion order.
5. Use a unique reservation record and compare-and-set state transitions around counter allocation, job finalization, and result insertion. MongoDB 3.4 cannot wrap these documents in a transaction, so every step must be idempotent and a reconciliation task must complete or flag partial operations.
6. Monitor BSON document size. MongoDB documents have a 16 MiB limit. Reject a submission before it makes the document invalid and raise a migration review if a sample approaches a configured warning threshold (for example 12 MiB).
7. Store new artifact locations as stable paths relative to one configured local artifact root, never arbitrary absolute paths from requests. Resolve existing absolute paths only in the one-time data migration/import tooling if historical artifacts must be retained.
8. Validate unknown IMGT fields permissively: preserve them and alert on schema drift rather than dropping them.
9. Back up and restore the collection byte-for-byte before any cutover rehearsal.

Recommended indexes, which do not change document shape:

```javascript
db.vquest_results.createIndex({ name: 1 }, { name: "ix_vquest_results_name" })
db.samples.createIndex({ name: 1 }, { name: "ix_samples_name" })
db.samples.createIndex({ report: 1, date_added: -1, name: 1 }, { name: "ix_samples_worklist" })
db.samples.createIndex({ run_id: 1, name: 1 }, { name: "ix_samples_run_name" })
```

Do not make `samples.name` unique without a business decision: the UI explicitly detects duplicate sample names, so duplicates are currently an accepted condition.

## 1.7 Existing sample/report schema

The sample collection is both a sample registry and a workflow/report metadata store. In addition to registration fields, routes add:

- `is_eligible_for_vquest`
- `cll_reports.<report_id>` containing path, creation time, submission ID, author, hidden/audit fields, and summary text
- `negative_report` containing report ID, path, date, summary, and author

Boolean `vquest` and `report` values are denormalized status flags. They can disagree with the actual result/report collections after partial failures. During migration, keep them for compatibility but derive API status from authoritative records, then repair the flags asynchronously.

New report artifacts and metadata should live in a dedicated `reports` collection. Because the replacement is a new application rather than a long-running legacy coexistence design, do not dual-write `samples.cll_reports`/`negative_report`. A one-time importer may copy historical report metadata into `reports`; `vquest_results` remains unchanged.

## 1.8 Report generation and clinical logic

### Report data selection

Reports use an allowlist of summary and junction columns. They display sample/IMGT parameters, per-sequence gene/identity/functionality details, merge statistics, mutation classification, CLL subset, conclusion text, and a fixed Swedish method/reference section.

The artifact called a PDF in some icons and comments is currently HTML. The application writes rendered Jinja HTML to disk. `weasyprint` is installed, but no route calls it. The report contains Clarity placeholder tokens:

```text
<PATIENT_NAME>
<PERSONAL_IDENTITY_NUMBER>
<REGISTRATION_DATE>
<SAMPLE_TYPE>
```

There is no Clarity REST/API client, authentication, upload, status polling, or PDF retrieval code. The operational handoff is therefore outside the repository.

### Mutation status logic

The implemented classification is:

```text
V identity < 97.00                 -> M-CLL
97.00 <= V identity <= 97.99       -> Borderline
V identity > 97.99                 -> U-CLL
```

At two decimal precision this makes `>= 98.00` U-CLL, as expected from the stated report text. However, the fixed method paragraph also says `<98%` is M-CLL and then separately says `97-97.99%` is borderline. That prose is internally ambiguous and must be resolved by a clinically authorized owner before rules are activated in production.

For multiple sequences, the conclusion is:

- all U-CLL -> concordant U-CLL text;
- all M-CLL -> concordant M-CLL text;
- all borderline -> borderline text;
- mixed categories -> inconclusive text and referral recommendation.

The sequence count is used to index a Swedish number word list that ends at ten, so more than ten sequences can raise an error.

### Productivity logic

The report proceeds with mutation/subset conclusions only when every result has `Inframe == true` and no result has `Stop Codon == true`. A single nonproductive sequence suppresses those sections for all sequences. This may be intended, but it is a consequential clinical rule and needs explicit acceptance tests.

The one-sequence nonproductive branch recommends RNA-level analysis in Göteborg. The zero-sequence branch duplicates the introductory paragraph. The multi-sequence productive text assumes all submitted sequences are functional based on the aggregate booleans.

### CLL subset logic

The report collects non-null `CLL subset` values:

- one unique subset -> report that subset;
- none -> no subset membership;
- multiple unique subsets -> conflicting #2/#8 assignment and no definitive call.

Subset #2 and #8 append different prognostic statements. Configuration lists subsets #1 through #8, but only #2 and #8 are actually supported by the IMGT request/report logic.

### Comments and report history

Suggested conclusions are saved as submission comments. Exporting a report also creates a new comment containing the final summary. Comments and reports are soft-hidden rather than normally deleted, but deletion routes can remove result submissions and local artifacts.

### Clinical safety requirements for the replacement

- Every report must record the exact result submission, rule-set version, template version, application version, user, timestamp, and artifact checksum.
- A generated conclusion is a draft until a qualified user approves it.
- Published reports must be immutable. Corrections create a superseding version; they never overwrite the original.
- Rule edits require draft/review/approved/retired states and two-person approval if required by the laboratory QMS.
- Golden test cases must cover 96.99, 97.00, 97.99, 98.00, indels, missing identity, nonproductive sequences, mixed multi-sequence states, subset #2, subset #8, conflicting subsets, and no sequences.
- Clinical wording, thresholds, and references require domain-owner sign-off. Software migration must not silently “correct” them.

## 1.9 Authentication, authorization, and security findings

Users are stored in `coyote.users`, separate from the configured application database. `_id` is the username; fields include a Werkzeug password hash, groups, fullname, and optionally email. `admin` and `lymphotrack_admin` confer elevated privileges.

Required corrections:

- The home/worklist route is not protected by `login_required`, exposing sample identifiers to unauthenticated users.
- `update_user` lacks `login_required` and calls `current_user.admin()` directly.
- Several destructive or state-changing operations use GET requests, which permits CSRF and accidental activation.
- The default secret key is `notsosecret`; development/test secrets are hard-coded.
- File paths from MongoDB/request data are passed to filesystem operations. Enforce artifact IDs and root confinement.
- Uploaded workbook filename handling needs basename normalization, size/type checks, and malware policy.
- Report summaries are rendered with `|safe`, creating stored XSS risk.
- Search uses user input as a MongoDB regular expression without escaping or length controls.
- Full IMGT payload logging can expose sample IDs and sequences.
- Exceptions are broadly swallowed, obscuring data corruption and authorization failures.

The replacement must support both local accounts and LDAP authentication behind one identity service. Local passwords use Argon2id. LDAP authentication uses LDAPS or StartTLS, service-account search followed by user bind (or the organization's required bind pattern), configurable base DN/user filter, group-to-role mapping, and timeouts. Never store an LDAP password. Create or update only a small local shadow profile containing username, display name, email, auth source, mapped roles, and last login. Keep at least one audited local emergency administrator so LDAP failure does not make the system unmanageable.

Use secure server-side sessions, CSRF protection, rate limiting, account lockout for local users, generic login failures, explicit RBAC permissions, and an immutable audit log. Do not place bearer tokens in browser local storage; use Secure, HttpOnly, SameSite cookies. The login form can offer an `Organization (LDAP)` / `Local account` selector or apply a deterministic username-domain rule, but it must never reveal whether a username exists in either source.

## 1.10 Notable correctness and maintainability defects

These should be represented by regression tests before migration rather than patched ad hoc in production:

- Application configuration selection checks `cll_app.debug` before environment configuration is loaded, so production configuration is effectively always selected.
- `ColorfulFormatter.format` is indented outside its class; ANSI color codes may reach file logs.
- Result insertion failure calls a nonexistent `delete_cll_results` method on `ResultsHandler`.
- The text-result download expects `detailed_text_file`, which is never stored.
- Submission numbering depends on dynamic-key iteration order and is race-prone.
- Whole nested dictionaries are rewritten, causing lost updates under concurrency.
- Report filename logic passes a stripped submission number into code that again parses underscores; the API contract is inconsistent.
- Boolean expressions such as `elif report_id is not None or report_id != ""` are always true for most inputs.
- `except KeyError or ValueError or TypeError` catches only `KeyError`; the intended form is a tuple.
- Report status uses `len(negative_report_dict)` as if it were report count.
- Template conditions reference the misspelled `lyphotrack_qc`.
- The base template tests `current_user.admin` as a method object instead of calling it.
- The add-user redirect refers to `main_bp.add_user`, although the route belongs to `login_bp`.
- The remove-user template referenced by the route is absent.
- The active registration script ignores configured MongoDB host/port.
- No request timeout exists for IMGT and no queue isolates long work.
- Local absolute artifact paths are persisted, tightly coupling records to one host/container layout.
- Docker development/prod port assumptions are inconsistent, image tags are hard-coded, MongoDB is external, and Compose exposes the app directly.
- Dependency pins are old and include unused packages. Generated frontend chunks coexist with Jinja and should not be treated as source.

---

# Section 2: Tech Stack Recommendation & Capability Assessment

## 2.1 Recommended stack

| Layer | Recommendation | Why it fits CLL Genie |
|---|---|---|
| Frontend | React, TypeScript, Vite, React Router, TanStack Query, React Hook Form + Zod | Typed API consumption, complex workflow forms, table state, safe validation, independent deployment/build |
| UI | An accessible component library approved by the organization; AG Grid Community or TanStack Table for result tables | Handles large structured result tables without embedding raw HTML from pandas |
| Backend API | FastAPI, Pydantic v2, Python 3.12+ | Natural fit for the existing Python/pandas bioinformatics code, explicit schemas, generated OpenAPI, async I/O |
| MongoDB access | MongoDB 3.4-compatible synchronous PyMongo, pinned and isolated in repositories | Preserves current server compatibility; avoids unsupported current-driver features and contains the technical debt to one adapter |
| Queue | Celery + Redis; worker built from the same backend image | Durable retries, independent IMGT/parser/report workloads, operationally familiar |
| Data processing | pandas + openpyxl behind typed parser interfaces | Reuses proven logic while making parsing independently testable |
| Reports | Jinja2 templates + WeasyPrint in a worker; HTML retained for Clarity if required | Deterministic server-side rendering, HTML and PDF artifacts, no browser dependency |
| Artifact storage | Shared local filesystem through an `ArtifactStore` abstraction | Matches the current environment while enforcing safe relative paths, checksums, permissions, and versioned files |
| Database | Existing local MongoDB 3.4 | Preserves current documents; application code compensates for absent transactions/change streams/retryable writes |
| Authentication | Local Argon2id accounts plus LDAP via `ldap3` | Supports emergency/local administration and organizational identities without storing LDAP passwords |
| Ingress | Nginx | Single port, TLS, static frontend, request limits, proxy controls |
| Observability | OpenTelemetry, Prometheus metrics, structured JSON logs, Sentry-compatible error tracking if approved | Correlates API request, job, submission, external call, and report version |
| Testing | pytest, pytest-asyncio, Testcontainers, respx, Hypothesis; Vitest/Testing Library/Playwright | Covers parsers, MongoDB atomicity, external protocol, UI, and clinical golden cases |

FastAPI's in-process `BackgroundTasks` is not sufficient for IMGT or report work: those jobs need durability, retry state, resource controls, and survival across API restarts. FastAPI's own guidance points heavier multi-process work toward a queue such as Celery.

### MongoDB 3.4 compatibility boundary

MongoDB 3.4 is end-of-life and constrains an otherwise modern Python stack. Treat it as an explicit infrastructure adapter, not as a capability the rest of the application can assume:

- Pin the last driver version validated against both MongoDB 3.4 and the selected Python runtime. Prove this combination in CI against a MongoDB 3.4 container before fixing the final Python version; do not assume a current PyMongo release will connect.
- Prefer Python 3.11 if the validated legacy driver cannot build or run reliably on Python 3.12.
- Use synchronous repository methods and synchronous FastAPI route functions for database-heavy calls.
- Do not use sessions, multi-document transactions, change streams, retryable writes, update pipelines, or newer aggregation operators.
- Use atomic `$set`, `$unset`, `$inc`, `$push`, `$addToSet`, `find_one_and_update`, unique indexes, and compare-and-set revision filters supported by 3.4.
- Persist operation/job state before side effects and make every worker step replay-safe.
- Add a startup capability check that verifies server version and fails clearly if code attempts an unsupported feature.

An eventual MongoDB upgrade is desirable technical-debt work, but it is not a prerequisite or hidden requirement of this functional-parity rebuild.

## 2.2 Why FastAPI over Django for the recommended implementation

FastAPI is not inherently “more production-grade” than Django. It is the better fit here because:

- Most of the application is an API plus background scientific processing, not relational CRUD.
- The existing data shape is MongoDB-native and deeply nested.
- Native PyMongo operations are required regardless of framework.
- Pydantic models provide a clean boundary without pretending the upstream IMGT document is relational.
- Django Admin would be useful for rules/users, but it does not outweigh the MongoDB ORM mismatch for the primary result model. A small React admin surface can reuse the same audited API.

Keep the FastAPI application modular, not route-centric. Domain code must have no FastAPI, PyMongo, Celery, pandas, or Jinja imports; those belong in adapters/application services.

## 2.3 Django with MongoDB: explicit capability assessment

MongoDB now maintains an official Django MongoDB Backend for current supported MongoDB releases. It is not an appropriate primary persistence layer for this project's MongoDB 3.4 constraint. Even on a current server it supports ordinary model CRUD, embedded models, indexes, transactions/sessions, and only portions of Django's query model.

It is **not** a reason to assume full MongoDB semantics are available transparently through Django ORM:

- MongoDB's compatibility documentation marks aggregation operations as partially supported.
- MongoDB-specific pipelines use `MongoManager.raw_aggregate()` rather than ordinary Django ORM aggregation.
- Operations not covered by QuerySet or `raw_aggregate()` require direct access through `MongoClient`/PyMongo.
- Embedded models must be typed Django embedded models; arbitrary untyped embedded content is not supported by that modeling layer.
- Some index, relationship, and query features remain partial or unsupported, and `$lookup`-style operations may perform poorly compared with embedded modeling.

For CLL Genie, MongoDB 3.4 plus the dynamic keys `results.submission_N`, dynamic sequence IDs, verbatim IMGT labels, atomic nested updates, positional comment edits, document-size inspection, and arbitrary aggregation/report projections mean a Django implementation would still need a native version-compatible PyMongo repository for `vquest_results`. On newer MongoDB versions, heavy filtering and deep aggregations should bypass the ORM through `raw_aggregate()` or PyMongo; on 3.4, only operators supported by that server may be emitted.

Therefore:

- **Recommended:** FastAPI + direct PyMongo repositories.
- **Acceptable alternative:** Django + Django REST Framework for users/admin/rules, but treat `vquest_results` as an unmanaged/native-PyMongo aggregate. Do not force it into Django models.
- **Not recommended:** third-party ODMs that require field-name normalization or obscure MongoDB operators.

Official references:

- [Django MongoDB Backend feature compatibility](https://www.mongodb.com/docs/languages/python/django-mongodb/current/limitations-upcoming/)
- [Django MongoDB Backend raw queries](https://www.mongodb.com/docs/languages/python/django-mongodb/current/interact-data/raw-queries/)
- [MongoDB migration guidance for PyMongo Async and Motor](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)
- [FastAPI background task caveat](https://fastapi.tiangolo.com/tutorial/background-tasks/#caveat)

## 2.4 Capability and risk table

| Capability | Current | Target |
|---|---|---|
| Sample/run ingestion | Cron-like script + marker files | Idempotent ingestion jobs, provenance, quarantine, marker compatibility |
| Excel parsing | In Flask request | Worker task with typed parser result and fixtures |
| IMGT submission | Blocking request | Durable state machine, bounded retry, immutable raw response |
| MongoDB writes | Whole-object rewrites | MongoDB 3.4-compatible targeted atomic operations, idempotency, compare-and-set, reconciliation |
| Reports | Mutable local HTML | Versioned immutable HTML/PDF with rule/template snapshot |
| Clarity | Manual/out-of-repo | Explicit adapter boundary; manual export first, API integration only with a confirmed contract |
| Authentication | Local Flask session | Local Argon2id + LDAP, hardened server session, group mapping, RBAC |
| Audit | Application logs and hidden flags | Append-only audit events with actor/reason/correlation IDs |
| Deployment | One directly exposed Flask container | Nginx-only ingress; isolated API/worker/Redis, existing MongoDB 3.4 service, shared local artifacts |

## 2.5 Modern web UI and brand system

The replacement UI must preserve all existing functionality while completely replacing the presentation layer. It should feel like a modern clinical workbench: calm, information-dense where needed, and restrained rather than decorative.

### UI foundation

- Use React, TypeScript, Vite, React Router, and TanStack Query as above.
- Use Material UI as the accessible component/design-system base, with a small CLL Genie theme layer. It provides robust forms, dialogs, tables, focus behavior, menus, tooltips, and dark mode without inventing accessibility primitives.
- Use `lucide-react` as the single application icon package. Icons are tree-shaken SVG components, inherit `currentColor`, and work in light/dark themes. Do not carry forward the loose PNG/GIF icon directory or use emoji as action icons.
- Pair every unfamiliar icon action with visible text. Icon-only actions are allowed only for universally understood compact controls and must have an accessible name and tooltip.
- Use a self-hosted variable font if organizational policy permits; otherwise use the system stack. Do not fetch fonts, icons, analytics, or UI assets from a public CDN at runtime.
- Use semantic status chips with icon + label + color; never communicate status by color alone.

### Theme tokens

All components, text, buttons, icons, tables, charts, report previews, and brand assets must use semantic tokens—never hard-coded light-only colors:

```css
:root {
  color-scheme: light;
  --bg-canvas: #f6f8fb;
  --bg-surface: #ffffff;
  --bg-elevated: #ffffff;
  --text-primary: #13212b;
  --text-secondary: #536471;
  --border-subtle: #dbe3e8;
  --brand-primary: #146c74;
  --brand-primary-hover: #0f5960;
  --brand-accent: #c84f7a;
  --focus-ring: #1677ff;
  --status-success: #237a57;
  --status-warning: #9a6700;
  --status-danger: #b42318;
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: #0d1419;
  --bg-surface: #131e25;
  --bg-elevated: #19262f;
  --text-primary: #f1f6f8;
  --text-secondary: #a9bac4;
  --border-subtle: #2b3b45;
  --brand-primary: #5cc4c9;
  --brand-primary-hover: #80d4d8;
  --brand-accent: #f08aad;
  --focus-ring: #74adff;
  --status-success: #6dd3a0;
  --status-warning: #f2c94c;
  --status-danger: #ff8b83;
}
```

Theme behavior:

- Default to the operating-system preference on first visit.
- Store an explicit user choice (`system`, `light`, `dark`) in the profile and local preference for pre-login rendering.
- Apply the theme before React hydrates to prevent a bright flash on the dark login page.
- Test WCAG 2.2 AA contrast, 200% zoom, keyboard-only navigation, visible focus, reduced motion, and high-contrast/forced-colors behavior.
- Keep clinical report output as a separately controlled print theme. A dark application must not produce a dark PDF unless a report template explicitly requires it.

### New logo direction

Replace the shield/stock antibody/icon collage with one simple vector mark: a restrained antibody `Y` whose center negative space forms a DNA helix, enclosed by an open circular path suggesting continuity from sequence to interpretation. The mark should remain recognizable at favicon size and must not contain tiny lettering.

Initial theme-aware vector concepts are included with this blueprint: [symbol mark](assets/cll-genie-mark-concept.svg) and [horizontal lockup](assets/cll-genie-lockup-concept.svg). They are design starting points for stakeholder review, not claims of final organizational brand approval.

Brand deliverables:

```text
frontend/src/assets/brand/cll-genie-mark.svg          symbol only, currentColor + accent
frontend/src/assets/brand/cll-genie-lockup.svg        symbol + “CLL Genie” wordmark
frontend/src/assets/brand/cll-genie-lockup-dark.svg   only if currentColor cannot cover a case
frontend/public/favicon.svg
frontend/public/mask-icon.svg
```

Prefer one theme-aware SVG using `currentColor` and CSS variables over separate light/dark raster files. Provide monochrome and print-safe fallbacks. Avoid gradients in the core mark, effects, shadows, medical crosses, shields, cartoon DNA, or unlicensed regional/organizational branding.

### Login page design

The login route is a focused full-viewport experience, not the normal application shell:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ CLL Genie logo + wordmark                         Theme   Help       │
│                                                                      │
│       Quiet sequence/antibody brand field     ┌──────────────────┐  │
│       “IGHV analysis and reporting”            │ Welcome          │  │
│       one short operational description        │ [LDAP] [Local]   │  │
│                                                │ Username         │  │
│                                                │ Password   Show  │  │
│                                                │ [ Sign in      ] │  │
│                                                │ secure-session  │  │
│                                                └──────────────────┘  │
│ Version vX.Y.Z  •  Environment  •  Service status  •  Privacy       │
└──────────────────────────────────────────────────────────────────────┘
```

- Desktop: two balanced panels with the form in a compact elevated card; mobile: one column with the illustration reduced or removed.
- Display logo, `CLL Genie`, one-line purpose, application version, environment badge outside production, theme control, help/contact link, and a non-sensitive service status.
- Provider selector labels are `Organization account` and `Local account`, not implementation jargon unless staff prefer `LDAP` explicitly.
- Username and password have persistent labels, autocomplete attributes, show/hide password, Caps Lock warning, loading state, keyboard submit, and generic errors.
- The login artwork must be CSS/SVG and theme-aware, subtle enough not to compete with the form.
- Never display MongoDB, LDAP host, stack trace, internal network, or username-existence details.

### Application information architecture

```text
Primary navigation
  Worklist
  Samples
  Analysis jobs
  Reports
  Administration (permission-gated)

Sample workspace tabs
  Overview | LymphoTrack | IMGT/V-QUEST | Reports | Audit
```

Use a responsive left navigation on desktop and drawer on small screens. Keep the sample ID and current status in a sticky context header. Long-running work appears in a persistent jobs tray and dedicated job page, so users never need scripts that disable back/refresh navigation.

Tables use sticky headers, column visibility, safe text rendering, sorting/filtering, pagination, empty/loading/error states, and accessible row actions. Destructive actions use confirmation dialogs showing the exact sample/submission/report and require a reason when clinically relevant.

---

# Section 3: New Architecture & Data Flow

## 3.1 Logical architecture

```text
                         port 443 only
User browser  ------------------------------>  Nginx
                                                  |
                          /                       | /api, /auth, /admin
                          v                       v
                    React static SPA        FastAPI API
                                                  |
                                 +----------------+----------------+
                                 |                |                |
                              MongoDB 3.4      Redis queue     Local artifact volume
                                 ^                |                ^
                                 |                v                |
                                 +---------- Python worker --------+
                                               |   |   |
                                               |   |   +-> report renderer
                                               |   +-----> IMGT/V-QUEST
                                               +---------> LymphoTrack parsers

Run-folder watcher/CLI -> ingestion API or queue -> same application services
Clarity export/import  -> explicit adapter/manual controlled handoff
```

The backend is one deployable codebase used in two process roles: API and worker. This avoids duplicating clinical logic.

## 3.2 Domain modules

- `samples`: sample identity, runs, QC, worklists, duplicate-name behavior.
- `ingestion`: run discovery, SampleSheet parsing, Stats.json parsing, artifact matching.
- `lymphotrack`: workbook parsing, filtering, selected sequence drafts.
- `vquest`: payload validation, external client, ZIP parser, compatibility persistence.
- `reports`: derived facts, rules evaluation, templates, report versions, rendering.
- `rules`: rule lifecycle, validation, simulation, approval, activation.
- `identity`: local/LDAP authentication, user shadow profiles, sessions, and RBAC.
- `audit`: append-only clinical and administrative actions.
- `artifacts`: storage abstraction, checksum, download authorization, retention.

## 3.3 State machines

Analysis jobs should use explicit states:

```text
DRAFT
  -> QUEUED
  -> PARSING_INPUT
  -> SUBMITTING_IMGT
  -> WAITING_IMGT
  -> PARSING_IMGT
  -> VALIDATING_RESULT
  -> PERSISTING_RESULT
  -> SUCCEEDED

Any processing state -> RETRY_SCHEDULED -> prior safe state
Any processing state -> FAILED_RETRYABLE | FAILED_FINAL | NEEDS_REVIEW
Queued/running before external submission -> CANCELLED
```

Record every transition with timestamp, actor/service, attempt, reason, and correlation ID. A retry must reuse a request fingerprint and must never allocate a second `submission_N` after a successful persistence.

Report states:

```text
DRAFT -> GENERATED -> REVIEWED -> PUBLISHED -> SUPERSEDED
                    \-> REJECTED
```

## 3.4 End-to-end data flow

### A. Sample registration

1. The ingestion scheduler scans eligible run folders or receives a run-created event.
2. It verifies completion markers and creates/gets an `ingestion_runs` record keyed by `run_id`.
3. The worker parses `SampleSheet.csv` with a real CSV parser and validates each row.
4. The worker parses Stats.json and aggregates reads/bases per lane and sample.
5. Valid samples are upserted idempotently according to the existing duplicate policy. Invalid rows are stored in `ingestion_errors` and surfaced in admin.
6. Artifacts are discovered using explicit filename rules, checksummed, and registered.
7. Sample compatibility flags/paths are updated.
8. Only after durable success is `cll_genie.done` written. The new application owns this workflow after cutover.

### B. LymphoTrack parsing and sequence selection

1. `POST /api/v1/samples/{sample_object_id}/analysis-drafts` accepts filtering parameters and an existing artifact ID or an uploaded file.
2. The API validates access and queues parsing.
3. The worker parses the workbook and stores a typed draft with metadata, warnings, all filtered rows, parser version, and source checksum.
4. The frontend polls `GET /api/v1/analysis-drafts/{id}` or subscribes through server-sent events.
5. The user selects sequence record IDs; the backend revalidates them and stores the selection server-side.

### C. IMGT execution

1. `POST /api/v1/analysis-drafts/{id}/submissions` validates the configuration and selection.
2. The API creates an `analysis_jobs` record and enqueues it, returning `202 Accepted` with a job URL.
3. The worker reserves the next submission number from `submission_counters`.
4. It constructs FASTA and an allowlisted IMGT payload. Local merge metadata is excluded.
5. It posts through `ImgtVquestClient`, stores the raw response ZIP, and validates/extracts expected members.
6. It parses parameters, summary, and junction results; joins selected LymphoTrack metadata; and runs schema/clinical sanity checks.
7. It atomically writes only `results.submission_N` to the existing `vquest_results` document with a nonexistence precondition. It then advances the job through compare-and-set transitions. If the process stops between documents, reconciliation observes the inserted submission and completes the job instead of resubmitting IMGT.
8. The frontend receives/polls the completed state and fetches the normalized API projection. MongoDB retains the established `vquest_results` shape.

### D. Report generation

1. `POST /api/v1/samples/{id}/submissions/{submission_id}/report-drafts` loads the immutable result submission.
2. A fact builder derives typed facts such as identities, per-sequence statuses, productivity, subset set, counts, and conflicts.
3. The rules engine loads one active approved rule-set for the report type/language/effective date.
4. It evaluates rules deterministically and renders text templates with a strict variable allowlist.
5. The API returns the suggested conclusion and rule trace for user review.
6. A qualified user edits/accepts and submits generation. The worker creates HTML and PDF, stores checksums, and records the exact rule/template/result snapshots.
7. Publishing is a separate authorized action. The published artifact is immutable.

### E. Clarity handoff

Phase 1 must preserve the current workflow: authorized download of Clarity-compatible HTML with placeholder tokens. Record who exported which report version and checksum.

Only after the actual Clarity contract is available should an adapter implement:

```python
class ClarityReportGateway(Protocol):
    async def submit(self, report_version_id: ObjectId) -> ExternalSubmission: ...
    async def status(self, external_id: str) -> ExternalStatus: ...
    async def fetch_final_pdf(self, external_id: str) -> StoredArtifact: ...
```

Patient identifiers should be resolved inside the approved clinical system boundary and should not be added to `vquest_results`.

## 3.5 API surface

Use `/api/v1` and OpenAPI-generated clients. Representative endpoints:

```text
GET    /api/v1/auth/providers                     enabled local/LDAP providers
POST   /api/v1/auth/login                         provider, username, password
POST   /api/v1/auth/logout
GET    /api/v1/me

GET    /api/v1/samples
GET    /api/v1/samples/{sample_id}
GET    /api/v1/samples/{sample_id}/artifacts
POST   /api/v1/samples/{sample_id}/analysis-drafts
GET    /api/v1/analysis-drafts/{draft_id}
PATCH  /api/v1/analysis-drafts/{draft_id}/selection
POST   /api/v1/analysis-drafts/{draft_id}/submissions

GET    /api/v1/jobs/{job_id}
POST   /api/v1/jobs/{job_id}/retry
POST   /api/v1/jobs/{job_id}/cancel

GET    /api/v1/samples/{sample_id}/submissions
GET    /api/v1/samples/{sample_id}/submissions/{submission_id}
GET    /api/v1/samples/{sample_id}/submissions/{submission_id}/raw-zip
POST   /api/v1/samples/{sample_id}/submissions/{submission_id}/comments
PATCH  /api/v1/samples/{sample_id}/submissions/{submission_id}/comments/{comment_id}

POST   /api/v1/samples/{sample_id}/submissions/{submission_id}/report-drafts
POST   /api/v1/report-drafts/{draft_id}/generate
POST   /api/v1/reports/{report_id}/publish
GET    /api/v1/reports/{report_id}/versions/{version}/artifact

GET    /api/v1/admin/report-rules
POST   /api/v1/admin/report-rules
POST   /api/v1/admin/report-rules/{id}/simulate
POST   /api/v1/admin/report-rules/{id}/approve
POST   /api/v1/admin/report-rule-sets/{id}/activate
GET    /api/v1/admin/audit-events
```

Use object IDs as resource identifiers; treat human sample name as searchable/display data because duplicates are currently possible.

## 3.6 Error and concurrency contract

Return RFC 9457 problem details with a stable code, safe user message, correlation ID, and field errors. Never expose external HTML or stack traces.

Require an `Idempotency-Key` for submission and report-generation POSTs. Use ETags/version fields for editable drafts and rules. Return `409 Conflict` on stale revisions rather than overwriting another user's work.

## 3.7 Local and LDAP authentication design

Use one `users` collection for application profiles and local credentials. LDAP remains the authority for LDAP passwords and group membership:

```json
{
  "_id": "normalized-username",
  "auth_sources": ["ldap"],
  "display_name": "Example User",
  "email": "user@example.internal",
  "local_password_hash": null,
  "local_password_changed_at": null,
  "ldap_dn": "uid=user,ou=people,dc=example,dc=internal",
  "roles": ["analyst"],
  "role_sources": {
    "ldap": ["analyst"],
    "local": []
  },
  "enabled": true,
  "last_login_at": { "$date": "..." },
  "last_login_source": "ldap",
  "revision": 4
}
```

Local login:

1. Normalize the username consistently but preserve the display form.
2. Load an enabled profile with `local` in `auth_sources`.
3. Verify Argon2id in constant-time library code; transparently rehash when parameters are upgraded.
4. Apply per-account and per-IP throttling and audit success/failure without logging passwords.

LDAP login:

1. Validate and normalize input; reject LDAP filter metacharacters through library escaping.
2. Connect through LDAPS or StartTLS with certificate verification and short connect/read timeouts.
3. Search for exactly one user using the configured service identity and escaped user filter.
4. Bind as that user with the submitted password. The password exists only in request memory and is never logged or persisted.
5. Resolve permitted LDAP groups, map them through configuration to application roles, and deny login if no access role is mapped.
6. Upsert the shadow profile with display fields, DN, mapped roles, and last-login metadata using a revision check.
7. Create the same server-side session used by local login.

Recommended roles and permissions:

```text
viewer       read samples, QC, results, published reports
analyst      create drafts, submit IMGT, add comments, generate report drafts
reviewer     review/publish reports
rule_admin   edit/simulate report rules
admin        manage local users, mappings, operations
```

LDAP groups map to roles in configuration, not hard-coded Python. Local administrators may grant local roles only to local/emergency accounts unless policy explicitly allows overrides. Every role change is audited. LDAP failure returns a generic organization-login error and does not automatically fall back with the same password to local authentication; the user deliberately selects `Local account`.

---

# Section 4: Dynamic Report Rules Engine (No-Code Updates)

## 4.1 Design principles

Clinical report logic must be editable without a backend deployment, but “no code” must not mean ungoverned arbitrary expressions. Use:

- A small typed condition DSL represented as MongoDB documents.
- Strictly allowlisted facts and operators.
- Sandboxed templates with allowlisted variables and filters.
- Versioned rule sets with effective dates.
- Draft, review, approval, activation, and retirement workflow.
- Simulation against de-identified fixtures before approval.
- Immutable snapshots on every generated report.
- Complete audit records for edits, approvals, activation, and use.

Do not use Python `eval`, JavaScript execution, MongoDB `$where`, or administrator-authored Jinja expressions.

## 4.2 Fact model

The evaluator receives a normalized, read-only fact object, not raw MongoDB:

```json
{
  "report_type": "CLL_IGHV",
  "language": "sv-SE",
  "sequence_count": 1,
  "all_productive": true,
  "any_stop_codon": false,
  "all_in_frame": true,
  "identities": [97.59],
  "mutation_statuses": ["BORDERLINE"],
  "combined_mutation_status": "BORDERLINE",
  "subset_ids": [],
  "subset_count": 0,
  "subset_conflict": false,
  "sequences": [
    {
      "display_id": "Seq1",
      "identity_percent": 97.59,
      "productive": true,
      "subset_id": null
    }
  ]
}
```

The fact builder owns numeric rounding and missing-value behavior. Rules never parse strings such as `"284/291 nt"`.

## 4.3 `report_rules` schema

```json
{
  "_id": { "$oid": "..." },
  "rule_key": "cll_ighv.mutation.borderline.v1",
  "rule_set_id": { "$oid": "..." },
  "version": 1,
  "status": "APPROVED",
  "report_type": "CLL_IGHV",
  "language": "sv-SE",
  "section": "mutation_conclusion",
  "priority": 200,
  "exclusive_group": "mutation_conclusion",
  "stop_on_match": true,
  "effective_from": { "$date": "2026-07-01T00:00:00Z" },
  "effective_to": null,
  "condition": {
    "all": [
      { "fact": "all_productive", "op": "eq", "value": true },
      { "fact": "combined_mutation_status", "op": "eq", "value": "BORDERLINE" }
    ]
  },
  "template": {
    "engine": "restricted_format_v1",
    "text": "Analysen påvisar ett borderline-resultat ({identities_percent} identitet mot IGHV-genen).",
    "variables": ["identities_percent"]
  },
  "citations": [
    {
      "citation_key": "ERIC_2022",
      "display_text": "ERIC Guidelines 2022"
    }
  ],
  "metadata": {
    "title": "Borderline mutation conclusion",
    "description": "Applied when every submitted sequence is productive and combined status is borderline.",
    "clinical_owner": "CLL diagnostics",
    "change_reason": "Initial migration from ReportController",
    "source_reference": "functional-parity specification: mutation conclusion"
  },
  "created_at": { "$date": "..." },
  "created_by": "user-id",
  "reviewed_at": { "$date": "..." },
  "reviewed_by": "different-user-id",
  "approved_at": { "$date": "..." },
  "approved_by": "different-user-id",
  "revision": 3,
  "content_hash": "sha256:..."
}
```

Supported operators should initially be limited to:

```text
eq, ne, lt, lte, gt, gte,
in, not_in, contains, is_null, is_not_null,
all, any, not
```

Array quantifiers can be added explicitly (`all_items`, `any_item`) with a reviewed implementation. Facts and expected value types belong in a `rule_fact_catalog`, so the admin UI can render safe controls and reject invalid comparisons.

## 4.4 Rule-set schema

```json
{
  "_id": { "$oid": "..." },
  "rule_set_key": "cll_ighv_sv",
  "version": 4,
  "status": "ACTIVE",
  "report_type": "CLL_IGHV",
  "language": "sv-SE",
  "effective_from": { "$date": "2026-07-01T00:00:00Z" },
  "effective_to": null,
  "rule_ids": [{ "$oid": "..." }],
  "template_version_id": { "$oid": "..." },
  "thresholds": {
    "m_cll_identity_lt": 97.00,
    "borderline_identity_gte": 97.00,
    "borderline_identity_lte": 97.99,
    "u_cll_identity_gt": 97.99
  },
  "created_by": "...",
  "approved_by": "...",
  "activated_by": "...",
  "content_hash": "sha256:..."
}
```

Only one active set may overlap for `(report_type, language, effective time)`. MongoDB 3.4 cannot enforce that with a transaction or a simple unique index. Serialize activation with a short-lived application lock document acquired by atomic `find_one_and_update`, validate the range again while holding the lock, and run a scheduled overlap audit.

## 4.5 Evaluation algorithm

1. Load the active approved rule set by report type, language, and report effective timestamp.
2. Verify the stored hash and that all referenced rules are approved.
3. Build typed facts from one immutable V-QUEST submission.
4. Sort rules by section, ascending priority, then stable `rule_key`.
5. Evaluate conditions with the allowlisted interpreter.
6. Within an `exclusive_group`, select the first matching rule; include all matching nonexclusive rules.
7. Render templates using only declared variables.
8. Return section text plus a trace containing rule ID/version, inputs used, match outcome, and rendered hash.
9. Store the fact snapshot, rule-set snapshot/hash, match trace, rendered conclusion, and user-edited conclusion in the report version.

Rules are loaded once per generation, not once per sentence. Cache active sets by `(id, version, content_hash)` and invalidate on activation.

## 4.6 Administration workflow

The admin UI should provide:

- Rule list filtered by report type, language, section, and status.
- A structured condition builder populated from the fact catalog.
- Template editor with variable insertion, not arbitrary code.
- Live preview using de-identified fixture cases.
- Diff against the previous version.
- Validation for unreachable rules, gaps/overlaps in threshold ranges, duplicate priorities, missing variables, and conflicting exclusive matches.
- Submit-for-review, approve, activate, retire, and rollback actions with reason fields.
- Separation of duties: an author cannot approve their own change.
- Export/import of a signed rule-set JSON package for controlled promotion between development, validation, and production.

The first rule set should reproduce current functionality exactly. Any wording or threshold correction becomes a separately reviewed later version rather than an accidental migration change.

## 4.7 Suggested indexes

```javascript
db.report_rules.createIndex(
  { rule_set_id: 1, section: 1, priority: 1 },
  { name: "ix_rule_set_evaluation_order" }
)
db.report_rules.createIndex(
  { rule_key: 1, version: 1 },
  { unique: true, name: "uq_rule_key_version" }
)
db.report_rule_sets.createIndex(
  { rule_set_key: 1, version: 1 },
  { unique: true, name: "uq_rule_set_version" }
)
db.audit_events.createIndex({ occurred_at: -1 }, { name: "ix_audit_time" })
```

## 4.8 Is a rules engine the right long-term move?

Yes—provided it remains a governed deterministic decision layer, not a generic script editor. It is one of the strongest architectural moves in this redesign because it separates four concerns that are currently tangled together: scientific facts, clinical decisions, Swedish wording, and HTML presentation.

It makes the system “smarter” safely in stages:

1. **Now: deterministic rules.** Reproduce current thresholds, productivity, subset, negative-result, and multi-sequence behavior with a human-readable trace.
2. **Next: stronger decision support.** Add completeness checks, contradictory-result detection, missing-data warnings, rule coverage analysis, and cohort-safe simulation before activation.
3. **Later: assisted suggestions.** Use historical overrides and approved outcomes to identify where rules need refinement or to rank suggested wording. Recommendations must be visibly labeled and require human acceptance.
4. **Future: validated models.** A statistical or ML model can consume the same versioned fact object and return a recommendation with model version, confidence, and explanation. It should sit beside the deterministic rules, never silently replace them in a clinical report.

To enable that future, capture without exposing patient identity:

- fact snapshot and rule matches;
- generated text and final user-approved text;
- structured override reason, not only free text;
- approval/rejection and reviewer role;
- rule/model/template versions;
- quality-control warnings and final disposition.

Do not train on raw comments casually: they can contain identifying data, inconsistent wording, and selection bias. Any learning component requires a defined intended use, governed dataset, validation, drift monitoring, rollback, and clinical ownership. The rules engine remains the explainable safety baseline even if assisted intelligence is added later.

---

# Section 5: Single-Port Docker Network Architecture (Proxy)

## 5.1 Container design

Production containers:

- `proxy`: Nginx; the only published port.
- `frontend-build`: build stage only; compiled SPA files are copied into the Nginx image. It need not run as a production container.
- `api`: FastAPI/ASGI; internal port 8000 only.
- `worker`: same backend image, Celery worker command; no port.
- `scheduler`: optional Celery Beat process for run scans/reconciliation; no port.
- `mongo`: development/test only, pinned to MongoDB 3.4. Production connects to the existing locally managed MongoDB 3.4 service and does not start or expose another database container.
- `redis`: queue/broker; internal port 6379 only.
- `cll_artifacts` host directory: bind-mounted read/write into API and worker at the same container path. It is local storage, not MinIO or an organizational bucket.

If policy literally requires a separate running frontend container, Nginx may proxy `/` to it, but serving immutable compiled files directly from the proxy is smaller and removes a needless hop.

## 5.2 Exact Nginx routing configuration

```nginx
upstream cll_genie_api {
    server api:8000;
    keepalive 32;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name _;
    server_tokens off;

    # Terminate TLS here in production or listen behind the approved TLS LB.
    # listen 443 ssl http2;
    # ssl_certificate     /run/secrets/tls_cert;
    # ssl_certificate_key /run/secrets/tls_key;

    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 50m;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Frame-Options DENY always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    # Start CSP in report-only mode and tune it before enforcement.
    add_header Content-Security-Policy-Report-Only "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'" always;

    location = /healthz {
        access_log off;
        proxy_pass http://cll_genie_api/health/live;
        proxy_set_header Host $host;
        proxy_set_header X-Request-ID $request_id;
    }

    # Preserve /api/... as seen by FastAPI.
    location /api/ {
        proxy_pass http://cll_genie_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }

    # Local/LDAP login, logout, and server-side session endpoints.
    location /auth/ {
        proxy_pass http://cll_genie_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    # If admin is server-rendered, route it to the backend.
    # If admin is part of the SPA, remove this block and use /api/v1/admin for data.
    location /admin/ {
        proxy_pass http://cll_genie_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # React Router fallback. Never use this for /api, or API 404s become HTML 200s.
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

The `proxy_pass` form is deliberate: no trailing slash means `/api/v1/...` reaches FastAPI unchanged.

## 5.3 Production-oriented Compose blueprint

```yaml
name: cll-genie

services:
  proxy:
    build:
      context: .
      dockerfile: docker/proxy.Dockerfile
    ports:
      - "${CLL_GENIE_PORT:-80}:80"
    depends_on:
      api:
        condition: service_healthy
    networks: [edge, internal]
    read_only: true
    tmpfs: [/var/cache/nginx, /var/run]
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    command: >-
      uvicorn cll_genie_api.main:app
      --host 0.0.0.0 --port 8000
      --proxy-headers --forwarded-allow-ips=*
    env_file: [.env]
    expose: ["8000"]
    depends_on:
      redis: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "python", "-m", "cll_genie_api.healthcheck"]
      interval: 10s
      timeout: 3s
      retries: 10
    networks: [internal]
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - "${CLL_ARTIFACT_ROOT:-/data/lymphotrack/cll_genie_artifacts}:/var/lib/cll-genie/artifacts"
    read_only: true
    tmpfs: [/tmp]
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    command: celery -A cll_genie_api.worker.app worker --loglevel=INFO --concurrency=2
    env_file: [.env]
    depends_on:
      redis: { condition: service_healthy }
    networks: [internal]
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - "${CLL_ARTIFACT_ROOT:-/data/lymphotrack/cll_genie_artifacts}:/var/lib/cll-genie/artifacts"
    read_only: true
    tmpfs: [/tmp]
    restart: unless-stopped

  scheduler:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    command: celery -A cll_genie_api.worker.app beat --loglevel=INFO
    env_file: [.env]
    depends_on:
      redis: { condition: service_healthy }
    networks: [internal]
    read_only: true
    tmpfs: [/tmp]
    restart: unless-stopped

  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    volumes: [redis_data:/data]
    expose: ["6379"]
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a '$${REDIS_PASSWORD}' ping | grep PONG"]
      interval: 10s
      timeout: 3s
      retries: 10
    networks: [internal]
    restart: unless-stopped

networks:
  edge: {}
  internal:
    internal: true

volumes:
  redis_data: {}
```

Pin images by digest in validated production releases. The production Compose project does not own MongoDB; `MONGODB_URI` points to the existing local MongoDB 3.4 service through its reachable hostname or `host.docker.internal`. Never expose Redis, API, or worker ports externally.

For development and CI only, a profile may start a pinned `mongo:3.4` fixture container and publish it to `127.0.0.1`. This is not part of the production deployment. Mount source only in `compose.override.yaml`.

## 5.4 Local storage and operational ownership

- MongoDB backup/restore is explicitly handled by the existing external service and is not duplicated in this application or Compose project. The application still needs a documented restore-contact/runbook and a startup/readiness check, but no backup jobs.
- Artifacts use `${CLL_ARTIFACT_ROOT}` on the host. Create it before deployment with ownership limited to the API/worker runtime UID and the operational support group.
- Store files below generated relative keys such as `samples/<object-id>/submissions/submission_1/imgt/raw.zip`; never derive a path from an unsanitized sample name.
- Write to a same-filesystem temporary name, `fsync` when required, verify SHA-256, then atomically rename. Published report versions are never overwritten.
- Keep a small `artifacts` MongoDB record containing relative path, media type, size, checksum, creator/job, and timestamps. MongoDB 3.4 stores metadata; the bytes stay on disk.
- Retention and deletion follow the organization's existing local-storage policy. The application should not invent a second backup system.
- Redis: queue state is operational, not the clinical system of record. Every job state must also exist in MongoDB so queue loss is recoverable.
- Secrets: Docker/Kubernetes secrets or approved vault, never `.env` in production images.

---

# Section 6: Directory Structure & Code Layout

```text
cll_genie/
├── README.md
├── CHANGELOG.md
├── compose.yaml
├── compose.override.yaml
├── .env.example
├── docs/
│   ├── TECHNICAL_REMODELING_BLUEPRINT.md
│   ├── architecture/
│   │   ├── decisions/
│   │   │   ├── 0001-modular-monolith.md
│   │   │   ├── 0002-preserve-vquest-results.md
│   │   │   └── 0003-report-rules-governance.md
│   │   └── data-flow.md
│   ├── api/
│   └── operations/
│       ├── database-service-contact.md
│       ├── imgt-outage.md
│       ├── ldap-outage.md
│       └── rollback.md
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── favicon.svg
│   │   └── mask-icon.svg
│   └── src/
│       ├── app/
│       │   ├── router.tsx
│       │   ├── providers.tsx
│       │   └── queryClient.ts
│       ├── api/
│       │   ├── generated/             # OpenAPI-generated client
│       │   └── client.ts
│       ├── assets/
│       │   └── brand/
│       │       ├── cll-genie-mark.svg
│       │       └── cll-genie-lockup.svg
│       ├── components/                # shared accessible UI components
│       ├── features/
│       │   ├── samples/
│       │   ├── lymphotrack/
│       │   ├── vquest/
│       │   ├── reports/
│       │   └── admin-rules/
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── WorklistPage.tsx
│       │   └── SampleWorkspacePage.tsx
│       ├── styles/
│       │   ├── tokens.css
│       │   └── theme.ts
│       ├── test/
│       └── main.tsx
├── backend/
│   ├── pyproject.toml
│   ├── alembic-not-used.md            # Mongo migrations use explicit scripts
│   ├── src/
│   │   └── cll_genie_api/
│   │       ├── main.py
│   │       ├── config.py
│   │       ├── worker.py
│   │       ├── api/
│   │       │   ├── dependencies.py
│   │       │   ├── errors.py
│   │       │   └── v1/
│   │       │       ├── router.py
│   │       │       ├── samples.py
│   │       │       ├── drafts.py
│   │       │       ├── submissions.py
│   │       │       ├── jobs.py
│   │       │       ├── reports.py
│   │       │       ├── admin_rules.py
│   │       │       └── auth.py
│   │       ├── domain/
│   │       │   ├── samples/
│   │       │   │   ├── entities.py
│   │       │   │   ├── value_objects.py
│   │       │   │   └── ports.py
│   │       │   ├── lymphotrack/
│   │       │   ├── vquest/
│   │       │   ├── reports/
│   │       │   │   ├── facts.py
│   │       │   │   ├── mutation.py
│   │       │   │   ├── rules.py
│   │       │   │   └── ports.py
│   │       │   └── audit/
│   │       ├── application/
│   │       │   ├── commands/
│   │       │   ├── queries/
│   │       │   ├── services/
│   │       │   └── dto.py
│   │       ├── infrastructure/
│   │       │   ├── mongo/
│   │       │   │   ├── client.py
│   │       │   │   ├── sample_repository.py
│   │       │   │   ├── vquest_compat_repository.py
│   │       │   │   ├── rule_repository.py
│   │       │   │   └── indexes.py
│   │       │   ├── artifacts/
│   │       │   │   └── filesystem.py
│   │       │   ├── imgt/
│   │       │   │   ├── client.py
│   │       │   │   ├── payload.py
│   │       │   │   └── zip_parser.py
│   │       │   ├── clarity/
│   │       │   │   ├── gateway.py
│   │       │   │   └── manual_export.py
│   │       │   ├── identity/
│   │       │   │   ├── local.py
│   │       │   │   ├── ldap.py
│   │       │   │   ├── roles.py
│   │       │   │   └── sessions.py
│   │       │   ├── queue/
│   │       │   └── observability/
│   │       ├── parsers/
│   │       │   ├── samplesheet.py
│   │       │   ├── run_stats.py
│   │       │   ├── lymphotrack_excel.py
│   │       │   └── lymphotrack_qc.py
│   │       ├── reports/
│   │       │   ├── templates/
│   │       │   │   ├── sv-SE/
│   │       │   │   │   ├── positive.html.j2
│   │       │   │   │   └── negative.html.j2
│   │       │   └── renderer.py
│   │       └── tasks/
│   │           ├── ingestion.py
│   │           ├── vquest.py
│   │           ├── reports.py
│   │           └── reconciliation.py
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── contract/
│   │   ├── clinical_golden/
│   │   └── fixtures/
│   │       ├── mongo_extended_json/
│   │       ├── lymphotrack/
│   │       └── imgt_zip/
│   └── scripts/
│       ├── create_indexes.py
│       ├── validate_vquest_compatibility.py
│       ├── initialize_submission_counters.py
│       ├── import_existing_data.py
│       └── import_initial_report_rules.py
├── docker/
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   ├── proxy.Dockerfile
│   └── nginx.conf
├── operations/
│   ├── rule-packages/
│   └── dashboards/
└── var/                                # local development only; ignored by Git
    └── artifacts/
```

### Dependency rules

```text
api -> application -> domain
tasks -> application -> domain
infrastructure -> domain ports
domain -> standard library only
```

Parsers may use pandas/openpyxl but return domain DTOs. Templates receive a dedicated report view model, never raw MongoDB documents. Routes contain validation and HTTP translation only; they do not parse files, call IMGT, or assemble clinical text.

---

# Section 7: Step-by-Step Build & Implementation Guide

## 7.1 Phase 0: freeze behavior and establish evidence

1. Tag the current production release and obtain a read-only development snapshot through the existing database backup/service process. Do not build a second backup subsystem into CLL Genie.
2. Copy representative, de-identified artifacts into a controlled test corpus:
   - SampleSheet variants and malformed rows.
   - Stats.json with multiple lanes and controls.
   - LymphoTrack workbook versions and QC files.
   - Successful and error IMGT responses/ZIPs.
   - Positive, negative, indel, nonproductive, multi-sequence, #2, #8, and conflicting-subset reports.
3. Export all `vquest_results` field paths/types and record BSON hashes/Extended JSON snapshots.
4. Add functional-parity tests around the existing parser and report conclusions. Where behavior is clinically questionable, label the test `current_approved_behavior` and require an explicit approved rule change rather than silently changing it.
5. Document the real Clarity import mechanism and required HTML/token contract with the Clarity owner.

Exit criterion: the team can run a test that proves the same fixture produces the same stored `vquest_results` submission and report conclusion.

## 7.2 Phase 1: scaffold the new repository

Backend setup:

```bash
mkdir -p backend/src/cll_genie_api backend/tests
cd backend
uv init --package
uv add fastapi 'uvicorn[standard]' pydantic pydantic-settings \
  pandas openpyxl httpx jinja2 weasyprint celery redis structlog \
  ldap3 argon2-cffi \
  opentelemetry-api opentelemetry-sdk
uv add 'pymongo==3.13.0'  # compatibility candidate; retain only after CI proves Python/MongoDB 3.4 support
uv add --dev pytest pytest-asyncio pytest-cov hypothesis respx testcontainers \
  ruff mypy
```

Frontend setup:

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom @tanstack/react-query react-hook-form zod \
  @hookform/resolvers @mui/material @emotion/react \
  @emotion/styled lucide-react
npm install --save-dev vitest @testing-library/react @testing-library/user-event \
  playwright eslint prettier
```

Pin and lock dependencies. Enable Ruff formatting/linting, strict mypy for domain/application code, ESLint, TypeScript strict mode, secret scanning, dependency review, and image vulnerability scanning in CI.

## 7.3 Phase 2: implement compatibility repositories first

1. Implement `VquestCompatRepository` against the existing fixture.
2. Read the established dynamic keys into typed DTOs without altering unknown fields.
3. Implement atomic operations:

```python
collection.update_one(
    {"_id": sample_object_id, f"results.{submission_id}": {"$exists": False}},
    {
        "$set": {
            "name": sample_name,
            f"results.{submission_id}": submission_document,
        }
    },
    upsert=first_submission,
)
```

The actual upsert path must handle MongoDB's upsert/filter constraints and duplicate-key races explicitly; test first and later submissions separately.

4. Add targeted comment operations using the MongoDB 3.4 positional `$` operator and an element-matching query. Do not use `arrayFilters`, which require a newer server.
5. Initialize `submission_counters` by scanning the numeric suffix of every existing result key; reruns must be idempotent.
6. Add the non-shape-changing indexes.
7. Run a compatibility test that reads every fixture, performs a no-op round trip in memory, and verifies no write occurs.

Exit criterion: the new API can read current production-shaped documents and add a submission without modifying any existing submission.

## 7.4 Phase 3: extract and harden parsers

1. Port SampleSheet parsing using `csv.DictReader` with encoding/BOM handling.
2. Port Stats.json aggregation with explicit Pydantic input models or defensive typed parsing.
3. Port QC parsing with locale-independent decimal conversion.
4. Port the workbook parser with header/sheet discovery, typed columns, decimal cutoff, and row-level errors.
5. Port IMGT ZIP parsing with safe extraction and required-member validation.
6. Store parser version and input checksum with every output.
7. Use property-based tests for delimiter, missing column, null, numeric, and malformed archive cases.

Exit criterion: golden parser outputs match current expected values, and malformed inputs reach a controlled error/quarantine state.

## 7.5 Phase 4: build the job workflow

1. Create `analysis_jobs`, `analysis_drafts`, `submission_counters`, `artifacts`, and `audit_events` collections.
2. Implement Celery tasks as thin wrappers over application commands.
3. Add idempotency keys and request fingerprints.
4. Implement IMGT timeout/retry/circuit-breaker behavior.
5. Persist raw ZIP before parsed output.
6. Add reconciliation tasks for jobs stuck beyond expected durations and denormalized `samples.vquest`/`samples.report` status flags.
7. Expose job status and safe error details through the API.

Do not retry after an ambiguous external success unless the request fingerprint/result state proves the submission was not persisted. Prefer a `NEEDS_REVIEW` state over creating duplicate clinical results.

## 7.6 Phase 5: implement rules and reports

1. Convert each branch in `generate_report_summary_text`, `get_hypermutation_string`, and `get_subset_string` into facts and version-1 rules.
2. Import the fixed report method/reference text as a versioned template.
3. Build threshold boundary and multi-sequence golden tests.
4. Have clinical owners review output diffs for every fixture.
5. Implement rules admin draft/simulation/review/approval/activation.
6. Render HTML and PDF in the worker, save immutable artifacts, and include provenance.
7. Keep the current Clarity-token HTML export until the external contract is confirmed.
8. Import historical sample report metadata once if it must appear in the new UI; all new reports write only the new `reports` collection.

Exit criterion: authorized clinical owners sign off on rule set version 1 and report template version 1.

## 7.7 Phase 6: build the React workflow

Implement screens in this order:

1. Theme-aware local/LDAP login, session handling, and worklist.
2. Sample details, QC, artifacts, submissions, and report versions.
3. LymphoTrack filters and typed sequence selection.
4. IMGT configuration generated from a backend capability endpoint so species/locus options are not duplicated in JavaScript.
5. Job progress, retry/review states, and result tables.
6. Report conclusion preview/edit, report generation, review, and publish.
7. Rule administration and audit views.
8. Brand SVGs, Lucide icon mapping, responsive layouts, light/dark visual regression tests, and the polished login page.

Never render server-provided HTML in the SPA except a separately sandboxed report preview. Render result cells as text. For report preview, use a sandboxed iframe and a dedicated artifact endpoint with a restrictive CSP.

## 7.8 Phase 7: Docker and local development

Create `.env` from a non-secret example:

```dotenv
APP_ENV=development
MONGODB_URI=mongodb://cll_genie_app:change-me@host.docker.internal:27017/cll_genie?authSource=cll_genie
REDIS_URL=redis://:change-me@redis:6379/0
ARTIFACT_BACKEND=filesystem
ARTIFACT_ROOT=/var/lib/cll-genie/artifacts
AUTH_PROVIDERS=local,ldap
LDAP_URI=ldaps://ldap.example.internal:636
LDAP_BASE_DN=dc=example,dc=internal
LDAP_USER_FILTER=(uid={username})
LDAP_GROUP_BASE_DN=ou=groups,dc=example,dc=internal
LDAP_BIND_DN_FILE=/run/secrets/ldap_bind_dn
LDAP_BIND_PASSWORD_FILE=/run/secrets/ldap_bind_password
IMGT_VQUEST_URL=https://www.imgt.org/IMGT_vquest/analysis
IMGT_CONNECT_TIMEOUT_SECONDS=5
IMGT_READ_TIMEOUT_SECONDS=120
SESSION_SECRET=replace-with-generated-secret
TRUSTED_ORIGINS=http://localhost
```

Bring up and initialize:

```bash
docker compose build
install -d -m 0770 "${CLL_ARTIFACT_ROOT:-/data/lymphotrack/cll_genie_artifacts}"
docker compose up -d redis
docker compose run --rm api python -m cll_genie_api.infrastructure.mongo.indexes
docker compose run --rm api python -m cll_genie_api.scripts.import_initial_report_rules
docker compose up -d
docker compose ps
curl --fail http://localhost/healthz
```

Run tests before accepting a build:

```bash
cd backend && uv run pytest --cov=cll_genie_api --cov-report=term-missing
cd frontend && npm run lint && npm run test -- --run && npm run build
docker compose config --quiet
```

## 7.9 Phase 8: greenfield acceptance and data validation

The new repository contains only the new application. The current deployment may remain available as an external behavioral reference during validation, but no Flask routes, templates, assets, or old scripts are copied into the new source tree.

1. Deploy the new stack read-only against a development snapshot supplied by the existing database service.
2. Compare worklist, sample detail, submission projections, and report output with approved current examples.
3. Replay captured IMGT responses; do not send duplicate external requests during comparison.
4. Run the new ingestion worker against copied run folders and compare created sample documents field by field.
5. Test local login, LDAP login, LDAP outage with local emergency access, group mapping, session expiry, and authorization boundaries.
6. Execute every functional-parity workflow in both light and dark themes at desktop and mobile widths.
7. Compare report artifacts and require clinical approval.
8. Perform a controlled acceptance run on designated non-production/test samples before cutover.

Validation queries should assert:

- Every `vquest_results._id` has the expected sample relationship.
- `name` agrees across collections where IDs match.
- Submission keys match `^submission_[1-9][0-9]*$`.
- Required submission fields exist.
- Every sequence has both summary and junction documents.
- Artifact references resolve and checksums match.
- Imported and source submission counts agree.
- No document approaches the configured BSON size threshold unnoticed.

## 7.10 Phase 9: cutover and retirement

1. Announce a controlled write window and drain active jobs.
2. Coordinate a final recovery checkpoint with the existing database backup service; do not run application-owned MongoDB backup jobs.
3. Run the validation suite and reconciliation reports.
4. Switch Nginx routing to the new API/SPA.
5. Monitor error rates, job age, IMGT latency, parser drift, MongoDB update conflicts, report generation failures, and audit events.
6. If the acceptance criteria fail, stop new workers and revert traffic according to the operational rollback plan; data compatibility avoids a reverse `vquest_results` migration.
7. Retire the old deployment after the agreed observation window. The new repository remains free of legacy runtime code.

## 7.11 CI/CD quality gates

Every merge should require:

- Unit, integration, contract, clinical golden, and frontend tests.
- OpenAPI backward-compatibility check.
- `vquest_results` fixture compatibility check.
- Rule-set schema validation and clinical snapshot diff.
- Static typing/linting and dependency/secret/container scans.
- Docker image build with an SBOM and immutable digest.
- Deployment to validation, automated smoke tests, and manual approval for production.

Rule/template releases should be promoted independently as signed/versioned data packages, while still passing the clinical golden suite.

## 7.12 Definition of done

The migration is complete only when:

- Existing `vquest_results` documents are readable without mutation and new submissions retain the exact compatible shape.
- No IMGT, parsing, or report generation work runs inside an API request process.
- Reports are reproducible from result + fact + rule + template snapshots.
- Clarity handoff behavior is documented and tested against the real receiving system.
- All state-changing endpoints are authenticated, authorized, CSRF-safe, idempotent where needed, and audited.
- The only externally reachable container is Nginx on the approved port.
- Recovery coordination with the existing database service, application rollback, LDAP/IMGT outage, stuck-job recovery, and rule rollback have been rehearsed.
- Local and LDAP authentication both work, including local emergency administration during an LDAP outage.
- Every UI surface, icon, brand asset, and interaction passes the agreed light/dark and accessibility checks.
- Clinical owners have approved thresholds, wording, templates, and golden outputs.

---

## Appendix A: migration priorities

**P0 before any production cutover**

- Preserve and test `vquest_results` compatibility.
- Introduce durable jobs and remove blocking IMGT work from requests.
- Fix authentication coverage, CSRF, secrets, logging of sequences, and unsafe file handling.
- Add clinical golden tests and rule/template approval.
- Add versioned local artifacts, audit trail, recovery coordination, and rollback.
- Validate the MongoDB 3.4/Python/PyMongo combination in CI before feature work depends on it.
- Deliver local + LDAP authentication and the accessible light/dark application shell.

**P1 immediately after foundation**

- Local artifact integrity/reconciliation tooling.
- LDAP group/role administration and outage monitoring.
- Brand asset and UI visual-regression governance.
- Admin rule simulation/diff workflow.
- Reconciliation dashboards and document-size monitoring.
- Explicit Clarity adapter if an API contract exists.

**P2 after measured need**

- Split IMGT/report workers into separately scaled deployables.
- Server-sent events for live job updates.
- Advanced analytics/search projections in separate read models.

## Appendix B: decisions that require clinical or operational confirmation

1. Confirm the authoritative mutation boundaries and reconcile the `<98% M-CLL` prose with the 97.00–97.99 borderline rule.
2. Confirm whether one nonproductive sequence should suppress interpretation of all productive sequences in the same submission.
3. Confirm allowed maximum sequence count and wording beyond ten sequences.
4. Confirm the supported CLL subsets are only #2 and #8.
5. Confirm whether hidden comments/reports are records under retention and must never be physically deleted.
6. Confirm the exact Clarity HTML/token/import contract and whether final PDFs must return to CLL Genie.
7. Confirm duplicate clinical sample names are valid across runs and the intended identity key.
8. Confirm data classification, retention, encryption, external IMGT transfer approvals, and the existing database service's recovery ownership for sample IDs and nucleotide sequences.

## Appendix C: legacy source-to-target traceability

| Legacy source | Current responsibility | Target owner |
|---|---|---|
| `cll_genie/__init__.py`, `extensions.py` | Flask factory and global Mongo/login/handler instances | `main.py`, dependency providers, repository interfaces |
| `config.py`, `version.py` | environment settings, paths, thresholds, version | typed `pydantic-settings`; thresholds move to approved rule sets |
| `logging_setup.py` | root file/console logging | structured logging and OpenTelemetry configuration |
| `blueprints/models/cll_samples.py` | sample CRUD, flags, nested report metadata | sample/report repositories with targeted updates |
| `blueprints/models/cll_vquest.py` | result CRUD, comments, local deletion | `VquestCompatRepository`, artifact service |
| `blueprints/main/data_processing.py` | LymphoTrack workbook read/filter/FASTA | `parsers/lymphotrack_excel.py`, draft service |
| `blueprints/main/vquest.py` | IMGT POST, ZIP extraction, output parsing | IMGT client, safe ZIP parser, worker task |
| `blueprints/main/vquest_results_controller.py` | submission numbering/persistence/comments/delete | submission application service and compatibility repository |
| `blueprints/main/reports.py` | projections, clinical conclusion branches, report lifecycle | fact builder, rules engine, report service |
| `blueprints/main/samplelists.py` | worklist queries and duplicate detection | sample query service/read model |
| `blueprints/main/util.py`, `filters.py` | search, ZIP/AIRR helpers, formatting | focused utilities; eliminate unused helpers after coverage proves safety |
| `blueprints/main/views.py` | all HTTP orchestration and filesystem rendering | thin versioned API routes plus worker commands |
| `blueprints/login/login.py`, `login/views.py` | local users, forms, group authorization | local/LDAP identity service, sessions, permission policy, admin API |
| `templates/cll_genie.html`, `sample.html` | worklist and sample/submission/report views | React sample features/pages |
| `templates/get_sequences.html` | filter form, dynamic pandas table, negative report entry | typed LymphoTrack draft/selection UI |
| `templates/vquest_analysis.html` | IMGT configuration and selected FASTA | schema-driven V-QUEST configuration UI |
| `templates/vquest_results.html` | IMGT result tables/comments/report actions | React result/report workflow |
| `templates/cll_report.html`, `report_base.html`, `static/css/report.css` | Clarity-compatible report artifact | versioned server-side report templates/assets |
| `templates/login.html`, `add_user.html`, `update_user.html`, `admin.html` | local identity administration | identity provider or audited admin pages |
| `templates/base.html`, `errors.html` | shared navigation/flash/error rendering | SPA shell and problem-details UI |
| application-owned small JavaScript files | checkbox validation, locus lists, navigation suppression, upload label, tooltips | typed React components; locus capabilities come from API |
| bundled jQuery/Plotly/sorttable and generated chunks/maps | vendored/generated browser assets, some apparently unused | remove; dependencies come from locked frontend build |
| `scripts/register_lymphotrack_samples.py` | active run/sample/result registrar | ingestion scheduler/worker and compatibility CLI |
| `scripts/register_lymphotrack_samples.old.py` | superseded registrar | characterization reference, then Git history only |
| `scripts/add_user.py` | interactive local account management | identity admin API/IdP |
| `scripts/mongodb_dump.sh`, `databases_list.txt` | ad hoc database copy | not migrated; recovery remains with the existing database backup service |
| `scripts/install.sh`, `build-lennart_dev.sh` | host-specific image build/run | CI-built images and Compose/deployment manifests |
| `Dockerfile*`, `docker-compose*.yml`, `wsgi.py`, `run.py` | direct Flask container runtime | multi-stage API/worker/proxy images and ASGI entrypoint |
| `.design/*.jsonl` | Extended JSON compatibility examples | protected test fixtures and compatibility gates |
| `.pre-commit-config.yaml`, `.github/workflows/changelog-reminder.yml` | formatting and changelog enforcement | expanded backend/frontend/security/compatibility CI |

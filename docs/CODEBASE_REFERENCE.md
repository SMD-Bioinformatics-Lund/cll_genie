# Codebase reference

## Repository root

| Path | Responsibility |
|---|---|
| `backend/` | Python package, report templates, scripts, and backend tests. |
| `frontend/` | React/TypeScript web client and client test. |
| `docker/` | Backend image, frontend/Nginx image, and Nginx routing. |
| `docs/` | Implementation and operations documentation. |
| `.design/` | anonymized Mongo Extended JSON fixtures used for compatibility tests. |
| `compose.yaml` | production-shaped API, proxy, worker, scheduler, and Redis topology. |
| `compose.dev.yaml` | development override adding pinned MongoDB 3.4 and internal Mongo URIs. |
| `.env.example` | complete non-secret configuration template. |
| `CHANGELOG.md` | externally meaningful release changes. |

## Backend package

### Entrypoints and configuration

- `cll_genie_api/__init__.py` defines package version `2.0.0`.
- `config.py` defines all settings with Pydantic Settings. Environment variables
  override defaults. It parses comma-separated authentication providers and
  exposes `ldap_is_configured()` so an incomplete LDAP configuration is never
  advertised to users.
- `main.py` constructs FastAPI, locates Swagger/OpenAPI beneath
  `/cll_genie/api/v1`, registers a stable JSON 404 response, and mounts all
  routers. Production disables interactive docs and the OpenAPI document.
- `worker.py` creates the Celery application, selects JSON serialization,
  enables tracked task state, uses Stockholm time, and schedules ingestion.
- `tasks.py` contains the three asynchronous operations described below.

### HTTP layer: `api/`

- `common.py`: recursively serializes `ObjectId`, `datetime`, `date`, mappings,
  and lists into JSON-compatible values.
- `schemas.py`: Pydantic request/response contracts for login, users, sessions,
  filters, V-QUEST submissions, comments, reports, and rules. It enforces sizes,
  ranges, enums, and sequence-count limits before handler execution.
- `dependencies.py`: constructs the shared service graph, resolves session
  cookies, validates CSRF headers, and centralizes permission failures.
- `auth.py`: lists configured providers, authenticates, creates/deletes session
  cookies, and returns the currently effective local user profile.
- `health.py`: liveness checks process availability; readiness additionally
  executes a MongoDB ping.
- `samples.py`: paginated worklist, sample workspace, LymphoTrack Excel/QC
  upload, analysis-draft creation, and draft retrieval. Hidden data is filtered
  according to permission before serialization.
- `jobs.py`: returns persisted job state for UI polling.
- `submissions.py`: validates sequence selection, queues IMGT, reads/downloads
  submissions, creates/hides/restores comments, and deletes submissions for
  authorized administrators.
- `reports.py`: creates rule-based suggestions, previews/exports positive and
  negative reports, archives/restores report records, and serves HTML artifacts.
- `admin.py`: manages rules and local application users, simulates a rule with
  representative facts, and returns audit events.

### Domain layer

`domain/identity.py` defines immutable `LocalUser` and `Session` values.
`LocalUser.from_document()` adapts existing `coyote.users` documents. Groups
map to permissions as follows:

| Group | Additional permissions |
|---|---|
| every enabled user | `samples:read`, `results:read`, `reports:read` |
| `lymphotrack` | `analysis:create`, `comments:create`, `reports:create` |
| `lymphotrack_admin` | analyst permissions plus administrator permissions |
| `admin` | `results:delete`, `reports:publish`, `rules:manage`, `users:manage` |

### Infrastructure layer

- `mongo.py` creates one client and named collection handles. `ensure_indexes()`
  installs TTL, worklist, lookup, uniqueness, and chronological indexes using
  MongoDB 3.4-compatible definitions.
- `repositories.py` contains focused persistence adapters:
  `SampleRepository`, `DraftRepository`, `JobRepository`,
  `SubmissionCounterRepository`, `VquestRepository`, `ReportRepository`,
  `RuleRepository`, and `AuditRepository`.
- `users.py` loads the canonical local user record.
- `sessions.py` generates high-entropy opaque session and CSRF tokens, stores
  only the SHA-256 session-token digest, enforces expiration, and reloads the
  user on every request so disabled accounts and group changes take effect.
- `authentication.py` implements Werkzeug-compatible local hashes and
  certificate-validated LDAP/LDAPS. LDAP filter input is escaped and the search
  must resolve exactly one directory entry before a user bind is attempted.
- `artifacts.py` sanitizes names, writes through a temporary file with `fsync`,
  atomically renames, calculates SHA-256 and size, and stores metadata. Each
  artifact path contains a new ObjectId, so re-uploading the same filename does
  not overwrite an older artifact.
- `imgt.py` submits form data with explicit connect/read timeouts, rejects HTTP
  errors and HTML error pages, and only accepts ZIP-signature responses.

### Parsers

- `parsers/ingestion.py` recognizes MiSeq run directories, reads SampleSheet
  CSV with Python's CSV parser, extracts instrument/sample/Clarity data, parses
  Stats.json, aggregates lane counts, and constructs new sample documents.
  Control identifiers receive the run-number suffix that prevents collisions.
- `parsers/lymphotrack.py` reads `.xlsx`/`.xlsm` workbooks with openpyxl,
  resolves expected column aliases, normalizes numeric values including decimal
  commas, applies read/productivity filters, and returns typed sequences plus
  workbook metadata. `parse_qc()` validates the Q30 TSV and returns numeric QC.
- `parsers/vquest.py` validates ZIP count, expanded size, paths, and required
  files; parses Parameters, Summary, and Junction tables; converts scalar types;
  and requires Summary/Junction sequence IDs to agree.

### Reporting

- `reporting/clinical.py` derives a constrained fact dictionary from an immutable
  submission. Mutation boundaries are `<97.00 = M-CLL`, `97.00–97.99 =
  Borderline`, and `>=98.00 = U-CLL`. It also derives productivity, subset,
  conflict, sequence-count, and display facts and supplies a code fallback when
  no database rules exist.
- `reporting/rules.py` evaluates nested `all`, `any`, and `not` conditions plus
  a fixed operator allowlist. It tracks matches and exclusive groups and renders
  templates only against known facts.
- `reporting/render.py` configures Jinja with autoescaping for `.j2`, computes
  per-sequence mutation status, and renders positive/negative templates.
- `reporting/templates/*.html.j2` contain Clarity placeholders, general report
  metadata, summary and detailed result tables, method text, and references.

### Scripts

- `scripts/ensure_indexes.py`: idempotently creates required Mongo indexes.
- `scripts/seed_rules.py`: idempotently inserts the initial Swedish rule set.
- `scripts/ingest.py`: callable manual form of scheduled run/result ingestion.
- `scripts/load_design_samples.py`: development-only stdin loader for sample
  Extended JSON; resets matching analysis/result state without loading result fixtures.

### Asynchronous task behavior

`parse_lymphotrack_draft(job_id, draft_id)` transitions the job through reading,
parses the selected artifact/path, stores sequence candidates, updates sample
eligibility, and completes or fails the job.

`run_vquest(job_id, draft_id, sequence_ids, options)` revalidates draft state
and selected IDs, produces FASTA IDs tied to the sample, calls IMGT, validates
result IDs, adds LymphoTrack read/productivity facts, atomically reserves
`submission_N`, stores the ZIP, inserts the compatible nested submission, and
records the audit event.

`ingest()` delegates to run registration and result attachment and returns both
counts to Celery.

## Frontend source

- `main.tsx`: React root and global theme provider.
- `theme.tsx`, `theme-context.ts`, `ThemeControl.tsx`: system/light/dark mode,
  local persistence, and MUI palette/component configuration.
- `api.ts`: cookie-aware fetch wrapper, error normalization, `/cll_genie` URL
  construction, and typed workflow calls.
- `types.ts`: shared client representations for users, sessions, samples, jobs,
  drafts, and reports.
- `session-context.ts`: authenticated session/sign-out dependency for pages.
- `App.tsx`: initial session restoration, login boundary, query cache, lazy page
  modules, `/cll_genie` router basename, and admin route guards.
- `components/Brand.tsx`: accessible SVG brand lockup; `Brand.test.tsx` verifies
  the rendered identity.
- `components/AppLayout.tsx`: fixed application bar, navigation drawer,
  role-aware administration links, identity, theme, and logout.
- `pages/LoginPage.tsx`: provider discovery, local/LDAP tabs, password reveal,
  errors, version/environment display, and responsive branded composition.
- `pages/WorklistPage.tsx`: search, report-state filters, pagination, and sample
  navigation.
- `pages/SamplePage.tsx`: overview metrics, Excel/QC upload, submissions,
  reports, and no-result report dialog with permission-aware controls.
- `pages/AnalysisPage.tsx`: workbook filters, candidate selection, IMGT options,
  queued-job progress, and automatic navigation to completed results.
- `pages/SubmissionPage.tsx`: parameter/results display, ZIP download, rule
  suggestion editing, preview/export, comments, archive controls, and deletion.
- `pages/ReportsPage.tsx`: report archive and authorized hide/restore actions.
- `pages/AdminRulesPage.tsx`: create/edit/simulate rule records.
- `pages/AdminUsersPage.tsx`: local profile, group, enabled state, and optional
  local-password management; LDAP passwords are never accepted or displayed.
- `pages/AuditPage.tsx`: chronological administrative and clinical events.
- `styles.css`: Tailwind CSS 4 entrypoint, CSS-first theme tokens, reusable
  `@apply` component classes, light/dark surfaces, and the small amount of CSS
  required for pseudo-elements, color mixing, and reduced-motion behavior.

## Container and build files

- `docker/backend.Dockerfile` builds a non-root Python 3.11 runtime.
- `docker/proxy.Dockerfile` builds the locked frontend and copies it beneath
  `/usr/share/nginx/html/cll_genie` in Nginx.
- `docker/nginx.conf` is the base-path-aware proxy and static-file contract.
- `frontend/vite.config.ts` sets build base `/cll_genie/`, development proxies,
  the first-party Tailwind Vite plugin, and deterministic vendor chunking.
- `.github/workflows/ci.yml` repeats format, lint, test, build, Compose, and
  container checks on pull requests and main pushes.

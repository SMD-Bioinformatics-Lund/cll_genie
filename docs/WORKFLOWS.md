# Clinical and processing workflows

## 1. Run and sample registration

Celery Beat invokes `cll_genie.ingest` every five minutes. The registration
pass examines immediate children of `RUN_ROOT` and only considers directory
names matching the configured MiSeq pattern. A run is eligible when:

1. `RTAComplete.txt` exists;
2. `cdm.done` exists;
3. `cll_genie.done` does not exist;
4. `SampleSheet.csv` exists; and
5. `Data/Intensities/BaseCalls/Stats/Stats.json` exists.

The SampleSheet parser locates the actual data header rather than assuming a
fixed row. It reads `Sample_ID`, `Description`, and `I7_Index_ID`, recognizes
clinical SHM identifiers, and retains known control identifiers. Controls are
renamed with `-R<run_number>` so controls from separate runs cannot collide.
Clarity ID is extracted from the Description convention. Instrument Type is
captured when present.

Stats.json values are aggregated across conversion/lane entries by SampleId.
Each new `samples` document receives run metadata, raw read/base counts,
workflow flags, empty QC values, `assay: lymphotrack`, and a UTC creation time.
Existing sample names are not inserted twice. After the run has been processed,
the scheduler creates `cll_genie.done`; this makes ingestion idempotent at the
run level.

## 2. LymphoTrack result attachment

The attachment pass queries samples missing Excel or QC state and recursively
indexes `LYMPHOTRACK_RESULTS_ROOT`. It associates:

- a filename containing the sample name with suffix `.xlsx` or `.xlsm`; and
- a filename containing the sample name and ending `.fastq_indexQ30.tsv`.

QC files are parsed before the sample flag is changed. Invalid QC is skipped
and retried during later scheduler passes. Files discovered on the managed
results filesystem are referenced by path. Files uploaded through the UI are
copied into immutable application artifact storage and referenced by artifact
ID plus resolved path.

## 3. Manual uploads

An analyst may upload a replacement workbook or QC file from the sample page.
The API checks `analysis:create` and CSRF. Workbook extensions are restricted to
openpyxl-supported formats. The local artifact service sanitizes the original
basename, creates an ObjectId-scoped directory, writes to a temporary file,
flushes and `fsync`s, then atomically moves it into place. SHA-256, byte size,
media type, actor, kind, and relative path are recorded in `artifacts`.

QC is immediately parsed; invalid content produces HTTP 422. Because artifact
locations are unique, failed or repeated uploads never overwrite historical
files.

## 4. LymphoTrack candidate generation

The analyst chooses worksheet, zero-based header row, minimum read percentage,
in-frame filter, and no-stop-codon filter. The API creates:

- an `analysis_drafts` document with `PROCESSING` state; and
- an `analysis_jobs` document with `QUEUED` state.

It then queues `parse_lymphotrack_draft`. The worker selects the explicitly
requested artifact or current sample workbook, normalizes spreadsheet values,
applies filters, and stores typed candidates. Each candidate contains a stable
sequence ID, rank, nucleotide sequence, merge count, total-read percentage,
productivity booleans, and length. The draft becomes `READY`; the sample becomes
eligible when at least one candidate exists. The UI polls the durable job and
loads candidates only after success.

## 5. IMGT/V-QUEST submission

The browser submits selected sequence IDs and supported IMGT options. Both the
API and worker validate the selected IDs against the stored draft to prevent a
client from injecting a different sequence. Duplicate IDs are removed while
preserving order.

The worker builds FASTA identifiers as `<sequence_id>_<sample_name>`, constructs
the form payload from a safe default set, and allows overrides only for known
payload keys. Full output tables needed for clinical display and reporting are
requested. Timeouts separate connection failure from slow analysis.

IMGT output must be HTTP 200, non-HTML, and ZIP-signature data. The ZIP parser
requires `11_Parameters.txt`, `1_Summary.txt`, and `6_Junction.txt`; limits file
count and expanded size; rejects absolute/traversal names; parses tabular data;
and requires identical sequence IDs in Summary and Junction.

Returned IDs must exactly equal submitted IDs. LymphoTrack merge count, read
percentage, in-frame, and stop-codon facts are added to each Summary. Only then
is `submission_N` reserved. Reservation uses an atomic Mongo `$inc`; on first
use the counter is initialized from the maximum existing submission key.

The raw ZIP is written as an immutable artifact and the nested submission is
inserted using a targeted dotted-path update. The existing result document and
all previous submissions are not rewritten. Job and sample flags are updated
and an audit event is recorded.

## 6. Result review and comments

Result pages display parameters and the clinically relevant Summary fields for
each sequence. Users can download the original IMGT ZIP. Analysts can append
comments. Administrators can hide and restore comments; hidden comment content
is removed from API responses to ordinary users rather than only hidden in CSS.

Administrators can permanently remove a result submission. The operation uses
`$unset` on only the requested nested key. An empty parent `vquest_results`
document is removed, the sample workflow flag is recomputed, and the deletion
is audited. The ZIP artifact is intentionally retained for traceability unless
an explicit artifact-retention process removes it.

## 7. Suggested clinical conclusion

The backend converts a submission into a fixed fact dictionary. Active Swedish
`CLL_IGHV` rules are ordered by priority and evaluated. Exclusive groups ensure
only the first matching alternative in a clinical section contributes text.
The response contains generated text, facts, and a rule trace. If no rules have
been seeded, the code fallback produces equivalent baseline wording.

The analyst reviews and may edit the suggestion. Generated text is assistance,
not an autonomous final clinical decision.

## 8. Positive report

Preview performs the same render without persistence and marks the output as a
preview. Export allocates a report ObjectId, captures fact and rule-trace
snapshots, autoescapes the analyst's conclusion, and renders:

- Clarity patient placeholders;
- sample, method, analysis site, author, date, report ID/version, and submission;
- summary sequence table with indel-aware identity and mutation status;
- analyst conclusion;
- detailed V, D, J, junction, subset, read, and productivity information; and
- method description and references.

The HTML receives a unique local artifact path and metadata record. A `reports`
document references it, the final summary is appended as a submission comment,
the sample report flag becomes true, and the action is audited.

## 9. Negative/no-result report

From the sample page an analyst can enter the no-result conclusion. The report
contains the same Clarity placeholders, identifiers, author/version, method,
and escaped conclusion but no V-QUEST sequence table. It is persisted as a
`NEGATIVE` report and the sample is no longer marked eligible for V-QUEST.

## 10. Report archive

All reports are listed chronologically. Administrators can hide or restore
them. Hidden metadata and artifacts are inaccessible to ordinary users; a
direct artifact request returns 404. The sample's report flag reflects whether
at least one visible report remains.

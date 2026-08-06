# 5. IMGT/V-QUEST Analysis

An IMGT/V-QUEST analysis is an asynchronous submission of user-selected LymphoTrack sequences. Each successful run is appended beneath a new `submission_N` key in the sample's existing `vquest_results` document; previous submissions are not overwritten.

## 1. Creating an analysis job

The wizard submits:

```http
POST /cll_genie/api/v1/samples/{sample_id}/submit-vquest
```

The request contains between one and 50 rows selected from the LymphoTrack preview. Each row contains the sequence identifier, nucleotide sequence, read measurements, and productivity fields required by the worker. A separate `options` object contains the selected IMGT/V-QUEST settings.

All three roles may submit an analysis: `user`, `lymphotrack_admin`, and `admin`. The endpoint also checks the persisted `vquest_analysis` operational control. If an administrator has disabled IMGT/V-QUEST analysis, new submissions are rejected with HTTP 503 before a job is created. After CSRF validation, the enabled endpoint:

1. inserts an `analysis_jobs` document with status `QUEUED`;
2. stores only `sequence_count` and `options` in that job payload;
3. enqueues `cll_genie.run_vquest` through Redis/Celery;
4. writes the `vquest.analysis.queued` audit event; and
5. returns HTTP 202 with the `job_id`.

The worker receives the complete selected sequence objects in the Celery message.

## 2. Payload construction

The worker changes the job to `RUNNING` at 5% and reloads the sample. Each selected row is converted to FASTA using a sequence-only identifier:

```text
>Seq<rank>
<nucleotide sequence>
```

Sample names are not included in the FASTA content sent to IMGT. The default request includes:

| Setting                 | Default                       |
| ----------------------- | ----------------------------- |
| Species                 | `human`                       |
| Receptor/locus          | `IGH`                         |
| Molecule type           | `gDNA`                        |
| Reference directory set | `1`                           |
| Reference alleles       | enabled                       |
| V-region indel search   | enabled                       |
| CLL subset search       | enabled                       |
| scFv analysis           | disabled                      |
| V/D/J mutation limits   | `-1`                          |
| Result type             | Excel-compatible ZIP response |

The requested output tables include Summary, JUNCTION, parameters, nucleotide and amino-acid sequences, IMGT-gapped sequences, V-region mutation tables/statistics, and hotspot data. User options may override only keys already present in the backend default payload; arbitrary new form fields are discarded.

## 3. IMGT communication

At 25%, the worker sends a form-encoded HTTP POST directly to the configured `IMGT_VQUEST_URL` with configured connect/read timeouts. Redirects are not followed.

The response is accepted only when:

- HTTP status is 200;
- the response is not an HTML error page; and
- its bytes begin with the ZIP signature `PK`.

For an HTML rejection, visible `<span>` messages are extracted and reported as the job error. Network, HTTP, and unexpected-response failures all enter the same final failure path.

## 4. Parsing and integrity checks

At 65%, the returned ZIP is parsed into V-QUEST parameters and per-sequence results. The worker verifies that the set of result IDs exactly equals the set of submitted FASTA IDs. Missing or unexpected IDs fail the complete job rather than storing a partial clinical result.

For each result, its `summary` is enriched with the corresponding LymphoTrack values:

- `Merge Count`
- `Total Reads Per` rounded to two decimals
- `Inframe`
- `Stop Codon` (the inverse of `no_stop_codon`)

## 5. Artifact and MongoDB writes

The unmodified IMGT response ZIP is saved in local artifact storage under the sample/submission hierarchy. A per-sample atomic counter reserves the next `submission_N` identifier. If a counter does not exist, it initializes from the largest existing submission number so imported data retains its numbering sequence.

The successful submission written below `vquest_results.results.submission_N` has this outer shape:

```javascript
{
  vquest_results: { "Seq1": { /* parsed IMGT tables */ } },
  vquest_parameters: { /* parsed parameters */ },
  data_added: ISODate("..."),
  results_zip_file: "<resolved local artifact path>",
  submission_comments: []
}
```

The collection-level document remains:

```javascript
{
  _id: ObjectId("<same ID as the sample>"),
  name: "<sample name>",
  results: {
    submission_1: { /* submission above */ },
    submission_2: { /* later independent submission */ }
  }
}
```

The worker creates this schema for the first result or atomically adds a nested submission when the key does not already exist. It then sets `samples.vquest` to true.

## 6. Job lifecycle and failure behavior

```text
QUEUED -> RUNNING (5%) -> RUNNING (25%) -> RUNNING (65%) -> SUCCEEDED (100%)
                                                               `-> FAILED_FINAL (100%)
```

On success, the job records `sample_id` and `submission_id`, and an informational `vquest.analysis.succeeded` audit event is written. On any exception, the job becomes `FAILED_FINAL`, stores the error string, and writes an error-severity `vquest.analysis.failed` audit event.

The database submission is inserted only after the ZIP has been received, parsed, validated, and saved. Failed jobs therefore do not create partial `vquest_results` submissions.

## 7. Reading and downloading results

The sample details API returns the sample, its submissions from `vquest_results`, and its reports. Dedicated endpoints list/get submissions and download the stored ZIP. ZIP download returns HTTP 404 if the database submission exists but the physical local file is unavailable.

## Source-code map

| Responsibility                          | Implementation                                             |
| --------------------------------------- | ---------------------------------------------------------- |
| Submission endpoints and audit event    | `backend/src/cll_genie_api/api/submissions.py`             |
| Job persistence and submission counters | `backend/src/cll_genie_api/infrastructure/repositories.py` |
| Celery task and enrichment logic        | `backend/src/cll_genie_api/tasks.py`                       |
| HTTP client and allowed defaults        | `backend/src/cll_genie_api/infrastructure/imgt.py`         |
| ZIP parser                              | `backend/src/cll_genie_api/parsers/vquest.py`              |
| Local artifact persistence              | `backend/src/cll_genie_api/infrastructure/artifacts.py`    |

---

**[Next: Reports and Comments](06_reports_and_comments.md)**

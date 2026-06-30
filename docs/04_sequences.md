# 4. Sequences and Preview Parsing

LymphoTrack sequences are parsed on demand when a user opens the analysis wizard and clicks **Read workbook**. The workbook upload/attachment step does not create persistent “draft sequence” documents. Preview rows live in the browser until selected rows are submitted to IMGT/V-QUEST.

## Preview request

The frontend calls:

```http
POST /cll_genie/api/v1/samples/{sample_id}/preview-sequences
```

The authenticated user must have `lymphotrack`, `lymphotrack_admin`, or `admin`. CSRF validation also applies. The request supports:

```json
{
  "sheet_name": "Merged Read Summary",
  "header_row": 4,
  "minimum_reads_percent": 0,
  "in_frame": "B",
  "no_stop_codon": "B",
  "artifact_id": null
}
```

`B` means both values are accepted; `Y` and `N` require an exact workbook value. `header_row` is zero-based in the API, so the default value `4` reads Excel row 5.

## Workbook resolution

The backend selects the source in this order:

1. `artifact_id` supplied in the request;
2. `lymphotrack_excel_artifact_id` stored on the sample; or
3. `lymphotrack_excel_path` stored on the sample.

An artifact ID must resolve through local artifact storage. A path-based workbook must remain readable at its mounted filesystem location. If no workbook is available, the API returns HTTP 409.

## Parser contract

The parser accepts only `.xlsx` and `.xlsm`, opens the workbook read-only with calculated cell values, and defaults to the `Merged Read Summary` worksheet. These columns are mandatory:

| Required column | Use |
|---|---|
| `Rank` | Clone rank and generated sequence ID |
| `Sequence` | Nucleotide sequence submitted to IMGT |
| `Merge count` | Supporting merged-read count |
| `% total reads` | Clone abundance and local threshold filter |
| `In-frame (Y/N)` | Reading-frame filter and result annotation |
| `No Stop codon (Y/N)` | Stop-codon filter and result annotation |

Optional columns consumed when present are `Length`, `V-gene`, `J-gene`, `D-gene`, `Mutation rate to partial V-gene (%)`, `Cumulative %`, and `V-coverage`.

Rows above the header are read as key/value workbook metadata. The parser returns that metadata internally, but the current preview endpoint returns only `sequences` to the frontend.

## Numeric normalization and validation

Comma decimal separators are converted to dots. Numeric columns are converted to integers or floats; an invalid value produces HTTP 422 identifying the source row. A missing worksheet, unreadable workbook, unsupported extension, or missing required column also produces HTTP 422.

Rows with an empty `Sequence` are skipped. Remaining rows are evaluated in this order:

1. `% total reads` must be greater than or equal to `minimum_reads_percent`.
2. If `in_frame` is not `B`, `In-frame (Y/N)` must exactly match it.
3. If `no_stop_codon` is not `B`, `No Stop codon (Y/N)` must exactly match it.

## Preview response shape

Each accepted workbook row becomes:

```json
{
  "sequence_id": "Seq1",
  "rank": 1,
  "sequence": "ACGT...",
  "merge_count": 25000,
  "total_reads_percent": 42.125,
  "in_frame": true,
  "no_stop_codon": true,
  "source_row": 6,
  "length": 320,
  "v_gene": "IGHV...",
  "j_gene": "IGHJ...",
  "d_gene": "IGHD...",
  "v_mutation": 3.7
}
```

`sequence_id` is derived as `Seq<Rank>`. Read percentage is rounded to four decimals. Boolean fields are true only for an exact `Y` value.

## Selection and persistence boundary

The preview table lets the user select one or more rows. CLL Genie does not automatically choose the most abundant or productive sequence. The selected row objects are sent with the V-QUEST options when the user submits the final wizard step.

Important persistence boundaries:

- preview rows are not inserted into MongoDB;
- changing filters simply reparses the workbook;
- the queued `analysis_jobs` document stores the sequence count and options, not the full selected nucleotide sequences;
- the complete selected rows are carried in the Celery task message; and
- after successful IMGT processing, selected LymphoTrack metrics are merged into the parsed result stored in the unchanged `vquest_results` structure.

This avoids a second draft collection while preserving the clinical result history at the submission level.

---

**[Next: IMGT/V-QUEST Analysis](05_vquest_analysis.md)**

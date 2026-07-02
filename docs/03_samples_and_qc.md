# 3. Sample and LymphoTrack Ingestion

This page describes the implemented data path, including the exact folder rules, parser behavior, MongoDB writes, and operational limitations. A sample is registered first; LymphoTrack files are attached to that existing sample later.

## End-to-end flow

```text
RUN_ROOT/<completed Illumina run>
  |-- SampleSheet.csv --------------------+
  `-- Data/.../Stats/Stats.json ----------+--> samples collection
                                                   |
LYMPHOTRACK_RESULTS_ROOT/<result files> ------------+
  |-- <sample name>*.xlsx/.xlsm            attach workbook path/flag
  `-- <sample name>*.fastq_indexQ30.tsv     parse QC and attach metrics
```

Celery Beat queues `cll_genie.ingest` every 300 seconds. The task performs these operations in order:

1. `register_runs()` discovers completed sequencing runs and inserts new sample documents.
2. `attach_results()` searches for LymphoTrack workbooks and QC files for incomplete sample documents.

Both the Beat scheduler and worker must be running. Beat only queues the task; the worker executes all discovery and parsing. Consequently, `RUN_ROOT` and `LYMPHOTRACK_RESULTS_ROOT` must be mounted in the worker container. `RUN_ROOT` must be writable because ingestion creates a completion marker, while the LymphoTrack result root can remain read-only.

## 1. Registering samples from sequencing runs

### Run discovery

Only immediate child directories of `RUN_ROOT` are considered. A directory name must exactly match:

```regex
^\d{6}_[A-Z]\d{5}_\d{4}_\d{9}-[A-Z0-9]{5}$
```

Before opening a run, the ingester checks all of the following:

- the configured CLL Genie marker, normally `cll_genie.done`, does not already exist;
- `RTAComplete.txt` exists;
- `cdm.done` exists;
- `SampleSheet.csv` exists; and
- `Data/Intensities/BaseCalls/Stats/Stats.json` exists.

An incomplete or non-matching directory is ignored and reconsidered on the next five-minute pass.

### SampleSheet parsing

The parser reads `SampleSheet.csv` using UTF-8 with BOM support. It scans until it finds a row containing all three required columns:

- `Sample_ID`
- `Description`
- `I7_Index_ID`

It also reads `Instrument Type` from the first field of any preceding row. For each data row:

- IDs beginning with the pattern `NNLLNNNNN-SHM` are accepted as clinical samples;
- the exact controls `POS-SHM`, `NEG-SHM`, and `IGHSHM-SHM` are accepted;
- controls are renamed to `<control>-R<run number>` so repeated controls from different runs do not share a name;
- all other IDs are ignored; and
- `Description` is split on underscores and its second segment is stored as `clarity_id`.

For example, `lymphotrack_GEN1264A2976_26MD06399` produces the Clarity ID `GEN1264A2976`. If the description does not contain a second underscore-delimited segment, `clarity_id` is stored as an empty string.

The run number used in control names is the third underscore-separated segment of the run directory name.

### Run statistics

`Stats.json` is traversed through every `ConversionResults[].DemuxResults[]` entry. For each `SampleId`, the parser sums:

- `NumberReads` into `total_raw_reads`; and
- `Yield` into `total_raw_bases`.

This is an aggregate across every matching conversion/lane entry, not just the first one.

### MongoDB insert and duplicate behavior

Each accepted sample is inserted into the `samples` collection only when no document with the same `name` exists. The current code performs an application-level lookup; it does not overwrite an existing sample. If the name already exists, including when it appears in a different run, ingestion writes a structured warning and a `sample.registration_skipped` warning audit event containing the existing and incoming run IDs. The new occurrence is skipped and requires manual intervention.

A newly registered document has this effective shape (MongoDB adds `_id`):

```javascript
{
  name: "25AB12345-SHM",
  clarity_id: "GEN1264A2976",
  total_raw_bases: 123456789,
  total_raw_reads: 123456,
  lymphotrack_excel: false,
  lymphotrack_excel_path: "",
  lymphotrack_qc: false,
  lymphotrack_qc_path: "",
  vquest: false,
  report: false,
  total_bases: "",
  q30_bases: "",
  q30_per: "",
  date_added: ISODate("..."),
  is_control: false,
  run_id: "<run directory name>",
  run_path: "<absolute or mounted run path>",
  run_number: "<Stats.json RunNumber or folder value>",
  flowcell_id: "<Stats.json Flowcell>",
  sequencer: "<SampleSheet Instrument Type>",
  assay: "lymphotrack"
}
```

After every eligible row has been considered, the ingester touches the configured `cll_genie.done` file. Future scheduled runs skip that directory. Therefore, a run must not be marked complete upstream until its SampleSheet and Stats data are final.

## 2. Automatically attaching LymphoTrack outputs

`attach_results()` recursively enumerates files below `LYMPHOTRACK_RESULTS_ROOT`. It only queries samples where `lymphotrack_excel` or `lymphotrack_qc` is still false.

### Workbook matching

The first regular file satisfying both conditions is attached:

- its filename contains the sample `name` as a substring; and
- its suffix is `.xlsx` or `.xlsm`, case-insensitively.

Automatic attachment sets:

```javascript
{
  lymphotrack_excel: true,
  lymphotrack_excel_path: "<matched path>"
}
```

The scheduled attachment step does **not** parse workbook sequences and does not write anything to `vquest_results`. Parsing happens on demand in the analysis wizard, as described in [Sequences and Preview Parsing](04_sequences.md).

### QC matching and parsing

The first regular file whose name contains the sample name and ends exactly with `.fastq_indexQ30.tsv` is parsed as a two-column, tab-separated key/value file. Required keys map as follows:

| QC key       | Sample field  | Conversion                    |
| ------------ | ------------- | ----------------------------- |
| `totalCount` | `total_bases` | integer                       |
| `countQ30`   | `q30_bases`   | integer                       |
| `indexQ30`   | `q30_per`     | float rounded to two decimals |

Decimal commas are normalized to decimal points. A valid file also sets `lymphotrack_qc: true` and `lymphotrack_qc_path`. If automatic QC parsing fails, that sample is left incomplete and will be retried by later scans; the current scheduled path does not create an audit event for this parse failure.

> [!CAUTION]
> Matching is substring-based and the first match wins. File naming must make sample names unambiguous. Avoid keeping multiple candidate workbooks for one sample under the scan root.

## 3. Manual attachment through the UI/API

Sample registration is performed by the run-ingestion path described above. The Worklist does not expose arbitrary sample creation. The Sample Details page can attach files to an existing sample.

The interface requests confirmation before starting either upload. If the sample already has an attachment of the same type, the confirmation identifies the operation as a replacement and names the selected file.

### Workbook upload

`POST /cll_genie/api/v1/samples/{sample_id}/artifacts/lymphotrack-excel` accepts `.xlsx` and `.xlsm`. The API:

1. saves the physical file in local artifact storage;
2. creates artifact metadata;
3. stores the artifact ID, resolved path, and `lymphotrack_excel: true` on the sample; and
4. records an upload audit event.

The upload itself only validates the extension. Workbook contents are validated when the user clicks **Read workbook** in the analysis wizard.

### QC upload

`POST /cll_genie/api/v1/samples/{sample_id}/artifacts/lymphotrack-qc` saves the local artifact and parses it immediately. Invalid content returns HTTP 422. Valid metrics and the artifact/path fields are written to the sample, followed by an audit event.

Manually uploaded files receive artifact records. Automatically discovered external files are represented by paths stored on the sample.

## 4. Audit events

Automatic ingestion, manual attachment, and skipped duplicate names produce append-only MongoDB audit events visible in **Administration > Audit events**:

| Activity                                     | Event type                                                                        | Actor                          |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| Sample inserted from a completed run         | `sample.registered`                                                               | `cll-genie-ingestion` / system |
| Existing sample name skipped                  | `sample.registration_skipped`                                                     | `cll-genie-ingestion` / system |
| Workbook discovered and attached             | `sample.lymphotrack_excel.attached`                                               | `cll-genie-ingestion` / system |
| QC file discovered, parsed, and attached     | `sample.lymphotrack_qc.attached`                                                  | `cll-genie-ingestion` / system |
| Workbook uploaded by a person                | `sample.lymphotrack_excel.uploaded`                                               | Authenticated local/LDAP user  |
| QC uploaded by a person                      | `sample.lymphotrack_qc.uploaded`                                                  | Authenticated local/LDAP user  |
| Personal upload rejected or cannot be parsed | `sample.lymphotrack_excel.upload_failed` or `sample.lymphotrack_qc.upload_failed` | Authenticated local/LDAP user  |

Events identify the sample, actor/provider, source request/IP for browser uploads, run information, filenames, media type, byte size, SHA-256 for locally stored artifacts, and parsed QC values where applicable. File contents and nucleotide sequences are never copied into audit metadata. Failed personal uploads use warning severity and failure outcome. Invalid automatically discovered QC files are retried without producing a new MongoDB event every five minutes, preventing repetitive audit-event growth.

## 5. Development fixture loading

The separate `load_design_samples` script is a development/testing utility, not the production ingest path. It upserts sample fixtures from the design JSONL data and removes associated V-QUEST results, reports, jobs, and counters so the samples can be analyzed from a clean state.

## Source-code map

| Responsibility                                  | Implementation                                     |
| ----------------------------------------------- | -------------------------------------------------- |
| Five-minute schedule                            | `backend/src/cll_genie_api/worker.py`              |
| Celery ingestion task                           | `backend/src/cll_genie_api/tasks.py`               |
| Run discovery and result attachment             | `backend/src/cll_genie_api/scripts/ingest.py`      |
| SampleSheet, Stats, and sample-document parsing | `backend/src/cll_genie_api/parsers/ingestion.py`   |
| Workbook and QC parsers                         | `backend/src/cll_genie_api/parsers/lymphotrack.py` |
| Manual uploads and sequence preview API         | `backend/src/cll_genie_api/api/samples.py`         |

---

**[Next: Sequences and Preview Parsing](04_sequences.md)**

# Data model and storage contracts

## Databases

CLL Genie uses two databases through the same configured MongoDB service:

- `cll_genie` for clinical workflow documents;
- `coyote` for shared local user profiles and CLL Genie sessions.

Names are configurable. MongoDB 3.4 compatibility means the implementation
does not depend on transactions, change streams, pipeline updates, modern
schema-validation syntax, or an ODM requiring newer server features.

## `vquest_results`: compatibility-critical collection

This collection remains unchanged. One document corresponds to one sample:

```javascript
{
  _id: ObjectId("sample object id"),
  name: "24AB00001-SHM",
  results: {
    submission_1: {
      vquest_results: {
        "Seq1_24AB00001-SHM": {
          summary: {
            "V-DOMAIN Functionality": "productive",
            "V-GENE and allele": "Homsap IGHV...",
            "V-REGION identity %": 97.59,
            "CLL subset": null,
            "Merge Count": 12345,
            "Total Reads Per": 18.2,
            "Inframe": true,
            "Stop Codon": false
          },
          junction: {
            "JUNCTION-nt nb": 54,
            "JUNCTION decryption": "..."
          }
        }
      },
      vquest_parameters: { /* human-readable IMGT keys and values */ },
      data_added: ISODate("..."),
      results_zip_file: "/absolute/local/path/to/result.zip",
      submission_comments: [
        {
          id: ObjectId("..."),
          text: "reviewed conclusion",
          time_created: ISODate("..."),
          author: "Display Name",
          hidden: false,
          hidden_by: "",
          time_hidden: ""
        }
      ]
    }
  }
}
```

Compatibility rules:

- `_id` equals the corresponding `samples._id`.
- top-level keys remain `_id`, `name`, `results`.
- submission keys remain `submission_<integer>`.
- IMGT column headings remain human-readable keys; they are not renamed.
- Summary and Junction stay separate under each sequence.
- additions use `$set: {"results.submission_N": value}`.
- deletion uses `$unset` against only one nested submission.
- existing documents are never bulk rewritten by startup or index scripts.

The fixture `.design/cll_genie.vquest.jsonl` is decoded as Mongo Extended JSON,
inserted into mongomock, read through `VquestRepository`, and BSON-compared to
prove shape preservation.

## `samples`

Representative fields:

```javascript
{
  _id: ObjectId,
  name: String,
  clarity_id: String,
  run_id: String,
  run_path: String,
  run_number: String,
  flowcell_id: String | null,
  sequencer: String | null,
  assay: "lymphotrack",
  is_control: Boolean,
  total_raw_reads: Number,
  total_raw_bases: Number,
  total_bases: Number | "",
  q30_bases: Number | "",
  q30_per: Number | "",
  lymphotrack_excel: Boolean,
  lymphotrack_excel_path: String,
  lymphotrack_excel_artifact_id: ObjectId,
  lymphotrack_qc: Boolean,
  lymphotrack_qc_path: String,
  lymphotrack_qc_artifact_id: ObjectId,
  is_eligible_for_vquest: Boolean,
  vquest: Boolean,
  report: Boolean,
  date_added: Date
}
```

Empty strings in historical QC fields are tolerated. New parsed QC values are
numeric. Worklist filtering uses `report`; search uses escaped case-insensitive
regex against `name`.

## `analysis_drafts`

Stores immutable input selection context and parsed candidates:

```javascript
{
  _id: ObjectId,
  sample_id: ObjectId,
  status: "PROCESSING" | "READY",
  artifact_id: ObjectId | null,
  filters: {
    sheet_name: String,
    header_row: Number,
    minimum_reads_percent: Number,
    in_frame: "Y" | "N" | "B",
    no_stop_codon: "Y" | "N" | "B"
  },
  sequences: [{ sequence_id, rank, sequence, merge_count,
                total_reads_percent, in_frame, no_stop_codon, length }],
  metadata: Object,
  created_by: String,
  created_at: Date,
  updated_at: Date,
  revision: Number
}
```

## `analysis_jobs`

Jobs are the durable user-visible state machine:

```javascript
{
  _id: ObjectId,
  kind: "LYMPHOTRACK_PARSE" | "VQUEST",
  sample_id: ObjectId,
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED_FINAL",
  payload: Object,
  progress: 0..100,
  message: String,
  error: String,
  result: Object,
  actor: String,
  attempt: Number,
  created_at: Date,
  updated_at: Date
}
```

## `submission_counters`

`{ _id: sample ObjectId, value: integer }`. The first reservation scans
existing compatible submission keys, inserts the maximum, tolerates a racing
insert, and atomically increments with `find_one_and_update`.

## `artifacts`

```javascript
{
  _id: ObjectId,
  relative_path: String,  // unique
  filename: String,
  media_type: String,
  size: Number,
  sha256: String,
  kind: String,
  created_by: String,
  created_at: Date
}
```

Physical layout is
`<ARTIFACT_ROOT>/<logical directory>/<artifact ObjectId>/<safe filename>`.
Database documents store relative paths; the compatibility field
`results_zip_file` stores the resolved absolute location expected by existing
consumers.

## `reports`

Reports are separate from samples and V-QUEST results:

```javascript
{
  _id: ObjectId,
  sample_id: ObjectId,
  sample_name: String,
  submission_id: String | null,
  report_type: "POSITIVE" | "NEGATIVE",
  summary: String,
  created_by: String,
  created_at: Date,
  artifact_id: ObjectId,
  artifact_path: String,
  fact_snapshot: Object,
  rule_trace: Array,
  hidden: Boolean,
  hidden_by: String | null,
  hidden_at: Date | null
}
```

## `report_rules`

See [Report rules](REPORT_RULES.md) for the full schema and behavior. The unique
key is `(rule_key, version)`. Active queries additionally select report type and
language and sort by priority/key.

## `audit_events`

Append-only event records contain actor, action, target, structured details,
and UTC `occurred_at`. Current events cover result/report deletion or restore,
comment visibility, report creation, rule changes, user changes, and V-QUEST
creation.

## `coyote.users`

```javascript
{
  _id: "username",
  password: "Werkzeug hash", // required only for local password login
  fullname: "Display Name",
  email: "address@example.internal",
  groups: ["lymphotrack"],
  enabled: true
}
```

The document is mandatory for local and LDAP login because it is the canonical
application profile.

## `coyote.cll_genie_sessions`

```javascript
{
  _id: "sha256-of-opaque-cookie-token",
  user_id: "username",
  provider: "local" | "ldap",
  csrf_token: "independent high-entropy token",
  created_at: Date,
  last_seen_at: Date,
  expires_at: Date
}
```

Mongo's TTL index removes expired records asynchronously. Request validation
also compares `expires_at` directly, so TTL cleanup delay cannot revive a
session.

## Indexes

`ensure_indexes` creates:

- session TTL on `expires_at` and lookup on `user_id`;
- samples worklist compound index and sample name index;
- result name lookup;
- job chronological and sample/chronological indexes;
- draft sample/chronological index;
- unique artifact `relative_path`;
- report sample/chronological index;
- unique rule `(rule_key, version)`; and
- descending audit time.

Index creation is explicit, idempotent, and must be run before production use.

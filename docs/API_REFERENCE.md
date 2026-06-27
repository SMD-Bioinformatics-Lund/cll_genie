# HTTP API reference

## Conventions

All routes are rooted at `/cll_genie`. API routes use
`/cll_genie/api/v1`. Authentication is an HttpOnly same-origin cookie. Every
state-changing authenticated request also sends `X-CSRF-Token`, obtained from
login or `/auth/me`. JSON dates are ISO 8601 and BSON ObjectIds are strings.

Common failures are 401 unauthenticated, 403 permission/CSRF failure, 404
unknown or hidden resource, 409 invalid workflow state, and 422 invalid input.

## Authentication

| Method and path | Purpose |
|---|---|
| `GET /cll_genie/api/v1/auth/providers` | Enabled provider labels, application version, environment. Public. |
| `POST /cll_genie/api/v1/auth/login` | Authenticate `{provider, username, password}`, set cookie, return session and CSRF token. |
| `GET /cll_genie/api/v1/auth/me` | Restore effective user, groups, permissions, provider, and CSRF token. |
| `POST /cll_genie/api/v1/auth/logout` | CSRF-protected session deletion and cookie expiry. |

## Samples and LymphoTrack

| Method and path | Permission | Behavior |
|---|---|---|
| `GET /cll_genie/api/v1/samples` | authenticated | Query: `search`, optional `report_status`, `page`, `page_size`. Returns page metadata and samples. |
| `GET /cll_genie/api/v1/samples/{sample_id}` | authenticated | Sample, submissions, and reports; hidden content filtered for non-admins. |
| `POST .../artifacts/lymphotrack-excel` | `analysis:create` | Multipart field `file`; `.xlsx`/`.xlsm`; returns artifact metadata. |
| `POST .../artifacts/lymphotrack-qc` | `analysis:create` | Multipart QC file; validates and returns artifact plus numeric QC. |
| `POST .../sequence-drafts` | `analysis:create` | Body `DraftFilters`; creates draft/job; returns IDs with 202. |
| `GET /cll_genie/api/v1/samples/drafts/{draft_id}` | authenticated | Returns filter context, candidates, metadata, status, and revision. |

Draft filter body:

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

`header_row` follows the prior UI contract and is zero-based. Filter enums are
`Y`, `N`, or `B` (both).

## Jobs and submissions

| Method and path | Permission | Behavior |
|---|---|---|
| `GET /cll_genie/api/v1/jobs/{job_id}` | authenticated | Durable state, progress, message, error, and result. |
| `POST /cll_genie/api/v1/drafts/{draft_id}/submit` | `analysis:create` | Body contains 1–50 `sequence_ids` and IMGT `options`; queues V-QUEST. |
| `GET .../samples/{sample_id}/submissions` | authenticated | All submissions with hidden comments filtered when required. |
| `GET .../submissions/{submission_id}` | authenticated | One compatible submission. |
| `GET .../submissions/{submission_id}/zip` | authenticated | Original IMGT ZIP download. |
| `POST .../submissions/{submission_id}/comments` | `comments:create` | Body `{ "text": "..." }`; max 20,000 characters. |
| `PATCH .../comments/{comment_id}` | `results:delete` | Body `{ "hidden": true|false }`. |
| `DELETE .../submissions/{submission_id}` | `results:delete` | Permanently removes only that nested submission; returns 204. |

Supported IMGT options are intersected with backend defaults; unknown keys are
discarded. The frontend exposes species, locus, molecule type, reference set,
indel/subset search, and mutation/D-gene limits.

## Reports

| Method and path | Permission | Behavior |
|---|---|---|
| `GET .../submissions/{submission_id}/report-suggestion` | authenticated | Generated text, clinical facts, and matched-rule trace. |
| `POST .../submissions/{submission_id}/report-preview` | `reports:create` | Body `{summary}`; returns non-persisted HTML. |
| `POST .../submissions/{submission_id}/reports` | `reports:create` | Persists positive HTML artifact/report; returns report and artifact identifiers. |
| `POST /cll_genie/api/v1/samples/{sample_id}/negative-report` | `reports:create` | Persists a no-result report. |
| `GET /cll_genie/api/v1/samples/{sample_id}/reports` | authenticated | Sample reports, hidden records filtered for non-admins. |
| `GET /cll_genie/api/v1/reports` | authenticated | Up to 250 reports, newest first. |
| `GET /cll_genie/api/v1/reports/{report_id}/artifact` | authenticated | HTML download; hidden reports return 404. |
| `PATCH /cll_genie/api/v1/reports/{report_id}` | `results:delete` | Hide/restore with `{hidden}` and recompute sample flag. |

Report summaries must contain 1–50,000 characters.

## Administration

| Method and path | Permission | Behavior |
|---|---|---|
| `GET /cll_genie/api/v1/admin/rules` | `rules:manage` | All rule versions ordered by section/priority. |
| `POST /cll_genie/api/v1/admin/rules` | `rules:manage` | Validate and create a rule; duplicate key/version returns 409. |
| `PUT /cll_genie/api/v1/admin/rules/{rule_id}` | `rules:manage` | Replace editable rule fields and update timestamp. |
| `POST /cll_genie/api/v1/admin/rules/simulate` | `rules:manage` | Evaluate submitted rule against representative facts. |
| `GET /cll_genie/api/v1/admin/users` | `users:manage` | Local profiles without password hashes. |
| `POST /cll_genie/api/v1/admin/users` | `users:manage` | Create local application profile and optional local password. |
| `PATCH /cll_genie/api/v1/admin/users/{username}` | `users:manage` | Update supplied profile fields/password. |
| `GET /cll_genie/api/v1/admin/audit?limit=100` | `users:manage` | Latest 1–500 audit events. |

## Health and documentation

- `GET /cll_genie/health/live` checks that the API process can respond.
- `GET /cll_genie/health/ready` additionally pings MongoDB.
- `/cll_genie/api/v1/docs` and `openapi.json` exist outside production only.

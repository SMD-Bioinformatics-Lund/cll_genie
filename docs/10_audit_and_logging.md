# 10. Audit Events & File Logging

CLL Genie deliberately separates operational diagnostics from durable audit history. Runtime request details, stack traces, and worker diagnostics belong in rotating JSON files and container stdout. Security and business actions belong in the queryable MongoDB `audit_events` collection. Ordinary request logs are never copied into MongoDB.

## Runtime file logging

The API, Celery worker, and scheduler each write a separate JSON Lines file:

```text
${LOG_ROOT}/cll-genie-api.json.log
${LOG_ROOT}/cll-genie-worker.json.log
${LOG_ROOT}/cll-genie-scheduler.json.log
```

Each line contains an ISO-8601 UTC timestamp, severity, logger, service, message, and structured fields. HTTP records also contain `request_id`, client IP, method, path, status code, and duration in milliseconds. Unhandled errors include a stack trace. The API returns the correlation identifier in the `X-Request-ID` response header.

Files rotate at UTC midnight and rotated files are gzip-compressed. `LOG_RETENTION_DAYS` controls the number of daily backups. The handler uses inter-process file locking so Celery's worker processes can safely share their service log. Logs are also written to stdout for `docker compose logs` and external collection. If the configured directory is temporarily unavailable, the application reports the failure to stdout and continues operating there.

## MongoDB audit event schema

Audit writes are append-only. Application workflows do not update or reuse existing audit documents.

```javascript
{
  _id: ObjectId,
  occurred_at: ISODate,
  expires_at: ISODate,
  severity: "info" | "warning" | "error" | "critical",
  category: "security" | "identity" | "configuration" | "data" |
            "analysis" | "reporting" | "activity" | "system",
  event_type: "auth.login.failed",
  message: "Authentication attempt was rejected",
  outcome: "success" | "failure" | "denied",
  actor: {
    username: "jsmith",
    fullname: "Jane Smith",
    roles: ["user"],
    provider: "local" | "ldap" | null
  },
  resource: {
    type: "sample" | "submission" | "report" | "analysis_job" | "user" | null,
    id: "stable resource identifier",
    name: "optional display name"
  },
  source: {
    application: "cll-genie",
    environment: "production",
    request_id: "UUID correlation identifier",
    client_ip: "proxy-resolved client address",
    method: "POST",
    path: "/cll_genie/api/v1/auth/login",
    user_agent: "browser description"
  },
  tags: ["authentication", "failed-login"],
  metadata: { provider: "ldap" }
}
```

Metadata is intentionally bounded and recursively sanitized. Keys resembling password, secret, token, cookie, authorization, sequence, report body, or file content are redacted. Values and collection sizes are capped. Report summaries, sequence data, uploaded contents, session tokens, LDAP secrets, and credentials must never be placed in an audit event.

## Severity conventions

- `info`: expected successful activity, such as sign-in, uploads, report creation, or job completion.
- `warning`: rejected access, failed login, destructive action, role/enablement change, or hidden clinical content.
- `error`: a workflow failed and needs investigation, such as a failed V-QUEST job.
- `critical`: the audit persistence mechanism itself failed or another security-critical condition threatens traceability. Persistence failures are also emitted to the runtime log.

Severity describes operational importance; `outcome` independently records whether the requested activity succeeded, failed, or was denied.

## Recorded event families

The current implementation records successful and failed login, logout, missing or invalid sessions, authorization denials, profile changes, user administration, report-rule changes, operational task-control changes, manual ingestion queueing, sample registration and duplicate-name skips, LymphoTrack attachment and uploads, V-QUEST queue/success/failure, comments, report creation/access/hide/restore, and permanent sample or submission deletion.

Resource metadata includes useful, non-sensitive measurements where available: uploaded file size, selected sequence count (never sequences), V-QUEST option names, rule match count, job ID, sample ID, submission ID, report ID, and artifact ID. These fields support activity and resource-volume monitoring without turning MongoDB into an operational log sink.

## Retention and indexes

`AUDIT_RETENTION_DAYS` defaults to 730 days. Every document receives `expires_at`, and the `ttl_audit_expiry` index uses `expireAfterSeconds: 0`. MongoDB removes expired documents asynchronously. Change retention only after confirming organizational and legal requirements.

Indexes support newest-first browsing and filtering by severity, category, event type, actor, and tags. Because only material security/business events are stored, the collection grows with user actions rather than with every application log line.

Run index creation after deployment or configuration changes:

```bash
docker compose exec api python -m cll_genie_api.scripts.ensure_indexes
```

Index initialization is independent per index. If existing data violates a unique-index requirement, CLL Genie emits a structured warning containing the collection, index name, and MongoDB error code, then continues creating the remaining indexes. Index initialization does not delete or rewrite application data. Resolve reported duplicate data separately; an unrelated index conflict does not prevent audit-index initialization or application startup.

## Administration UI and API

Only users with the `admin` role can open **Administration → Audit logs**. The page shows severity totals, newest-first events, actor/IP, affected resource, outcome, tags, request correlation, safe metadata, and expiry. Filters cover severity, category, username, and free text across message, event type, resource identifiers, resource names, and tags. Results are server-paginated at 50 events per page and refresh every 30 seconds.

The UI calls:

```http
GET /cll_genie/api/v1/admin/audit-logs?page=1&limit=50
    &severity=warning&category=security&actor=jsmith&search=failed-login
    &from=2026-06-29T00:00:00Z&to=2026-06-30T00:00:00Z
```

The endpoint returns `items`, `total`, `page`, `page_size`, `severity_counts`, and available `categories`. Invalid severity, outcome, or time-range values return HTTP 422. Non-administrators receive HTTP 403, and that denied request is itself auditable.

## Monitoring recommendations

Use event type plus outcome for alerts instead of matching display text. Useful initial rules include repeated `auth.login.failed` events from one actor or IP, any `critical` event, bursts of `security.access.denied`, `vquest.analysis.failed`, administrative role changes, and destructive-action tags. For longer retention, export audit documents to the organization's security platform before TTL expiry rather than disabling retention indefinitely.

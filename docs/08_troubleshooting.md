# 8. Troubleshooting

This guide lists common runtime symptoms, diagnostic commands, and corrective actions.

## V-QUEST / IMGT Errors

Because CLL Genie relies on scraping the external IMGT/V-QUEST web service, it is susceptible to IMGT downtime.

- **`IMGT/V-QUEST returned HTTP 502/503`**: IMGT may be unavailable for maintenance or overloaded. Wait 15 minutes and retry the submission.
- **`IMGT/V-QUEST could not be reached`**: The Celery worker cannot access the internet, or IMGT's servers are completely offline.
- **`IMGT/V-QUEST returned an unexpected response`**: IMGT may have changed their HTML layout, breaking the scraper. Contact an administrator to update the `vquest.py` parser.

> [!TIP]
> A failed submission is marked as `ERROR` in the UI. Retain the sample and create another submission after resolving the underlying issue.

## Upload and Parsing Errors

- **`Missing required columns`**: The LymphoTrack Excel file does not contain the exact column headers expected (e.g., `Rank`, `Sequence`, `% total reads`). Ensure you are uploading the _Merged Read Summary_ worksheet.
- **`The LymphoTrack QC file is invalid`**: The uploaded QC document is not a valid text-based TSV/CSV format or is missing the `totalCount` or `countQ30` keys.

## Application State Errors

- **Missing Artifact ID**: The report record does not reference a usable generated artifact. Hide the affected report, review API and worker logs for the PDF-generation error, and generate the report again.

## Checking Docker Logs

Container logs provide the primary runtime diagnostics for the API, worker, and scheduler.

```bash
# View backend API logs
docker-compose logs api

# View Celery worker logs (where IMGT analysis happens)
docker-compose logs worker

# View all logs in real-time
docker-compose logs -f
```

## Runtime and Audit Logs

Runtime diagnostics are JSON Lines files named `cll-genie-api.json.log`, `cll-genie-worker.json.log`, and `cll-genie-scheduler.json.log` under `${LOG_ROOT}`. They rotate at UTC midnight and are retained according to `LOG_RETENTION_DAYS`. The same records are emitted to container stdout, so `docker compose logs` remains useful.

## Celery cannot connect to MongoDB

### Symptom

The worker reports `ServerSelectionTimeoutError`, often mentioning `host.docker.internal:27017` or `Connection refused`.

### Resolution

Use a `MONGODB_URI` that is reachable from the application containers:

- Compose MongoDB: `mongodb://mongo:27017`, with the `mongo` profile enabled.
- Host-installed MongoDB: use the Docker host address, verify the active bridge gateway, and permit traffic from the Docker network.
- Remote MongoDB: use its reachable DNS name or IP address and required connection options.

Do not use `localhost` or `127.0.0.1` for a host-installed MongoDB service because those addresses refer to the application container itself.

Recreate the affected services with the complete development command:

```bash
docker compose --env-file .env.dev \
  -f compose.yaml -f compose.dev.yaml \
  up -d --force-recreate worker scheduler
```

Verify connectivity from the worker:

```bash
docker compose --env-file .env.dev \
  -f compose.yaml -f compose.dev.yaml \
  exec worker python -c \
  "from cll_genie_api.infrastructure.mongo import get_collections; print(get_collections().samples.count_documents({}))"
```

Add `--profile mongo` to these commands when using the optional Compose MongoDB service.

Do not run a plain `docker compose up` for development: it omits `compose.dev.yaml` and may recreate services using `.env` production/base settings.

Security and business audit events are separate, structured documents in MongoDB's `audit_events` collection. Administrators inspect them under **Administration → Audit logs**. See [Audit Events & File Logging](10_audit_and_logging.md) for the schema, retention policy, filters, redaction, and event catalog.

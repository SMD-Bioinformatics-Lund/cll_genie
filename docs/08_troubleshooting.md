# 8. Troubleshooting & Errors

While CLL Genie automates the heavy lifting, environmental issues or external service outages can cause errors. Below are common issues and how to resolve them.

## V-QUEST / IMGT Errors

Because CLL Genie relies on scraping the external IMGT/V-QUEST web service, it is susceptible to IMGT downtime.

- **`IMGT/V-QUEST returned HTTP 502/503`**: IMGT is currently down for maintenance or overloaded. Wait 15 minutes and retry the submission.
- **`IMGT/V-QUEST could not be reached`**: The Celery worker cannot access the internet, or IMGT's servers are completely offline.
- **`IMGT/V-QUEST returned an unexpected response`**: IMGT may have changed their HTML layout, breaking the scraper. Contact an administrator to update the `vquest.py` parser.

> [!TIP]
> If a submission fails, it will be marked as `ERROR` in the UI. You do not need to delete the sample; you can simply create a new submission once the issue is resolved.

## Upload and Parsing Errors

- **`Missing required columns`**: The LymphoTrack Excel file does not contain the exact column headers expected (e.g., `Rank`, `Sequence`, `% total reads`). Ensure you are uploading the *Merged Read Summary* worksheet.
- **`The LymphoTrack QC file is invalid`**: The uploaded QC document is not a valid text-based TSV/CSV format or is missing the `totalCount` or `countQ30` keys.

## Application State Errors

- **Missing Artifact ID**: An older bug that occurred when reports were generated but the PDF generation failed silently. If you encounter this, hide the broken report and click "Generate Report" again to spin up a fresh artifact.

## Checking Docker Logs

For administrators troubleshooting deeper issues, the Docker logs are your best friend.

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

### Development fix

Docker-based development must use `MONGODB_URI=mongodb://mongo:27017` from `.env.dev`. The host-published `MONGO_DEV_PORT` is for tools running on the host and must not be used by application containers.

Recreate the affected services with the complete development command:

```bash
docker compose --env-file .env.dev \
  -f compose.yaml -f compose.dev.yaml \
  --profile mongo up -d --force-recreate worker scheduler
```

Verify connectivity from the worker:

```bash
docker compose --env-file .env.dev \
  -f compose.yaml -f compose.dev.yaml \
  --profile mongo exec worker python -c \
  "from cll_genie_api.infrastructure.mongo import get_collections; print(get_collections().samples.count_documents({}))"
```

Do not run a plain `docker compose up` for development: it omits `compose.dev.yaml` and may recreate services using `.env` production/base settings.

Security and business audit events are separate, structured documents in MongoDB's `audit_events` collection. Administrators inspect them under **Administration → Audit logs**. See [Audit Events & File Logging](10_audit_and_logging.md) for the schema, retention policy, filters, redaction, and event catalog.

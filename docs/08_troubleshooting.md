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

## System Audit Logs

All sensitive actions (creating samples, updating users, submitting analysis, and hiding reports) are written through the audit logger into `${LOG_ROOT}/app.log`. The file rotates daily and retains 30 backups.

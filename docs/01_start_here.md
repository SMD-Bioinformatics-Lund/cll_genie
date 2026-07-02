# 1. Introduction

CLL Genie supports the CLL IGHV workflow between completed sequencing runs and clinical report preparation.

## Workflow

1. Register eligible samples from a completed Illumina run.
2. Attach LymphoTrack Dx workbook and QC outputs to the registered samples.
3. Let a user review and filter workbook sequences.
4. Submit selected sequences to IMGT/V-QUEST through a Celery worker.
5. Parse and retain the IMGT response.
6. Apply active report rules and let a user review the report text.
7. Store the generated report record and HTML artifact; produce a PDF when requested.

The application reduces manual transfer between LymphoTrack and IMGT, but it does not replace review of source data, selected sequences, clinical text, or the final report.

## Intended users

- Laboratory and clinical staff use the worklist, analysis, comments, and reports.
- Administrators manage users, roles, report rules, and audit events.
- System administrators operate Compose services, MongoDB, storage, backups, and monitoring.

## Architecture

- The React frontend provides the browser interface and uses Tailwind CSS for styling.
- The FastAPI service handles authentication, authorization, application data, and HTTP endpoints.
- Celery workers run scheduled ingestion and IMGT/V-QUEST analysis. Redis provides the queue and result backend.
- MongoDB stores users, sessions, samples, submissions, jobs, rules, reports, and audit events.
- Uploaded and generated files are stored below `ARTIFACT_ROOT`. Automatically discovered LymphoTrack files remain in their configured external results directory.
- Nginx serves the frontend and proxies API requests through the configured application prefix.

See [Installation and setup](02_installation.md) for deployment requirements.

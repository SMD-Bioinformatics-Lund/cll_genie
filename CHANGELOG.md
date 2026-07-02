# Changelog

## [2.0.0] - 2026-07-02

### Added

- React and Tailwind CSS web interface with light and dark themes.
- FastAPI service, Celery worker and scheduler, Redis queue, and Nginx proxy deployment.
- Local and LDAP login using authorization profiles stored in the CLL Genie database.
- Role-based administration for users, report rules, hidden content, and audit events.
- Scheduled Illumina run registration, LymphoTrack result attachment, QC parsing, and manual workbook/QC uploads.
- Asynchronous IMGT/V-QUEST submissions with progress reporting, response validation, and retained ZIP artifacts.
- Positive and negative clinical reports, report previews, PDF downloads, comments, and report history.
- Structured JSON runtime logs, request correlation IDs, audit retention, and application system-status checks.

### Changed

- Replaced the Flask application and server-rendered interface with separate API and frontend services.
- Replaced Material UI with repository-owned Tailwind CSS components.
- Moved users and application data into the configured CLL Genie database.
- Made deployment paths, MongoDB connectivity, LDAP settings, resource limits, and runtime UID/GID configurable.
- Centralized the application version in `backend/src/cll_genie_api/version.py`.
- Added direct actions for analysis, result viewing, report viewing, artifact downloads, and confirmed uploads from sample pages.

### Operational notes

- Existing users must have an explicit `allowed_login_methods` array containing `ldap`, `local`, or both.
- Existing `lymphotrack` roles must be changed to `user`. Accounts may have one or more of `admin`, `lymphotrack_admin`, and `user`; permissions are additive.
- The API, worker, and scheduler must be able to write to `LOG_ROOT` and `ARTIFACT_ROOT` using `APP_UID:APP_GID`.
- Development can use the optional MongoDB Compose profile, a host-installed MongoDB service, or a remote MongoDB server.
- Duplicate sample names are skipped during run registration and recorded as warning audit events requiring manual review.

## [1.1.1]

- Added the IMGT/V-QUEST molecule-type selector and included `moleculeType` in submissions.
- Made the sequence text area expand to fit its FASTA content.

## [1.1.0]

- Registered control samples with run-specific names such as `POS-SHM-R0000`.
- Corrected IGHV mutation-status text in reports.
- Opened report previews in a separate browser tab.
- Added run number and control status to the sample table.

## [1.0.0]

- Initial release.

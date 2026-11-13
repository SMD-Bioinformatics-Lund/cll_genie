# CHANGELOG

## v1.2.0 — 2026-11-13

### Installation and development

- Require deployment settings from each environment file, including port, URL prefix, container name, database, paths, and DNS.
- Use Python 3.11 on Debian Bullseye with signed archived repositories for older Docker hosts; include the PDF font runtime.
- Add a dedicated development installer with isolated defaults and source reloading.
- Validate deployment configuration and restore the previous container on startup failure.
- Read the runtime version from version.py and pass the configured secret correctly.
- Stop logging development configuration secrets and separate dev session cookies.

### Reporting

- Use smd-reports 0.5.3 for newly generated CLL Genie HTML reports and previews.
- Add shared sequence-table captions and a dedicated bordered reference table.
- Align PDF rendering dependencies with the shared report package.
- Preserve existing saved reports and report storage contracts.
- Rename the analysis center to Sektion för molekylär diagnostik (SMD).
- Remove brackets around U-CLL/M-CLL in generated summaries and update Nationellt Vårdprogram citations to 2026.


## v1.1.1
- Added a visible V-QUEST molecule type selector, defaulting to Unknown, so submissions include the current IMGT-required moleculeType parameter. The sequence textarea now auto-expands to fit its prefilled FASTA content.


## v1.1.0
- Control samples can now be loaded into the database
- Control samples are suffixed with run_number to avoid conficts between the runs, since the names are same across different runs7
- Control sample naming format `POS-SHM-R0000`, `NEG-SHM-R0000`, `IGHSHM-SHM-R0000`
- Fix IGHV mutation status in CLL Genie svarstext to display only the correct status (M-CLL or U-CLL)
- Preview reports will now be opened in a new tab
- Added run number and is control columns in the samples table

## v1.0.0
- Initial release of the project.
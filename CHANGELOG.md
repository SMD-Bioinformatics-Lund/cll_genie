# Changelog

## v1.2.0 — 2026-11-13

- Adopt `smd-reports 0.5.3` with an SVG logo, SMD contact information, grouped results, and numbered references. Existing saved reports remain readable.
- Add HTML downloads from report previews without finalizing reports.
- Update Swedish report headings, remove brackets around M-CLL/U-CLL, and cite Nationellt Vårdprogram 2026.
- Add self-contained production/dev installers with environment-based configuration, source reloading, startup checks, and rollback.
- Improve deployment logs and automatically detect public URLs, with `PUBLIC_BASE_URL` overrides.
- Fix secret handling and isolate development session cookies.
- Support older Docker hosts with Python 3.11, signed Debian Bullseye archives, and PDF dependencies.

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
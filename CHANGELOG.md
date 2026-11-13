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

- Add V-QUEST molecule-type selection (default: Unknown) and an auto-expanding sequence input.

## v1.1.0

- Import controls with run-number suffixes, such as `POS-SHM-R0000`, and display control/run metadata.
- Correct IGHV mutation-status wording to show the applicable M-CLL or U-CLL status.
- Open report previews in a new tab.

## v1.0.0

- Initial release.

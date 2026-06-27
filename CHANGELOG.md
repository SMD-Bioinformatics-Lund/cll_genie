# Changelog

## 2.0.0

- Rebuilt CLL Genie as a FastAPI and React application at `/cll_genie`.
- Preserved the MongoDB 3.4 `vquest_results` contract and local login behavior.
- Added optional LDAP password authentication backed by local application profiles.
- Added queued LymphoTrack and IMGT/V-QUEST workflows and immutable local artifacts.
- Added dynamic report rules, full Clarity-compatible reports, administration, and audit events.
- Added a responsive light/dark interface, redesigned brand, single-port Nginx topology, and CI.
- Standardized application styling on Tailwind CSS 4.3 with Material UI retained for accessible widgets.
- Added a development Compose override with a validated MongoDB 3.4.24 container; production remains external-MongoDB only.

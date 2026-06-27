# Testing and validation

## Automated checks

Backend:

```bash
ruff format --check backend/src backend/tests
ruff check backend/src backend/tests
pytest -q backend/tests
python -m compileall -q backend/src
```

Frontend:

```bash
cd frontend
npm ci
npm run lint
npm run test
npm run build
```

Deployment:

```bash
docker compose config --quiet
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
docker compose build
git diff --check
```

GitHub Actions executes backend, frontend, Compose, and image jobs on pull
requests and pushes to main.

## Current backend test intent

- `test_identity.py`: local document adaptation, permissions, Werkzeug local
  authentication, LDAP authentication with a mocked directory, and disabled or
  missing-local-profile behavior.
- `test_auth_api.py`: every registered route remains under `/cll_genie`,
  provider/login/me/logout paths, scoped session cookie, and CSRF behavior.
- `test_lymphotrack_parser.py`: workbook column parsing/filtering and QC metrics.
- `test_vquest_parser.py`: required V-QUEST tables and typed structured result.
- `test_vquest_compatibility.py`: byte-level BSON shape equivalence for the
  Extended JSON fixture and targeted addition without rewriting submission 1.
- `test_reporting.py`: exact mutation thresholds, Swedish facts/text,
  deterministic rule trace, invalid operator types, Clarity report fields, and
  HTML escaping.
- `test_artifacts.py`: repeated same-name uploads create distinct immutable
  physical files.
- `test_design_loader.py`: sample fixtures are upserted while matching V-QUEST,
  report, draft, job, and counter state is removed.

Frontend tests cover accessible branding and exact-once `/cll_genie` URL
prefixing. TypeScript compilation, ESLint, and production bundling validate the
complete route/component graph.

## Container smoke validation

With `.env` configured and MongoDB reachable:

```bash
docker compose up -d redis api proxy
curl --fail http://127.0.0.1:8080/cll_genie/health/live
curl --fail http://127.0.0.1:8080/cll_genie/health/ready
curl --fail http://127.0.0.1:8080/cll_genie/api/v1/auth/providers
curl --fail http://127.0.0.1:8080/cll_genie/ | grep '<title>CLL Genie</title>'
docker compose down
```

Also verify that `/api/v1/...` without `/cll_genie` returns 404 and that a deep
SPA URL such as `/cll_genie/reports` returns the React index through Nginx.

## Laboratory acceptance matrix

Automated tests do not replace clinical validation. Before production release,
use de-identified known-good cases covering:

1. local analyst and administrator login;
2. LDAP analyst and administrator login using local profiles;
3. disabled local profile rejection for both providers;
4. clinical and control SampleSheet registration;
5. multi-lane Stats.json aggregation;
6. valid and malformed LymphoTrack QC;
7. workbook default sheet/header and each productivity filter;
8. decimal-comma and numeric cell handling;
9. single and multiple selected sequences;
10. IMGT timeout, HTML rejection, malformed ZIP, and successful ZIP;
11. existing sample with prior `submission_N` counter initialization;
12. M-CLL values below 97.00;
13. exact 97.00 and 97.99 borderline boundaries;
14. exact 98.00 and higher U-CLL values;
15. mixed status, nonproductive, subset none/#2/#8/conflict branches;
16. report preview and persisted export;
17. Clarity placeholder replacement and downstream PDF creation;
18. Swedish wording and references reviewed by qualified staff;
19. comment/report hide and restore authorization;
20. submission deletion restricted and audited;
21. Apache publication at `/cll_genie/` including refresh on deep routes;
22. dark/light modes and desktop/mobile layouts; and
23. MongoDB plus artifact restore from the organizational backup service.

For each case archive input IDs, application version, rule versions, expected
facts, expected report text, observed result, reviewer, and approval date.

## Release evidence

A release record should contain:

- commit and image digests;
- `.env` configuration checksum with secrets excluded;
- MongoDB server/driver versions;
- active rule key/version list;
- automated test logs;
- container health and Apache smoke results;
- clinical acceptance matrix; and
- rollback decision and responsible approvers.

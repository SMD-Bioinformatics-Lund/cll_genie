# CLL Genie 2.0

CLL Genie is the clinical workflow for LymphoTrack Dx processing,
IMGT/V-QUEST analysis, result review, and Clarity-compatible IGHV reporting.

This repository contains only the current application: FastAPI, React,
Tailwind CSS 4, Material UI, Celery, Redis, and Nginx. Production connects to
the existing organizational MongoDB 3.4 service. Development can start an
isolated MongoDB 3.4 container through `compose.dev.yaml`. Artifacts remain on
the local filesystem; the application does not deploy MinIO or database-backup
tooling.

## Application URL

Every browser, API, health, and static route is beneath `/cll_genie`:

- UI: `https://server/cll_genie/`
- API: `https://server/cll_genie/api/v1/`
- health: `https://server/cll_genie/health/live`

The prefix is retained through Apache and Nginx; it is not stripped by proxying.

## Capabilities

- existing Werkzeug local login and optional TLS-protected LDAP authentication;
- canonical local `coyote.users` profiles, groups, and permissions for both methods;
- automated MiSeq/sample registration and LymphoTrack Excel/QC attachment;
- filtered sequence selection and durable queued IMGT/V-QUEST processing;
- exact MongoDB 3.4 `vquest_results` compatibility;
- immutable local artifacts, comments, audit events, and administrative controls;
- deterministic database-driven Swedish clinical summary rules;
- full positive/no-result Clarity-compatible HTML reports; and
- responsive accessible React interface with light/dark modes and Lucide icons.

## Start

### Development with MongoDB 3.4 in Docker

```bash
cp .env.example .env
docker compose -f compose.yaml -f compose.dev.yaml up -d mongo redis
docker compose -f compose.yaml -f compose.dev.yaml run --rm api python -m cll_genie_api.scripts.ensure_indexes
docker compose -f compose.yaml -f compose.dev.yaml run --rm api python -m cll_genie_api.scripts.seed_rules
docker compose -f compose.yaml -f compose.dev.yaml up -d
docker compose -f compose.yaml -f compose.dev.yaml exec -T api python -m cll_genie_api.scripts.load_design_samples < .design/cll_genie.sample.jsonl
```

MongoDB is available to the containers as `mongo:27017` and to host-side tools
at `127.0.0.1:${MONGO_DEV_PORT:-27017}`. The final command imports only sample
fixtures and clears matching analysis/result/report records; it never imports
`.design/cll_genie.vquest.jsonl`.

### Production with external MongoDB

```bash
cp .env.example .env
# Configure MongoDB, LDAP, local paths, cookies, and IMGT in .env.
docker compose build
docker compose run --rm api python -m cll_genie_api.scripts.ensure_indexes
docker compose run --rm api python -m cll_genie_api.scripts.seed_rules
docker compose up -d
```

Open `http://localhost:8080/cll_genie/`. Only Nginx publishes a host port.

## Repository

```text
backend/       FastAPI, domain logic, parsers, workers, reports, scripts, tests
frontend/      React/TypeScript client
docker/        production image and Nginx configuration
docs/          complete codebase and operations reference
.design/       de-identified Mongo Extended JSON compatibility fixtures
compose.yaml   API, worker, scheduler, Redis, and single proxy entrypoint
compose.dev.yaml  development-only MongoDB 3.4 override
```

Start with the [documentation index](docs/README.md). Deployment and Apache
configuration are documented in
[Deployment and operations](docs/DEPLOYMENT_AND_OPERATIONS.md).
The original repository analysis remains available in the
[Technical Remodeling Blueprint](docs/TECHNICAL_REMODELING_BLUEPRINT.md).

## Verify

```bash
ruff format --check backend/src backend/tests
ruff check backend/src backend/tests
pytest -q backend/tests
cd frontend && npm ci && npm run lint && npm run test && npm run build
cd .. && docker compose config --quiet && docker compose build
```

Internal software developed by Section for Molecular Diagnostics (SMD), Lund.

# Deployment and operations

## Requirements

- Docker Engine with Compose v2
- existing reachable MongoDB 3.4 service
- host paths for local artifacts, MiSeq runs, and LymphoTrack results
- outbound HTTPS access to the configured IMGT/V-QUEST endpoint
- LDAP/LDAPS connectivity when enabled
- Apache publication configuration and TLS certificate

The production stack does not deploy MongoDB, MinIO, or a MongoDB backup
process. The development override intentionally provides MongoDB 3.4 for
workstations that do not have a local installation.

## Configure

```bash
cp .env.example .env
chmod 600 .env
```

Set at minimum the MongoDB URI/database names, authentication providers,
artifact and instrument paths, IMGT URL/timeouts, and production cookie flags.
When Apache publishes HTTPS, set `COOKIE_SECURE=true`.

Important path variables:

| Variable | Container use |
|---|---|
| `CLL_ARTIFACT_ROOT` | read/write bind mount shared by API and worker. |
| `MISEQ_RUN_ROOT` | scheduler run discovery and marker creation. |
| `LYMPHOTRACK_RESULTS_ROOT` | scheduler/worker read-only result discovery. |

`APPLICATION_PREFIX` and `API_PREFIX` should remain `/cll_genie` and
`/cll_genie/api/v1` unless source, proxy, tests, and Apache are deliberately
changed together.

## Build and initialize

### Development database and full stack

The official MongoDB 3.4 image is amd64-only. `compose.dev.yaml` therefore pins
`platform: linux/amd64`; Docker Desktop on Apple Silicon runs it through
emulation.

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d mongo redis
docker compose -f compose.yaml -f compose.dev.yaml run --rm api python -m cll_genie_api.scripts.ensure_indexes
docker compose -f compose.yaml -f compose.dev.yaml run --rm api python -m cll_genie_api.scripts.seed_rules
docker compose -f compose.yaml -f compose.dev.yaml up -d
docker compose -f compose.yaml -f compose.dev.yaml exec -T api python -m cll_genie_api.scripts.load_design_samples < .design/cll_genie.sample.jsonl
```

The override replaces API, worker, and scheduler `MONGODB_URI` with
`mongodb://mongo:27017`. Host tools may connect through loopback port
`MONGO_DEV_PORT`, default 27017. Development data persists in
`mongo_dev_data`; remove it only when intentionally resetting the development
database:

```bash
docker compose -f compose.yaml -f compose.dev.yaml down
docker volume rm cll-genie_mongo_dev_data
```

The sample loader is deliberately destructive only for records matching the
fixture sample ObjectIds: it upserts `samples`, forces V-QUEST/report/eligibility
flags false, and removes matching V-QUEST results, reports, drafts, jobs, and
counters. It does not read or import the V-QUEST fixture.

### Production initialization

```bash
docker compose build
docker compose run --rm api python -m cll_genie_api.scripts.ensure_indexes
docker compose run --rm api python -m cll_genie_api.scripts.seed_rules
docker compose up -d
```

Index and rule seed commands are required for a fresh application deployment.

## Services

| Service | Function | Published port |
|---|---|---|
| `proxy` | Nginx static frontend and reverse proxy | `${CLL_GENIE_PORT:-8080}` |
| `api` | FastAPI application | none; `8000` private |
| `worker` | LymphoTrack and V-QUEST tasks | none |
| `scheduler` | five-minute ingestion trigger | none |
| `redis` | Celery broker/result backend | none |
| `mongo` | development-only MongoDB 3.4 fixture | loopback-only development port |

Compose uses two private networks. Only Nginx belongs to the edge and backend
networks. Production MongoDB is reached through the configured external URI
(the default host example uses `host.docker.internal`; Linux receives the
host-gateway mapping). Development services reach the override container as
`mongo:27017`.

Celery Beat writes its disposable local schedule database under `/tmp`; the
authoritative schedule is declared in source and job/business state remains in
MongoDB, so this file does not require a persistent volume.

## Apache reverse proxy

Preserve the `/cll_genie` prefix on both sides:

```apache
ProxyPreserveHost On
RequestHeader set X-Forwarded-Proto "https"

ProxyPass        /cll_genie/ http://127.0.0.1:8080/cll_genie/
ProxyPassReverse /cll_genie/ http://127.0.0.1:8080/cll_genie/

# Normalize the no-trailing-slash URL.
RedirectMatch 301 ^/cll_genie$ /cll_genie/
```

Do not use a target ending at `/`; that would strip the prefix Apache-side
while FastAPI expects it. Restrict port 8080 to loopback/firewall where Apache
and Docker share the host. If Apache adds authentication, caching, or response
headers, verify they do not interfere with the application cookie, CSRF header,
HTML reports, or hashed assets.

## Nginx path behavior

- `/` redirects to `/cll_genie/` for direct host smoke tests.
- `/cll_genie` redirects to the trailing-slash form.
- `/cll_genie/api/*` and `/cll_genie/health/*` retain their path into FastAPI.
- `/cll_genie/assets/*` is immutable for one year because filenames are hashed.
- other `/cll_genie/*` paths fall back to the SPA index.
- unrelated paths return 404.

The API upstream uses Docker's embedded DNS resolver with periodic re-resolution,
so recreating the API container does not leave Nginx pinned to its previous
container IP.

## Local development

Backend:

```bash
python3.11 -m venv .venv
. .venv/bin/activate
pip install -e 'backend[dev]'
uvicorn cll_genie_api.main:app --app-dir backend/src --reload
```

Frontend in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173/cll_genie/`. Vite forwards
`/cll_genie/api` and `/cll_genie/health` to port 8000.

For synchronous task debugging set `CELERY_EAGER=true` in the backend process.

## Health and smoke checks

```bash
curl --fail http://127.0.0.1:8080/cll_genie/health/live
curl --fail http://127.0.0.1:8080/cll_genie/health/ready
curl --fail http://127.0.0.1:8080/cll_genie/api/v1/auth/providers
curl --fail http://127.0.0.1:8080/cll_genie/
docker compose ps
docker compose logs --tail=200 api worker scheduler proxy
```

Liveness does not prove MongoDB access. Apache monitoring should normally use
readiness; container health uses liveness so a database outage does not create
an API restart loop.

## Routine operations

```bash
docker compose pull                 # Redis/base changes when tags are updated
docker compose build --pull
docker compose up -d
docker compose logs -f worker
docker compose run --rm api python -m cll_genie_api.scripts.ingest
```

Configuration or code changes require rebuilding relevant images. Rule/user
changes through the UI do not.

## Filesystem permissions

The backend image runs as UID/GID `10001`. The artifact bind mount must allow
that identity to create directories and files. Scheduler run mounts must allow
the configured container identity to read inputs and create
`cll_genie.done`; the LymphoTrack results mount is read-only.

## Backup and recovery ownership

MongoDB recovery is external to this stack. Include the following in the
organizational plan:

- both `cll_genie` and relevant `coyote` collections;
- synchronized artifact filesystem backup;
- `.env` recovery through the approved secret-management process; and
- restore testing that verifies artifact metadata paths and report downloads.

Redis contains queue/result state and is append-only in its Docker volume, but
MongoDB remains the authoritative job/business state. Losing Redis may require
manually re-queuing failed work; it does not alter completed V-QUEST results.

## Upgrade and rollback

1. Build and test the new image set without changing MongoDB documents.
2. Stop new clinical work or establish an agreed short maintenance window.
3. Record current image IDs and configuration version.
4. Deploy and run health plus representative read-only checks.
5. Exercise one validation workflow before general release.
6. Roll back image versions if needed. Because `vquest_results` is unchanged and
   new concerns are separate collections, rollback does not require rewriting
   result documents.

Never run destructive MongoDB cleanup as part of application rollback.

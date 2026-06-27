# Architecture

## Purpose

CLL Genie is a clinical workflow application for registering IGHV samples,
attaching LymphoTrack Dx results, selecting candidate sequences, submitting
those sequences to IMGT/V-QUEST, reviewing structured results, and producing
HTML artifacts for downstream Clarity report completion.

The implementation is a modular monolith: one backend codebase owns the
clinical invariants and one React client consumes its HTTP API. Long-running or
filesystem-scanning work executes in separate worker processes.

## Runtime topology

```text
User browser
    |
    | HTTPS /cll_genie/*
    v
Organizational Apache
    |
    | reverse proxy; path retained
    v
Nginx container :80                 sole published application port
    |-- /cll_genie/                 compiled React files
    |-- /cll_genie/api/* ----------+
    |-- /cll_genie/health/*         |
                                      v
                                  FastAPI :8000
                                      |
                       +--------------+---------------+
                       |                              |
                  MongoDB 3.4                    Redis 7
             existing local service          private Docker network
                       ^                              ^
                       |                              |
                  Celery worker <--------------------+
                       ^
                       |
                  Celery scheduler
                       |
              MiSeq and LymphoTrack paths
```

MongoDB is deliberately absent from the production Compose file. Backup and
recovery remain the responsibility of the existing organizational database
service. `compose.dev.yaml` adds a pinned MongoDB 3.4 container only for local
development, with its own named volume and loopback-only host port. Artifacts
are ordinary local files on a bind-mounted filesystem; there is no MinIO or
object-store dependency.

## Components

### Reverse proxy

Nginx is the container entrypoint. It serves immutable hashed assets, returns
the SPA entry document for client routes, and forwards API and health paths to
FastAPI without stripping `/cll_genie`. Security headers are applied to every
response. Apache remains the externally managed TLS and publication layer.

### Frontend

The client uses React 19, TypeScript, Tailwind CSS 4.3 through its first-party
Vite plugin, React Router, TanStack Query, Material UI, Emotion, and Lucide.
Tailwind owns application layout, responsive behavior, design tokens, and
custom component classes. Material UI remains the accessible widget layer for
dialogs, fields, tabs, steppers, and tables; its theme consumes the same
light/dark brand palette. `BrowserRouter` has a `/cll_genie` basename. All HTTP
URLs pass through `applicationUrl`, so generated links and requests retain the
prefix. Route modules are lazy-loaded and the production bundle is split into
React, MUI, query, icon, vendor, and page chunks.

### API

FastAPI exposes typed request validation, authentication/session endpoints,
sample and artifact operations, analysis jobs, V-QUEST results, reports, and
administration. API handlers coordinate repositories and domain services; they
do not perform long-running IMGT calls inline.

### Worker and scheduler

Celery uses Redis as broker and result backend. The worker parses LymphoTrack
workbooks and performs IMGT/V-QUEST jobs. Celery Beat invokes ingestion every
300 seconds. Job progress is persisted in MongoDB, so the UI does not depend on
Celery's transient task-result representation.

### Persistence

PyMongo 3.13 is intentionally used for MongoDB 3.4 compatibility. The code uses
Mongo-native operations rather than an ORM. The established `vquest_results`
shape is preserved exactly. New concerns use separate collections so old
pipeline consumers do not need changes.

## Architectural boundaries

```text
api/              HTTP transport, validation, permissions, serialization
domain/           identity and permission semantics
infrastructure/   Mongo, auth providers, sessions, artifacts, IMGT client
parsers/          deterministic LymphoTrack, run, QC, and V-QUEST parsing
reporting/        clinical facts, rules, and HTML rendering
scripts/          explicit initialization and ingestion entrypoints
tasks.py          durable asynchronous workflow orchestration
```

The frontend has an equivalent separation: `api.ts` is transport, `App.tsx`
owns route/session composition, `components/` contains shared layout/branding,
and `pages/` contains workflow screens.

## Key design decisions

- `/cll_genie` is part of the application contract, not an Apache rewrite detail.
- The existing `coyote.users` record is the application identity for both authentication methods.
- LDAP validates only the password; names, groups, email, enabled state, and permissions stay local.
- The `vquest_results` collection is not migrated or normalized.
- IMGT and workbook processing are asynchronous and visible through durable jobs.
- New files receive immutable ObjectId-scoped paths, preventing same-name overwrite.
- User-authored report text is Jinja-autoescaped before HTML export.
- Clinical summary rules are stored as data and evaluated by a restricted interpreter, never `eval`.
- Normal users cannot retrieve hidden comments or report metadata; administrators can restore them.

## Failure boundaries

- MongoDB unavailable: readiness returns 503; authenticated operations fail, but liveness remains 200.
- Redis unavailable: new jobs cannot queue; existing MongoDB data remains readable.
- IMGT unavailable/rejects input: the job becomes `FAILED_FINAL` with a safe diagnostic message.
- Invalid workbook/ZIP: parser errors are recorded on the job and no result submission is inserted.
- Artifact missing: metadata remains traceable but download returns 404.
- LDAP unavailable: LDAP login fails closed; local login remains available when enabled.

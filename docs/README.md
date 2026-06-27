# CLL Genie documentation

These documents describe the CLL Genie 2.0 code that is present in this
repository. They are implementation documentation, not a migration proposal.

The original 1,797-line analysis of the retired Flask application and its
proposed replacement has also been preserved verbatim as the
[Technical Remodeling Blueprint](TECHNICAL_REMODELING_BLUEPRINT.md). It is the
historical rationale and source-to-target traceability record. The documents
below are the split, current-state equivalent for the implemented application.

## Reading order

1. [Architecture](ARCHITECTURE.md) — system boundaries, components, runtime topology, and design decisions.
2. [Codebase reference](CODEBASE_REFERENCE.md) — responsibility of every source module and important function.
3. [Clinical workflows](WORKFLOWS.md) — run registration through Clarity-compatible report export.
4. [Data model](DATA_MODEL.md) — MongoDB collections, exact `vquest_results` contract, indexes, and filesystem artifacts.
5. [API reference](API_REFERENCE.md) — every HTTP route, authorization requirement, request, and response role.
6. [Authentication and security](AUTHENTICATION_AND_SECURITY.md) — local/LDAP behavior, sessions, CSRF, permissions, and proxy controls.
7. [Report rules](REPORT_RULES.md) — clinical facts, operators, rule schema, evaluation, administration, and future evolution.
8. [Deployment and operations](DEPLOYMENT_AND_OPERATIONS.md) — Docker, Apache reverse proxy, configuration, initialization, monitoring, and recovery.
9. [Testing and validation](TESTING_AND_VALIDATION.md) — automated coverage and laboratory acceptance procedure.

## Historical design record

- [Technical Remodeling Blueprint](TECHNICAL_REMODELING_BLUEPRINT.md) — original monolith analysis, schema assessment, technology evaluation, target design, and implementation plan.

## Blueprint-to-current documentation map

| Original blueprint subject | Implemented-application documentation |
|---|---|
| Deep code and schema analysis | [Codebase reference](CODEBASE_REFERENCE.md), [Data model](DATA_MODEL.md) |
| Technology and architecture assessment | [Architecture](ARCHITECTURE.md) |
| New data flow | [Clinical workflows](WORKFLOWS.md) |
| Dynamic report rules | [Report rules](REPORT_RULES.md) |
| Single-port proxy and Apache publication | [Deployment and operations](DEPLOYMENT_AND_OPERATIONS.md) |
| Directory and code layout | [Codebase reference](CODEBASE_REFERENCE.md) |
| Authentication and authorization | [Authentication and security](AUTHENTICATION_AND_SECURITY.md) |
| HTTP contract | [API reference](API_REFERENCE.md) |
| Build, rollout, and acceptance | [Deployment and operations](DEPLOYMENT_AND_OPERATIONS.md), [Testing and validation](TESTING_AND_VALIDATION.md) |

The frontend styling contract is Tailwind CSS 4 for application layout,
responsive utilities, and design tokens, with Material UI retained for
accessible interactive widgets. Development MongoDB behavior is documented
separately from the external production database topology.

## Public URL contract

The entire application is rooted at `/cll_genie`:

- UI: `/cll_genie/`
- API: `/cll_genie/api/v1/...`
- liveness: `/cll_genie/health/live`
- readiness: `/cll_genie/health/ready`
- development-only OpenAPI UI: `/cll_genie/api/v1/docs`

No application route is intentionally exposed outside this prefix. This lets
Apache publish CLL Genie beside other applications without rewriting paths.

# Authentication and security

## Identity model

Every person must have an enabled local document in `coyote.users`, regardless
of how their password is validated. This document is the single source for
fullname, email, groups, enabled status, and authorization. It prevents LDAP
directory groups or attribute changes from silently changing clinical access.

## Local authentication

The local provider loads the user by exact `_id` and verifies the stored
Werkzeug password hash with `check_password_hash`. Existing hashes remain
usable. New passwords created through administration use
`pbkdf2:sha256`. A missing hash means the profile is LDAP-only; local login
fails without disclosing that distinction.

## LDAP authentication

LDAP is advertised only when `AUTH_PROVIDERS` contains `ldap` and both
`LDAP_URI` and `LDAP_BASE_DN` are configured.

1. The local profile is loaded first and must be enabled.
2. URI scheme must be `ldap` or `ldaps`.
3. TLS certificate validation is `CERT_REQUIRED`.
4. Plain `ldap://` uses StartTLS before bind; `ldaps://` uses TLS directly.
5. Username is escaped with LDAP filter escaping and substituted into the
   configured filter.
6. The service/anonymous search must return exactly one entry.
7. A second connection binds as that entry with the supplied password.
8. The password is discarded; it is never written to MongoDB or logs.

Search, network, TLS, bind, and invalid-credential errors return the same generic
401 response. LDAP does not populate profile fields.

## Sessions

Login generates independent high-entropy URL-safe session and CSRF tokens. The
browser receives the session token in a cookie with:

- `HttpOnly`;
- `SameSite=Lax` or configured `Strict`;
- `Secure` in HTTPS deployments;
- path `/cll_genie`; and
- configured maximum age, default eight hours.

MongoDB stores SHA-256(session token), never the bearer token itself. Session
lookup requires an unexpired document and reloads the local user on every
request. Disabling a user immediately invalidates effective access; changing
groups changes effective permissions without waiting for relogin.

Logout deletes server state and expires the cookie at the exact same
`/cll_genie` path.

## CSRF

Cookie-authenticated reads require only a valid session. Every state-changing
route depends on `require_csrf`, which compares `X-CSRF-Token` with the session
value using `secrets.compare_digest`. The React client stores this token only in
memory as part of the restored session response.

## Authorization

Handlers enforce permissions server-side with `assert_permission`; hiding UI
controls is only a usability measure. Administration routes additionally have
React route guards. See the group mapping in
[Codebase reference](CODEBASE_REFERENCE.md#domain-layer).

Hidden report artifacts return 404 rather than revealing existence. Hidden
comment/report metadata is filtered before serialization for non-admin users.
Password fields are excluded from user-list queries.

## Input and output safety

- Pydantic limits string lengths, enum values, numeric ranges, page sizes, and
  selected sequence count.
- Search text is regex-escaped before MongoDB use.
- ObjectId strings are validated before repository conversion.
- LDAP usernames are filter-escaped.
- Uploaded filenames are reduced to safe basenames and characters.
- Artifact resolution verifies the final path remains beneath `ARTIFACT_ROOT`.
- ZIP paths, expanded size, file count, signature, and expected tables are
  validated.
- IMGT options are intersected with a backend allowlist.
- Report templates autoescape `.j2`; a regression test verifies script input is
  emitted as text rather than executable HTML.
- The rules interpreter has a fixed operator map and never evaluates Python or
  database expressions.

## Proxy security

Nginx sets `nosniff`, no-referrer, deny framing, restrictive browser feature
policy, and a same-origin Content Security Policy. Static assets are served only
beneath `/cll_genie`; unrelated paths return 404. The API and Redis have no
published host port. Apache should terminate TLS and forward trusted headers.

Recommended production values:

```dotenv
ENVIRONMENT=production
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
AUTH_PROVIDERS=local,ldap
```

Do not place secrets in `.env.example`, Compose, image layers, frontend build
variables, source control, or Apache configuration committed to this repository.

## Audit and remaining organizational controls

Application audit events provide attribution for important mutations, but they
do not replace Apache access logs, MongoDB audit facilities, filesystem access
controls, or laboratory QMS review. Protect `.env`, artifact mounts, database
credentials, LDAP bind credentials, and container administration at the host
level. Define retention and review procedures externally.

# End-to-End Application Audit

**Audit date:** 2026-10-21 (Asia/Kolkata)  
**Commit reviewed:** `3070766` on `main`  
**Scope:** Static source review, local automated checks, one anonymous production health probe, public frontend sign-in page, and the production DevTools screenshots supplied by the owner.  
**Changes to application code/data:** None. No login was attempted, no production records were read or changed, and no migration was applied.

## Executive summary

**Release recommendation: Release blocked pending fixes and verification.** The owner-provided production screenshots show repeated HTTP 500s on department issue endpoints. The code now queries the new `department_issue_batches` table and `issue_batch_id` relation, introduced by migration `20261018120000_department_issue_batches`; the runbook requires that migration to be applied separately before deploying the backend. This is the leading explanation, but production migration status and server logs were not available, so it is a probable root cause rather than a verified one. The public health probe returned `READY`; its readiness checks do not confirm that every application migration is applied.

The local backend suite passed (186 tests in 23 files), backend compilation passed, and frontend TypeScript passed. The repository lint command fails: frontend ESLint reports 13 errors and 113 warnings, including reproducible conditional-hook violations in the client operations overview and rerun modal. The regular Next build could not complete in this sandbox: Turbopack failed to start a child process; a Webpack retry failed with `EPERM` creating a `.next` output directory. These are not evidence of an application compile error, but leave the frontend production build unverified.

The live sign-in page exposes role quick-fill buttons that populate a static demo password. Whether the corresponding accounts exist or are usable in the deployed database was not tested. The app also keeps the bearer token in both a JavaScript-readable cookie and `localStorage`, and its default JWT expiry differs between `AuthService` and the auth module / `.env.example`.

The full authenticated journey, all role and tenant boundaries, upload/export correctness, mobile interactions, concurrency, and recovery scenarios remain untested because no isolated staging URL, test accounts, or test database were supplied. The screenshots themselves show mobile table headers and cells wrapping into narrow vertical fragments.

## Coverage dashboard

| Area | Discovered | Executed | Result / limit |
|---|---:|---:|---|
| Frontend page routes | 26 | 2 public surfaces | Root redirects to sign-in; sign-in rendered. Authenticated routes not exercised. |
| Backend route handlers | 117 across 18 controller files | 1 public health probe | 116 authenticated/other handlers not called directly. Full route list is in the API inventory below. |
| OpenAPI operations | 42 | Static comparison | 75 fewer operations than the controller inventory; the spec labels itself a draft inventory. |
| Backend automated tests | 186 in 23 files | 186 | All passed. These are unit tests, not production API journeys. |
| Frontend automated tests | No frontend test suite configured | 0 | Not available. |
| Role / tenant combinations | 3 documented roles; multi-client design | 0 live combinations | Blocked: no test accounts or isolated tenant environment. |
| Uploads / downloads / exports | Routes and UI found | 0 end-to-end | Blocked; source review found incomplete file safeguards and unsupported binary handling. |
| Security scenarios | Auth, RBAC, CORS, rate limiting, storage and import controls inspected | No active attack tests | Static review only; no fuzzing or production data access. |
| Mobile / tablet | Responsive UI routes identified | Screenshot evidence only | Owner screenshots show broken table wrapping; no logged-in viewport tests. |

### Execution results

| Check | Result |
|---|---|
| `npm run test:backend` | **PASS** — 23 files, 186 tests. First attempt hit sandbox temp-folder `EPERM` before executing tests; rerun with temp files inside the workspace passed. |
| `npm run typecheck` | **PASS** — frontend TypeScript. |
| `npm run build:backend` | **PASS** — NestJS build. |
| `npm run lint` | **FAIL** — frontend ESLint: 13 errors, 113 warnings. Backend lint emitted warnings. |
| `npm run build:frontend` | **BLOCKED** — Turbopack child process failed while processing CSS. |
| `npm run build --workspace frontend -- --webpack` | **BLOCKED** — sandbox `EPERM` creating `frontend/.next/static/chunks/...`. |
| `npm audit --json` | **BLOCKED** — registry unreachable (`ENOTFOUND registry.npmjs.org`); no advisory result obtained. |
| React Doctor scan | **NOT RUN** — scanner is not installed locally; no tools were installed. |
| Public `GET /api/v1/health` | **PASS at probe time** — returned `READY` with timestamp `2026-10-21T15:51:13Z`. This does not verify migration completeness. |
| Public frontend `/` | **PASS for anonymous routing only** — redirected to `/login`; page rendered. No credentials were entered. |

## Findings

### AUD-01 — Department issue endpoints fail in the deployed environment

**Severity:** P1 functional blocker for client department stock-out and Super Admin review. **Confidence:** failure confirmed by supplied screenshots; root cause probable, not verified.  
**Evidence:** The supplied Render DevTools captures show `GET /api/v1/departments/issues` and `GET /api/v1/departments/issues/batches?status=PENDING_APPROVAL` returning 500. Current service code queries `departmentIssueBatch` and includes the new batch relation. The Prisma migration adding the table, enum, foreign key, and issue-batch column is `backend/prisma/migrations/20261018120000_department_issue_batches/migration.sql`. The Render runbook explicitly requires `prisma migrate deploy` before the deployment.  
**Likely cause:** The deployed API is newer than the production database schema. A missing table/column would explain both failures, but the database's `_prisma_migrations` state and request logs were unavailable.  
**Safe verification:** An authorized operator should check migration status against the correct production `DIRECT_URL` and inspect sanitized logs for the failing request IDs. Apply any pending migration only through the approved release procedure after the required recovery point; no migration was run during this audit.

### AUD-02 — Readiness can report `READY` without checking migration compatibility

**Severity:** P2 operational risk. **Confidence:** high (code inspection).  
`/api/v1/health` checks database connectivity and storage readiness, then returns only `READY` / `NOT_READY`; it does not inspect migration state or exercise the department-batch schema. This permits a healthy probe while business endpoints fail due to schema drift. The live probe returned `READY` during this audit while the supplied captures show department API failures. Add a migration compatibility check or an explicit deployment-version/schema signal, without exposing internal details publicly.

### AUD-03 — Conditional React hooks can crash authenticated pages

**Severity:** P2 functional defect. **Confidence:** high (ESLint and source).  
`ClientOperationsOverview.tsx` returns on loading/error at lines 122–132, then calls additional `useState` hooks beginning at line 226. A normal first load therefore renders fewer hooks than the loaded render and can trigger “Rendered more hooks than during the previous render.” `ReRunCycleModal.tsx` returns when `cycle` is null at line 27 before calling state and memo hooks beginning at line 30; opening it after a null render changes hook order. These are included in the frontend lint failures and need behavioral regression coverage.

### AUD-04 — Production sign-in exposes static demo credential autofill

**Severity:** P2; escalate to P1 if any seeded demo account is active. **Confidence:** visible UI and source confirmed; account usability unknown.  
The public sign-in page displays role quick-fill buttons. `LoginForm.tsx` fills a hard-coded demo password when a button is clicked. `backend/src/seed.ts` has a production-environment guard, but that does not prove the deployed database lacks previously seeded accounts. Do not test those credentials against production. Remove or strictly build-gate the demo controls and verify/rotate any demo accounts in an isolated release process.

### AUD-05 — Bearer token is accessible to JavaScript and stored twice

**Severity:** P2 security risk. **Confidence:** high (source).  
`frontend/src/lib/auth/session.ts` writes `session_token` through `document.cookie` without `HttpOnly` and also writes the same token to `localStorage`. The API client reads it in JavaScript and adds it as a Bearer header. Any same-origin script injection can read and exfiltrate the token. This conflicts with the approved secure-session design. Use a server-set `HttpOnly; Secure; SameSite` cookie or another short-lived, non-persistent-in-JavaScript design; test logout and session replacement afterward.

### AUD-06 — JWT expiry configuration is inconsistent and has no refresh flow

**Severity:** P2 security/configuration risk. **Confidence:** high (source).  
`AuthModule` defaults JWT expiration to `15m` and `.env.example` documents `JWT_EXPIRATION=15m`, but `AuthService.login()` supplies its own fallback of `30d`. If the environment variable is absent, the signing call uses 30 days, overriding the module default. Session lifetime also defaults to 30 days, and no refresh endpoint is present in the controller inventory. Make the expiration policy a single validated setting and align it with the documented short-lived-token/refresh policy.

### AUD-07 — Login rate limiting is process-local

**Severity:** P2 hardening risk. **Confidence:** high (source).  
`LoginRateLimiterGuard` keeps its IP counters in a local `Map`; the global Nest throttler also uses default process-local state. On serverless or multiple instances, limits are independent per process and can reset on cold starts. The database-backed per-account lockout remains a separate control, but the IP limit does not provide a deployment-wide ceiling. Use shared rate-limit storage at the platform/gateway or a shared backend and verify `Retry-After` behavior.

### AUD-08 — CORS preview-origin matching is broader than an exact allowlist

**Severity:** Informational / potential P2. **Confidence:** high (source); exploitability not verified.  
`backend/src/main.ts` allows any `*.vercel.app` origin whose hostname merely contains the configured project-name substring, while enabling credentialed CORS. This is broader than the runbook's exact-origin configuration. Since the application currently uses an explicit Bearer header, this review did not establish cross-origin data access. Replace substring matching with exact approved origins or an explicitly validated preview-domain pattern and test preflight behavior.

### AUD-09 — Department stock-out still has a separate single-item API path

**Severity:** P2 workflow inconsistency. **Confidence:** high (source).  
The UI uses the daily issue batch, but `POST /api/v1/departments/issues` remains enabled for Client Admin and Super Admin in addition to `/issues/draft` and `/issues/batches/...`. The service still implements direct single-issue submission and its own approval/immediate-post behavior. A Client Admin can therefore bypass the daily batch through the API, contrary to D-018's single client stock-out flow. Retire the endpoint or explicitly preserve it as a documented legacy route with server-side policy that cannot undermine the one-flow requirement.

### AUD-10 — Import upload marks unscanned files `CLEAN` and does not preserve binary bytes

**Severity:** P2 security and functionality risk. **Confidence:** high (source); exploitability not verified.  
`ImportsService.createBatch()` validates extension and a few text substrings, then unconditionally stores `scanStatus: CLEAN`; no malware scanner or MIME-signature verification is called. The UI reads every selected file with `File.text()`, and the backend converts the resulting string back to UTF-8 bytes. The service nevertheless accepts PDF and image extensions, so binary content is corrupted before storage/extraction. The implementation task list also records malware scanning as incomplete. Limit accepted formats to correctly implemented ones until byte-preserving parsing and a real scan pipeline exist; never mark unscanned data clean.

### AUD-11 — Frontend lint is a failing quality gate

**Severity:** P2 release-quality blocker. **Confidence:** exact local command result.  
Frontend ESLint reports 13 errors and 113 warnings across 139 files. Errors include the conditional hooks in AUD-03 and `ManufacturingView.tsx`, where `setAnalyticsClientId` is referenced in an effect before its state declaration. The latter may not throw at runtime because the effect runs after render, but it remains a lint/React-compiler compatibility error. Other warnings include state-setting effects in `DataTable.tsx`, unused values, and unsafe `any` typing. Fix errors first, then triage warnings by user impact.

### AUD-12 — API contract and pagination coverage are incomplete

**Severity:** P2 integration / scale risk. **Confidence:** high (counts and source).  
The controllers contain 117 route decorators, while `14_API_SPEC.yaml` defines 42 operations and calls itself a draft endpoint inventory. Several implemented modules and operations are absent from that OpenAPI file. `getIssueBatches()` also has no cursor/page limit and includes every issue line for every matching batch. Complete the OpenAPI contract (schemas, roles, errors, pagination, and idempotency) and bound batch/history queries before large tenants accumulate data.

### AUD-13 — Mobile table readability is broken in supplied evidence

**Severity:** P2 usability/accessibility. **Confidence:** high for supplied screenshots; current authenticated runtime not repeated.  
The owner-provided mobile screenshots show product table headings and cell text broken into narrow vertical letter columns, and the department queue table extends below the visible viewport. This makes inventory and approval data difficult to scan or act on. Verify every authenticated table at common phone widths; use a deliberate card layout or a controlled horizontal-scroll table with stable minimum widths, and keep primary filters/actions reachable.

### AUD-14 — Conflicting approval instructions remain in repository documentation

**Severity:** P2 specification / implementation ambiguity. **Confidence:** confirmed.  
The owner-provided current agent instructions and `01_PRD.md`, `02_WORKFLOWS_AND_STATES.md`, and `11_DECISIONS.md` say approval defaults to required but can be disabled per supported workflow. `12_AGENTS.md` still says all inventory-affecting actions require approval under a fixed baseline. Consolidate the stale instruction file so future changes do not silently reintroduce a conflicting business rule.

### AUD-15 — A bearer token is visible in supplied DevTools screenshots

**Severity:** P2 if still valid; confidence that it was displayed is high, validity unknown.  
The supplied Network screenshot visibly includes an Authorization Bearer value. This report does not repeat it. Sign out/revoke that session and sign in again if the captured token may still be valid; redact authorization headers from future screenshots and logs.

## Feature and workflow test matrix

| Test ID | Area / roles | Expected behavior from specification | Actual / result |
|---|---|---|---|
| DISC-01 | Frontend route discovery | All role-accessible screens catalogued | 26 Next page files found; only anonymous root and sign-in rendered. Remaining pages **BLOCKED** without authenticated staging accounts. |
| AUTH-01 | Login/logout/session | Rate limits, lockout, revocation, and role-based landing work | Login UI loaded only; credentials not submitted. Automated auth unit tests pass, live auth **NOT TESTED**. |
| NAV-01 | Navigation/deep links | Role menu links and direct routes resolve | Static route inventory only; authenticated navigation **NOT TESTED**. |
| INV-01 | Stock-in/out/transfer/count | Correct stock deltas, no draft effect, reservations atomic | **NOT TESTED** end-to-end; no isolated DB/test accounts. |
| APP-01 | Approvals/configuration | Defaults require approval; settings affect new requests only | Unit tests cover approval defaults and settings; UI/API live verification **NOT TESTED**. Documentation conflict AUD-14. |
| DEPT-01 | Client Admin daily department issue | Multiple lines save, submit atomically, one review decision | Unit tests exist; production screenshots show related GET endpoints returning 500. Current DB migration state **BLOCKED**. Legacy single-item API AUD-09. |
| DEPT-02 | Department detail/deep link | Scoped department IDs resolve, stale links recover | Screenshot shows a department detail request returning 404 for an ID not in the displayed list; source returns 404 for unknown IDs. Cause (stale notification vs wrong identifier) **UNRESOLVED**. |
| MFG-01 | Manufacturing | Draft/edit/submit/approve posts atomically | Service unit tests pass; browser and live API journey **NOT TESTED**. Frontend lint findings affect overview and rerun modal. |
| IMP-01 | Upload/parse/review/approve | Secure byte-preserving upload; human review; no draft stock effect | **NOT TESTED** end-to-end. Source findings AUD-10; no malware scan evidence. |
| EXP-01 | Reports/downloads/exports | Complete, scoped, auditable files | **NOT TESTED**; no authenticated session or test dataset. |
| SEC-01 | RBAC / horizontal tenant isolation | Direct API access denied across roles/clients | Static guards and unit tests inspected; multi-tenant live attempts **NOT TESTED**. |
| SEC-02 | CORS / headers / rate limits | Exact origins, safe headers, bounded abuse | Static review only; findings AUD-07/08. `main.ts` sets HSTS in production and basic browser headers but no CSP was found in backend or Next config. |
| PERF-01 | Search/filter/large lists | Bounded queries and responsive tables | No benchmark or large dataset; unbounded issue-batch list found (AUD-12). |
| MOB-01 | Phone/tablet | No clipped controls, readable tables, usable filters | Screenshots show broken text wrapping (AUD-13); no live authenticated viewport tests. |
| REC-01 | Network/server failures/recovery | No false success, safe retry, no duplicate movement | Unit tests cover some service failures; UI/browser retries and DB rollback under live faults **NOT TESTED**. |

## API inventory

This inventory was derived from controller decorators and route-level role metadata. “Authenticated / service policy” means the handler is under a JWT/Roles guard but has no `@Roles` decorator; the service performs additional scope checks. This is **discovery**, not proof that authorization is correct at runtime. All routes except `GET /api/v1/health` and the login/root probes were not called in production.

| Controller group | Handlers | Runtime coverage | Notes |
|---|---:|---|---|
| Root / health / auth / profile | 6 | Root and health public probes only; login and protected routes not tested | `GET /api/v1/me` and `/me/bootstrap` are in `auth.controller.ts` under a separate `@Controller('me')`. |
| Backups | 6 | Not tested | Includes health, summary, record detail, and restore drill. |
| Catalog / categories | 9 | Not tested | Includes products, review, versions, categories, manufacturing options. |
| Departments / issues / returns | 23 | User-provided 500/404 evidence only | Includes both legacy single issue and daily batch endpoints. |
| Imports | 9 | Not tested | Upload, list/detail, validate, submit, row edit, approve/reject, errors. |
| Inventory | 6 | Not tested | Balances, locations, transactions, correction/reversal. |
| Manufacturing | 15 | Not tested | Runs, cycles, analytics, batch operations, rerun, approval. |
| Notifications/settings | 6 | Not tested | Notifications, read state, alert check, global settings. |
| Clients / warehouses | 10 | Not tested | CRUD and assignments. |
| Reports | 2 | Not tested | Reports and audit history. |
| Stock requests | 8 | Not tested | Draft, list/detail, edit, submit, cancel, approve/reject. |
| Shipments | 4 | Not tested | List/detail, receive, receipt approval. |
| Client staff | 8 | Not tested | Staff and work-log CRUD/list. |
| Users | 5 | Not tested | User list/detail, disable, password reset. |
| **Total** | **117** | **1 public health probe; 116 not directly called** | OpenAPI declares 42 operations. |

### API routes that require special attention

| Method / endpoint | Access metadata | Purpose | Validation / authorization / rate-limit status | Test result |
|---|---|---|---|---|
| `GET /api/v1/health` | Public | Liveness/readiness response | Public by design; throttler global; migration completeness not checked | **PASS** at probe time (`READY`). |
| `POST /api/v1/auth/login` | Public + login guard | Create authenticated session | DTO validation and account lockout exist; IP throttling is process-local (AUD-07) | UI rendered; API **NOT TESTED**. |
| `GET /api/v1/departments/issues` | Super Admin / Client Admin | List issue history | Role decorator present; service scopes client; list query not page-bounded | Owner screenshot: **500**. |
| `GET /api/v1/departments/issues/batches` | Super Admin / Client Admin | List issue batches | Role decorator present; client scoping; unbounded nested result (AUD-12) | Owner screenshot: **500**. |
| `POST /api/v1/departments/issues` | Super Admin / Client Admin | Legacy single-item issue submission | Handler remains beside daily batch flow (AUD-09) | **NOT TESTED**. |
| `POST /api/v1/departments/issues/draft` | Client Admin | Get/create open daily batch | Role decorator present; DB-backed behavior depends on the batch migration | **NOT TESTED**. |
| `PATCH /api/v1/departments/issues/batches/:id/lines` | Client Admin | Replace draft lines | Role decorator present; service checks client and draft ownership | **NOT TESTED**. |
| `POST /api/v1/departments/issues/batches/:id/submit` | Client Admin | Atomically reserve/submit or post | Role decorator present; service performs per-line checks and transaction | **NOT TESTED**. |
| `POST /api/v1/departments/issues/batches/:id/approve` | Super Admin | Approve and post all lines | Role decorator present; transaction/status checks in service | **NOT TESTED**. |
| `POST /api/v1/departments/issues/batches/:id/reject` | Super Admin | Reject batch/release reservations | Role decorator present; rejection reason DTO | **NOT TESTED**. |
| `POST /api/v1/import-batches` | All three roles | Create upload draft | DTO checks type/required fields; format/malware gaps (AUD-10) | **NOT TESTED**. |
| Other 106 handlers | See full route decorators in the controller files | Organization, inventory, production, reporting, approvals, administration | Static-only; route-level role metadata and service authorization need direct role tests | **NOT TESTED**. |

### Complete discovered route-by-route execution matrix

Static access metadata below is derived from NestJS controller/method decorators. The list records the repository's declared route surface; it does not establish runtime authorization correctness. Except for the public health probe, routes were not called because no isolated staging tenant or authorized test credentials were available.

| Method | Route | Declared access metadata | Runtime result |
|---|---|---|---|
| `GET` | `/api/v1/` | Public | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/auth/login` | Public + login limiter | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/auth/logout` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/backups` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/backups` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/backups/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/backups/:id/restore-drill` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/backups/health` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/backups/summary` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/categories` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/categories` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/client-staff` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/client-staff` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `DELETE` | `/api/v1/client-staff/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/client-staff/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/client-staff/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/client-staff/:id/work-logs` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/client-staff/:id/work-logs` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/client-staff/work-logs` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/clients` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/clients` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/clients/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/clients/:id` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/clients/:id/warehouses` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `DELETE` | `/api/v1/clients/:id/warehouses/:warehouseId` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/departments/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments/issues` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments/issues/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments/issues/batches` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues/batches/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/departments/issues/batches/:id/lines` | CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues/batches/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues/batches/:id/submit` | CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/issues/draft` | CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments/returns` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/returns` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/departments/returns/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/returns/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/returns/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/departments/write-offs` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/health` | Public | PASS — health probe returned READY |
| `GET` | `/api/v1/import-batches` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/import-batches` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/import-batches/:batchId/rows/:rowId` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/import-batches/:id` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/import-batches/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/import-batches/:id/errors` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/import-batches/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/import-batches/:id/submit` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/import-batches/:id/validate` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/inventory/balances` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/inventory/locations` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/inventory/low-stock-count` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/inventory/transactions` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/inventory/transactions/:id/correct` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/inventory/transactions/reversal/:id` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/me` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/me/bootstrap` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/notifications` | JWT required | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/notifications/:id/read` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/notifications/check-alerts` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/notifications/read-all` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/notifications/settings` | JWT required | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/notifications/settings` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/production-runs` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs` | JWT required | NOT TESTED — no authenticated staging credentials |
| `DELETE` | `/api/v1/production-runs/:id` | CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/production-runs/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/production-runs/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/:id/re-run` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/:id/submit` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/production-runs/analytics` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/batch-approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/batch-reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/batch-submit` | CLIENT_ADMIN, SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/production-runs/check-low-stock-cycles` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/production-runs/cycles` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/products` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/products` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/products/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/products/:id` | SUPER_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/products/:id/review` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/products/:id/versions/:versionId/review` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/products/manufacturing-options` | CLIENT_ADMIN, SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/reports/:reportType` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/reports/audit-history` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/shipments` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/shipments/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/shipments/:id/approve-receipt` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/shipments/:id/receive` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/stock-requests` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/stock-requests` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/stock-requests/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/stock-requests/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/stock-requests/:id/approve` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/stock-requests/:id/cancel` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/stock-requests/:id/reject` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/stock-requests/:id/submit` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/users` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/users` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/users/:id` | JWT required | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/users/:id/disable` | JWT required | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/users/:id/reset-password` | JWT required | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/warehouses` | SUPER_ADMIN, STORE_ADMIN, CLIENT_ADMIN | NOT TESTED — no authenticated staging credentials |
| `POST` | `/api/v1/warehouses` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |
| `GET` | `/api/v1/warehouses/:id` | SUPER_ADMIN, STORE_ADMIN | NOT TESTED — no authenticated staging credentials |
| `PATCH` | `/api/v1/warehouses/:id` | SUPER_ADMIN | NOT TESTED — no authenticated staging credentials |

## Prioritized remediation backlog

| Priority | Issue | Remediation / regression coverage |
|---|---|---|
| 1 | AUD-01 department 500 / migration status | Verify production migration state and sanitized logs; apply the pending migration only through the release runbook; test both list endpoints and draft/submit/approve flows in staging. |
| 2 | AUD-03 conditional hooks + AUD-11 lint failures | Move all hooks before conditional returns or split loading/error child components; rerun lint; add React component tests for loading-to-loaded and null-to-open transitions. |
| 3 | AUD-04 demo autofill and AUD-15 screenshot token | Remove/gate demo fill; audit/rotate any seeded accounts; revoke the token visible in owner screenshots if it may still be live. |
| 4 | AUD-05/06 token storage and expiry | Use a server-set HttpOnly cookie and align token/session lifetimes with one documented refresh policy; tests for XSS-resistant storage assumptions, logout, expiry and replacement. |
| 5 | AUD-10 import pipeline | Restrict supported formats until binary-safe handling exists; MIME/signature/size validation, malware scanning before CLEAN state, and tests for spoofed type, malformed binary, oversized file, and malicious content. |
| 6 | AUD-09 daily stock-out bypass | Remove or constrain the single-issue route; tests must prove Client Admin cannot bypass the daily draft policy. |
| 7 | AUD-07/08 rate limiting and CORS | Shared rate limiter; exact allowed origins; tests for distributed limits and hostile Vercel-origin rejection. |
| 8 | AUD-02/12 health, API contract, pagination | Add schema compatibility signal; document all 117 operations with schemas/roles/errors; pagination and result-size bounds with large fixture tests. |
| 9 | AUD-13 mobile tables | Responsive card/table treatment, keyboard and zoom checks, viewport tests at 320/375/768/1024px. |
| 10 | AUD-14 documentation conflict | Update stale `12_AGENTS.md` to match the approved configurable-approval invariant across specs. |

## Reusable regression cases

- **REG-DEPT-01:** With migrated test database, authenticate Client Admin; list issue batches and issues; expect 200, tenant-scoped results, no 500.
- **REG-DEPT-02:** Submit a multi-department daily draft; simulate insufficient stock on one line; assert no line is reserved and no inventory changes.
- **REG-DEPT-03:** Verify direct `POST /departments/issues` cannot bypass the configured daily issue flow.
- **REG-FE-01:** Render client operations overview through loading → success and loading → error; assert no hook-count error.
- **REG-FE-02:** Render rerun modal with `cycle=null`, then with a cycle; assert open/close works and state resets for a new cycle.
- **REG-AUTH-01:** Verify a built production sign-in page contains no demo credential controls or static credential values.
- **REG-AUTH-02:** Verify tokens are not written to localStorage or script-readable cookies; test expiry and logout/session replacement.
- **REG-IMP-01:** Upload supported text and binary files; reject spoofed MIME/signature and malware fixtures; never mark unscanned attachments CLEAN.
- **REG-API-01:** For every route in the appendix, run authenticated allowed-role, denied-role, cross-tenant/object-scope, invalid-input, and expected-error checks.
- **REG-MOB-01:** At 320px, 375px, 768px and 1024px, check tables, filters, tabs, dialogs, focus, zoom, and touch targets on every authenticated route.

## Limitations and release decision

No staging environment, role credentials, test tenant, or approved production database access was available. As a result, business transactions, actual tenant isolation, export completeness, upload malware behavior, concurrent writes, live error recovery, and role-based mobile layouts were not proven. No claim is made that the app is secure or bug-free. The production 500s shown by the owner, failing lint gate, unresolved frontend build, auth/storage risks, and incomplete staging evidence support **Release blocked pending fixes and verification**.

No source code, migration, runtime setting, or business rule was changed during this audit. The only pre-existing workspace modification observed was `backend/tsconfig.build.tsbuildinfo`; it was left untouched.

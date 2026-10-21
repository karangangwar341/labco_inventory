# Current Application Audit Report

**Audit date:** 2026-10-21 (Asia/Kolkata)  
**Scope:** Current repository source and specifications, local frontend browser run, static API/security review, backend automated suite, frontend typecheck/lint, and backend build. Backend runtime was not started because its configured database is remote.  
**Data safety:** No credentials were used and no application data or database was accessed or changed.

## A. Executive summary

**Release recommendation: Insufficient evidence to determine readiness.** The source and automated checks provide useful implementation evidence, but there was no live or isolated environment with test accounts to verify any authenticated business journey, authorization boundary, tenant isolation, transaction outcome, import/export contents, or browser behavior. Do not treat the passing unit suite as end-to-end or release acceptance.

Current checks: backend Vitest **PASS, 23 files / 186 tests** when temporary files were redirected into the workspace; backend Nest build **PASS**; frontend TypeScript **PASS**; frontend ESLint completed without surfaced diagnostics; initial test attempt failed before test discovery because the sandbox denied writes to its default temp directory. No production or staging probe was attempted in this audit.

Confirmed source-level concerns: the public sign-in UI contains quick-fill buttons that populate a static demo password; the client stores its bearer token in JavaScript-readable cookie and local storage; login rate limiting is an in-memory per-process guard; and CORS includes a substring-based Vercel preview origin match. These are code facts, not proof that a deployed environment is exploitable. No live exploitability test was possible.

## B. Coverage dashboard

| Area | Discovered | Executed / status |
|---|---:|---|
| Frontend page routes | 26 | 26/26 opened locally; unauthenticated paths resolved to sign-in after hydration; 0 authenticated views exercised |
| Backend controller handlers | 117 | Static inventory only; 0 authenticated API requests |
| OpenAPI paths | 33 | Static inventory; draft describes itself as endpoint inventory with incomplete schemas |
| Backend automated tests | 186 | 186 passed across 23 files |
| Frontend automated tests | No suite configured | 0 |
| Roles in implementation/spec | Super Admin, Store Admin, Client Admin | 0 role journeys executed |
| Tenant isolation | Multi-client model documented | 0 cross-tenant tests; blocked by missing test tenants/accounts |
| Upload/import | Import-batch flow discovered | 0 uploads executed |
| Exports/downloads | Report/export-related code and routes discovered | 0 end-to-end exports; completeness unverified |
| Responsive/accessibility | UI source discovered | 0 browser viewport or assistive-technology tests |
| Security active testing | Auth, RBAC, CORS, rate limit, storage source reviewed | 0 live attack tests |

**Test case totals:** 4 automated checks (backend suite, backend build, frontend typecheck, frontend lint), 26 browser route checks and 2 sign-in control checks. All 26 route checks ended on the sign-in page while unauthenticated; the 2 control checks verified role quick-fill and password show/hide. These establish route gating and basic public sign-in UI behavior, not authenticated access. No authenticated UI/API scenario is marked PASS.

### Environment and tool facts

- Technology: NestJS + TypeScript backend; Next.js 16.4 + React 19 frontend; Prisma/PostgreSQL design.
- Local frontend URL: `http://localhost:3001`; frontend API target is localhost. Backend `.env` is configured with remote database hosts, so it was not started. No safe isolated test database, test accounts, or tenant fixtures were supplied.
- API prefix in source: `/api/v1`; auth uses bearer JWT/session token.
- Browser used for local page-route and sign-in control checks; no authenticated session was available.
- Source of truth documents were read as instructed. API specification identifies itself as a draft endpoint inventory whose request/response schemas are incomplete.

### Phase progress

| Phase | Outcome |
|---|---|
| 1 Discovery/planning | Complete for repository: 26 page routes, 117 controller handlers, 33 OpenAPI paths, 3 documented roles identified. |
| 2 Frontend and UX | Local browser: all 26 routes opened; unauthenticated routes resolved to sign-in with requested route preserved. Quick-fill and show/hide controls worked. Dev log showed React DevTools informational messages only. Authenticated interactions, responsive viewports and assistive-technology behavior remain blocked. |
| 3 API contract/business logic | Static route and guard review; direct request/response contract scenarios blocked. |
| 4 Auth/security | Static source review only; token handling, limiter and CORS concerns recorded; no credentials or active tests. |
| 5 Upload/download/export | Import/report features discovered; files and complete exports not exercised. |
| 6 Integrity/concurrency/performance | Unit tests passed, but database transactions, concurrent requests, latency and recovery were not measured. |
| 7 Regression/final | No runtime regression cases possible; report includes reusable follow-up cases. |

## C. API audit matrix

Controller inventory is derived from decorators in `backend/src/**/*.controller.ts`. Every discovered handler is listed below by controller group. Exact request schemas and handler-level roles should be taken from DTOs, guards and service code; the OpenAPI draft does not fully specify them. **All endpoints: live scenario NOT TESTED** due to missing runtime, credentials and fixtures. Rate limits: only the login endpoint has an explicitly identified custom limiter in the inspected controller; other endpoints were not demonstrated to have endpoint-specific quotas.

| Controller / base endpoint | Methods and route suffixes | Purpose / auth scope from source | Live status |
|---|---|---|---|
| Auth `/auth` | POST `/login`, POST `/logout` | Public login with login guard; logout JWT | NOT TESTED |
| Profile `/me` | GET `/`, GET `/bootstrap` | JWT current user/profile bootstrap | NOT TESTED |
| Health `/health` | GET `/` | Public health | NOT TESTED |
| Clients `/clients` | POST `/`, GET `/`, GET `/:id`, PATCH `/:id`, POST `/:id/warehouses`, DELETE `/:id/warehouses/:warehouseId` | Client and warehouse assignment administration; role guards in controller | NOT TESTED |
| Warehouses `/warehouses` | POST `/`, GET `/`, GET `/:id`, PATCH `/:id` | Warehouse administration | NOT TESTED |
| Catalog `/products` | GET `/`, POST `/`, GET `/:id`, PATCH `/:id`, POST `/:id/review`, POST `/:id/versions/:versionId/review`, GET `/manufacturing-options` | Product/catalog and approval workflows | NOT TESTED |
| Categories `/categories` | GET `/`, POST `/` | Category catalog | NOT TESTED |
| Manufacturing `/production-runs` | POST `/`, GET `/`, GET `/cycles`, GET `/analytics`, POST `/check-low-stock-cycles`, POST `/:id/re-run`, POST `/batch-submit`, POST `/batch-approve`, POST `/batch-reject`, GET `/:id`, POST `/:id/submit`, PATCH `/:id`, DELETE `/:id`, POST `/:id/approve`, POST `/:id/reject` | Production runs, cycles, analytics and approval | NOT TESTED |
| Inventory `/inventory` | GET `/balances`, GET `/low-stock-count`, GET `/locations`, GET `/transactions`, POST `/transactions/reversal/:id`, POST `/transactions/:id/correct` | Balance, ledger and corrections | NOT TESTED |
| Stock requests `/stock-requests` | GET `/`, POST `/`, GET `/:id`, PATCH `/:id`, POST `/:id/approve`, POST `/:id/cancel`, POST `/:id/reject`, POST `/:id/submit` | Request and approval state flow | NOT TESTED |
| Departments `/departments` | POST `/`, GET `/`, PATCH `/:id`, POST `/:id/approve`, POST `/:id/reject`, POST `/issues/draft`, GET `/issues/batches`, PATCH `/issues/batches/:id/lines`, POST `/issues/batches/:id/submit`, POST `/issues/batches/:id/approve`, POST `/issues/batches/:id/reject`, POST `/issues`, GET `/issues`, GET `/issues/:id`, POST `/issues/:id/approve`, POST `/issues/:id/reject`, POST `/returns`, GET `/returns`, GET `/returns/:id`, POST `/returns/:id/approve`, POST `/returns/:id/reject`, POST `/write-offs` | Departments, batched issues, returns and write-offs | NOT TESTED |
| Imports `/import-batches` | POST `/`, GET `/`, GET `/:id`, POST `/:id/validate`, POST `/:id/submit`, PATCH `/:batchId/rows/:rowId`, POST `/:id/approve`, POST `/:id/reject`, GET `/:id/errors` | Staged import and approval workflow | NOT TESTED |
| Reports `/reports` | GET `/audit-history`, GET `/:reportType` | Audit/report reads | NOT TESTED |
| Notifications `/notifications` | GET `/`, PATCH `/:id/read`, POST `/read-all`, POST `/check-alerts`, GET `/settings`, PATCH `/settings` | User notifications/admin settings | NOT TESTED |
| Backups `/backups` | POST `/`, GET `/health`, GET `/`, GET `/summary`, GET `/:id`, POST `/:id/restore-drill` | Backup and restore-drill operations | NOT TESTED |
| Users `/users` | POST `/`, GET `/`, GET `/:id`, PATCH `/:id/disable`, POST `/:id/reset-password` | User administration | NOT TESTED |
| Client staff `/client-staff` | GET `/`, GET `/work-logs`, GET `/:id`, POST `/`, PATCH `/:id`, DELETE `/:id`, GET `/:id/work-logs`, POST `/:id/work-logs` | Client workforce and logs | NOT TESTED |
| Shipments `/shipments` | GET `/`, GET `/:id`, POST `/:id/receive`, POST `/:id/approve-receipt` | Inbound shipment receive/approval | NOT TESTED |

The OpenAPI draft has 33 paths, while controller decorators expose 117 handlers. This difference is a documentation coverage gap, not proof that handlers are unimplemented. Full response schema, auth scope, DB entity and UI-consumer mapping remains unverified for many routes.

## D. Feature-by-feature test matrix

| ID | Feature / user | Expected behavior | Actual evidence | Status |
|---|---|---|---|---|
| DISC-01 | Sign in / all roles | Authenticate, establish scoped session, show useful errors | Local UI rendered; quick-fill populated fields; show/hide toggle worked. No login submission because backend environment points to remote DB. | PARTIAL / BLOCKED |
| DISC-02 | Dashboard / all roles | Role-appropriate summary and safe navigation | `/` resolved to sign-in after hydration; no authenticated session | BLOCKED |
| DISC-03 | Inventory / operational roles | Correct balances, locations, ledger and filters | Service unit tests cover decimal conversion, physical/available equations, insufficient stock, precision, idempotency, reversal/correction, and Store Admin warehouse scoping; no PostgreSQL/API/UI verification | UNIT PASS; E2E NOT TESTED |
| DISC-04 | Catalog / administrators | Create/edit/review products and categories | Service unit tests cover role restrictions, normalized duplicate detection, base unit/precision validation, pending approval and review; no browser/API run | UNIT PASS; E2E NOT TESTED |
| DISC-05 | Requests / operational roles | Request/submit/approve/reject/cancel with valid transitions | Service unit tests cover drafts without stock changes, reservation, insufficient stock, cancellation/rejection release, atomic approval posting, idempotency and physical-count adjustment; no database concurrency/API/UI run | UNIT PASS; E2E NOT TESTED |
| DISC-06 | Shipments / warehouse roles | Receive and approve atomically with privacy rules | Service unit tests cover receipt-confirmation modes, partial receipt discrepancy, tenant scope and idempotent completion; release-readiness tests cover source-warehouse redaction; no browser/API/DB run | UNIT PASS; E2E NOT TESTED |
| DISC-07 | Departments / client/admin roles | Draft, amend, submit and approve batch issues/returns | Service unit tests cover client scoping, role denials, approval modes, issue/return/write-off stock behavior and invalid conditions; no browser/API/PostgreSQL run | UNIT PASS; E2E NOT TESTED |
| DISC-08 | Manufacturing / client/admin roles | Submit, rerun and approve production with stock consistency | 11 service unit tests exist and passed; no user journey or production database behavior executed in browser/API | UNIT PASS; E2E NOT TESTED |
| DISC-09 | Imports / admins | Validate staged rows, expose errors, submit/approve safely | Service unit tests cover unsupported extension, script-like input, no-stock draft, duplicates, row correction, all-or-nothing/partial batches, mixed source warehouses and CSV formula neutralization; no actual multipart upload tested | UNIT PASS; upload E2E NOT TESTED |
| DISC-10 | Reports / authorized roles | Filters, totals and exports match full permitted result | Service unit tests cover role-scoped reports, totals, shipment privacy, expiry, cross-scope denials and CSV formula neutralization; no downloaded file completeness check | UNIT PASS; export E2E NOT TESTED |
| DISC-11 | Administration / admins | Manage clients, warehouses, users and settings with server authorization | Unit tests cover account role prerequisites, duplicate usernames, session revocation, client/warehouse scoping and approval settings; no admin browser/API session | UNIT PASS; E2E BLOCKED |
| DISC-12 | Notifications/backups/help | Accurate status, safe actions and recovery guidance | Unit tests cover notification thresholds/scope/read state, backup retry/restore invariants, and minimal health response; help page rendered only as an unauthenticated protected route | UNIT PASS; E2E NOT TESTED |
| DISC-13 | Responsive/accessibility | Usable at desktop/tablet/mobile, keyboard and screen reader accessible | No browser or viewport execution | BLOCKED |
| DISC-14 | Search/filter/sort/pagination | Stable complete result sets and accurate totals | Static code only; no fixtures/runtime | NOT TESTED |

**How to read the statuses:** `UNIT PASS` means the corresponding service-level mocked tests in the passing backend suite executed successfully. It does not establish a real database transaction, HTTP contract, role guard integration, browser outcome or production behavior. Those remain `E2E NOT TESTED/BLOCKED` as indicated.

## E. Security findings

### Confirmed source findings

| ID | Severity / confidence | Evidence and impact | Recommendation |
|---|---|---|---|
| SEC-01 | P2, high confidence in source; deployment exposure unverified | Login component includes three demo role quick-fill buttons and fills static `Password123!`. This discloses a credential pattern and encourages demo-account use on a public sign-in surface. Account existence/use in deployment was not tested. | Remove demo autofill controls from production builds; ensure demo identities cannot exist in production. Add static build assertion. |
| SEC-02 | P1 if active token is stolen; high confidence in source, exploitability unverified | `setSessionToken` writes bearer token to JavaScript-readable `document.cookie` and `localStorage`; any script executing in the origin can read it. Cookie lacks `HttpOnly`. | Prefer server-set `HttpOnly`, `Secure`, `SameSite` cookie or a backend-for-frontend session; avoid persistent script-readable bearer storage. Verify logout/revocation and expiry. |
| SEC-03 | P2 operational/security risk, high confidence in source | Login limiter keeps request timestamps in a process-local `Map` (10 per minute per IP). Limits reset on restart and do not coordinate across replicas, so it is not a shared deployment-wide control. | Use shared storage/gateway rate limiting with documented keys, bounded state and 429/Retry-After behavior; preserve account lockout as a separate control. |
| SEC-04 | P2, medium-high confidence in source | CORS Vercel preview logic matches by substring derived from an allowed host and suffix `.vercel.app`; this can admit unrelated preview names containing the same base string. Credentials are enabled. | Match exact deployment hostnames or a narrowly anchored project-specific pattern. Add hostile-origin regression cases. |

No SQL injection, XSS, BOLA, tenant escape, CSRF, upload exploit, or secret exposure was confirmed dynamically. They remain untested, not cleared.

### Potential risks requiring verification

- Endpoint/object authorization and tenant scoping need a role-by-role direct API matrix, including forged IDs and list/report/export routes.
- **SEC-05 — possible post-login open redirect:** `LoginForm` reads the `redirect` query parameter and passes it directly to `router.push` after successful login without visibly restricting it to same-origin relative paths. This may allow an external destination; no login was attempted, so exploitability remains unverified. Validate same-origin relative paths and reject protocol-relative, absolute and backslash variants.
- Import file type, parser limits, formula injection and scan-state transitions need synthetic malicious fixtures.
- Security headers, production CORS values, TLS, cookie flags and secret rotation must be checked against actual deployed responses/configuration.
- Single-process rate limits require review against the actual deployment replica model.

## F. UI and UX audit

| Finding | Evidence | User impact | Specific improvement |
|---|---|---|---|
| UX-01 Demo buttons on sign-in (objective security/usability issue) | Static role-fill controls in `LoginForm.tsx` | Exposes demo credential convention and may confuse real users about account access | Remove from production UI; provide explicit demo environment banner only in isolated demo builds. |
| UX-02 Mobile table behavior | No current screenshot/browser evidence | Cannot assess current layout; historical report cites narrow wrapping but is stale evidence | Verify 320/375/768/1024px with authenticated tables and use card/column-priority views where clipping is reproduced. |
| UX-03 Error recovery and workflows | Not executable | Loading, retry, duplicate submit and preserved-input behavior unknown | Exercise each consequential form with 4xx/5xx/timeout/session-expiry scenarios before release. |

Only UX-01 is a current source-confirmed issue. Other points are test requirements, not findings.

## G. Business workflow and data-integrity findings

The repository defines inventory, reservation, approval, reversal and audit invariants; unit tests passed. No real or test database was connected, so physical/usable/available stock, reservation consistency, transfer atomicity, approval bypass, audit append-only behavior, stale update handling and report reconciliation were **not verified end-to-end**. Avoid interpreting mocked service tests as proof of PostgreSQL locking or migration state.

## H. Import/export audit

| Capability | Discovery | Execution / count correctness |
|---|---|---|
| Import batches | Nine controller operations covering create/list/detail/validate/submit/edit/approve/reject/errors; import screen exists | No valid or malformed file uploaded; row counts, rollback, size/type limits and injection handling unknown |
| Reports and audit history | Report and audit endpoints plus report UI | No CSV/XLSX/PDF/other export downloaded; complete dataset, filtering, permissions and formula safety unknown |
| Shipment/backup files | Storage and backup modules exist | No upload/download or restore drill executed |

## I. Backend reliability and performance

- Backend unit suite: 186/186 passed. Backend compilation passed.
- No live latency, throughput, response size, query plan, database contention, connection failure or concurrency measurement was available.
- Login limiter is process-local (SEC-03).
- Global validation pipe enables whitelist and rejects non-whitelisted properties; route-specific validation completeness still needs request-level tests.
- Do not infer production capacity from local tests.

## J. Prioritized remediation backlog

| Priority | Issue | Impact / fix | Regression coverage |
|---|---|---|---|
| 1 | SEC-02 Script-readable bearer token | Token theft following any same-origin script execution can compromise session; migrate to HttpOnly cookie/BFF model | Assert token absent from localStorage and inaccessible to JS; test CSRF strategy, expiry, revocation and replacement |
| 2 | SEC-01 Demo autofill | Public sign-in exposes fixed demo password convention; remove/gate and ensure no production demo users | Production build contains no demo fill control or static password |
| 3 | SEC-03 In-memory login limiter | Multi-replica bypass/restart reset; move to shared limiter | Multi-instance bounded test returns correct 429/Retry-After and recovers after window |
| 4 | SEC-04 Broad preview CORS matching | Unrelated Vercel preview origins may receive credentialed CORS permission | Allow exact approved origin; reject lookalike and unrelated preview hostnames |
| 5 | API contract incompleteness | OpenAPI has 33 paths vs 117 handlers; client contracts and role/error expectations are hard to verify | Generate/compare complete OpenAPI contract for all controller operations |
| 6 | Missing runtime release evidence | Core workflows, tenant isolation, exports, migration compatibility and recovery unproven | Run the regression suite in isolated staging with three roles and two synthetic tenants |

## K. Reusable regression suite

- **REG-SEC-01:** Build production login page; assert no demo credential quick-fill controls or static demo password are present.
- **REG-SEC-02:** Login, inspect browser storage; assert access token is absent from localStorage and JavaScript-readable cookies; verify logout revokes session and expiry is enforced.
- **REG-SEC-03:** Send bounded login attempts across two API replicas; verify shared limit, 429 and Retry-After, then recovery after window.
- **REG-SEC-04:** Test exact approved CORS origin, unrelated Vercel host containing project substring, arbitrary Vercel host, localhost and no-Origin request.
- **REG-SEC-05:** After test login, try redirect values for a same-origin relative path, absolute external URL, protocol-relative URL and backslash form; confirm only the safe local path is followed.
- **REG-AUTH-01:** For each of Super Admin, Store Admin and Client Admin, exercise allowed/denied methods and direct object IDs across every controller group.
- **REG-TENANT-01:** Create synthetic tenant A/B fixtures; verify B cannot read/write A records through detail, list, search, aggregate, import and export endpoints.
- **REG-STOCK-01:** Submit concurrent reservations against limited stock; assert available never negative and ledger/balance/request state commit or rollback together.
- **REG-APPROVAL-01:** Verify pending drafts/imports do not change finalized inventory; exercise approval enabled/disabled for new submissions and historical pending requests.
- **REG-IMPORT-01:** Test CSV and supported binary formats with spoofed MIME, invalid signatures, excessive size, malformed rows, formulas and duplicate IDs; assert no partial posting.
- **REG-EXPORT-01:** Compare full authorized filtered API result IDs/counts with export rows across page boundaries; verify no unauthorized records and safe spreadsheet values.
- **REG-RECOVERY-01:** Inject timeout, 401, 409, 413 and 500 into one critical workflow; verify no false success, duplicate posting or lost recoverable input.

## L. Final release recommendation

**Insufficient evidence to determine readiness.** The source checks, backend tests and unauthenticated frontend route checks do not cover authenticated workflows, running API behavior or real transaction/database properties. No staging URL, test credentials, isolated tenants, or safe test database was available. Before release approval, resolve the source-confirmed auth/CORS/demo-account concerns and execute the role, tenant, stock, upload/export and error-recovery regression suite in a dedicated staging environment. This report does not claim the application is secure or bug-free.

## Test execution details

| Check | Result |
|---|---|
| Backend tests, default sandbox temp directory | BLOCKED before suite execution: OS `EPERM` renaming temporary transformed modules |
| Backend tests, temp redirected inside workspace | PASS — 23 files, 186 tests |
| Backend Nest build | PASS |
| Frontend TypeScript typecheck | PASS |
| Frontend ESLint | Completed with no diagnostics surfaced |
| Frontend production build | NOT RUN |
| Local browser, frontend on port 3001 | PARTIAL PASS — 26/26 page routes opened and resolved to sign-in while unauthenticated; role quick-fill and password visibility controls operated. No authenticated session. |
| Live API/database | NOT RUN; backend config resolves to a remote database and no isolated test database was available |

## Files changed and scope

- Added this audit report only: `plans/AUDIT_REPORT_2026-10-21_CURRENT.md`.
- No application code, tests, migrations, settings, business rules, or user data were changed.
- The pre-existing modified `backend/tsconfig.build.tsbuildinfo` was present before audit commands and was not edited intentionally. Transient test cache output was removed after execution.

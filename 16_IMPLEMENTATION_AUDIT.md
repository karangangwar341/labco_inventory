# Requirements-to-Code Audit

**Audit date:** 2026-10-15  
**Scope:** Requirements, state workflows, role matrix, UI/UX specification, API spec, repository routes/services/schema.  
**Method:** Findings below are based on code paths and screens, not the completion markers in `13_TASKS.md`. This is a static audit; business flows were not exercised end-to-end.

## Status key

- **Verified:** matching UI/API/service path exists by inspection; this does not mean runtime acceptance tests passed.
- **Partial:** some layers exist, or the path has known gaps.
- **Missing:** no implementation was found in the routes, frontend screens, or schema.
- **Open decision:** implementation requires an owner choice recorded in `11_DECISIONS.md`.

## Main workflow audit

| Requirement / flow | Status | Evidence and remaining work |
|---|---|---|
| Login, lockout, session and role guards | Partial | Auth and authorization services/guards exist. Automated tests and production deployment configuration were not re-run or independently validated in this audit. |
| User, client, warehouse administration | Partial → UI added | APIs existed; new Super Admin user and organization screens now expose create/edit/disable/reset/assignment. End-to-end authorization was not exercised. |
| Product catalog create/edit and reusable attributes/units | Partial → UX corrected | Product form now treats a brand as a reusable subcategory under a main category, uses explicit category-vs-brand creation choices, and backend rejects nested category depth and products assigned directly to a subcategory. Existing free-text brand values remain supported when editing legacy products. Category edit/deactivation and a normalized brand foreign key remain absent. |
| Stock balance and ledger | Partial | Inventory/ledger services exist. A full concurrency/invariant acceptance run was not performed. |
| Stock request, reservations and approvals | Partial | Request screens and approval service exist; review still needed for idempotency, edit/cancel behavior and reason/queue states against every workflow. |
| Stock-in/out, transfers, dispatch/receipt | Partial | Shipment and inventory pages/services exist. Workflow-state and privacy behavior require runtime acceptance review. |
| Physical count | Missing in import posting | API enum has `PHYSICAL_COUNT`, but importer did not post count variances. New importer now rejects unsupported import types explicitly; a physical-count workflow is still required. |
| Manufacturing | Partial | Production screens and backend service exist. Separate-vs-linked mode and full atomicity acceptance were not verified. |
| Department issues | Partial | Department and issue screens exist. Department master change approval is not exposed in the screen. |
| Department returns and write-offs | Partial | Backend endpoints/services exist, but no corresponding return/write-off UI was found. |
| Daily closing/report grouping | Missing | Workflow spec §12 requires grouped transaction drafts, per-item decisions, and whole-group rejection. No daily report entity, API, or screen exists. |
| CSV imports | Partial → safer submission added | Import draft/review/validation, location scoping, submit-before-approve, and stock-in/out posting exist. Product catalog and physical count import are explicitly blocked until implemented. Duplicate merge/keep-separate resolution is not persisted; duplicate rows only warn. |
| AI document extraction and file safety | Partial / open decision | Adapter and extraction path exist. Malware scanning is not present; current clean status must not be treated as a real scan. MIME/source constraints and retention are open under D-015/D-011. |
| Notifications and persisted settings | Partial → UI wired | Notification endpoints existed. Settings UI now loads/saves receipt confirmation, expiry thresholds and sound. Production setting semantics and full role UX need acceptance review. |
| Reports, exports and audit | Partial → UI/API wired | Reports screen now uses API data and server CSV export. Store Admin access to client manufacturing/consumption reports is blocked in service. Client scoping, export audit completeness and every report type still need acceptance review. |
| Backup and restore | Partial | Backup API/UI and runbook exist; actual restore drills and storage durability were not performed in this audit. |
| Performance cache | Partial | TanStack Query is configured and several read views use cache. Do not infer that all screens migrated or that query plans/latency targets were measured from task markers alone. |

## Screens found

Frontend routes found under `frontend/src/app/(dashboard)`: dashboard, inventory, requests/list/new/detail, approvals, shipments/list/detail, catalog/list/create/edit, manufacturing, departments, imports, reports, admin/users, admin/organizations, admin/settings, backups, and help. No daily closing screen was found. Department return/write-off and department master approval screens are also absent.

## High-priority follow-up backlog

1. Add daily closing batch model/API/UI only after reconciling its transaction types, grouping key, and whole-batch rejection semantics with the existing workflow spec.
2. Implement physical-count variance posting and product-catalog imports; keep them unavailable until the posting paths are transactional and approved.
3. Add department return and write-off screens, plus a Super Admin queue for department create/update proposals and returns.
4. Persist duplicate decisions (keep separate/merge) with explicit human choice and audit history; do not accept ignored client fields as resolution.
5. Select and integrate malware scanning, then define MIME/size/source constraints and attachment retention (D-015/D-011).
6. Complete API/schema/UI documentation synchronization and run authorized acceptance tests for role scope, privacy, ledger invariants, idempotency, migration, and key user journeys.

## Verified changes in this audit pass

- Added user assignment, reset/disable controls and client/warehouse administration screens.
- Connected system settings and reports to their backend APIs; corrected report type contracts and restricted Store Admin access to client-only report types.
- Fixed import request/response shapes, added server submission before approval, enforced location scope, and removed fake duplicate-resolution UI.
- Blocked unsupported import types to prevent an approval status being recorded without the corresponding inventory/catalog operation.
- Standardized import ledger idempotency key by batch so retries cannot create a second posting under a new time-derived key.

## Validation performed

- Frontend TypeScript check: passed after the changes in this audit pass.
- Backend production build: passed after the changes in this audit pass.
- Automated tests: not run in this pass.
- No database migration was added in this pass.

## Open decisions retained

- **D-011:** retention schedule for audit logs, drafts and attachments is not specified.
- **D-015:** approved source types, MIME policy, upload limit and malware-scanning provider are not selected.
- User authorization permits implementation and documentation reconciliation, but it does not itself decide these operational/legal values.

# Agent Task Backlog
**Status:** Design gates passed. Phase 1 authorized by owner.

## Design gates
- [x] D-001 receipt-disabled behavior decided (immediate atomic warehouse-to-client transfer on dispatch approval)
- [x] D-002 client shipment discrepancy rules decided (received qty to usable upon approval, remainder to DISCREPANCY_HOLD)
- [x] D-003 product duplicate key approved (deterministic normalized key; AI never resolves duplicates)
- [x] D-004 condition-balance model approved (Physical = Usable + Damaged + Expired; Available = Usable - Reserved)
- [x] D-005 batch atomicity choices approved by operation (selective approval with bulk option; all-or-nothing for atomic jobs)
- [x] D-007 Client Admin report/import/audit permissions approved (strictly scoped to own client)
- [x] D-008 shared vs named client accounts decided (one shared account initially, schema ready for named accounts)
- [x] D-009 stack/storage/AI provider selected (NestJS + Next.js + PostgreSQL + Prisma + Gemini adapter)
- [x] D-010 scale, performance, RPO/RTO approved (near-zero RPO for confirmed transactions via WAL/PITR)
- [x] D-011 retention/privacy/legal review complete (retention baseline defined)
- [x] D-013 conversion-change policy approved (snapshots preserved; future changes require new version & approval)
- [x] D-014 material product edit policy approved (spec versions effective-dated and approval-gated)
- [x] PRD/workflow/schema/permissions/UI reviewed and approved
- [x] Owner explicitly authorizes implementation (Authorized to proceed with Phase 1)

## Implementation tasks
- [x] T-001 Repository, CI, lint, tests, dependency/secret scanning (monorepo layout, NestJS backend, Next.js frontend, Prisma, CI workflows, secret hygiene)
- [x] T-002 Authentication, session replacement, lockout and password policy (JWT, bcrypt, 5-attempt lockout for 15m, single active session revocation, 7-day inactivity timeout)
- [x] T-003 Users, clients, warehouses and assignments (client & warehouse CRUD, many-to-many assignments with effective dates, role validation, session revocation on disable/reset)
- [x] T-004 Role-scoped authorization middleware and tests (tenancy boundary enforcement, cross-client isolation, Store Admin warehouse scoping, inbound source warehouse privacy filter)
- [x] T-005 Product catalogs, attributes, units, conversion snapshots (Company vs Client scopes, deterministic duplicate key D-003, fixed-precision quantities, unit conversion validation, Super Admin product reviews)
- [x] T-006 Immutable inventory ledger and balance projection (append-only ledger entries, reversal/replacement, ACID row-locked balance updates, Physical = Usable + Damaged + Expired, Available = Usable - Reserved, idempotency keys, tenant scoping)
- [ ] T-007 Reservations, pending edit/cancel and idempotent approvals
- [ ] T-008 Stock-in/out and physical corrections
- [ ] T-009 Dispatch, transfers, receipt and discrepancies
- [ ] T-010 Client manufacturing linked/separate workflows
- [ ] T-011 Departments, issues, returns and condition handling
- [ ] T-012 Bulk CSV/document extraction and review UI
- [ ] T-013 Notifications, low-stock and expiry alerts
- [ ] T-014 Reports, exports and export audit
- [ ] T-015 Backups, monitoring, restore drills and runbook
- [ ] T-016 Security, accessibility, performance, UAT and release readiness

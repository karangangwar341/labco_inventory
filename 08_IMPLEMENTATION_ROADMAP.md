# Implementation Roadmap & AI Agent Task Breakdown
**Status:** Implementation authorized by owner on 2026-10-15. Proceed sequentially against `13_TASKS.md`; unresolved decisions block only the affected feature. Current verified gaps are recorded in `16_IMPLEMENTATION_AUDIT.md`.

## Phase 0 — Close design gaps (remaining items tracked individually)
- Confirm open items in `11_DECISIONS.md`; do not block unrelated decided work.
- Approve PRD, workflows, schema, permissions and UX screen inventory.
- Select stack, hosting, storage, AI provider and operational targets.
**Exit:** Versioned design baseline approved.

## Phase 1 — Repository and engineering foundation
- Create repository layout and `AGENTS.md`.
- Configure formatter/linter/type checks, dependency scanning and secret scanning.
- Set up test framework, migration workflow, CI checks and environment templates.
**Exit:** clean build/test pipeline; no production secrets in repo.

## Phase 2 — Identity and organization
- Login, lockout, single-session policy, seven-day inactivity timeout.
- User/role management, projects, warehouses, assignments, and Store Admin multi-warehouse assignment (1:N Store Admin to Warehouse; 1:0..1 Warehouse to Store Admin).
- Server authorization tests.
**Exit:** all role-scope and session tests pass.

## Phase 3 — Catalog and units
- Company and project product catalogs.
- Categories, flexible attributes, units/conversions, quantity precision, thresholds.
- Product approval and duplicate-warning logic.
**Exit:** catalog lifecycle and conversion snapshot tests pass.

## Phase 4 — Inventory foundation
- Immutable ledger, usable/reserved balance projections, and damaged stock-out handling.
- Atomic reservations, idempotency, stock availability.
- Physical count adjustments and reversal-based corrections.
**Exit:** concurrency and ledger invariants pass.

## Phase 5 — Approval and notifications
- Super Admin queue, decisions/reasons, priority, audit and notifications.
- Pending-request editing/cancellation and reservation release.
**Exit:** no duplicate approval or unauthorized posting.

## Phase 6 — Warehouse operations
- Stock-in/out, dispatch, in-transit, transfer, receipt discrepancies and D-020 final resolution/reporting.
- Assignment constraints and source identity privacy.
**Exit:** warehouse lifecycle tests pass.

## Phase 7 — Project operations
- Direct project stock-in/out, manufacturing linked/separate, department issue/return (with physical indent form tracking and tabular grouping), daily batches.
**Exit:** atomic manufacturing and project scope tests pass.

## Phase 8 — Bulk imports and AI extraction
- CSV parsing, image/document extraction, editable field mapping, row validation, batch approvals.
- File security, duplicate warnings and error export.
**Exit:** import alone never changes stock; all import tests pass.

## Phase 9 — Reporting and operations
- Reports/exports, low-stock alerts, backups, restore drills, monitoring.
**Exit:** operational runbook tested and recovery targets met.

## Phase 10 — Hardening and launch readiness
- Security review, accessibility review, performance/load testing, UAT, data migration rehearsal.
- Fix critical/high findings; approve release checklist.
**Exit:** signed production go/no-go.

## Task contract for every AI-agent task
Each task must include: purpose, prerequisites, allowed scope, files/modules expected to change, explicit non-goals, acceptance criteria, tests to run, security implications, migration/rollback impact, and completion summary. Agent must stop and ask/flag if implementation requires changing an approved business rule.

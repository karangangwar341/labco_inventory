# Database Migration & Rollback Guide

## 1. Baseline Migration
- **Migration ID**: `20261014000000_init`
- **Scope**: Initial core schema, superseded for current deployments by subsequent migrations.

## 2. Migration Discipline
1. **Never alter published migrations**:
   Once applied to staging/production, migrations are immutable.
2. **Backward-compatible changes**:
   - Add new columns as `nullable` or with safe defaults.
   - Expand enums before application code references new variants.
   - Deprecate old fields over a two-phase deployment cycle.

## 3. Rollback & Forward-Fix Strategy
- **Forward-fix preferred**: In case of application issues, prefer forward-fixing via a corrective migration or rolling back application containers while keeping backward-compatible schema changes intact.
- **Product kind migration (`20261015090000_product_kind`)**: Adds a non-null `products.kind` enum column with `RAW_MATERIAL` as the database default, so all existing catalog products are classified as raw materials without changing stock balances or ledger history. Forward-fix is preferred. Dropping the column to roll back would discard any manufactured-product classifications created after deployment; only reverse it after confirming no such products exist or exporting and preserving their classifications.
- **Emergency rollback**:
  If an unapplied or broken migration must be rolled back on a test/staging instance:
  ```bash
  # Generate down migration diff
  npx prisma migrate diff --from-schema-datamodel ./prisma/schema.prisma --to-empty --script > rollback.sql
  ```
- **Department issue batch migration (`20261018120000_department_issue_batches`)**: Adds the `POSTED` enum variants and daily department issue batch table, links issue lines and reservations to a batch, and enforces exactly one reservation owner (request line or department issue). Apply after taking the usual database backup. Existing request reservations remain valid. This migration is additive; do not drop the reservation check, foreign keys, or batch table after batch data is created. Prefer an application rollback while retaining the schema, then forward-fix. A full down migration is unsafe once batch submissions or reservations exist.
- **Project rename and lot/expiry removal (`20261022120000_remove_lot_tracking_rename_projects`)**: Renames client-domain tables, columns, enum values, and role to Project terminology; removes stock lot/expiry columns, `stock_batches`, expired/damaged balance columns, expiry notification types and product tracking modes. Existing balances are consolidated by location/product, summing usable and reserved quantities; lot metadata and obsolete separate damaged/expired quantities are discarded. Operational import and department issue grouping rows remain. Append-only ledger entries are preserved, including legacy condition text such as `EXPIRED` as a historical snapshot; that value is not an active stock condition or balance bucket. This migration is destructive for the removed data and is authorized only for the confirmed non-production dataset. Apply first to a clean disposable database. No production deployment is authorized. A down migration cannot recover discarded lot/expiry or balance bucket data; forward-fix is the supported recovery.
- **Project assignment constraint names (`20261023120000_rename_project_assignment_constraints`)**: Renames the remaining warehouse-assignment foreign-key constraints to match the Project schema. No data changes; reverse the two names only if rolling back before the Project schema deployment.
- **Pre-deployment backup**:
  As specified in Section 3 of `10_DEPLOYMENT_RUNBOOK.md`, take a full snapshot backup before applying migrations in production.
# Shipment discrepancy resolution (2026-10-23)

Migration `20261023130000_resolve_shipment_discrepancies` adds one-time shipment resolution fields and the historical line conversion snapshot used by the missing-stock report. Existing shipment lines default to a conversion factor of 1; this preserves current stored quantities but cannot reconstruct a historical non-base conversion that was never stored. New dispatches store their request-line conversion snapshot.

Apply through the normal Prisma migration process against the intended Neon branch using `DIRECT_URL`; do not use `db push`. The migration is additive. Rollback requires a forward migration and should preserve any resolution decisions and stock-in ledger entries; do not delete ledger/audit records to reverse a decision. No Neon database was changed as part of authoring this migration.

# Database Migration & Rollback Guide

## 1. Baseline Migration
- **Migration ID**: `20261014000000_init`
- **Scope**: Full schema definition including all core models (`users`, `sessions`, `login_events`, `clients`, `warehouses`, `client_warehouse_assignments`, `categories`, `products`, `product_attributes`, `product_units`, `stock_locations`, `stock_batches`, `inventory_balances`, `stock_requests`, `stock_request_lines`, `reservations`, `shipments`, `shipment_lines`, `production_runs`, `production_inputs`, `production_outputs`, `departments`, `department_issues`, `department_returns`, `ledger_transactions`, `ledger_entries`, `approvals`, `import_batches`, `import_rows`, `attachments`, `notifications`, `stock_alert_states`, `audit_events`, `system_settings`, `backups`).

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
- **Pre-deployment backup**:
  As specified in Section 3 of `10_DEPLOYMENT_RUNBOOK.md`, take a full snapshot backup before applying migrations in production.

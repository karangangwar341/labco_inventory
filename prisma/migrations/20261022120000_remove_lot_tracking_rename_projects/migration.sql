BEGIN;

ALTER TABLE "ledger_transactions" ADD COLUMN "reason" TEXT;

-- Rename legacy enum labels in place so existing project assignments and role rows survive.
ALTER TYPE "UserRole" RENAME VALUE 'CLIENT_ADMIN' TO 'PROJECT_ADMIN';
UPDATE "users"
SET "username" = regexp_replace("username", '^clientadmin', 'projectadmin')
WHERE "username" LIKE 'clientadmin%';
ALTER TYPE "CatalogScope" RENAME VALUE 'CLIENT' TO 'PROJECT';
ALTER TYPE "LocationType" RENAME VALUE 'CLIENT' TO 'PROJECT';
ALTER TYPE "ShipmentType" RENAME VALUE 'DISPATCH_TO_CLIENT' TO 'DISPATCH_TO_PROJECT';

-- Expiry-specific notifications are obsolete; retain all other notifications.
DELETE FROM "notifications" WHERE "event_type"::text IN ('EXPIRY_WARNING', 'BATCH_EXPIRED');
CREATE TYPE "NotificationEventType_new" AS ENUM (
  'LOW_STOCK_DOWNWARD_CROSSING', 'LOW_STOCK_RECOVERED', 'REQUEST_STATUS_CHANGED',
  'SHIPMENT_DISPATCHED', 'SHIPMENT_RECEIVED', 'DISCREPANCY_ALERT', 'BACKUP_FAILED',
  'BACKUP_RESTORED', 'RESTORE_DRILL_FAILED', 'RESTORE_DRILL_PASSED'
);
ALTER TABLE "notifications" ALTER COLUMN "event_type" TYPE "NotificationEventType_new"
  USING ("event_type"::text::"NotificationEventType_new");
ALTER TYPE "NotificationEventType" RENAME TO "NotificationEventType_old";
ALTER TYPE "NotificationEventType_new" RENAME TO "NotificationEventType";
DROP TYPE "NotificationEventType_old";

-- Preserve append-only ledger history. Keep the old condition value as a text snapshot
-- on ledger entries; expired conditions are removed only from active request/shipment data.
DELETE FROM "stock_request_lines" WHERE "condition" = 'EXPIRED';
DELETE FROM "shipment_lines" WHERE "condition" = 'EXPIRED';
ALTER TABLE "ledger_entries" ALTER COLUMN "condition" DROP DEFAULT;
ALTER TABLE "stock_request_lines" ALTER COLUMN "condition" DROP DEFAULT;
ALTER TABLE "shipment_lines" ALTER COLUMN "condition" DROP DEFAULT;
ALTER TABLE "ledger_entries" ALTER COLUMN "condition" TYPE TEXT
  USING ("condition"::text);
CREATE TYPE "StockCondition_new" AS ENUM ('USABLE', 'DAMAGED');
ALTER TABLE "stock_request_lines" ALTER COLUMN "condition" TYPE "StockCondition_new"
  USING ("condition"::text::"StockCondition_new");
ALTER TABLE "shipment_lines" ALTER COLUMN "condition" TYPE "StockCondition_new"
  USING ("condition"::text::"StockCondition_new");
-- Department returns are no longer tracked by stock condition; drop this dependency before
-- removing the legacy enum so the enum conversion is valid on PostgreSQL.
ALTER TABLE "department_returns" DROP COLUMN "condition";
ALTER TYPE "StockCondition" RENAME TO "StockCondition_old";
ALTER TYPE "StockCondition_new" RENAME TO "StockCondition";
DROP TYPE "StockCondition_old";
ALTER TABLE "ledger_entries" ALTER COLUMN "condition" SET DEFAULT 'USABLE';
ALTER TABLE "stock_request_lines" ALTER COLUMN "condition" SET DEFAULT 'USABLE';
ALTER TABLE "shipment_lines" ALTER COLUMN "condition" SET DEFAULT 'USABLE';

-- Consolidate lot-split balances into one balance per location and product.
-- Usable and reserved quantities are preserved; obsolete damaged/expired buckets are discarded.
CREATE TEMP TABLE "inventory_balance_rollup" ON COMMIT DROP AS
SELECT MIN("id") AS "id", "location_id", "product_id",
       SUM("usable_qty") AS "usable_qty", SUM("reserved_qty") AS "reserved_qty",
       MAX("version") AS "version", MAX("updated_at") AS "updated_at"
FROM "inventory_balances"
GROUP BY "location_id", "product_id";
DELETE FROM "inventory_balances";
DROP INDEX "inventory_balances_location_id_product_id_batch_id_key";
DROP TABLE "stock_batches" CASCADE;
ALTER TABLE "inventory_balances"
  DROP COLUMN "batch_id",
  DROP COLUMN "damaged_qty",
  DROP COLUMN "expired_qty";
INSERT INTO "inventory_balances" ("id", "location_id", "product_id", "usable_qty", "reserved_qty", "version", "updated_at")
SELECT "id", "location_id", "product_id", "usable_qty", "reserved_qty", "version", "updated_at"
FROM "inventory_balance_rollup";
CREATE UNIQUE INDEX "inventory_balances_location_id_product_id_key"
  ON "inventory_balances" ("location_id", "product_id");

-- Rename Client domain tables and foreign-key columns in place; preserve existing Project data.
ALTER TABLE "clients" RENAME TO "projects";
ALTER TABLE "client_warehouse_assignments" RENAME TO "project_warehouse_assignments";
ALTER TABLE "project_warehouse_assignments" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "categories" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "products" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "stock_locations" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "users" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "stock_requests" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "production_runs" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "departments" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "department_issues" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "department_issue_batches" RENAME COLUMN "client_id" TO "project_id";
ALTER TABLE "department_returns" RENAME COLUMN "client_id" TO "project_id";

ALTER TABLE "projects" RENAME CONSTRAINT "clients_pkey" TO "projects_pkey";
ALTER TABLE "project_warehouse_assignments" RENAME CONSTRAINT "client_warehouse_assignments_pkey" TO "project_warehouse_assignments_pkey";
ALTER TABLE "project_warehouse_assignments" RENAME CONSTRAINT "client_warehouse_assignments_client_id_fkey" TO "project_warehouse_assignments_project_id_fkey";
ALTER TABLE "categories" RENAME CONSTRAINT "categories_client_id_fkey" TO "categories_project_id_fkey";
ALTER TABLE "products" RENAME CONSTRAINT "products_client_id_fkey" TO "products_project_id_fkey";
ALTER TABLE "stock_locations" RENAME CONSTRAINT "stock_locations_client_id_fkey" TO "stock_locations_project_id_fkey";
ALTER TABLE "users" RENAME CONSTRAINT "users_client_id_fkey" TO "users_project_id_fkey";
ALTER TABLE "stock_requests" RENAME CONSTRAINT "stock_requests_client_id_fkey" TO "stock_requests_project_id_fkey";
ALTER TABLE "production_runs" RENAME CONSTRAINT "production_runs_client_id_fkey" TO "production_runs_project_id_fkey";
ALTER TABLE "departments" RENAME CONSTRAINT "departments_client_id_fkey" TO "departments_project_id_fkey";
ALTER TABLE "department_issues" RENAME CONSTRAINT "department_issues_client_id_fkey" TO "department_issues_project_id_fkey";
ALTER TABLE "department_issue_batches" RENAME CONSTRAINT "department_issue_batches_client_id_fkey" TO "department_issue_batches_project_id_fkey";
ALTER TABLE "department_returns" RENAME CONSTRAINT "department_returns_client_id_fkey" TO "department_returns_project_id_fkey";

-- Staff tables are absent from the checked-in base migrations but may already exist
-- in databases previously synchronized with db push. Rename and preserve them when present;
-- otherwise create the Project tables for a clean migration history.
DO $migration$
BEGIN
  IF to_regclass('public.client_staff_members') IS NOT NULL
     AND to_regclass('public.client_staff_work_logs') IS NOT NULL THEN
    ALTER TABLE "client_staff_members" RENAME TO "project_staff_members";
    ALTER TABLE "project_staff_members" RENAME COLUMN "client_id" TO "project_id";
    ALTER TABLE "project_staff_members" RENAME CONSTRAINT "client_staff_members_pkey" TO "project_staff_members_pkey";
    ALTER TABLE "project_staff_members" RENAME CONSTRAINT "client_staff_members_client_id_fkey" TO "project_staff_members_project_id_fkey";
    ALTER INDEX "client_staff_members_client_id_staff_number_key" RENAME TO "project_staff_members_project_id_staff_number_key";

    ALTER TABLE "client_staff_work_logs" RENAME TO "project_staff_work_logs";
    ALTER TABLE "project_staff_work_logs" RENAME COLUMN "client_id" TO "project_id";
    ALTER TABLE "project_staff_work_logs" RENAME CONSTRAINT "client_staff_work_logs_pkey" TO "project_staff_work_logs_pkey";
    ALTER TABLE "project_staff_work_logs" RENAME CONSTRAINT "client_staff_work_logs_client_id_fkey" TO "project_staff_work_logs_project_id_fkey";
    ALTER TABLE "project_staff_work_logs" RENAME CONSTRAINT "client_staff_work_logs_staff_member_id_fkey" TO "project_staff_work_logs_staff_member_id_fkey";
    ALTER INDEX "client_staff_work_logs_client_id_log_date_idx" RENAME TO "project_staff_work_logs_project_id_log_date_idx";
  ELSE
    CREATE TABLE "project_staff_members" (
      "id" TEXT NOT NULL,
      "project_id" TEXT NOT NULL,
      "staff_number" TEXT NOT NULL,
      "full_name" TEXT NOT NULL,
      "role_title" TEXT,
      "contact" TEXT,
      "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "project_staff_members_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "project_staff_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX "project_staff_members_project_id_staff_number_key"
      ON "project_staff_members"("project_id", "staff_number");

    CREATE TABLE "project_staff_work_logs" (
      "id" TEXT NOT NULL,
      "staff_member_id" TEXT NOT NULL,
      "project_id" TEXT NOT NULL,
      "log_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "shift_type" TEXT,
      "hours_worked" DECIMAL(5,2),
      "tasks_completed" TEXT NOT NULL,
      "notes" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "project_staff_work_logs_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "project_staff_work_logs_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "project_staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "project_staff_work_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE INDEX "project_staff_work_logs_project_id_log_date_idx"
      ON "project_staff_work_logs"("project_id", "log_date");
  END IF;
END
$migration$;

-- Drop product lot/expiry tracking fields while preserving workflow grouping IDs.
ALTER TABLE "products" DROP COLUMN "tracking_mode";
ALTER TABLE "ledger_entries" DROP COLUMN "batch_id";
ALTER TABLE "stock_request_lines" DROP COLUMN "batch_id", DROP COLUMN "batch_number", DROP COLUMN "expiry_date";
ALTER TABLE "reservations" DROP COLUMN "batch_id";
ALTER TABLE "shipment_lines" DROP COLUMN "batch_id";
ALTER TABLE "production_inputs" DROP COLUMN "batch_id";
ALTER TABLE "production_outputs" DROP COLUMN "batch_number", DROP COLUMN "expiry_date";
ALTER TABLE "department_issues" DROP COLUMN "batch_id";
ALTER TABLE "department_returns" DROP COLUMN "batch_id";
DROP TYPE "TrackingMode";
DROP TYPE "BatchStatus";

-- Rename mapped indexes so Prisma sees the Project schema without duplicate legacy indexes.
ALTER INDEX "clients_name_key" RENAME TO "projects_name_key";
ALTER INDEX "categories_name_owner_scope_client_id_key" RENAME TO "categories_name_owner_scope_project_id_key";
ALTER INDEX "products_client_id_idx" RENAME TO "products_project_id_idx";
ALTER INDEX "stock_locations_client_id_key" RENAME TO "stock_locations_project_id_key";
ALTER INDEX "users_client_id_idx" RENAME TO "users_project_id_idx";
ALTER INDEX "stock_requests_client_id_idx" RENAME TO "stock_requests_project_id_idx";
ALTER INDEX "production_runs_client_id_idx" RENAME TO "production_runs_project_id_idx";
ALTER INDEX "departments_client_id_idx" RENAME TO "departments_project_id_idx";
ALTER INDEX "departments_client_id_name_key" RENAME TO "departments_project_id_name_key";
ALTER INDEX "department_issues_client_id_idx" RENAME TO "department_issues_project_id_idx";
ALTER INDEX "department_issue_batches_client_id_status_idx" RENAME TO "department_issue_batches_project_id_status_idx";
ALTER INDEX "department_issue_batches_one_draft_per_client_idx" RENAME TO "department_issue_batches_one_draft_per_project_idx";
ALTER INDEX "department_returns_client_id_idx" RENAME TO "department_returns_project_id_idx";
ALTER INDEX "client_warehouse_assignments_client_id_idx" RENAME TO "project_warehouse_assignments_project_id_idx";
ALTER INDEX "client_warehouse_assignments_warehouse_id_idx" RENAME TO "project_warehouse_assignments_warehouse_id_idx";
ALTER INDEX "client_warehouse_assignments_is_active_idx" RENAME TO "project_warehouse_assignments_is_active_idx";

COMMIT;

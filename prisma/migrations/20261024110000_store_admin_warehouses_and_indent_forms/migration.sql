-- AlterTable: add store_admin_id to warehouses
ALTER TABLE "warehouses" ADD COLUMN "store_admin_id" TEXT;

-- CreateIndex
CREATE INDEX "warehouses_store_admin_id_idx" ON "warehouses"("store_admin_id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_store_admin_id_fkey" FOREIGN KEY ("store_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill store_admin_id from users table if any exists
UPDATE "warehouses" w
SET "store_admin_id" = u."id"
FROM "users" u
WHERE u."warehouse_id" = w."id" AND u."role" = 'STORE_ADMIN';

-- AlterTable: add indent_number and requested_quantity to department_issues
ALTER TABLE "department_issues" ADD COLUMN "indent_number" TEXT NOT NULL DEFAULT 'N/A';
ALTER TABLE "department_issues" ADD COLUMN "requested_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- Backfill requested_quantity with existing quantity
UPDATE "department_issues"
SET "requested_quantity" = "quantity"
WHERE "requested_quantity" = 0;

-- CreateIndex
CREATE INDEX "department_issues_indent_number_idx" ON "department_issues"("indent_number");

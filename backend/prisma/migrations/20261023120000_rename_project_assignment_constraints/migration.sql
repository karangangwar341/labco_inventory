ALTER TABLE "project_warehouse_assignments"
  RENAME CONSTRAINT "client_warehouse_assignments_changed_by_id_fkey"
  TO "project_warehouse_assignments_changed_by_id_fkey";

ALTER TABLE "project_warehouse_assignments"
  RENAME CONSTRAINT "client_warehouse_assignments_warehouse_id_fkey"
  TO "project_warehouse_assignments_warehouse_id_fkey";

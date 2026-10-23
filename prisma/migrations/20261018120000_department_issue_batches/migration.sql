ALTER TYPE "DepartmentIssueStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "DepartmentIssueStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "ProductionStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "DepartmentReturnStatus" ADD VALUE IF NOT EXISTS 'POSTED';
ALTER TYPE "ImportBatchStatus" ADD VALUE IF NOT EXISTS 'POSTED';

CREATE TYPE "DepartmentIssueBatchStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REJECTED');

ALTER TABLE "reservations" ALTER COLUMN "request_line_id" DROP NOT NULL;
ALTER TABLE "reservations" ADD COLUMN "department_issue_id" TEXT;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_department_issue_id_fkey"
  FOREIGN KEY ("department_issue_id") REFERENCES "department_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_owner_exactly_one_check"
  CHECK (("request_line_id" IS NOT NULL) <> ("department_issue_id" IS NOT NULL));

CREATE TABLE "department_issue_batches" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "status" "DepartmentIssueBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "rejection_reason" TEXT,
  "approved_by_id" TEXT,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "department_issue_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "department_issue_batches_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "department_issue_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "department_issue_batches_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "department_issues" ADD COLUMN "issue_batch_id" TEXT;
ALTER TABLE "department_issues" ADD CONSTRAINT "department_issues_issue_batch_id_fkey"
  FOREIGN KEY ("issue_batch_id") REFERENCES "department_issue_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "reservations_department_issue_id_idx" ON "reservations"("department_issue_id");
CREATE INDEX "department_issue_batches_client_id_status_idx" ON "department_issue_batches"("client_id", "status");
CREATE INDEX "department_issue_batches_created_by_id_status_idx" ON "department_issue_batches"("created_by_id", "status");
CREATE INDEX "department_issues_issue_batch_id_idx" ON "department_issues"("issue_batch_id");
CREATE UNIQUE INDEX "department_issue_batches_one_draft_per_client_idx"
  ON "department_issue_batches"("client_id") WHERE "status" = 'DRAFT';

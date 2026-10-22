CREATE TYPE "ShipmentDiscrepancyResolution" AS ENUM ('MISSING', 'CALCULATION_MISTAKE');

ALTER TABLE "shipments"
  ADD COLUMN "discrepancy_resolution" "ShipmentDiscrepancyResolution",
  ADD COLUMN "discrepancy_resolved_at" TIMESTAMP(3),
  ADD COLUMN "discrepancy_resolved_by_id" TEXT,
  ADD COLUMN "discrepancy_resolution_note" TEXT;

ALTER TABLE "shipment_lines"
  ADD COLUMN "conversion_to_base_snapshot" DECIMAL(18,4) NOT NULL DEFAULT 1;

CREATE INDEX "shipments_discrepancy_resolution_discrepancy_resolved_at_idx"
  ON "shipments"("discrepancy_resolution", "discrepancy_resolved_at");

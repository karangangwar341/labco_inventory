-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "device_id" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent_hash" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sessions_device_id_idx" ON "sessions"("device_id");

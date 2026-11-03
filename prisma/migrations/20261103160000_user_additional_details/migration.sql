-- AlterTable: add optional full_name, phone_number, address, id_image_url to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "full_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_number" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_image_url" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN "read_at" TIMESTAMP(3);

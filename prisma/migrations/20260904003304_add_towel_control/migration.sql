-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "towel_cutoff_hour" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "towel_fee_lost" DECIMAL(65,30) NOT NULL DEFAULT 150,
ADD COLUMN     "towel_grace_days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "towel_max_per_profile" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "TowelStock" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "clean" INTEGER NOT NULL DEFAULT 0,
    "in_use" INTEGER NOT NULL DEFAULT 0,
    "laundry" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TowelStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TowelLoan" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "issued_by_id" TEXT NOT NULL,
    "received_by_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "returned_qty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'prestada',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "charged_at" TIMESTAMP(3),
    "payment_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TowelLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TowelStock_unit_id_key" ON "TowelStock"("unit_id");

-- CreateIndex
CREATE INDEX "TowelLoan_profile_id_status_idx" ON "TowelLoan"("profile_id", "status");

-- CreateIndex
CREATE INDEX "TowelLoan_unit_id_status_idx" ON "TowelLoan"("unit_id", "status");

-- AddForeignKey
ALTER TABLE "TowelStock" ADD CONSTRAINT "TowelStock_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowelLoan" ADD CONSTRAINT "TowelLoan_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowelLoan" ADD CONSTRAINT "TowelLoan_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowelLoan" ADD CONSTRAINT "TowelLoan_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowelLoan" ADD CONSTRAINT "TowelLoan_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowelLoan" ADD CONSTRAINT "TowelLoan_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowelLoan" ADD CONSTRAINT "TowelLoan_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

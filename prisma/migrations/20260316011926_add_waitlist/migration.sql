-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "resource_type" TEXT,
    "service_id" TEXT,
    "activity_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time_slot" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "notified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_profile_id_resource_type_date_time_slot_key" ON "Waitlist"("profile_id", "resource_type", "date", "time_slot");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_profile_id_service_id_date_time_slot_key" ON "Waitlist"("profile_id", "service_id", "date", "time_slot");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_profile_id_activity_id_date_time_slot_key" ON "Waitlist"("profile_id", "activity_id", "date", "time_slot");

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

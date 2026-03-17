-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "staff_id" TEXT,
    "service_id" TEXT,
    "resource_type" TEXT,
    "activity_id" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rating_profile_id_reservation_id_key" ON "Rating"("profile_id", "reservation_id");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

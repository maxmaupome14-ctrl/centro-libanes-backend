-- CreateTable
CREATE TABLE "GuestPass" (
    "id" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_phone" TEXT,
    "guest_email" TEXT,
    "visit_date" TIMESTAMP(3) NOT NULL,
    "pass_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "checked_in_at" TIMESTAMP(3),
    "max_guests" INTEGER NOT NULL DEFAULT 1,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestPass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestPass_pass_code_key" ON "GuestPass"("pass_code");

-- AddForeignKey
ALTER TABLE "GuestPass" ADD CONSTRAINT "GuestPass_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

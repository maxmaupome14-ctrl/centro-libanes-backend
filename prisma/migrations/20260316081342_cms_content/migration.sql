-- CreateTable
CREATE TABLE "FeaturedItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "gradient_start" TEXT NOT NULL DEFAULT '#005A36',
    "gradient_end" TEXT NOT NULL DEFAULT '#007A4A',
    "icon" TEXT NOT NULL DEFAULT 'dumbbell',
    "link" TEXT NOT NULL DEFAULT '/reservations',
    "image_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExploreItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'dumbbell',
    "color" TEXT NOT NULL DEFAULT '#007A4A',
    "background_color" TEXT NOT NULL DEFAULT 'rgba(0,122,74,0.08)',
    "link" TEXT NOT NULL DEFAULT '/reservations',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExploreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "background_color" TEXT NOT NULL DEFAULT '#007A4A',
    "image_url" TEXT,
    "cta_text" TEXT,
    "cta_link" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'home_top',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

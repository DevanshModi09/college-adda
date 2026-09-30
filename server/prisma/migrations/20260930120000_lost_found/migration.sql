-- CreateTable
CREATE TABLE "lost_found" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "place" TEXT NOT NULL DEFAULT '',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "lost_found_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lost_found_created_at_idx" ON "lost_found"("created_at");

-- AddForeignKey
ALTER TABLE "lost_found" ADD CONSTRAINT "lost_found_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


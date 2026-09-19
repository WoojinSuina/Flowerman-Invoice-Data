-- CreateTable
CREATE TABLE "pending_pages" (
    "id" TEXT NOT NULL,
    "processing_job_id" TEXT NOT NULL,
    "source_page" INTEGER NOT NULL,
    "source_file_name" TEXT NOT NULL,
    "storage_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_pages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pending_pages" ADD CONSTRAINT "pending_pages_processing_job_id_fkey" FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

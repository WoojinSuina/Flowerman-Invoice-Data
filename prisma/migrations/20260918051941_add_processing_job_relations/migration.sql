-- AlterTable
ALTER TABLE "extraction_attempts" ADD COLUMN     "processing_job_id" TEXT,
ADD COLUMN     "source_page" INTEGER;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "processing_job_id" TEXT;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_processing_job_id_fkey" FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_attempts" ADD CONSTRAINT "extraction_attempts_processing_job_id_fkey" FOREIGN KEY ("processing_job_id") REFERENCES "processing_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

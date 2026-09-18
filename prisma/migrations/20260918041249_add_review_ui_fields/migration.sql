-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "line_number" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "source_image_url" TEXT;

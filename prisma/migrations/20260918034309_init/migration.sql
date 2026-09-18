-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PROCESSING', 'PASS', 'REVIEW', 'APPROVED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "store_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "store_id" TEXT NOT NULL,
    "total_charges_cents" INTEGER NOT NULL,
    "total_credit_cents" INTEGER NOT NULL,
    "total_amount_due_cents" INTEGER NOT NULL,
    "calculated_total_charges_cents" INTEGER NOT NULL,
    "calculated_total_credit_cents" INTEGER NOT NULL,
    "calculated_amount_due_cents" INTEGER NOT NULL,
    "validation_difference_cents" INTEGER NOT NULL,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'PROCESSING',
    "validation_suggestions" JSONB,
    "raw_extraction" JSONB,
    "source_file" TEXT NOT NULL,
    "source_page" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "retail_price_cents" INTEGER NOT NULL,
    "unit_cost_cents" INTEGER NOT NULL,
    "delivered_quantity" INTEGER NOT NULL,
    "returned_quantity" INTEGER NOT NULL,
    "sold_quantity" INTEGER NOT NULL,
    "delivered_amount_cents" INTEGER NOT NULL,
    "return_credit_cents" INTEGER NOT NULL,
    "net_sold_amount_cents" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_attempts" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "provider" TEXT NOT NULL,
    "raw_response" JSONB NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_corrections" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "field_path" TEXT NOT NULL,
    "original_value" TEXT NOT NULL,
    "corrected_value" TEXT NOT NULL,
    "corrected_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "total_pages" INTEGER NOT NULL,
    "processed_pages" INTEGER NOT NULL DEFAULT 0,
    "passed_pages" INTEGER NOT NULL DEFAULT 0,
    "review_pages" INTEGER NOT NULL DEFAULT 0,
    "failed_pages" INTEGER NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_number_key" ON "stores"("store_number");

-- CreateIndex
CREATE UNIQUE INDEX "products_name_key" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_store_id_key" ON "invoices"("invoice_number", "store_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_attempts" ADD CONSTRAINT "extraction_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_corrections" ADD CONSTRAINT "manual_corrections_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

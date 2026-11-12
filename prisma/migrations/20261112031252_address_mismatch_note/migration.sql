-- DropIndex
DROP INDEX "stores_name_address_key";

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "address_mismatch_note" TEXT;

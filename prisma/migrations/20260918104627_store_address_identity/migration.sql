-- DropIndex
DROP INDEX "stores_store_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "stores_address_key" ON "stores"("address");

-- DropIndex
DROP INDEX "stores_address_key";

-- CreateIndex
CREATE UNIQUE INDEX "stores_name_address_key" ON "stores"("name", "address");

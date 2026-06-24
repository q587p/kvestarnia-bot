ALTER TABLE "item_transfers" ADD COLUMN "reservation_key" TEXT;

CREATE UNIQUE INDEX "item_transfers_reservation_key_key" ON "item_transfers"("reservation_key");

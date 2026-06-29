ALTER TABLE "item_transfers" ADD COLUMN "transfer_kind" TEXT NOT NULL DEFAULT 'gift';
ALTER TABLE "item_transfers" ADD COLUMN "package_json" JSONB;
ALTER TABLE "item_transfers" ADD COLUMN "delivery_fee_gold" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "item_transfers_transfer_kind_status_expires_at_idx" ON "item_transfers"("transfer_kind", "status", "expires_at");

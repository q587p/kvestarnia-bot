-- CreateTable
CREATE TABLE "item_transfers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "sender_character_id" TEXT NOT NULL,
    "receiver_character_id" TEXT NOT NULL,
    "sender_telegram_user_id" BIGINT NOT NULL,
    "receiver_telegram_user_id" BIGINT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "receiver_name" TEXT NOT NULL,
    "sender_remort_count" INTEGER NOT NULL DEFAULT 0,
    "receiver_remort_count" INTEGER NOT NULL DEFAULT 0,
    "location_id" TEXT,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_fingerprint" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result_json" JSONB,
    "expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "responded_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "item_transfers_sender_character_id_fkey" FOREIGN KEY ("sender_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "item_transfers_receiver_character_id_fkey" FOREIGN KEY ("receiver_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "item_transfers_token_key" ON "item_transfers"("token");

-- CreateIndex
CREATE INDEX "item_transfers_sender_character_id_status_expires_at_idx" ON "item_transfers"("sender_character_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "item_transfers_receiver_character_id_status_expires_at_idx" ON "item_transfers"("receiver_character_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "item_transfers_item_id_status_idx" ON "item_transfers"("item_id", "status");

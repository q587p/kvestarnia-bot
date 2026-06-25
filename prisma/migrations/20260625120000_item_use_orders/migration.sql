-- CreateTable
CREATE TABLE "item_use_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "remort_count" INTEGER NOT NULL DEFAULT 0,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "item_fingerprint" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "effect_kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reservation_key" TEXT,
    "preview_json" JSONB NOT NULL,
    "result_json" JSONB,
    "expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "item_use_orders_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "item_use_orders_token_key" ON "item_use_orders"("token");

-- CreateIndex
CREATE UNIQUE INDEX "item_use_orders_reservation_key_key" ON "item_use_orders"("reservation_key");

-- CreateIndex
CREATE INDEX "item_use_orders_character_id_status_expires_at_idx" ON "item_use_orders"("character_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "item_use_orders_item_id_status_idx" ON "item_use_orders"("item_id", "status");

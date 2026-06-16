CREATE TABLE "level_barter_exchanges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "input_items_json" JSONB NOT NULL,
    "spent_gold" INTEGER NOT NULL,
    "level_before" INTEGER NOT NULL,
    "level_after" INTEGER NOT NULL,
    "xp_before" INTEGER NOT NULL,
    "xp_after" INTEGER NOT NULL,
    "xp_carry" INTEGER NOT NULL,
    "item_total_value" INTEGER NOT NULL,
    "selected_total_value" INTEGER NOT NULL,
    "overpay" INTEGER NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "level_barter_exchanges_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "level_barter_exchanges_character_id_token_key" ON "level_barter_exchanges"("character_id", "token");
CREATE INDEX "level_barter_exchanges_character_id_status_idx" ON "level_barter_exchanges"("character_id", "status");

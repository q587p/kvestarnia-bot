CREATE TABLE "player_hint_receipts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "telegram_user_id" BIGINT NOT NULL,
  "key" TEXT NOT NULL,
  "shown_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "player_hint_receipts_telegram_user_id_key_key" ON "player_hint_receipts"("telegram_user_id", "key");
CREATE INDEX "player_hint_receipts_key_idx" ON "player_hint_receipts"("key");

-- CreateTable
CREATE TABLE "barrel_raid_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "period_id" TEXT NOT NULL,
    "available_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" DATETIME,
    "skipped_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "barrel_raid_notifications_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_mantok_chest_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input_items_json" JSONB NOT NULL,
    "output_items_json" JSONB,
    "average_input_score" INTEGER NOT NULL,
    "minimum_output_score" INTEGER NOT NULL,
    "output_score" INTEGER,
    "completed_at" DATETIME,
    "expired_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "mantok_chest_runs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_mantok_chest_runs" ("average_input_score", "character_id", "completed_at", "created_at", "id", "input_items_json", "minimum_output_score", "output_items_json", "output_score", "status", "token", "updated_at") SELECT "average_input_score", "character_id", "completed_at", "created_at", "id", "input_items_json", "minimum_output_score", "output_items_json", "output_score", "status", "token", "updated_at" FROM "mantok_chest_runs";
DROP TABLE "mantok_chest_runs";
ALTER TABLE "new_mantok_chest_runs" RENAME TO "mantok_chest_runs";
CREATE UNIQUE INDEX "mantok_chest_runs_token_key" ON "mantok_chest_runs"("token");
CREATE INDEX "mantok_chest_runs_character_id_status_idx" ON "mantok_chest_runs"("character_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "barrel_raid_notifications_telegram_user_id_period_id_key" ON "barrel_raid_notifications"("telegram_user_id", "period_id");

-- CreateIndex
CREATE INDEX "barrel_raid_notifications_character_id_status_idx" ON "barrel_raid_notifications"("character_id", "status");

-- CreateIndex
CREATE INDEX "barrel_raid_notifications_status_available_at_idx" ON "barrel_raid_notifications"("status", "available_at");

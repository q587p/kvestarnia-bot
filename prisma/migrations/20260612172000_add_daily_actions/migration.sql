-- CreateTable
CREATE TABLE "daily_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "reward_xp" INTEGER NOT NULL,
    "reward_gold" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_actions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_actions_character_id_key_local_date_key" ON "daily_actions"("character_id", "key", "local_date");

-- CreateIndex
CREATE INDEX "daily_actions_key_idx" ON "daily_actions"("key");

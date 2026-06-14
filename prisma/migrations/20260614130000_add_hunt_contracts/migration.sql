-- CreateTable
CREATE TABLE "hunt_contracts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "local_period_id" TEXT NOT NULL,
    "monster_id" TEXT NOT NULL,
    "contract_token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "completed_action" TEXT,
    "reward_xp" INTEGER,
    "reward_gold" INTEGER,
    "reward_items_json" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "hunt_contracts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "hunt_contracts_character_id_local_period_id_key" ON "hunt_contracts"("character_id", "local_period_id");

-- CreateIndex
CREATE INDEX "hunt_contracts_monster_id_idx" ON "hunt_contracts"("monster_id");

-- CreateIndex
CREATE INDEX "hunt_contracts_local_period_id_idx" ON "hunt_contracts"("local_period_id");

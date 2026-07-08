-- CreateTable
CREATE TABLE "duel_tournament_claims" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "reward_gold" INTEGER NOT NULL,
    "reward_items_json" JSONB NOT NULL,
    "result_json" JSONB,
    "claimed_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "duel_tournament_claims_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "duel_tournament_claims_character_id_period_period_key_key" ON "duel_tournament_claims"("character_id", "period", "period_key");

-- CreateIndex
CREATE INDEX "duel_tournament_claims_period_period_key_idx" ON "duel_tournament_claims"("period", "period_key");

-- CreateIndex
CREATE INDEX "duel_tournament_claims_claimed_at_idx" ON "duel_tournament_claims"("claimed_at");

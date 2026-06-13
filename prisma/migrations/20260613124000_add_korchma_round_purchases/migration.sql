-- CreateTable
CREATE TABLE "korchma_round_purchases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "spent_gold" INTEGER NOT NULL,
    "local_date" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "korchma_round_purchases_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "korchma_round_purchases_character_id_idx" ON "korchma_round_purchases"("character_id");

-- CreateIndex
CREATE INDEX "korchma_round_purchases_local_date_idx" ON "korchma_round_purchases"("local_date");

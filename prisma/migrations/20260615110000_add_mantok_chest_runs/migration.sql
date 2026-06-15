-- CreateTable
CREATE TABLE "mantok_chest_runs" (
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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "mantok_chest_runs_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "mantok_chest_runs_token_key" ON "mantok_chest_runs"("token");

-- CreateIndex
CREATE INDEX "mantok_chest_runs_character_id_status_idx" ON "mantok_chest_runs"("character_id", "status");

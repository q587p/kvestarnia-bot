CREATE TABLE "pending_passage_encounters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "origin_location_id" TEXT NOT NULL,
    "passage" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "monster_id" TEXT NOT NULL,
    "base_monster_level" INTEGER NOT NULL,
    "effective_monster_level" INTEGER NOT NULL,
    "rules_version" TEXT NOT NULL,
    "seed_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "active_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "combat_session_id" TEXT,
    "expires_at" DATETIME NOT NULL,
    "consumed_at" DATETIME,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "pending_passage_encounters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pending_passage_encounters_token_key" ON "pending_passage_encounters"("token");
CREATE UNIQUE INDEX "pending_passage_encounters_active_key_key" ON "pending_passage_encounters"("active_key");
CREATE INDEX "pending_passage_encounters_character_id_status_expires_at_idx" ON "pending_passage_encounters"("character_id", "status", "expires_at");
CREATE INDEX "pending_passage_encounters_origin_location_id_idx" ON "pending_passage_encounters"("origin_location_id");
CREATE INDEX "pending_passage_encounters_monster_id_idx" ON "pending_passage_encounters"("monster_id");
CREATE INDEX "pending_passage_encounters_combat_session_id_idx" ON "pending_passage_encounters"("combat_session_id");

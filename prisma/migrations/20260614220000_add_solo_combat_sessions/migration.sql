-- CreateTable
CREATE TABLE "solo_combat_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "monster_id" TEXT NOT NULL,
    "state_json" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "solo_combat_sessions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "solo_combat_sessions_character_id_status_idx" ON "solo_combat_sessions"("character_id", "status");

-- CreateIndex
CREATE INDEX "solo_combat_sessions_monster_id_idx" ON "solo_combat_sessions"("monster_id");

-- CreateIndex
CREATE INDEX "solo_combat_sessions_expires_at_idx" ON "solo_combat_sessions"("expires_at");

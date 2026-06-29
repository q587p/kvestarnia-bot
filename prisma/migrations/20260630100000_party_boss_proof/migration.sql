-- Add durable one-boss party combat proof rows.
CREATE TABLE "party_boss_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "party_session_id" TEXT NOT NULL,
    "leader_character_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "turn" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rules_version" TEXT NOT NULL,
    "boss_key" TEXT NOT NULL,
    "state_json" JSONB NOT NULL,
    "result_json" JSONB,
    "turn_expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "party_boss_sessions_party_session_id_fkey" FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_boss_sessions_leader_character_id_fkey" FOREIGN KEY ("leader_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "party_boss_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "actor_character_id" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "action_key" TEXT NOT NULL,
    "result_json" JSONB,
    "submitted_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "party_boss_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "party_boss_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_boss_actions_actor_character_id_fkey" FOREIGN KEY ("actor_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_boss_sessions_party_session_id_key" ON "party_boss_sessions"("party_session_id");
CREATE INDEX "party_boss_sessions_leader_character_id_status_idx" ON "party_boss_sessions"("leader_character_id", "status");
CREATE INDEX "party_boss_sessions_status_turn_expires_at_idx" ON "party_boss_sessions"("status", "turn_expires_at");
CREATE UNIQUE INDEX "party_boss_actions_session_id_turn_actor_character_id_key" ON "party_boss_actions"("session_id", "turn", "actor_character_id");
CREATE INDEX "party_boss_actions_session_id_turn_idx" ON "party_boss_actions"("session_id", "turn");
CREATE INDEX "party_boss_actions_actor_character_id_idx" ON "party_boss_actions"("actor_character_id");

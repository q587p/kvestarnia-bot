ALTER TABLE "duel_challenges" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'quick';

CREATE TABLE "active_combat_leases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "active_combat_leases_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "duel_combat_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "duel_challenge_id" TEXT NOT NULL,
    "challenger_character_id" TEXT NOT NULL,
    "target_character_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "acting_character_id" TEXT NOT NULL,
    "state_json" JSONB NOT NULL,
    "turn" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "turn_expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "challenger_chat_id" BIGINT,
    "challenger_message_id" INTEGER,
    "target_chat_id" BIGINT,
    "target_message_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "duel_combat_sessions_duel_challenge_id_fkey" FOREIGN KEY ("duel_challenge_id") REFERENCES "duel_challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "duel_combat_sessions_challenger_character_id_fkey" FOREIGN KEY ("challenger_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "duel_combat_sessions_target_character_id_fkey" FOREIGN KEY ("target_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "duel_combat_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "actor_character_id" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "action_key" TEXT NOT NULL,
    "result_json" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "duel_combat_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "duel_combat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "active_combat_leases_character_id_key" ON "active_combat_leases"("character_id");
CREATE INDEX "active_combat_leases_kind_reference_id_idx" ON "active_combat_leases"("kind", "reference_id");
CREATE UNIQUE INDEX "duel_combat_sessions_duel_challenge_id_key" ON "duel_combat_sessions"("duel_challenge_id");
CREATE INDEX "duel_combat_sessions_challenger_character_id_status_idx" ON "duel_combat_sessions"("challenger_character_id", "status");
CREATE INDEX "duel_combat_sessions_target_character_id_status_idx" ON "duel_combat_sessions"("target_character_id", "status");
CREATE INDEX "duel_combat_sessions_status_turn_expires_at_idx" ON "duel_combat_sessions"("status", "turn_expires_at");
CREATE UNIQUE INDEX "duel_combat_actions_session_id_turn_key" ON "duel_combat_actions"("session_id", "turn");
CREATE INDEX "duel_combat_actions_actor_character_id_idx" ON "duel_combat_actions"("actor_character_id");

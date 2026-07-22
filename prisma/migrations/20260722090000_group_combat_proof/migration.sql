CREATE TABLE "group_combat_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "party_session_id" TEXT NOT NULL,
    "encounter_key" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "turn" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "delivery_revision" INTEGER NOT NULL DEFAULT 1,
    "delivery_pending" BOOLEAN NOT NULL DEFAULT true,
    "delivery_attempted_at" DATETIME,
    "state_json" JSONB NOT NULL,
    "result_json" JSONB,
    "turn_expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "group_combat_sessions_party_session_id_fkey" FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "group_combat_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL,
    "roster_order" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "contribution_json" JSONB NOT NULL,
    "chat_id" BIGINT,
    "message_id" INTEGER,
    "reference_version" INTEGER NOT NULL DEFAULT 0,
    "delivered_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "group_combat_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "group_combat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "group_combat_participants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "group_combat_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "actor_character_id" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "action_key" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "submitted_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_combat_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "group_combat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "group_combat_actions_actor_character_id_fkey" FOREIGN KEY ("actor_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "group_combat_sessions_party_session_id_key" ON "group_combat_sessions"("party_session_id");
CREATE INDEX "group_combat_sessions_status_turn_expires_at_id_idx" ON "group_combat_sessions"("status", "turn_expires_at", "id");
CREATE INDEX "group_combat_sessions_delivery_pending_delivery_attempted_at_updated_at_id_idx" ON "group_combat_sessions"("delivery_pending", "delivery_attempted_at", "updated_at", "id");
CREATE UNIQUE INDEX "group_combat_participants_session_id_character_id_key" ON "group_combat_participants"("session_id", "character_id");
CREATE UNIQUE INDEX "group_combat_participants_session_id_roster_order_key" ON "group_combat_participants"("session_id", "roster_order");
CREATE INDEX "group_combat_participants_character_id_session_id_idx" ON "group_combat_participants"("character_id", "session_id");
CREATE UNIQUE INDEX "group_combat_actions_session_id_turn_actor_character_id_key" ON "group_combat_actions"("session_id", "turn", "actor_character_id");
CREATE INDEX "group_combat_actions_session_id_turn_idx" ON "group_combat_actions"("session_id", "turn");
CREATE INDEX "group_combat_actions_actor_character_id_idx" ON "group_combat_actions"("actor_character_id");

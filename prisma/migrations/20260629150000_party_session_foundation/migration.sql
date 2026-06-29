CREATE TABLE "party_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "invite_token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recruiting',
  "leader_character_id" TEXT NOT NULL,
  "period_id" TEXT,
  "origin_location_id" TEXT,
  "participant_cap" INTEGER NOT NULL DEFAULT 8,
  "minimum_participants" INTEGER NOT NULL DEFAULT 1,
  "join_until_at" DATETIME NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active_leader_key" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_sessions_leader_character_id_fkey" FOREIGN KEY ("leader_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "party_participants" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "remort_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'joined',
  "join_source" TEXT NOT NULL,
  "joined_at" DATETIME NOT NULL,
  "left_at" DATETIME,
  "snapshot_json" JSONB,
  "chat_id" BIGINT,
  "message_id" INTEGER,
  "active_membership_key" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "party_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "party_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "party_participants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_sessions_invite_token_key" ON "party_sessions"("invite_token");
CREATE UNIQUE INDEX "party_sessions_active_leader_key_key" ON "party_sessions"("active_leader_key");
CREATE INDEX "party_sessions_status_join_until_at_idx" ON "party_sessions"("status", "join_until_at");
CREATE INDEX "party_sessions_status_expires_at_idx" ON "party_sessions"("status", "expires_at");
CREATE INDEX "party_sessions_leader_character_id_status_idx" ON "party_sessions"("leader_character_id", "status");
CREATE INDEX "party_sessions_period_id_idx" ON "party_sessions"("period_id");

CREATE UNIQUE INDEX "party_participants_session_id_character_id_key" ON "party_participants"("session_id", "character_id");
CREATE UNIQUE INDEX "party_participants_active_membership_key_key" ON "party_participants"("active_membership_key");
CREATE INDEX "party_participants_character_id_status_idx" ON "party_participants"("character_id", "status");
CREATE INDEX "party_participants_session_id_status_idx" ON "party_participants"("session_id", "status");

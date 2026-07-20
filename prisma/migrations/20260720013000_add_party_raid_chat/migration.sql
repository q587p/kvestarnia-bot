-- AlterTable
ALTER TABLE "party_sessions" ADD COLUMN "chat_revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "party_sessions" ADD COLUMN "raid_chat_retention_until" DATETIME;

-- CreateTable
CREATE TABLE "party_raid_chat_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "party_session_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "event_type" TEXT,
    "actor_character_id" TEXT,
    "actor_display_name" TEXT,
    "actor_remort_count" INTEGER,
    "body" TEXT,
    "payload_json" JSONB,
    "source_key" TEXT,
    "occurred_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "party_raid_chat_entries_party_session_id_fkey"
      FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_raid_chat_entries_actor_character_id_fkey"
      FOREIGN KEY ("actor_character_id") REFERENCES "characters" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "party_raid_chat_compose_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "party_session_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "private_chat_id" BIGINT NOT NULL,
    "prompt_message_id" INTEGER,
    "active_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'awaiting_prompt',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" DATETIME NOT NULL,
    "consumed_at" DATETIME,
    "cancelled_at" DATETIME,
    "accepted_source_key" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "party_raid_chat_compose_intents_party_session_id_fkey"
      FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_raid_chat_compose_intents_character_id_fkey"
      FOREIGN KEY ("character_id") REFERENCES "characters" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "party_raid_chat_author_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "party_session_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "next_allowed_at" DATETIME,
    "last_body_hash" TEXT,
    "last_body_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "party_raid_chat_author_states_party_session_id_fkey"
      FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_raid_chat_author_states_character_id_fkey"
      FOREIGN KEY ("character_id") REFERENCES "characters" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "party_raid_chat_rate_states" (
    "party_session_id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL DEFAULT 1,
    "window_started_at" DATETIME,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "party_raid_chat_rate_states_party_session_id_fkey"
      FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "party_raid_chat_delivery_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participant_id" TEXT NOT NULL,
    "party_session_id" TEXT NOT NULL,
    "surface_mode" TEXT NOT NULL DEFAULT 'recruiting_embed',
    "active_chat_id" BIGINT,
    "active_message_id" INTEGER,
    "desired_revision" INTEGER NOT NULL DEFAULT 0,
    "rendered_revision" INTEGER NOT NULL DEFAULT 0,
    "redaction_required" BOOLEAN NOT NULL DEFAULT false,
    "next_attempt_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_class" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "party_raid_chat_delivery_states_participant_id_fkey"
      FOREIGN KEY ("participant_id") REFERENCES "party_participants" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "party_raid_chat_delivery_states_party_session_id_fkey"
      FOREIGN KEY ("party_session_id") REFERENCES "party_sessions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "party_raid_chat_entries_party_session_id_revision_key"
ON "party_raid_chat_entries"("party_session_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "party_raid_chat_entries_party_session_id_source_key_key"
ON "party_raid_chat_entries"("party_session_id", "source_key");

-- CreateIndex
CREATE INDEX "party_raid_chat_entries_party_session_id_id_idx"
ON "party_raid_chat_entries"("party_session_id", "id");

-- CreateIndex
CREATE INDEX "party_raid_chat_entries_actor_character_id_occurred_at_idx"
ON "party_raid_chat_entries"("actor_character_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "party_raid_chat_compose_intents_active_key_key"
ON "party_raid_chat_compose_intents"("active_key");

-- CreateIndex
CREATE INDEX "party_raid_chat_compose_intents_bound_status_idx"
ON "party_raid_chat_compose_intents"("telegram_user_id", "private_chat_id", "prompt_message_id", "status");

-- CreateIndex
CREATE INDEX "party_raid_chat_compose_intents_status_expires_at_idx"
ON "party_raid_chat_compose_intents"("status", "expires_at");

-- CreateIndex
CREATE INDEX "party_raid_chat_compose_intents_party_character_idx"
ON "party_raid_chat_compose_intents"("party_session_id", "character_id");

-- CreateIndex
CREATE UNIQUE INDEX "party_raid_chat_author_states_party_character_life_key"
ON "party_raid_chat_author_states"("party_session_id", "character_id", "remort_count");

-- CreateIndex
CREATE INDEX "party_raid_chat_author_states_character_life_idx"
ON "party_raid_chat_author_states"("character_id", "remort_count");

-- CreateIndex
CREATE UNIQUE INDEX "party_raid_chat_delivery_states_participant_id_key"
ON "party_raid_chat_delivery_states"("participant_id");

-- CreateIndex
CREATE INDEX "party_raid_chat_delivery_states_due_idx"
ON "party_raid_chat_delivery_states"("next_attempt_at", "redaction_required", "desired_revision", "rendered_revision");

-- CreateIndex
CREATE INDEX "party_raid_chat_delivery_states_party_surface_idx"
ON "party_raid_chat_delivery_states"("party_session_id", "surface_mode");

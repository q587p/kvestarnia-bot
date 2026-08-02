-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalized_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "crest" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "leader_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "guilds_leader_user_id_fkey" FOREIGN KEY ("leader_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guild_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "guild_members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guild_creation_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "crest" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gold_cost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "guild_id" TEXT,
    "expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "guild_creation_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_creation_intents_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guild_invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "inviter_user_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "active_key" TEXT,
    "expires_at" DATETIME NOT NULL,
    "responded_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "guild_invites_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_invites_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_invites_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "guild_audits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guild_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "subject_user_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "payload_json" JSONB,
    "occurred_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "guild_audits_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guilds_normalized_name_key" ON "guilds"("normalized_name");
CREATE INDEX "guilds_leader_user_id_idx" ON "guilds"("leader_user_id");
CREATE UNIQUE INDEX "guild_members_user_id_key" ON "guild_members"("user_id");
CREATE UNIQUE INDEX "guild_members_guild_id_user_id_key" ON "guild_members"("guild_id", "user_id");
CREATE INDEX "guild_members_guild_id_role_joined_at_idx" ON "guild_members"("guild_id", "role", "joined_at");
CREATE UNIQUE INDEX "guild_creation_intents_token_key" ON "guild_creation_intents"("token");
CREATE INDEX "guild_creation_intents_user_id_status_expires_at_idx" ON "guild_creation_intents"("user_id", "status", "expires_at");
CREATE INDEX "guild_creation_intents_normalized_name_status_idx" ON "guild_creation_intents"("normalized_name", "status");
CREATE UNIQUE INDEX "guild_invites_token_key" ON "guild_invites"("token");
CREATE UNIQUE INDEX "guild_invites_active_key_key" ON "guild_invites"("active_key");
CREATE INDEX "guild_invites_guild_id_status_expires_at_idx" ON "guild_invites"("guild_id", "status", "expires_at");
CREATE INDEX "guild_invites_target_user_id_status_expires_at_idx" ON "guild_invites"("target_user_id", "status", "expires_at");
CREATE INDEX "guild_invites_inviter_user_id_created_at_idx" ON "guild_invites"("inviter_user_id", "created_at");
CREATE UNIQUE INDEX "guild_audits_dedupe_key_key" ON "guild_audits"("dedupe_key");
CREATE INDEX "guild_audits_guild_id_occurred_at_idx" ON "guild_audits"("guild_id", "occurred_at");
CREATE INDEX "guild_audits_event_type_occurred_at_idx" ON "guild_audits"("event_type", "occurred_at");

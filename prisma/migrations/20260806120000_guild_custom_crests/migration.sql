ALTER TABLE "guilds" ADD COLUMN "crest_kind" TEXT NOT NULL DEFAULT 'catalog';
ALTER TABLE "guilds" ADD COLUMN "crest_reservation_key" TEXT;
ALTER TABLE "guilds" ADD COLUMN "crest_file_id" TEXT;
ALTER TABLE "guilds" ADD COLUMN "crest_file_unique_id" TEXT;
ALTER TABLE "guilds" ADD COLUMN "crest_width" INTEGER;
ALTER TABLE "guilds" ADD COLUMN "crest_height" INTEGER;
ALTER TABLE "guilds" ADD COLUMN "crest_file_size" INTEGER;

ALTER TABLE "guild_creation_intents" ADD COLUMN "crest_kind" TEXT NOT NULL DEFAULT 'catalog';
ALTER TABLE "guild_creation_intents" ADD COLUMN "crest_file_id" TEXT;
ALTER TABLE "guild_creation_intents" ADD COLUMN "crest_file_unique_id" TEXT;
ALTER TABLE "guild_creation_intents" ADD COLUMN "crest_width" INTEGER;
ALTER TABLE "guild_creation_intents" ADD COLUMN "crest_height" INTEGER;
ALTER TABLE "guild_creation_intents" ADD COLUMN "crest_file_size" INTEGER;

UPDATE "guilds"
SET "crest_reservation_key" = "crest"
WHERE "status" IN ('forming', 'active');

CREATE UNIQUE INDEX "guilds_crest_reservation_key_key" ON "guilds"("crest_reservation_key");
CREATE INDEX "guilds_crest_reservation_key_status_idx" ON "guilds"("crest_reservation_key", "status");

CREATE TABLE "guild_crest_upload_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "guild_id" TEXT,
    "expected_guild_version" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "active_user_key" TEXT,
    "file_id" TEXT,
    "file_unique_id" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "file_size" INTEGER,
    "intent_id" TEXT,
    "expires_at" DATETIME NOT NULL,
    "consumed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "guild_crest_upload_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_crest_upload_drafts_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guild_crest_upload_drafts_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "guild_creation_intents" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guild_crest_upload_drafts_token_key" ON "guild_crest_upload_drafts"("token");
CREATE UNIQUE INDEX "guild_crest_upload_drafts_active_user_key_key" ON "guild_crest_upload_drafts"("active_user_key");
CREATE UNIQUE INDEX "guild_crest_upload_drafts_intent_id_key" ON "guild_crest_upload_drafts"("intent_id");
CREATE INDEX "guild_crest_upload_drafts_user_id_status_expires_at_idx" ON "guild_crest_upload_drafts"("user_id", "status", "expires_at");
CREATE INDEX "guild_crest_upload_drafts_guild_id_status_expires_at_idx" ON "guild_crest_upload_drafts"("guild_id", "status", "expires_at");

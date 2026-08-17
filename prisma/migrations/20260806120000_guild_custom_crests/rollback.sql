DROP TABLE IF EXISTS "guild_crest_upload_drafts";

DROP INDEX IF EXISTS "guilds_crest_reservation_key_status_idx";
DROP INDEX IF EXISTS "guilds_crest_reservation_key_key";

ALTER TABLE "guild_creation_intents" DROP COLUMN "crest_file_size";
ALTER TABLE "guild_creation_intents" DROP COLUMN "crest_height";
ALTER TABLE "guild_creation_intents" DROP COLUMN "crest_width";
ALTER TABLE "guild_creation_intents" DROP COLUMN "crest_file_unique_id";
ALTER TABLE "guild_creation_intents" DROP COLUMN "crest_file_id";
ALTER TABLE "guild_creation_intents" DROP COLUMN "crest_kind";

ALTER TABLE "guilds" DROP COLUMN "crest_file_size";
ALTER TABLE "guilds" DROP COLUMN "crest_height";
ALTER TABLE "guilds" DROP COLUMN "crest_width";
ALTER TABLE "guilds" DROP COLUMN "crest_file_unique_id";
ALTER TABLE "guilds" DROP COLUMN "crest_file_id";
ALTER TABLE "guilds" DROP COLUMN "crest_reservation_key";
ALTER TABLE "guilds" DROP COLUMN "crest_kind";

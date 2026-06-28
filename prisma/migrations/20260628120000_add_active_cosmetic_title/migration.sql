-- Add a nullable selected cosmetic-title pointer. Ownership is enforced in application code
-- against character_cosmetic_title_grants because title_grant_id is scoped per character.
ALTER TABLE "characters" ADD COLUMN "active_cosmetic_title_grant_id" TEXT;

ALTER TABLE "characters" ADD COLUMN "path" TEXT NOT NULL DEFAULT 'boundary';

UPDATE "characters"
SET "path" = CASE "pronoun"
  WHEN 'he' THEN 'sun'
  WHEN 'she' THEN 'moon'
  ELSE 'boundary'
END;

UPDATE "characters"
SET "hp_regen_at" = "updated_at"
WHERE "hp_regen_at" IS NULL
  AND "hp_current" < "hp_max";

UPDATE "characters"
SET "mana_regen_at" = "updated_at"
WHERE "mana_regen_at" IS NULL
  AND "mana_current" < "mana_max";

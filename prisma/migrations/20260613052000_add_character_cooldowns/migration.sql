CREATE TABLE "character_cooldowns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "available_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "character_cooldowns_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "character_cooldowns_character_id_key_key" ON "character_cooldowns"("character_id", "key");
CREATE INDEX "character_cooldowns_available_at_idx" ON "character_cooldowns"("available_at");

-- CreateTable
CREATE TABLE "character_achievements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "source_json" JSONB,
    "unlocked_at" DATETIME NOT NULL,
    "notified_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "character_achievements_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "character_achievement_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "character_achievement_progress_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "character_cosmetic_title_grants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "title_grant_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "granted_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "character_cosmetic_title_grants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "character_cosmetic_title_grants_character_id_achievement_id_fkey" FOREIGN KEY ("character_id", "achievement_id") REFERENCES "character_achievements" ("character_id", "achievement_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "character_achievements_character_id_achievement_id_key" ON "character_achievements"("character_id", "achievement_id");

-- CreateIndex
CREATE INDEX "character_achievements_character_id_unlocked_at_idx" ON "character_achievements"("character_id", "unlocked_at");

-- CreateIndex
CREATE INDEX "character_achievements_achievement_id_idx" ON "character_achievements"("achievement_id");

-- CreateIndex
CREATE UNIQUE INDEX "character_achievement_progress_character_id_achievement_id_key" ON "character_achievement_progress"("character_id", "achievement_id");

-- CreateIndex
CREATE INDEX "character_achievement_progress_character_id_updated_at_idx" ON "character_achievement_progress"("character_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "character_cosmetic_title_grants_character_id_title_grant_id_key" ON "character_cosmetic_title_grants"("character_id", "title_grant_id");

-- CreateIndex
CREATE INDEX "character_cosmetic_title_grants_character_id_granted_at_idx" ON "character_cosmetic_title_grants"("character_id", "granted_at");

-- CreateIndex
CREATE INDEX "character_cosmetic_title_grants_achievement_id_idx" ON "character_cosmetic_title_grants"("achievement_id");

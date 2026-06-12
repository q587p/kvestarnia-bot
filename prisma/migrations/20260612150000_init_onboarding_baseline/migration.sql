-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegram_user_id" BIGINT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "language_code" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "race_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "hp_current" INTEGER NOT NULL DEFAULT 25,
    "hp_max" INTEGER NOT NULL DEFAULT 25,
    "mana_current" INTEGER NOT NULL DEFAULT 10,
    "mana_max" INTEGER NOT NULL DEFAULT 10,
    "stats_json" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_user_id_key" ON "users"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "characters_user_id_key" ON "characters"("user_id");

-- CreateIndex
CREATE INDEX "characters_race_id_idx" ON "characters"("race_id");

-- CreateIndex
CREATE INDEX "characters_class_id_idx" ON "characters"("class_id");

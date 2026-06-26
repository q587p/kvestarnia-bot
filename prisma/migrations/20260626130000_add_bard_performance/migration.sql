-- CreateTable
CREATE TABLE "bard_performances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "performer_name" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL DEFAULT 0,
    "technique_id" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "live_guard" TEXT,
    "grade" TEXT NOT NULL,
    "power" INTEGER NOT NULL,
    "house_payout_gold" INTEGER NOT NULL DEFAULT 0,
    "role_action_xp" INTEGER NOT NULL DEFAULT 0,
    "audience_count" INTEGER NOT NULL DEFAULT 0,
    "stat_snapshot_json" JSONB NOT NULL,
    "result_json" JSONB,
    "started_at" DATETIME NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "cooldown_available_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bard_performances_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bard_performance_reactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "performance_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "audience_name" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "tip_gold" INTEGER NOT NULL DEFAULT 0,
    "result_json" JSONB,
    "offered_at" DATETIME NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "responded_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bard_performance_reactions_performance_id_fkey" FOREIGN KEY ("performance_id") REFERENCES "bard_performances" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bard_performance_reactions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "bard_performances_token_key" ON "bard_performances"("token");

-- CreateIndex
CREATE INDEX "bard_performances_character_id_status_expires_at_idx" ON "bard_performances"("character_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "bard_performances_character_id_cooldown_available_at_idx" ON "bard_performances"("character_id", "cooldown_available_at");

-- CreateIndex
CREATE INDEX "bard_performances_local_date_idx" ON "bard_performances"("local_date");

-- CreateIndex
CREATE UNIQUE INDEX "bard_performances_live_guard_key" ON "bard_performances"("live_guard");

-- CreateIndex
CREATE UNIQUE INDEX "bard_performance_reactions_performance_id_character_id_key" ON "bard_performance_reactions"("performance_id", "character_id");

-- CreateIndex
CREATE INDEX "bard_performance_reactions_character_id_status_expires_at_idx" ON "bard_performance_reactions"("character_id", "status", "expires_at");

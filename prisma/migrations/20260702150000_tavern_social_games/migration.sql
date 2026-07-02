-- CreateTable
CREATE TABLE "tavern_game_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "game_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "creator_character_id" TEXT NOT NULL,
    "stake_gold" INTEGER NOT NULL,
    "pot_gold" INTEGER NOT NULL DEFAULT 0,
    "seed" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "result_json" JSONB,
    "opened_at" DATETIME NOT NULL,
    "join_expires_at" DATETIME NOT NULL,
    "decision_expires_at" DATETIME,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tavern_game_sessions_creator_character_id_fkey" FOREIGN KEY ("creator_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tavern_game_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "display_name" TEXT NOT NULL,
    "remort_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "stake_gold" INTEGER NOT NULL,
    "payout_gold" INTEGER NOT NULL DEFAULT 0,
    "refunded_gold" INTEGER NOT NULL DEFAULT 0,
    "decision_json" JSONB,
    "result_json" JSONB,
    "active_stake_key" TEXT,
    "joined_at" DATETIME NOT NULL,
    "decided_at" DATETIME,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tavern_game_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tavern_game_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tavern_game_participants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tavern_game_sessions_token_key" ON "tavern_game_sessions"("token");

-- CreateIndex
CREATE INDEX "tavern_game_sessions_game_key_status_join_expires_at_idx" ON "tavern_game_sessions"("game_key", "status", "join_expires_at");

-- CreateIndex
CREATE INDEX "tavern_game_sessions_status_join_expires_at_idx" ON "tavern_game_sessions"("status", "join_expires_at");

-- CreateIndex
CREATE INDEX "tavern_game_sessions_status_decision_expires_at_idx" ON "tavern_game_sessions"("status", "decision_expires_at");

-- CreateIndex
CREATE INDEX "tavern_game_sessions_creator_character_id_status_idx" ON "tavern_game_sessions"("creator_character_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tavern_game_participants_active_stake_key_key" ON "tavern_game_participants"("active_stake_key");

-- CreateIndex
CREATE UNIQUE INDEX "tavern_game_participants_session_id_character_id_key" ON "tavern_game_participants"("session_id", "character_id");

-- CreateIndex
CREATE INDEX "tavern_game_participants_character_id_status_idx" ON "tavern_game_participants"("character_id", "status");

-- CreateIndex
CREATE INDEX "tavern_game_participants_session_id_status_idx" ON "tavern_game_participants"("session_id", "status");

-- CreateIndex
CREATE INDEX "tavern_game_participants_telegram_user_id_status_idx" ON "tavern_game_participants"("telegram_user_id", "status");

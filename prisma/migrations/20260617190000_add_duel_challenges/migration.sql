CREATE TABLE "duel_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenger_character_id" TEXT NOT NULL,
    "target_character_id" TEXT,
    "context_chat_id" BIGINT,
    "invite_token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" DATETIME NOT NULL,
    "resolved_at" DATETIME,
    "result_json" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "duel_challenges_challenger_character_id_fkey" FOREIGN KEY ("challenger_character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "duel_challenges_target_character_id_fkey" FOREIGN KEY ("target_character_id") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "duel_challenges_invite_token_key" ON "duel_challenges"("invite_token");
CREATE INDEX "duel_challenges_challenger_character_id_status_idx" ON "duel_challenges"("challenger_character_id", "status");
CREATE INDEX "duel_challenges_target_character_id_status_idx" ON "duel_challenges"("target_character_id", "status");
CREATE INDEX "duel_challenges_status_expires_at_idx" ON "duel_challenges"("status", "expires_at");


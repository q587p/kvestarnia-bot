UPDATE "party_boss_sessions"
SET "state_json" = json_set("state_json", '$.leaderCharacterId', "leader_character_id")
WHERE CASE
  WHEN json_valid("state_json") THEN
    json_type("state_json") = 'object'
    AND json_type("state_json", '$.leaderCharacterId') IS NULL
  ELSE 0
END;

CREATE TABLE "party_boss_rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "round_json" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "party_boss_rounds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "party_boss_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "party_boss_rounds_session_id_turn_key" ON "party_boss_rounds"("session_id", "turn");

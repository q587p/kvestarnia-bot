UPDATE "party_boss_sessions"
SET "state_json" = json_set("state_json", '$.leaderCharacterId', "leader_character_id")
WHERE CASE
  WHEN json_valid("state_json") THEN
    json_type("state_json") = 'object'
    AND json_type("state_json", '$.leaderCharacterId') IS NULL
  ELSE 0
END;

UPDATE "party_boss_sessions"
SET "state_json" = json_set(
  "state_json",
  '$.participants',
  json((
    SELECT json_group_array(json(
      CASE
        WHEN json_extract(participant.value, '$.status') = 'active'
          AND json_type(participant.value, '$.resources.hp') IN ('integer', 'real')
          AND json_extract(participant.value, '$.resources.hp') = 0
        THEN json_set(participant.value, '$.status', 'knocked-out')
        ELSE participant.value
      END
    ))
    FROM json_each("party_boss_sessions"."state_json", '$.participants') AS participant
  ))
)
WHERE CASE
  WHEN json_valid("state_json") THEN json_type("state_json", '$.participants') = 'array'
  ELSE 0
END;

UPDATE "party_boss_sessions"
SET "state_json" = json_set(
  "state_json",
  '$.roundLog',
  json((
    SELECT json_group_array(json(
      CASE
        WHEN json_type(round_entry.value, '$.participantsAfter') = 'array'
        THEN json_set(
          round_entry.value,
          '$.participantsAfter',
          json((
            SELECT json_group_array(json(
              CASE
                WHEN json_extract(participant_after.value, '$.status') = 'active'
                  AND json_type(participant_after.value, '$.hp') IN ('integer', 'real')
                  AND json_extract(participant_after.value, '$.hp') = 0
                THEN json_set(participant_after.value, '$.status', 'knocked-out')
                ELSE participant_after.value
              END
            ))
            FROM json_each(round_entry.value, '$.participantsAfter') AS participant_after
          ))
        )
        ELSE round_entry.value
      END
    ))
    FROM json_each("party_boss_sessions"."state_json", '$.roundLog') AS round_entry
  ))
)
WHERE CASE
  WHEN json_valid("state_json") THEN json_type("state_json", '$.roundLog') = 'array'
  ELSE 0
END;

UPDATE "party_boss_sessions"
SET "result_json" = json_set(
  "result_json",
  '$.participants',
  json((
    SELECT json_group_array(json(
      CASE
        WHEN json_extract(result_participant.value, '$.status') = 'active'
          AND EXISTS (
            SELECT 1
            FROM json_each("party_boss_sessions"."state_json", '$.participants') AS state_participant
            WHERE json_extract(state_participant.value, '$.characterId') =
                json_extract(result_participant.value, '$.characterId')
              AND json_extract(state_participant.value, '$.status') = 'knocked-out'
              AND json_type(state_participant.value, '$.resources.hp') IN ('integer', 'real')
              AND json_extract(state_participant.value, '$.resources.hp') = 0
          )
        THEN json_set(result_participant.value, '$.status', 'knocked-out')
        ELSE result_participant.value
      END
    ))
    FROM json_each("party_boss_sessions"."result_json", '$.participants') AS result_participant
  ))
)
WHERE CASE
  WHEN json_valid("result_json") AND json_valid("state_json") THEN
    json_type("result_json", '$.participants') = 'array'
    AND json_type("state_json", '$.participants') = 'array'
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

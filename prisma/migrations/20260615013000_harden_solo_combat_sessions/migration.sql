-- Persist the current turn separately so turn callbacks can be applied with a
-- simple conditional update instead of relying on JSON filtering.
ALTER TABLE "solo_combat_sessions" ADD COLUMN "turn" INTEGER NOT NULL DEFAULT 1;

UPDATE "solo_combat_sessions"
SET "turn" = COALESCE(CAST(json_extract("state_json", '$.turn') AS INTEGER), 1);

-- If old local data somehow contains duplicate active sessions, keep only the
-- most recently touched one playable before installing the active singleton.
UPDATE "solo_combat_sessions"
SET "status" = 'expired'
WHERE "status" = 'active'
  AND "id" NOT IN (
    SELECT "id"
    FROM (
      SELECT
        "id",
        ROW_NUMBER() OVER (
          PARTITION BY "character_id"
          ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
        ) AS "row_number"
      FROM "solo_combat_sessions"
      WHERE "status" = 'active'
    )
    WHERE "row_number" = 1
  );

CREATE UNIQUE INDEX "solo_combat_sessions_one_active_per_character_idx"
ON "solo_combat_sessions"("character_id")
WHERE "status" = 'active';

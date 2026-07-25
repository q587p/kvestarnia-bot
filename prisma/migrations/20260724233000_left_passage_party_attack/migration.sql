ALTER TABLE "party_sessions" ADD COLUMN "origin_kind" TEXT;
ALTER TABLE "group_combat_sessions" ADD COLUMN "repair_state" TEXT;
ALTER TABLE "group_combat_sessions" ADD COLUMN "repair_reason" TEXT;

ALTER TABLE "group_combat_participants" ADD COLUMN "achievement_effect_key" TEXT;
ALTER TABLE "group_combat_participants" ADD COLUMN "achievement_effect_type" TEXT;
ALTER TABLE "group_combat_participants" ADD COLUMN "achievement_effect_status" TEXT;
ALTER TABLE "group_combat_participants" ADD COLUMN "achievement_effect_occurred_at" DATETIME;
ALTER TABLE "group_combat_participants" ADD COLUMN "achievement_effect_projected_at" DATETIME;

CREATE UNIQUE INDEX "group_combat_participants_achievement_effect_key_key"
ON "group_combat_participants"("achievement_effect_key");

CREATE INDEX "group_combat_participants_achievement_effect_status_updated_at_id_idx"
ON "group_combat_participants"("achievement_effect_status", "updated_at", "id");

ALTER TABLE "pending_passage_encounters" ADD COLUMN "reservation_origin" TEXT;
ALTER TABLE "pending_passage_encounters" ADD COLUMN "reservation_remort_count" INTEGER;
ALTER TABLE "pending_passage_encounters" ADD COLUMN "reserved_party_session_id" TEXT REFERENCES "party_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pending_passage_encounters" ADD COLUMN "group_combat_session_id" TEXT REFERENCES "group_combat_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pending_passage_encounters" ADD COLUMN "reserved_at" DATETIME;

CREATE UNIQUE INDEX "pending_passage_encounters_reserved_party_session_id_key"
ON "pending_passage_encounters"("reserved_party_session_id");

CREATE UNIQUE INDEX "pending_passage_encounters_group_combat_session_id_key"
ON "pending_passage_encounters"("group_combat_session_id");

CREATE INDEX "pending_passage_encounters_reservation_origin_status_expires_at_idx"
ON "pending_passage_encounters"("reservation_origin", "status", "expires_at");

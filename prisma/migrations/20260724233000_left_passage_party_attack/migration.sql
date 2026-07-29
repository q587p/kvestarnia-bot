ALTER TABLE "party_sessions" ADD COLUMN "origin_kind" TEXT;
ALTER TABLE "group_combat_sessions" ADD COLUMN "repair_state" TEXT;
ALTER TABLE "group_combat_sessions" ADD COLUMN "repair_reason" TEXT;
ALTER TABLE "group_combat_participants" ADD COLUMN "exit_delivery_state" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "group_combat_participants" ADD COLUMN "exit_delivery_claim_token" TEXT;
ALTER TABLE "group_combat_participants" ADD COLUMN "exit_delivery_claimed_at" DATETIME;
ALTER TABLE "group_combat_participants" ADD COLUMN "exit_delivery_message_id" INTEGER;
ALTER TABLE "group_combat_participants" ADD COLUMN "reply_keyboard_fingerprint" TEXT;
ALTER TABLE "group_combat_participants" ADD COLUMN "reply_keyboard_generation" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "group_combat_ui_publication_claims" (
    "character_id" TEXT NOT NULL PRIMARY KEY REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "session_id" TEXT NOT NULL REFERENCES "group_combat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "claim_token" TEXT NOT NULL,
    "claimed_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "group_combat_ui_publication_claims_session_id_idx"
ON "group_combat_ui_publication_claims"("session_id");

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

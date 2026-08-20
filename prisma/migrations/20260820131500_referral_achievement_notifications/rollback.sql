PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_referral_notification_outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "logical_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" DATETIME NOT NULL,
    "claim_token" TEXT,
    "claimed_until" DATETIME,
    "sent_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "referral_notification_outbox_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_notification_outbox_kind_check" CHECK ("kind" IN ('REFERRAL_JOINED', 'REFERRAL_PAYOUT_GRANTED')),
    CONSTRAINT "referral_notification_outbox_state_check" CHECK ("state" IN ('PENDING', 'PROCESSING', 'SENT')),
    CONSTRAINT "referral_notification_outbox_attempt_check" CHECK ("attempt_count" >= 0)
);

INSERT INTO "new_referral_notification_outbox" (
    "id", "logical_key", "kind", "recipient_user_id", "payload_json", "state",
    "attempt_count", "next_attempt_at", "claim_token", "claimed_until", "sent_at",
    "created_at", "updated_at"
)
SELECT
    "id", "logical_key", "kind", "recipient_user_id", "payload_json", "state",
    "attempt_count", "next_attempt_at", "claim_token", "claimed_until", "sent_at",
    "created_at", "updated_at"
FROM "referral_notification_outbox"
WHERE "kind" IN ('REFERRAL_JOINED', 'REFERRAL_PAYOUT_GRANTED');

DROP TABLE "referral_notification_outbox";
ALTER TABLE "new_referral_notification_outbox" RENAME TO "referral_notification_outbox";

CREATE UNIQUE INDEX "referral_notification_outbox_logical_key_key" ON "referral_notification_outbox"("logical_key");
CREATE INDEX "referral_notification_outbox_kind_state_next_attempt_at_created_at_id_idx" ON "referral_notification_outbox"("kind", "state", "next_attempt_at", "created_at", "id");
CREATE INDEX "referral_notification_outbox_kind_state_claimed_until_created_at_id_idx" ON "referral_notification_outbox"("kind", "state", "claimed_until", "created_at", "id");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

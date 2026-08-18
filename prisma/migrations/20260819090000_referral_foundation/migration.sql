-- CreateTable
CREATE TABLE "referral_invite_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviter_user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "inviter_name_snapshot" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_invite_codes_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_invite_codes_token_shape_check" CHECK (length("token") = 16 AND "token" NOT GLOB '*[^A-Za-z0-9_-]*')
);

-- CreateTable
CREATE TABLE "referral_attributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviter_user_id" TEXT NOT NULL,
    "invitee_user_id" TEXT NOT NULL,
    "invite_code_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "captured_at" DATETIME NOT NULL,
    "accepted_at" DATETIME,
    "declined_at" DATETIME,
    "arrived_at" DATETIME,
    "reward_plan_version" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "referral_attributions_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_attributions_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_attributions_invite_code_id_fkey" FOREIGN KEY ("invite_code_id") REFERENCES "referral_invite_codes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_attributions_distinct_users_check" CHECK ("inviter_user_id" <> "invitee_user_id"),
    CONSTRAINT "referral_attributions_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED')),
    CONSTRAINT "referral_attributions_plan_check" CHECK (("status" = 'ACCEPTED' AND "reward_plan_version" IS NOT NULL) OR ("status" <> 'ACCEPTED' AND "reward_plan_version" IS NULL))
);

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attribution_id" TEXT NOT NULL,
    "beneficiary_user_id" TEXT NOT NULL,
    "reward_family" TEXT NOT NULL,
    "milestone_key" TEXT NOT NULL,
    "source_achievement_id" TEXT NOT NULL,
    "reward_plan_version" INTEGER NOT NULL,
    "reward_gold" INTEGER NOT NULL,
    "reward_items_json" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "earned_at" DATETIME NOT NULL,
    "delivery_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" DATETIME NOT NULL,
    "last_failure_code" TEXT,
    "granted_at" DATETIME,
    "granted_character_id" TEXT,
    "granted_remort_count" INTEGER,
    "actual_grant_json" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "referral_rewards_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "referral_attributions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_rewards_beneficiary_user_id_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "referral_rewards_granted_character_id_fkey" FOREIGN KEY ("granted_character_id") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "referral_rewards_gold_check" CHECK ("reward_gold" > 0),
    CONSTRAINT "referral_rewards_attempt_check" CHECK ("delivery_attempt_count" >= 0),
    CONSTRAINT "referral_rewards_state_check" CHECK ("state" IN ('PENDING', 'GRANTED'))
);

-- CreateTable
CREATE TABLE "referral_notification_outbox" (
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

CREATE UNIQUE INDEX "referral_invite_codes_inviter_user_id_key" ON "referral_invite_codes"("inviter_user_id");
CREATE UNIQUE INDEX "referral_invite_codes_token_key" ON "referral_invite_codes"("token");
CREATE UNIQUE INDEX "referral_attributions_invitee_user_id_key" ON "referral_attributions"("invitee_user_id");
CREATE INDEX "referral_attributions_inviter_user_id_status_arrived_at_id_idx" ON "referral_attributions"("inviter_user_id", "status", "arrived_at", "id");
CREATE UNIQUE INDEX "referral_rewards_attribution_id_beneficiary_user_id_reward_family_milestone_key_key" ON "referral_rewards"("attribution_id", "beneficiary_user_id", "reward_family", "milestone_key");
CREATE INDEX "referral_rewards_state_next_attempt_at_earned_at_id_idx" ON "referral_rewards"("state", "next_attempt_at", "earned_at", "id");
CREATE INDEX "referral_rewards_beneficiary_user_id_state_next_attempt_at_earned_at_id_idx" ON "referral_rewards"("beneficiary_user_id", "state", "next_attempt_at", "earned_at", "id");
CREATE UNIQUE INDEX "referral_notification_outbox_logical_key_key" ON "referral_notification_outbox"("logical_key");
CREATE INDEX "referral_notification_outbox_kind_state_next_attempt_at_created_at_id_idx" ON "referral_notification_outbox"("kind", "state", "next_attempt_at", "created_at", "id");
CREATE INDEX "referral_notification_outbox_kind_state_claimed_until_created_at_id_idx" ON "referral_notification_outbox"("kind", "state", "claimed_until", "created_at", "id");

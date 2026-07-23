ALTER TABLE "group_combat_sessions" ADD COLUMN "settlement_plan_json" JSONB;

ALTER TABLE "group_combat_participants" ADD COLUMN "settlement_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "group_combat_participants" ADD COLUMN "settlement_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "group_combat_participants" ADD COLUMN "settlement_receipt_json" JSONB;
ALTER TABLE "group_combat_participants" ADD COLUMN "settled_at" DATETIME;

ALTER TABLE "group_combat_actions" ADD COLUMN "payload_key" TEXT;

ALTER TABLE "noncombat_rogue_pickpocket_attempts" ADD COLUMN "retaliation_token" TEXT;
ALTER TABLE "noncombat_rogue_pickpocket_attempts" ADD COLUMN "retaliation_available_until" DATETIME;
ALTER TABLE "noncombat_rogue_pickpocket_attempts" ADD COLUMN "retaliation_used_at" DATETIME;
ALTER TABLE "noncombat_rogue_pickpocket_attempts" ADD COLUMN "retaliation_duel_invite_token" TEXT;

CREATE UNIQUE INDEX "noncombat_rogue_pickpocket_attempts_retaliation_token_key" ON "noncombat_rogue_pickpocket_attempts"("retaliation_token");

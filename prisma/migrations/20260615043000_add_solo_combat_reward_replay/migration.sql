ALTER TABLE "solo_combat_sessions" ADD COLUMN "reward_xp" INTEGER;
ALTER TABLE "solo_combat_sessions" ADD COLUMN "reward_gold" INTEGER;
ALTER TABLE "solo_combat_sessions" ADD COLUMN "reward_items_json" JSONB;
ALTER TABLE "solo_combat_sessions" ADD COLUMN "reward_claimed_at" DATETIME;

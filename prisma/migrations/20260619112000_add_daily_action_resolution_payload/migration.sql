ALTER TABLE "daily_actions" ADD COLUMN "spent_gold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "daily_actions" ADD COLUMN "result_json" JSONB;

ALTER TABLE "users" ADD COLUMN "last_action_at" DATETIME;
ALTER TABLE "users" ADD COLUMN "last_seen_location_id" TEXT;
ALTER TABLE "users" ADD COLUMN "current_raid_id" TEXT;
ALTER TABLE "users" ADD COLUMN "current_adventure_id" TEXT;

CREATE INDEX "users_last_action_at_idx" ON "users"("last_action_at");
CREATE INDEX "users_last_seen_location_id_idx" ON "users"("last_seen_location_id");
CREATE INDEX "users_current_raid_id_idx" ON "users"("current_raid_id");
CREATE INDEX "users_current_adventure_id_idx" ON "users"("current_adventure_id");

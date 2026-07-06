-- Item upgrades / Charkokovalnia
ALTER TABLE "character_items" ADD COLUMN "enhancement_level" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "item_upgrade_pities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "target_level" INTEGER NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failure_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "item_upgrade_pities_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "item_upgrade_pities_character_id_item_id_target_level_key" ON "item_upgrade_pities"("character_id", "item_id", "target_level");
CREATE INDEX "item_upgrade_pities_item_id_target_level_idx" ON "item_upgrade_pities"("item_id", "target_level");

CREATE TABLE "item_upgrade_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "donor_item_id" TEXT,
    "from_level" INTEGER NOT NULL,
    "target_level" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "required_fight_count" INTEGER NOT NULL DEFAULT 0,
    "progress_fight_count" INTEGER NOT NULL DEFAULT 0,
    "cost_json" JSONB NOT NULL,
    "chance_json" JSONB NOT NULL,
    "result_json" JSONB,
    "expires_at" DATETIME,
    "completed_at" DATETIME,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "item_upgrade_orders_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "item_upgrade_orders_token_key" ON "item_upgrade_orders"("token");
CREATE INDEX "item_upgrade_orders_character_id_status_expires_at_idx" ON "item_upgrade_orders"("character_id", "status", "expires_at");
CREATE INDEX "item_upgrade_orders_item_id_status_idx" ON "item_upgrade_orders"("item_id", "status");
CREATE INDEX "item_upgrade_orders_donor_item_id_status_idx" ON "item_upgrade_orders"("donor_item_id", "status");

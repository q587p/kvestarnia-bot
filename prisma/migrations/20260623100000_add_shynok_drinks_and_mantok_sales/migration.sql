-- Add server-owned Shynok drink, social round recipient, and Mantok sale state.

ALTER TABLE "korchma_round_purchases" ADD COLUMN "drink_key" TEXT;
ALTER TABLE "korchma_round_purchases" ADD COLUMN "recipient_count" INTEGER;
ALTER TABLE "korchma_round_purchases" ADD COLUMN "offer_expires_at" DATETIME;
ALTER TABLE "korchma_round_purchases" ADD COLUMN "rules_version" TEXT;
ALTER TABLE "korchma_round_purchases" ADD COLUMN "snapshot_json" JSONB;
ALTER TABLE "korchma_round_purchases" ADD COLUMN "telemetry_json" JSONB;

CREATE TABLE "character_drink_states" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "activation_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "drink_key" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "started_at" DATETIME NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "metadata_json" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "character_drink_states_character_id_fkey"
    FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "character_drink_states_character_id_key"
  ON "character_drink_states"("character_id");
CREATE UNIQUE INDEX "character_drink_states_activation_id_key"
  ON "character_drink_states"("activation_id");
CREATE INDEX "character_drink_states_expires_at_idx"
  ON "character_drink_states"("expires_at");

CREATE TABLE "shynok_drink_activation_audits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "character_id" TEXT NOT NULL,
  "activation_id" TEXT NOT NULL,
  "drink_key" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "outcome" TEXT NOT NULL,
  "combat_session_id" TEXT,
  "occurred_at" DATETIME NOT NULL,
  "metadata_json" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shynok_drink_activation_audits_character_id_fkey"
    FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "shynok_drink_activation_audits_activation_id_key"
  ON "shynok_drink_activation_audits"("activation_id");
CREATE INDEX "shynok_drink_activation_audits_character_id_outcome_occurred_at_idx"
  ON "shynok_drink_activation_audits"("character_id", "outcome", "occurred_at");
CREATE INDEX "shynok_drink_activation_audits_combat_session_id_idx"
  ON "shynok_drink_activation_audits"("combat_session_id");

CREATE TABLE "korchma_drink_orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "drink_key" TEXT NOT NULL,
  "price_gold" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "replacement_json" JSONB,
  "result_json" JSONB,
  "expires_at" DATETIME NOT NULL,
  "completed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "korchma_drink_orders_character_id_fkey"
    FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "korchma_drink_orders_token_key" ON "korchma_drink_orders"("token");
CREATE INDEX "korchma_drink_orders_character_id_status_expires_at_idx"
  ON "korchma_drink_orders"("character_id", "status", "expires_at");

CREATE TABLE "korchma_round_recipients" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchase_id" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "drink_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'offered',
  "offered_at" DATETIME NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "responded_at" DATETIME,
  "result_json" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "korchma_round_recipients_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "korchma_round_purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "korchma_round_recipients_character_id_fkey"
    FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "korchma_round_recipients_purchase_id_character_id_key"
  ON "korchma_round_recipients"("purchase_id", "character_id");
CREATE INDEX "korchma_round_recipients_character_id_status_expires_at_idx"
  ON "korchma_round_recipients"("character_id", "status", "expires_at");

CREATE TABLE "korchma_mantok_sales" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "character_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "selection_json" JSONB NOT NULL,
  "selection_fingerprint" TEXT NOT NULL,
  "nominal_value" INTEGER NOT NULL DEFAULT 0,
  "payout_gold" INTEGER NOT NULL DEFAULT 0,
  "result_json" JSONB,
  "expires_at" DATETIME NOT NULL,
  "completed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "korchma_mantok_sales_character_id_fkey"
    FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "korchma_mantok_sales_token_key" ON "korchma_mantok_sales"("token");
CREATE INDEX "korchma_mantok_sales_character_id_status_expires_at_idx"
  ON "korchma_mantok_sales"("character_id", "status", "expires_at");

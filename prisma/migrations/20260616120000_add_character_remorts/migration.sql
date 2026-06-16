CREATE TABLE "character_remort_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "selected_identity_json" JSONB NOT NULL,
    "selected_items_json" JSONB NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "character_remort_drafts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "character_remorts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "remort_number" INTEGER NOT NULL,
    "previous_level" INTEGER NOT NULL,
    "previous_xp" INTEGER NOT NULL,
    "previous_gold" INTEGER NOT NULL,
    "display_name_snapshot" TEXT NOT NULL,
    "preserved_payload_json" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "character_remorts_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "character_remort_drafts_token_key" ON "character_remort_drafts"("token");
CREATE INDEX "character_remort_drafts_character_id_status_idx" ON "character_remort_drafts"("character_id", "status");
CREATE INDEX "character_remort_drafts_expires_at_idx" ON "character_remort_drafts"("expires_at");

CREATE UNIQUE INDEX "character_remorts_token_key" ON "character_remorts"("token");
CREATE UNIQUE INDEX "character_remorts_character_id_remort_number_key" ON "character_remorts"("character_id", "remort_number");
CREATE INDEX "character_remorts_remort_number_created_at_idx" ON "character_remorts"("remort_number", "created_at");

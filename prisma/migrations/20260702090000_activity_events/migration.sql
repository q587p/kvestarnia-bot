-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "actor_character_id" TEXT,
    "actor_display_name" TEXT,
    "related_character_ids_json" JSONB,
    "subject_kind" TEXT,
    "subject_id" TEXT,
    "subject_name" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "dedupe_key" TEXT,
    "payload_json" JSONB,
    "occurred_at" DATETIME NOT NULL,
    "published_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_events_dedupe_key_key" ON "activity_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "activity_events_visibility_occurred_at_idx" ON "activity_events"("visibility", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_events_category_occurred_at_idx" ON "activity_events"("category", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_events_severity_occurred_at_idx" ON "activity_events"("severity", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_events_actor_character_id_occurred_at_idx" ON "activity_events"("actor_character_id", "occurred_at");

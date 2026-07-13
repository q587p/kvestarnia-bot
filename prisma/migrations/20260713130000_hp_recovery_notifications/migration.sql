-- CreateTable
CREATE TABLE "hp_recovery_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "remort_count" INTEGER NOT NULL DEFAULT 0,
    "source_hp_current" INTEGER NOT NULL,
    "source_hp_max" INTEGER NOT NULL,
    "source_hp_regen_at" DATETIME,
    "source_fingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "next_attempt_at" DATETIME NOT NULL,
    "processing_started_at" DATETIME,
    "ready_at" DATETIME,
    "sent_at" DATETIME,
    "suppressed_at" DATETIME,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "hp_recovery_notifications_character_id_fkey"
      FOREIGN KEY ("character_id") REFERENCES "characters" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "hp_recovery_notifications_character_id_key"
ON "hp_recovery_notifications"("character_id");

-- CreateIndex
CREATE INDEX "hp_recovery_notifications_status_next_attempt_at_idx"
ON "hp_recovery_notifications"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "hp_recovery_notifications_status_processing_started_at_idx"
ON "hp_recovery_notifications"("status", "processing_started_at");

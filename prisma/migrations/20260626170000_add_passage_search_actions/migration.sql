CREATE TABLE "passage_search_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "node_kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "active_key" TEXT,
    "started_at" DATETIME NOT NULL,
    "ends_at" DATETIME NOT NULL,
    "payload_json" JSONB NOT NULL,
    "result_json" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "passage_search_actions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "passage_search_actions_token_key" ON "passage_search_actions"("token");
CREATE UNIQUE INDEX "passage_search_actions_active_key_key" ON "passage_search_actions"("active_key");
CREATE INDEX "passage_search_actions_character_id_status_ends_at_idx" ON "passage_search_actions"("character_id", "status", "ends_at");
CREATE INDEX "passage_search_actions_node_key_idx" ON "passage_search_actions"("node_key");

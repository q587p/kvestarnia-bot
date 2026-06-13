-- CreateTable
CREATE TABLE "character_equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "character_id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "character_equipment_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "character_equipment_character_id_slot_key" ON "character_equipment"("character_id", "slot");

-- CreateIndex
CREATE INDEX "character_equipment_item_id_idx" ON "character_equipment"("item_id");

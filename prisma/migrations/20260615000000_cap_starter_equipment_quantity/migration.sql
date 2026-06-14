UPDATE "character_items"
SET "quantity" = 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "item_id" IN (
    'item.apron-of-foam-resistance',
    'item.pan-of-persuasion',
    'item.stamp-of-minor-authority',
    'item.cork-ring-of-serious-business'
)
AND "quantity" > 1;

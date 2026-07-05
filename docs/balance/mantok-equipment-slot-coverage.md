# Mantok Equipment Slot Coverage Balance Notes

## Intent

This pass fills the equipment-slot foundation with usable authored manatky while preserving the existing combat and economy envelope. The new items are intentionally modest: common/uncommon universal gear mostly adds one or two visible stat points, while restricted race/class/title items are identity gear rather than a new power tier.

## Authored coverage targets

| Target | Requirement | Included in patch |
| --- | ---: | ---: |
| Canonical equipment slots | 7 | 7 |
| Minimum authored coverage items per slot | 5 | 12+ |
| Maximum slot-count spread | 10 | 6 |
| Class-restricted items per class | 2 | 2 |
| Race-restricted items per active race | 2 | 2 |
| Title/path-bucket restricted items per bucket | 2 | 2 |

Authored coverage slot counts in this patch:

| Slot | Count |
| --- | ---: |
| `weapon` | 18 |
| `offhand` | 16 |
| `head` | 14 |
| `chest` | 12 |
| `legs` | 12 |
| `accessory` | 15 |
| `tool` | 14 |

The spread is `18 - 12 = 6`, below the requested ceiling of ten.

## Power envelope

- Universal coverage gear uses common prices around starter-equipment scale but stays above the existing very-cheap trophy guard.
- Class/race gear uses mostly uncommon rarity and small stat packages tied to identity.
- Title/path gear uses rare rarity and slightly higher prices, but remains narrow and gated by title-bucket matching.
- Two-handed weapons are tagged `twohand` so they use the existing offhand conflict/confirmation model.
- Shields, bucklers, parrying daggers and second-hand utilities use `offhand` metadata/tags instead of pretending to be generic chest armor.
- Tool coverage items are `slot: "accessory"` plus `equipmentSlot: "tool"`, matching the current item schema while using the canonical equipment slot.

## Generated loot adapter rules

Generated Loot Expansion v1 item ids and enhancement counts stay stable. The adapter derives slot/hand metadata at materialization time:

- head-like armor names/tags: `head`;
- leg/boot/pants/greave names/tags: `legs`;
- shield/buckler/guard names/tags: `offhand` and `offhand` tag;
- bonus-bearing maps, kits, keys, lanterns, whistles, chalk, tools or instruments: `tool`;
- bows, crossbows, long spears, staves and other large weapons: `twohand` tag;
- daggers, knives, parrying blades and small second-hand weapons: `offhand` tag.

These rules avoid hand-editing the generated source pack and keep future regeneration safer.

## Risks and follow-ups

- Equip restrictions for authored coverage items are runtime checks, not extra fields in `ItemContent`, so item detail copy should continue using the existing requirement presentation path.
- Title/path matching uses the same broad keyword-bucket style as Loot Expansion v1; when titles become fully normalized persisted ids, these buckets should switch from text inference to ids.
- Reward tables are not expanded in this patch. A follow-up can decide where each coverage family enters loot, shops, Yeger boards, Mantok Chest or quest rewards.

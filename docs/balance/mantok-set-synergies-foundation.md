# Mantok Set Synergies Foundation Balance Notes

## Scope

This slice adds 13 authored Mantok set families and live stat-only thresholds. It deliberately does not add gear actions, bleed/burn statuses, Yeger discounts, borrowed class/race abilities, combat callbacks, shops, crafting, markets or broad formula changes.

## Numeric posture

- 2-piece bonuses stay tiny: usually `+1` to one stat, `+2 HP/mana`, or one small defensive/offensive point.
- 3-piece bonuses stay comparable to one small authored item effect.
- 4-piece final bonuses are still stat-only and modest because the item pieces already carry their own equipment effects.
- Full-set power costs real slot pressure: paired daggers occupy both hands; armor families occupy head/chest/legs plus another slot; cross-slot kits trade flexibility for predictable totals.

## Drop posture

Set pieces are merged as rare extras into current high-level monster loot around levels `9..13`. They do not replace:

- base monster loot;
- concrete trophy/fallback loot;
- Mantok equipment slot-coverage loot.

The first content pass keeps the package's `0.05` set-piece weights. This is intentionally lower than the `0.35` Mantok slot-coverage weight so set hunting feels like a long-tail build goal rather than a required progression faucet.

## Deferred ideas

The handoff archive contains future ability/status/service concepts. Those remain design notes only for later slices. Before any future gear action ships, it needs combat callback/stale-turn tests, replay-safe resource/cooldown handling, achievement decisions and manual Telegram QA specific to that runtime path.

## Risk notes

- Effective-stat aggregation treats active set thresholds as synthetic equipment contributions, so `/hero`, fights and equipment summaries read one shared stat result.
- Duplicate two-handed visual slots are de-duplicated by item id before set progress is computed.
- Set definitions are content-driven, so adding future thresholds should not require hardcoded runtime branches.

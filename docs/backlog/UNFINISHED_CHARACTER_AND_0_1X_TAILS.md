# Unfinished Character and 0.1.x Tails

This backlog separates the shipped `0.2.4` item-use slice from older character/identity ideas that should not be treated as already implemented.

## Shipped In `0.2.4`

- Narrow item tag validation for explicit use/trade/duel/raid safety flags.
- `Бинт відповідальної паніки` as the first one-use out-of-combat healing item.
- Replay-safe item-use orders with stack reservation, confirmation, cancellation, expiry and remort cleanup.
- Єгер bandage supply with a ranger-specific advantage.
- A small authored monster-loot entry for bandages through existing loot flow.

## Recommended Next Runtime Order

1. `0.2.5` - Race Abilities MVP.
2. `0.2.6` - Achievements and Cosmetic Titles.
3. Later - Selected Signature Techniques.

## Deferred Tails

- Full race ability catalog and balance pass.
- Rewardless achievement definitions, hidden/locked/unlocked browsing and cosmetic-title unlocks.
- Signature techniques beyond a small selected proof slice.
- Broad item action catalog, in-combat consumables, food/coffee, shops, crafting and markets.
- Tag-weighted monster loot formulas beyond authored monster loot entries and existing LUCK/drop mechanics.
- Monster grammar metadata for richer case/gender-safe player copy.

## Guardrail

Do not combine these tails with an unrelated release cleanup. Each runtime tail should have its own task doc, tests and release surface.

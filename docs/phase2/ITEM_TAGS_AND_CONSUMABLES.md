# Phase 2 — Item Tags and One-use Manatky

Phase 1 equipment effects are intentionally small. Phase 2 can make манатки more expressive by adding item tags, combat actions and explicit one-use effects.

## Goals

- Items unlock or shape actions through data, not presenter hacks.
- Consumables require explicit use and confirmation.
- One-use effects are idempotent and replay-safe.
- Item tags support combat variety, trading eligibility and future party roles.

## Starter tag vocabulary

- `melee`
- `ranged`
- `magic-focus`
- `shield`
- `guard`
- `counter`
- `spell-channel`
- `trick`
- `song`
- `kick-enabled`
- `two-handed`
- `offhand`
- `consumable`
- `cosmetic`
- `trade-blocked`
- `story`

## Consumable rules

- No automatic hidden procs.
- Use action must show what will be spent.
- Confirm rechecks ownership and eligibility in a transaction.
- Repeated confirm replays the result instead of consuming another item.
- Consumable power must be capped lower than permanent progression.

## Combat action catalog

The future action catalog should combine:

- class/race base actions;
- effective stats;
- equipped item tags;
- available consumables;
- cooldown/resource state.

Player-facing keyboard should stay short: the catalog can choose a few best available actions instead of listing every possible trick.

## Acceptance criteria

- Content validation requires supported tags to be known.
- Action generation is deterministic in tests.
- Consumable use cannot spend equipped/protected/story items accidentally.
- Repeated callbacks do not double-spend.
- Presenters explain item effects in Ukrainian without exposing exact hidden formulas.


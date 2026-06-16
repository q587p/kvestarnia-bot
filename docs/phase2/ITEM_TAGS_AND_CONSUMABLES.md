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
- `single-use` / `one-use`
- `cosmetic`
- `duel-legal`
- `duel-blocked`
- `raid-legal`
- `raid-blocked`
- `tradeable`
- `trade-blocked`
- `memory`
- `sentimental`
- `soulbound`
- `story`

## Consumable rules

- No automatic hidden procs.
- Use action must show what will be spent.
- Confirm rechecks ownership and eligibility in a transaction.
- Repeated confirm replays the result instead of consuming another item.
- Protected, story, equipped, priceless, `sentimental`, `memory` and `soulbound` items are blocked from accidental use unless a later PR designs a very explicit exception.
- Consumable power must be capped lower than permanent progression.

## Eligibility rules

Tags must make future behavior visible to code review and content tests:

- `duel-legal` / `duel-blocked` decide whether the item can affect duel action catalogs or quick resolve.
- `raid-legal` / `raid-blocked` decide whether the item can affect party/raid actions.
- `tradeable` / `trade-blocked` decide whether the item can move through gifting/trading.
- `single-use` or `one-use` means explicit confirmation, transactional consume and replay-safe result are mandatory.
- `memory` / `sentimental` marks items that should usually be preserved as story objects, not spent by bulk actions.
- `soulbound` marks items tied to the character identity and blocked from trading by default.

No tag should create hidden automatic procs. If an item changes a duel, raid, trade, remort or consume path, the relevant preview/confirmation copy must say so in player-facing Ukrainian before the state changes.

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
- Future content tests validate duel/raid/trade/use eligibility tags.
- Action generation is deterministic in tests.
- Consumable use cannot spend equipped/protected/story items accidentally.
- Repeated callbacks do not double-spend.
- Presenters explain item effects in Ukrainian without exposing exact hidden formulas.

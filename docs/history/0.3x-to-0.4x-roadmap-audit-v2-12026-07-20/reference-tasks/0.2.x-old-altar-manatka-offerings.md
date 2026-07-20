# Old Altar Manatka Offerings — follow-up task

## Goal

Add safe manatka offerings to `🪨 Старий жертовник` as an item sink that grants `Благовоління` without risking accidental loss of important inventory.

This is a follow-up to the gold-only Old Altar Blessings MVP.

This is a docs-only draft until a human explicitly activates it as a concrete versioned task. Do not implement it together with the gold-only MVP unless the task is re-scoped.

## Why separate from MVP

Sacrificing items is desirable, but it requires careful inventory handling:

- equipped items must be protected;
- reserved items must be protected;
- postal/gift/remort/crafting reservations must be respected;
- stack quantity must be handled correctly;
- unique/quest/keepsake items need clear eligibility rules;
- stale callback confirmations must not consume a different item after inventory drift;
- player-facing copy must be very explicit that the item is gone permanently.

## Scope

- Add `🎒 Принести манатку` under `🎁 Принести требу`.
- List eligible non-equipped, non-reserved owned items with pagination.
- Show a confirmation card with item name, quantity consumed and favor granted.
- Consume exactly one stack unit or one item instance on confirmation.
- Grant favor in the same durable transaction.
- Add offering ledger fields for item details.
- Keep item offerings private; no public feed row.

## Eligibility

Initial safe rules:

- allowed:
  - ordinary owned items not equipped;
  - ordinary one-use items not currently reserved;
  - ordinary equipment not equipped and not reserved;
- blocked:
  - equipped items;
  - items reserved by mail/gift/remort/other flow;
  - active quest/progression tokens;
  - unique keepsakes where content marks them protected;
  - items whose content is missing or invalid;
  - any item stack where selected quantity changed before confirmation.

Use existing inventory reservation/protection helpers where available. Do not reimplement a second item ownership model.

## Favor yield

Conservative initial mapping:

```text
eligible ordinary low-power item: 1 favor
effect-bearing equipment or useful one-use item: 2 favor
rare/restricted/effect-bearing item: 3 favor
hard cap per item offering: 3 favor
```

If current item metadata cannot reliably distinguish rarity/power, start with:

```text
any eligible item -> 1 favor
```

Then tune after playtest.

## Daily cap

Do not share the same cap as gold offerings unless balance review asks for it.

Recommended first item-offering cap:

```text
max 3 favor/day from item offerings per current character/remort life
```

This prevents turning farmed low-value loot into a high-volume buff battery.

## UX

Required confirmation copy:

```text
Цю манатку буде принесено до жертовника. Вона зникне без повернення.
```

Required blocked copy categories:

- already equipped;
- reserved by another flow;
- item no longer exists;
- stack quantity changed;
- item cannot be offered;
- daily item-offering cap reached.

## Acceptance criteria

- Eligible item appears in offering list.
- Equipped item does not appear or is blocked with a clear reason.
- Reserved item does not appear or is blocked with a clear reason.
- Confirming an eligible item consumes exactly one unit/instance and grants favor once.
- Duplicate confirmation does not consume another unit.
- Stale confirmation after item is equipped, sent, sold, used or reserved blocks safely.
- Daily cap is enforced.
- Offering ledger stores item identity and favor granted.
- Gold offering behavior from MVP is unchanged.

## Suggested tests

- domain favor-yield tests;
- inventory eligibility tests;
- repository atomic consume+favor transaction test;
- stale callback tests for missing/equipped/reserved/quantity drift;
- presenter tests for confirmation and irreversible warning;
- pagination tests if inventory lists are long.

## Non-goals

- No bulk sacrifice in first item-sink slice.
- No random item sacrifice.
- No sacrifice from equipped slots.
- No public offering chest UI.
- No item recovery/buyback.
- No altar-only crafting.
- No shops, markets, broad crafting economy, item-instance migration or generated sacrifice loot.

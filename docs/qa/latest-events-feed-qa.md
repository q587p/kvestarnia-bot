# Latest Events Feed — QA plan

## Automated tests

### Repository / service

- `record` creates a public activity event with structured payload.
- `record` dedupes by `dedupeKey` and returns the existing row or a safe duplicate result.
- `recordSafely` catches repository errors and does not throw.
- `listRecent` returns public events sorted by `occurredAt desc`.
- Category and severity filters work.
- Pagination/cursor does not repeat rows.
- Empty result returns a safe empty page.

### Renderer

- Groups rows by Kyiv date.
- Renders `Сьогодні`, `Вчора` and month-day labels.
- Renders every MVP event type.
- Escapes player, item and monster names for Telegram HTML.
- Truncates long names without breaking HTML.
- Replaces empty/invisible display names with `Пригодник без таблички` or the chosen fallback.
- Keeps one screen under Telegram limits for the default page size.
- Uses `«»` around dynamic item/monster names.

### Callback parser

- Parses valid `v1:ev:*` callbacks.
- Rejects malformed callbacks.
- Keeps generated callback data under 64 bytes.
- Supports filter and refresh callbacks.
- Stale cursor callbacks do not throw and show a safe page or empty state.

### Emission hooks

- Character creation emits exactly one `character.created` activity row.
- Level reached emits exactly one row per reached level that passes the threshold.
- Multi-level reward settlement does not create an uncontrolled row storm; follow the task's chosen rule and test it.
- Group raid victory emits one row per terminal boss session, not one row per participant.
- Rare manatka receipt emits only for configured public rarities.
- Underdog victory emits only when monster level minus player level is at least 5.
- Ordinary combat wins, common items, deaths/losses and passive feed reads do not emit public rows.

### Regression

- Existing `/news` and `Дошка корчми` flows still render.
- Existing achievements still unlock and list as before.
- Existing achievement recalculation does not spam public activity rows.
- Existing party/raid settlement remains idempotent.
- Existing combat reward settlement remains idempotent.
- Existing item receipt/equipment tests continue to pass.

## Focused commands

Codex should inspect `package.json` first and use exact script names from current `main`. Expected commands from current context:

```bash
npm test -- latestEvents
npm test -- activityEvent
npm test -- achievementService
npm test -- partyBoss
npm test -- combat
npm run typecheck
npm run check
```

Run targeted tests first. Run broader checks before opening a ready PR unless a concrete blocker is documented.

## Manual Telegram QA

### Scenario 1 — entry point

1. Open `Дошка корчми` or the current board/news surface.
2. Tap `📣 Останні події`.
3. Expected: `📜 Хроніки Квестарні` opens with rows or the empty state.
4. Expected: existing `/news` / board navigation still works.

### Scenario 2 — new character

1. Create a new character through `/start`.
2. Open `📣 Останні події`.
3. Expected row:

```text
👋 HH:mm | Новий пригодник у Квестарні: <name>!
```

4. Repeat any idempotent startup action.
5. Expected: no duplicate row.

### Scenario 3 — level reached

1. Use a dev/admin path or controlled test data to grant enough XP for a level-up.
2. Open the feed.
3. Expected row:

```text
🎉 HH:mm | <name> бере <level> рівень!
```

4. Replay the reward/settlement callback if possible.
5. Expected: no duplicate row.

### Scenario 4 — group raid victory

1. Complete or simulate a group raid victory.
2. Open the feed.
3. Expected: one victory row for the boss session.
4. Expected: participant count is shown, but individual private Telegram ids are not.
5. Replay stale/duplicate terminal callbacks if available.
6. Expected: no duplicate row and no extra rewards.

### Scenario 5 — rare manatka

1. Grant or receive a common item.
2. Expected: no public row.
3. Grant or receive a configured rare item.
4. Expected: one public manatky row with escaped item name, but no row in `⭐ Важливе`.
5. Grant or receive a configured epic item.
6. Expected: one public manatky row with escaped item name, and it remains visible in `⭐ Важливе`.

### Scenario 6 — underdog victory

1. Win an ordinary same-level combat.
2. Expected: no public row.
3. Win against a monster at least 5 levels stronger.
4. Expected: one `🛡️` row in the general/combat feed; `+5..+7` stays out of `⭐ Важливе`, while `+8` and above appears there.
5. Lose/flee/expire against the same monster.
6. Expected: no public loss/shame row.

### Scenario 7 — filters and refresh

1. Open all filters.
2. Expected: rows match filter categories.
3. Tap `🔄 Оновити`.
4. Expected: no duplicate message storm and no spinner hang.
5. Tap an old/stale callback after restart/deploy.
6. Expected: safe fallback.

### Scenario 8 — privacy/name safety

1. Use a display name with HTML special characters.
2. Expected: escaped output.
3. Use a long display name.
4. Expected: truncated safe output.
5. Use an invisible or blank display name.
6. Expected: fallback label.

## Manual QA not in MVP

Do not test these as shipped behavior unless a later task explicitly implements them:

- proactive group/channel auto-announcements;
- public losses/deaths;
- item upgrade rows;
- overlevel item rows;
- guild feed;
- market/crafting feed;
- Mini App UI.

# Codex prompt - Lore Board MVP

> Historical/consumed prompt. The `0.2.18` Lore Board MVP shipped from [docs/tasks/0.2.18-lore-board-mvp.md](../../../tasks/0.2.18-lore-board-mvp.md). Reuse this only as background; follow the shipped compact callback contract in `src/bot/callbacks/loreBoardCallbackData.ts`.

```text
Use $kvestarnia-version-task.
Use $ukrainian-rpg-content for player-facing Ukrainian lore and UI copy.

Implement:
docs/tasks/0.2.18-lore-board-mvp.md

Context:
docs/ai/context.md
docs/design/kvestarnia-lore-board.md
docs/content/kvestarnia-lore-current-canon.md
docs/content/kvestarnia-lore-canon-snapshot.json
docs/content/kvestarnia-lore-seed.md
docs/content/kvestarnia-lore-seed.json

Follow AGENTS.md.
Start from the current main branch unless a human explicitly says this is a same-PR follow-up.
Work on this versioned task only.
Do not implement this inside the Big Barrel Brother PR unless the human explicitly reopens that scope.
Do not invent new playable race/class names in player-facing text.

Goal:
Add a lightweight `📖 Перекази` section reachable from the existing `Дошка корчми` / news-corner flow. It should read like Kvestarnia tavern folklore, not a wiki.

Before editing:
- inspect the existing news-corner command, presenter, keyboard and callback patterns;
- inspect `/news` and news archive behavior;
- inspect static content conventions under `src/content/`;
- inspect current race/class/monster/location source-of-truth files;
- inspect callback-data tests and Telegram HTML escaping helpers;
- choose the smallest architecture that fits current repo patterns.

Hard scope:
- one `📖 Перекази` entry point from `Дошка корчми`;
- static typed lore categories and entries seeded from the current docs;
- source-of-truth references aligned to current race/class/monster/location arrays where practical;
- lore menu, category screen, entry screen, random entry, category-random and back-to-board navigation;
- graceful invalid category/entry fallback;
- `v1:lore:*` callback namespace;
- callback_data <= 64 bytes;
- tests for content validity, canonical refs, keyboard/presenter rendering, HTML escaping, random selection and callback routing.

Achievement decision:
The MVP should not grant XP, gold, items, combat power or achievement rewards for simply reading lore. Document that no-achievement decision in the implementation PR body. If the human later asks for a rewardless first-read achievement, add normal achievement hooks and tests explicitly.

Non-goals:
- no Prisma schema or migration for the MVP unless current repo patterns make static content impossible;
- no admin UI;
- no unlock/progress gating in the MVP;
- no WebView or separate app surface;
- no rewrite of `Дошка корчми` or `/news`;
- no Big Barrel Brother, party/raid, combat, rewards, remort, passage search or economy changes;
- no exact future rewards, hidden odds, hidden path ids or combat/drop formulas in player-facing copy.

Player-facing copy rules:
- Ukrainian only;
- `Квестарня` for the game name;
- `пригодник` as the default in-world player noun;
- `соціяльн*`, `мітолог*`, `ґільдії` spelling;
- Ukrainian `«»` quotes in prose;
- no separate app-surface promise.

Shipped compact callback shape:
- `v1:lore:m`
- `v1:lore:c:<categoryId>`
- `v1:lore:e:<entryId>`
- `v1:lore:r`
- `v1:lore:rc:<categoryId>`

Focused tests:
- content id/category validation;
- canonicalRefs validation against known runtime ids where practical;
- callback-data length validation;
- lore menu includes every category;
- category screen shows only category entries;
- entry screen shows title/source/body and escapes HTML;
- random entry never returns undefined;
- news-corner includes the `📖 Перекази` button;
- back-to-board uses the existing board flow;
- `/news` and news archive still work.

Manual Telegram QA:
- open `Дошка корчми`;
- open `📖 Перекази`;
- browse every category;
- open several entries;
- use random and category-random;
- use back buttons;
- replay stale callbacks after restart/deploy;
- verify lore reading gives no XP, gold, items, combat power or hidden reward.

Final output:
- changed files
- behavior changed
- tests run
- manual Telegram QA
- achievement decision
- risks/follow-ups
- PR link / completion status

No tutorial.
```

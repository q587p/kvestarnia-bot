# Codex prompt - Lore Board MVP

```text
Use $kvestarnia-version-task.
Use $ukrainian-rpg-content for player-facing Ukrainian lore and UI copy.

Implement:
docs/tasks/0.2.x-lore-board.md

Context:
docs/ai/context.md
docs/design/kvestarnia-lore-board.md
docs/content/kvestarnia-lore-seed.md
docs/content/kvestarnia-lore-seed.json

Follow AGENTS.md.
Start from the current main branch unless a human explicitly says this is a same-PR follow-up.
Work on this versioned task only.
Do not reuse the old attached-package spelling for the project slug; technical ids use `kvestarnia`, player-facing copy uses `Квестарня`.
Do not implement this inside the Big Barrel Brother PR unless the human explicitly reopens that scope.

Goal:
Add a lightweight lore section reachable from the existing `Дошка вістей` flow. It should read like Kvestarnia tavern folklore, not a wiki.

Before editing:
- inspect the existing notice/news board command, presenter, keyboard and callback patterns;
- inspect static content conventions under `src/content/`;
- inspect existing callback-data tests and Telegram HTML/Markdown escaping helpers;
- choose the smallest architecture that fits current repo patterns.

Hard scope:
- one lore entry point from `Дошка вістей`;
- static typed lore categories and entries seeded from the docs;
- lore menu, category screen, entry screen, random entry and back-to-board navigation;
- graceful invalid category/entry fallback;
- callback_data <= 64 bytes;
- tests for content validity, keyboard/presenter rendering, random selection and callback routing.

Achievement checkpoint:
New player-facing gameplay requires an achievement decision. Add a small rewardless first-lore-read achievement if it fits the implementation. If not, explicitly document why no durable achievement is shipped in the task doc and PR body before calling the PR ready.

Non-goals:
- no Prisma schema or migration for the MVP unless current repo patterns make static content impossible;
- no admin UI;
- no unlock/progress gating;
- no WebView or separate app surface;
- no rewrite of `Дошка вістей`;
- no Big Barrel Brother, party/raid, combat, rewards, remort, passage search or economy changes;
- no exact future rewards, hidden odds or roadmap promises in player-facing copy.

Player-facing copy rules:
- Ukrainian only;
- `Квестарня` for the game name;
- `пригодник` as the default in-world player noun;
- `соціяльн*`, `мітолог*`, `ґільдії` spelling;
- Ukrainian `«»` quotes in prose;
- no separate app-surface promise.

Suggested callback shape:
- `lore:menu`
- `lore:c:<categoryId>`
- `lore:e:<entryId>`
- `lore:r`
- `lore:rc:<categoryId>`
- `lore:back:board`

Focused tests:
- content id/category validation;
- callback-data length validation;
- lore menu includes every category;
- category screen shows only category entries;
- entry screen shows title/source/body;
- random entry never returns undefined;
- notice board includes the lore button;
- back-to-board uses the existing board flow;
- achievement hook/recalc tests if achievements are added.

Manual Telegram QA:
- open `Дошка вістей`;
- open lore menu;
- browse every category;
- open several entries;
- use random and category-random;
- use back buttons;
- replay stale callbacks after restart/deploy;
- verify achievements if included.

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

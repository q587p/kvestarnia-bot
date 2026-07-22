Use $kvestarnia-version-task.
Use $ukrainian-rpg-content for player-facing Ukrainian copy.
Use $balance-review for constants and economy/power risks.

Task: implement the Old Altar Blessings MVP from `docs/tasks/archive/0.2.x-old-altar-blessings-mvp.md`.

Before editing:

- Fetch/verify current `main` and current package version.
- Choose the next versioned task doc path according to the repo convention.
- Inspect the current files touched by Priest blessings, Korchma Yard routing and presence before broad scans.

Start with these repo anchors:

- `docs/ai/context.md`
- `docs/tasks/0.2.25-class-noncombat-priest-rogue.md`
- `docs/design/noncombat-techniques.md`
- `docs/balance/notes.md`
- `src/domain/noncombat/classNoncombatTechniques.ts`
- `src/services/classNoncombatService.ts`
- `src/domain/noncombat/priestBlessingBonus.ts`
- `src/bot/presenters/classNoncombatPresenter.ts`
- `src/bot/presenters/tavernPresenter.ts`
- `src/bot/keyboards/tavernKeyboard.ts`
- `src/services/presenceService.ts`
- `src/bot/modules/mainMenu.ts`

MVP boundaries:

- Add `🪨 Старий жертовник` as an action surface from `Задвірок корчми`.
- Keep presence at `location.korchma.yard`; do not add `Тихий Корінь` or any new presence location in this task.
- Add private gold offerings: `13 gold -> 1 Благовоління`, max `3` favor per current character/remort life per Kyiv day.
- Add level 3+ Priest altar rite at the yard: mana + favor -> one visible selected-stat Priest blessing.
- Selected stats: strength, dexterity, intelligence, charisma, luck.
- Blessing duration stays 13 minutes; same actor-target repeat wait stays 93 minutes.
- Bonus is `+1..+3`; no stacking with any active Priest blessing.
- Preserve existing direct Priest heal/bless behavior from `Хто поруч`.
- No item offerings, no root-grove location, no travel/death/ambush effects, no reward multiplier, no achievements unless the activated task explicitly re-scopes them after the altar runtime is proven small enough.
- Add a narrow non-production `/dev_*` helper for local QA of favor balance, gold-offering caps, blessing waits or blessing expiry; document any deliberate exception in the task doc and PR body.
- Review `📖 Перекази` when implementing the altar. Update lore if the shipped runtime changes what Kvestarnia currently says about the yard, Priests, blessings or manatky offerings.

Use the copy seeds from `docs/content/old-altar-blessings-copy.uk.md` when adding player-facing text.

Expected implementation areas:

- domain helper/constants for old altar blessing types and costs;
- service/repository layer for favor balance, gold offering ledger and altar blessing spend;
- Prisma migration if needed;
- altar callbacks/keyboards/presenters/command or module;
- yard presenter/keyboard route integration;
- focused tests for domain, callbacks, service transactions, presenters and routing.

Validation:

- Run focused tests while developing.
- Run `npm run check` before final handoff, unless blocked; if blocked, report the exact blocker.

Final response format:

- changed files;
- behavior changed;
- tests run;
- risks/follow-ups;
- completion status.

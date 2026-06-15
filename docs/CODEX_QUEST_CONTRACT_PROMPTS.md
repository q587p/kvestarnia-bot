# Codex Quest Contract Prompts

Нижче - готові підказки для майбутніх implementation PRs. Вони **не** для цього docs-only пакета; це шаблони для наступних маленьких змін.

## Prompt 1 — Quest Contract UI copy polish for `Тринадцять дрібних проблем`

Goal:
Підчистити копірайт і presentation для quest wrapper навколо persistent fight sessions, щоб квест звучав як корчмарська справа, а не як сухий чекліст.

Context:
Read first:
- `AGENTS.md`
- `docs/QUEST_CONTRACTS_BACKLOG.md`
- `docs/QUEST_CONTRACT_AUTHORING_GUIDE.md`
- `docs/PHASE1_FINISH_PLAN.md`
- `docs/GAME_DESIGN.md`
- `src/services/fightService.ts`
- `src/services/questService.ts` if present
- `src/bot/presenters/questPresenter.ts`
- `tests/bot/questPresenter.test.ts`
- `tests/services/questService.test.ts`

Constraints:
- Do not change combat math.
- Do not change equipment effects.
- Do not add new reward types.
- Do not add new commands beyond the quest flow already in the repo.
- Keep all player-facing text Ukrainian.
- Keep repeated callbacks idempotent.
- Do not touch Prisma schema unless the current quest state model already requires a tiny safe fix.

Done when:
- `Тринадцять дрібних проблем` reads clearly in the quest screen.
- Progress and reward copy fit one mobile screen.
- Repeated completion does not duplicate rewards.
- Tests cover the presenter text and idempotency.
- Final response lists files changed, tests run, risks, and next smallest step.

## Prompt 2 — Inventory inspection quest foundation

Goal:
Add a tiny quest wrapper for inventory inspection so the game rewards curiosity about `манатки`, not just damage numbers.

Context:
Read first:
- `AGENTS.md`
- `docs/QUEST_CONTRACTS_BACKLOG.md`
- `docs/QUEST_CONTRACT_AUTHORING_GUIDE.md`
- `docs/BALANCE_NOTES.md`
- `src/services/inventoryService.ts`
- `src/bot/presenters/inventoryPresenter.ts`
- `src/bot/commands/inventoryCommand.ts` if present
- `tests/services/inventoryService.test.ts`
- `tests/bot/inventoryPresenter.test.ts`

Constraints:
- No sell/trade.
- No equipment stat effects.
- No loot engine.
- No new economy sinks.
- No power rewards.
- Do not add a general quest framework if a small focused wrapper is enough.

Done when:
- A small inventory-related quest can be opened, shown, and completed idempotently.
- Copy stays short and humorous.
- Tests cover unread/read/completed states.
- Final response explains the smallest safe slice and any remaining follow-up.

## Prompt 3 — Bestiary reading quest after level 3

Goal:
Add a quest wrapper that rewards a player for reading the bestiary after level 3 without creating a collection system.

Context:
Read first:
- `AGENTS.md`
- `docs/QUEST_CONTRACTS_BACKLOG.md`
- `docs/BESTIARY.md`
- `docs/MONSTER_FLAVOR_ROUTING.md`
- `src/bot/presenters/bestiaryPresenter.ts`
- `src/bot/commands/bestiaryCommand.ts`
- `src/services/heroService.ts`
- `tests/bot/bestiaryPresenter.test.ts`
- `tests/services/heroService.test.ts`

Constraints:
- No bestiary collection progression.
- No public sharing.
- No XP/gold/item power beyond the quest reward itself.
- No hidden path exposure.
- Keep the quest unavailable below level 3.

Done when:
- The quest is visible only when the level gate allows it.
- The player sees a short, funny reason to read the bestiary.
- Completion is idempotent.
- Tests cover gate, progress, and reward.

## Prompt 4 — Equipment attunement quest after `0.0.22`

Goal:
Create a future quest wrapper for equipping an item, but only after the equipment stat-effects PR exists.

Context:
Read first:
- `AGENTS.md`
- `docs/QUEST_CONTRACTS_BACKLOG.md`
- `docs/BALANCE_NOTES.md`
- `docs/TECHNICAL_PLAN.md`
- `src/services/equipmentService.ts`
- `src/domain/progression/effectiveStats.ts`
- `src/bot/presenters/equipmentPresenter.ts`
- `tests/services/equipmentService.test.ts`
- `tests/bot/equipmentPresenter.test.ts`

Constraints:
- Do not implement stat effects in the quest PR.
- Do not add a new equipment system.
- Keep the quest small and flavor-first.
- Do not let the quest become a power unlock by accident.

Done when:
- Equipping an item can satisfy a small quest objective.
- Copy explains the attunement idea in one screen.
- Tests prove the quest does not change equipment math.

## Prompt 5 — Level 13 capstone tavern notice

Goal:
Add a small capstone quest / notice for reaching level 13, mostly as a ceremonial finish line for Phase 1.

Context:
Read first:
- `AGENTS.md`
- `docs/QUEST_CONTRACTS_BACKLOG.md`
- `docs/PHASE1_FINISH_PLAN.md`
- `docs/BALANCE_NOTES.md`
- `src/domain/progression/level.ts`
- `src/domain/progression/characterSummary.ts` if present
- `src/bot/presenters/levelGrowthPresenter.ts`
- `tests/domain/progressionLevel.test.ts`
- `tests/bot/levelGrowthPresenter.test.ts`

Constraints:
- No new combat power.
- No new level thresholds.
- No hidden super reward.
- Keep the capstone ceremonial, not grindy.

Done when:
- Level 13 triggers a short notice or quest completion.
- Copy feels like a capstone, not a mechanic trap.
- Tests cover the threshold and repeated display.

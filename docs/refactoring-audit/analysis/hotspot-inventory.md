# Hotspot Inventory

This inventory is based on the observed GitHub `main` snapshot and should be rechecked on the actual `0.2.7` branch before editing.

| Area | Evidence | Risk | Recommended action | Priority |
|---|---|---:|---|---:|
| `src/domain/combat/combatActions.ts` | `getCombatSkillProfile(classId)` is a hard-coded switch for current class skills; ability types already exist in the same file. | Medium now, high for Player Abilities MVP. | Convert to registry + compatibility facade; keep current behavior. | P0 |
| `src/services/fightService.ts` | Large application service with imports from content, repositories, domain combat, progression, presence, daily keys, item grants, item use, analytics, and recovery. GitHub fetch reported 5k+ lines. | High merge/review risk; hard to safely add ability hooks. | Named dependencies first; then facade-preserving extraction. | P1 |
| `src/bot/modules/tavern.ts` | GitHub fetch reported 1k+ lines; owns Shynok, tavern, place, memorial, cellar, dev reset, movement, notifications. | High callback-flow repetition and review cost. | Extract callback helper and local subhandlers; do not create central router. | P1 |
| `src/bot/modules/quest.ts` | GitHub fetch reported 1k+ lines; owns quest hub, adventure, Yeger, hunt, fight routing. | Medium-high; many routing branches can drift. | Callback helper + small route helpers around place gates. | P1 |
| `src/bot/modules/combat.ts` | GitHub fetch reported 700+ lines; owns fight, training, passage search, quest progress after fights. | Medium-high due active combat/search/session coordination. | Keep ownership; extract passage-search and quest-progress follow-up helpers only when tests cover them. | P1 |
| `src/bot/modules/inventory.ts` | GitHub fetch reported 600+ lines; repeated item/use/equip/chest/barter callback ceremony. | Medium; easy place for stale callback mistakes. | Callback helper + repeat item-use helper tests. | P1 |
| `src/app/createServices.ts` | Several constructor calls include positional `undefined` placeholders. | Medium; dependency wiring mistakes become easy. | Named dependency object for high-arity services. | P1 |
| `src/domain/combat/combatEngine.ts` | GitHub fetch reported 1.7k lines; core turn resolver with item, skill, flee, multi-enemy, monster runtime integration. | High if changed casually. | Do not refactor first; add ability registry facade around it. | P2 |
| `src/domain/combat/monsterAbilityRuntime.ts` | GitHub fetch reported 3k+ lines; rich monster effect runtime. | High; many edge cases and persisted runtime state. | Delay; map shared contracts after player registry proves shape. | P2 |
| `src/bot/presenters/fightPresenter.ts` | GitHub fetch reported 1.3k lines; battle cards, journal, rewards, intros, passages. | Medium; mostly presentation complexity. | Later split by battle card/journal/reward helpers, no behavior changes. | P2 |
| `src/bot/createBot.ts` | Now a small shell. | Low. | Preserve; do not refactor again except true middleware/order changes. | Done |
| `tests/scope/architectureStabilizationScope.test.ts` | Pins module order, callback ownership, command aliases, no cycles. | Good guardrail. | Extend with new helper allowance and ability registry tests. | Guard |
| `tests/domain/noGrammyImports.test.ts` | Prevents domain importing grammY or bot modules. | Good guardrail. | Keep; add service/bot boundary tests if needed. | Guard |

## “Monster files” are not automatically bad

Some files are large because they are intentionally central to a domain. Refactor when ownership improves, not merely because the line count is high.

A good extraction has at least one of these properties:

- separates a stable domain policy from application orchestration;
- removes repeated unsafe boilerplate;
- creates a test seam for idempotency, rewards, or turn resolution;
- prevents feature PRs from touching unrelated systems;
- keeps public behavior and stored data stable.

A bad extraction:

- creates an anemic helper with five arguments and no ownership;
- hides transactions across many services;
- forces Telegram types into domain;
- breaks architecture tests by recreating a hidden central router;
- changes gameplay while claiming to be refactor-only.

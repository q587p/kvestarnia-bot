# Next Implementation Backlog після `0.0.16`

Нижче - маленькі, послідовні PR-и. Кожен slice має бути досить малим, щоб його можна було перевірити за один прохід, без побудови повного MMO.

## 0.0.17 — Combat Action Variants Shell

**Objective**  
Замість одного generic fight action показати typed action variants для combat probe.

**Scope**
- typed action taxonomy: `physical`, `spell`, `social` / `trick`, optional `class-special`;
- короткі mana/resource labels у UI;
- callback parsing для нових action ids;
- fight presenter updates;
- idempotent callback handling.

**Non-goals**
- no persistent combat state;
- no healing/rest loop;
- no equipment effects yet;
- no boss or group raid logic.

**Acceptance criteria**
- `/fight` показує кілька типів дій;
- resource cost видно в UI;
- повторний callback не списує mana двічі;
- combat probe лишається deterministic;
- tests cover stale/repeated callbacks.

**Likely files**
- `src/domain/combat/combatProbe.ts`
- `src/services/fightService.ts`
- `src/bot/presenters/fightPresenter.ts`
- `src/bot/createBot.ts`
- `src/bot/callbacks/*`
- `tests/services/fightService.test.ts`
- `tests/bot/fightPresenter.test.ts`

**Likely commands**
- `npm run check`
- `npm test`

## 0.0.18 — Effective Stats Helper, No Gear Effects Yet

**Objective**  
Винести в один helper всю математику effective stats, але без equipment effects.

**Scope**
- one shared helper for effective HP/mana/stats;
- transparent contribution lines;
- hero summary and fight preview read the same source of truth;
- clamp current values to effective max.

**Non-goals**
- no item stat bonuses;
- no combat rebalancing;
- no schema changes;
- no hidden presenter-side math.

**Acceptance criteria**
- `/hero` shows the same effective numbers as combat preview;
- contribution lines are readable and stable;
- current HP/mana are clamped, not magically refilled;
- unit tests cover level bonuses and clamping.

**Likely files**
- `src/domain/characters/characterSummary.ts`
- `src/domain/progression/effectiveStats.ts`
- `src/bot/presenters/heroPresenter.ts`
- `src/bot/presenters/fightPresenter.ts`
- `tests/...` around summary/presenters/helper

**Likely commands**
- `npm run check`
- `npm test`

## 0.0.19 — Equipment Effects V0, Tiny Numbers Only

**Objective**  
Додати найменший можливий equipment effect layer поверх helper-а.

**Scope**
- item metadata-driven effects for a small subset of equippable items;
- tiny HP/mana/primary stat adjustments;
- no big offensive scaling;
- preview of where effects come from.

**Non-goals**
- no shop, crafting, selling, or item sink economy;
- no multi-slot synergy system;
- no raid/group implications;
- no legendary or set bonuses.

**Acceptance criteria**
- тільки обрані items дають малі, пояснені бонуси;
- junk/cosmetic/priceless items лишаються без бойового ефекту;
- presenter can show contributions clearly;
- tests prove bonuses are tiny and deterministic.

**Likely files**
- `src/content/items.ts`
- `src/domain/progression/effectiveStats.ts`
- `src/bot/presenters/equipmentPresenter.ts`
- `src/bot/presenters/heroPresenter.ts`
- `src/services/inventoryService.ts`
- related tests

**Likely commands**
- `npm run check`
- `npm test`

## 0.0.20 — First Monster Variety Pack

**Objective**  
Почати різнити монстрів не тільки текстом, а й поведінкою.

**Scope**
- 2-4 additional monsters;
- tiny trait differences;
- combat probe / adventure flavor branches;
- small reward variety.

**Non-goals**
- no full bestiary;
- no boss system;
- no loot tables explosion;
- no encounter editor UI.

**Acceptance criteria**
- new monsters have stable ids;
- each monster has at least one clearly testable behavior difference;
- no handler becomes longer than needed;
- tests cover content validation and behavioral differences.

**Likely files**
- `src/content/monsters.ts`
- `src/domain/combat/*` or related fight/adventure domain
- `src/bot/presenters/*`
- tests for content + behavior

**Likely commands**
- `npm run check`
- `npm test`

## 0.0.21 — First Group Hook / Barrel Watch Design-to-Runtime Slice

**Objective**  
Перевести груповий hook із документації в мінімально playable runtime slice.

**Scope**
- join window;
- participant list;
- one tiny action loop;
- reward summary;
- stale callback protection.

**Non-goals**
- no full raid MMO;
- no complex leaderboards;
- no heavy Redis dependence unless truly required;
- no guild system.

**Acceptance criteria**
- група може зібратись у простий hook;
- є зрозумілий pending state;
- completion не дублює rewards;
- private-chat fallback поводиться чемно.

**Likely files**
- `src/services/*raid*`
- `src/bot/commands/*`
- `src/bot/presenters/*raid*`
- `src/db/*` if persistence is needed
- tests for session flow and idempotency

**Likely commands**
- `npm run check`
- `npm test`

## 0.0.22 — Item Economy Sink Preview

**Objective**  
Показати перші безпечні sinks для золота й манаток, не ламаючи економіку.

**Scope**
- one small sink action;
- cosmetic or convenience spending only;
- clear preview of cost and outcome;
- anti-spam guardrails.

**Non-goals**
- no market;
- no trading;
- no crafting tree;
- no power advantage for money.

**Acceptance criteria**
- sink costs are explicit;
- no pay-to-win edge;
- repeated callbacks stay idempotent;
- economy tests show no runaway reward loop.

**Likely files**
- `src/services/*`
- `src/bot/commands/*`
- `src/bot/presenters/*`
- `src/content/*` if new items or sinks are needed
- tests for wallet and reward flow

**Likely commands**
- `npm run check`
- `npm test`


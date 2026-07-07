# Monster Content Task Backlog

Нижче — практичний backlog для монстров, encounter flavor, loot і майбутніх encounter packs.

## Ready for implementation soon

- [ ] **Add 3 monster-specific action sets**
  Purpose: дати encounter-ам більш впізнавані кнопки без повного combat engine.
  Likely files: `src/content/monsterFlavor.ts`, `src/content/monsters.ts`, `src/bot/presenters/huntPresenter.ts`, `tests/content/monsterFlavor.test.ts`.
  Dependencies: Hunt Board MVP.
  Acceptance: кожен із трьох монстрів має окремий action set і deterministic fallback.

- [ ] **Add 5 fallback outcome lines for low-level monsters**
  Purpose: прибрати відчуття копіпасти у ранніх encounter-ах.
  Likely files: `src/content/monsterFlavor.ts`, `docs/design/monster-encounter-authoring-guide.md`.
  Dependencies: базовий flavor selector.
  Acceptance: fallback lines є короткими, різними й без повторів у тому самому монстрі.

- [ ] **Add 5 class-specific monster reactions**
  Purpose: щоб класи відчувались не тільки в stats.
  Likely files: `src/content/monsterFlavor.ts`, `src/content/classes.ts`, `tests/content/monsterFlavor.test.ts`.
  Dependencies: stable class ids.
  Acceptance: кожна реакція читається як flavor, а не як прихований stat bonus.

- [ ] **Design a level 2 food-monster mini-pack**
  Purpose: швидко розширити food-comedy кут без занадто серйозного лору.
  Likely files: `src/content/monsters.ts`, `src/content/monsterLootItems.ts`, `docs/design/bestiary.md`, `docs/design/monster-loot-drops.md`.
  Dependencies: authoring guide.
  Acceptance: щонайменше 3 нові food-монстри з короткими hooks і loot notes.

- [ ] **Design a bureaucracy-monster mini-pack**
  Purpose: додати нові encounter-и для бюрократії, черг і печаток.
  Likely files: `src/content/monsters.ts`, `src/content/monsterFlavor.ts`, `docs/design/bestiary.md`.
  Dependencies: routing docs.
  Acceptance: нові монстри мають зрозумілі tags і не дублюють уже існуючі кістки/печатки.

## Needs mechanics first

- [ ] **Add future boss gating rules**
  Purpose: зробити mini-boss/boss encounter-и окремо контрольованими.
  Likely files: `docs/design/monster-encounter-authoring-guide.md`, `docs/backlog/hunt-board-followup-plan.md`, пізніше `src/services/huntService.ts`.
  Dependencies: level bands і Hunt rotation.
  Acceptance: описано, які рівні/умови пускають до boss content.

- [ ] **Add reward pacing simulation for hunt vs cellar vs barrel**
  Purpose: не допустити, щоб hunt зламав інші loops.
  Likely files: `docs/balance/monster-reward-and-loot-balance.md`, future simulation script, balance notes.
  Dependencies: existing reward sources.
  Acceptance: є порівняльні очікування по XP/gold/item value.

- [ ] **Add future group hunt entrance copy**
  Purpose: підготувати текст для спільного входу в hunt без runtime групової логіки.
  Likely files: `docs/backlog/hunt-board-followup-plan.md`, `docs/design/monster-encounter-authoring-guide.md`.
  Dependencies: group-session design.
  Acceptance: є короткі тексти для join window, ready state і stale callback.

- [ ] **Add group chat monster spam moderation notes**
  Purpose: запобігти flood’у в чатах, коли hunt стане груповим.
  Likely files: `docs/architecture/security-and-fair-play.md`, future group hunt docs.
  Dependencies: group hunt design.
  Acceptance: описано rate-limit, ownership checks і stale action behavior.

- [ ] **Prepare equipment-aware encounter consequences**
  Purpose: щоб майбутні stats/equipment effects підключались через helper, а не прямо в текст.
  Likely files: `docs/architecture/effective-stats-and-equipment-effects-plan.md`, future service tests.
  Dependencies: effective stats helper.
  Acceptance: чітко сказано, що encounter texts не рахують бонуси самі.

## Docs/content only

- [ ] **Add Ukrainian loot name review pass**
  Purpose: прибрати мовні дрібні збої та вирівняти тон манаток.
  Likely files: `src/content/monsterLootItems.ts`, `docs/design/content-style-guide.md`, `docs/design/monster-loot-drops.md`.
  Dependencies: current loot content.
  Acceptance: назви звучать однією українською інтонацією без випадкових translit-артефактів.

- [ ] **Expand monster tag taxonomy**
  Purpose: дати майбутнім фільтрам кращі сигнали, ніж просто `starter` і `boss`.
  Likely files: `src/content/monsters.ts`, `docs/design/bestiary.md`, `docs/backlog/monster-content-task-backlog.md`.
  Dependencies: current roster.
  Acceptance: є узгоджений словник тегів для food, bureaucracy, undead, beast, social, seasonal.

- [ ] **Add content safety tests for external IP names**
  Purpose: не пустити чужі бренди або персонажів у нові монстри.
  Likely files: future `tests/content/*.test.ts`, docs guide.
  Dependencies: authoring guide rules.
  Acceptance: є checklist або тестовий контракт, що ловить прямі external IP names.

- [ ] **Add monster flavor seed examples**
  Purpose: зробити deterministic routing зрозумілим для наступного Codex.
  Likely files: `docs/design/monster-flavor-routing.md`, `docs/design/monster-encounter-authoring-guide.md`.
  Dependencies: stable flavor selector shape.
  Acceptance: у документації є хоча б 3 seed-приклади та пояснення precedence.

- [ ] **Add encounter authoring QA examples**
  Purpose: показати, як виглядає хороший один-екранний encounter.
  Likely files: `docs/design/monster-encounter-authoring-guide.md`, `docs/design/bestiary.md`.
  Dependencies: current bestiary style.
  Acceptance: є приклади hook/action/result/loot/CTA для кількох монстрів.

## Do not implement yet

- [ ] **Add random loot engine**
  Purpose: поки що не потрібна повна таблиця випадкового луту.
  Likely files: future service/content modules.
  Dependencies: reward pacing, content tables.
  Acceptance: postponed until balance data says it реально потрібно.

- [ ] **Add shop and economy sink integration**
  Purpose: не роздувати економіку до того, як hunt стабільно працює.
  Likely files: future economy services, inventory services.
  Dependencies: reward tuning and equipment helper.
  Acceptance: deferred; only documented as later path.

- [ ] **Add PvP hunt variant**
  Purpose: PvP потребує окремих guardrails, а не спішного перетікання з hunt.
  Likely files: future combat and guild docs.
  Dependencies: persistent combat, matchmaking, anti-abuse.
  Acceptance: explicitly out of scope for this slice.

- [ ] **Add persistent hunt state schema**
  Purpose: не створювати зайву БД-модель, доки не доведено потребу.
  Likely files: future Prisma schema and migrations.
  Dependencies: confirmed runtime need.
  Acceptance: postponed until one-shot hunt перестане бути достатнім.

- [ ] **Add live group-chat monster broadcast mechanics**
  Purpose: не робити шумний chat spam engine раніше за group hook design.
  Likely files: future bot handlers and moderation docs.
  Dependencies: group hunt design and rate limiting.
  Acceptance: not implemented; only documented as future work.

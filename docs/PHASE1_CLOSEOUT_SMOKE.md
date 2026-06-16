# Phase 1 Closeout Smoke

Цей checklist — фінальна ручна рамка для `0.1.0` Phase 1 closeout. Він доповнює [docs/PLAYTESTING.md](PLAYTESTING.md), [docs/PHASE1_CLOSEOUT_0_1_TRANSITION.md](PHASE1_CLOSEOUT_0_1_TRANSITION.md) і [docs/PHASE1_RELEASE_NOTES.md](PHASE1_RELEASE_NOTES.md), але не замінює unit/integration tests.

## New Player

- [ ] `/start` створює одного пригодника; повторний onboarding callback не дублює персонажа.
- [ ] `/hero` показує рівень, XP, золото, HP, ману, характеристики й спорядження.
- [ ] `🗺️ Квести` надворі каже, що квести видають усередині.
- [ ] `🍺 Корчма` або `/tavern` відкриває залу.
- [ ] `/online` і `/look` показують approximate presence без точних timestamp-ів.
- [ ] `/adventure` із шаурмою idempotent і не дублює reward.
- [ ] Starter `/fight` для рівнів 1-2 лишається deterministic/idempotent.
- [ ] `/inventory` відкривається і нормально обробляє пусту або ранню торбу.
- [ ] `/news` показує актуальні player-facing вісті.

## Level 3+ Player

- [ ] `/fight` starts/resumes один active persistent fight.
- [ ] Атака змінює HP монстра і рухає хід.
- [ ] Class/special action коректно витрачає ману або показує low-mana state.
- [ ] Старий callback із попереднього ходу не мутує state повторно.
- [ ] Перемога grants small XP/gold/optional item один раз.
- [ ] Repeated terminal callback replay-ить той самий reward.
- [ ] Loss/flee/expired не дають full reward.
- [ ] HP/мана після terminal state збережені.
- [ ] 0 HP блокує новий бій із ясною rest guidance.
- [ ] `/hero` recovery copy пояснює HP 0 як паузу, а не soft-lock.
- [ ] `/equipment` змінює effective stats; новий бій використовує їх без hidden heal/refill.

## Mantok Chest

- [ ] Eligible count показується.
- [ ] Auto-pick preview перелічує 5 inputs і попереджає, що вони зникнуть.
- [ ] Auto confirm consumes 5 і creates 1 output.
- [ ] Repeated confirm не дублює output.
- [ ] Manual selection показує `x/5`.
- [ ] Manual confirm consumes selected 5 only.
- [ ] Equipped/priceless/protected/story items excluded.
- [ ] Stale selection або змінений inventory повертає safe error.

## Level 4+ / Yeger

- [ ] `/hunt` locked для рівнів 1-3.
- [ ] Рівень 4+ бачить `🧥 Єгерський куток`.
- [ ] `🏹 Взяти справу` idempotent і не дає reward.
- [ ] `👣 Вийти на слід` створює persisted tracking wait і не дає reward.
- [ ] Під час wait `/hunt` показує pending state.
- [ ] Після wait `/hunt` показує ready state.
- [ ] `🔎 Перевірити слід` або starts/returns valid unquiet target, або показує no-fight miss.
- [ ] Existing non-Yeger active fight не описується як неупокоєна ціль.
- [ ] Тільки won target fights рухають Єгерський progress.
- [ ] `5/5` turn-in grants one-time reward once.
- [ ] Старі `v1:hunt:*` callbacks safely refresh current Yeger screen.
- [ ] Ready Yeger trail + unrelated active fight не reset-ить trail cooldown; bot показує blocked copy і окремо рендерить поточний бій.

## Манчкін-скупник

- [ ] Preview показує selected eligible stacks, докладене золото, переплату, XP carry і рівень `N → N+1`.
- [ ] Confirm списує щонайменше одну eligible priced манатку й тільки потрібне wallet gold.
- [ ] Repeated confirm після успіху replay-ить той самий exchange і не списує вдруге.
- [ ] Stale preview до першого успіху не мутує gold/items/level.
- [ ] Gold-only з `1000+` золота denied: Манчкін вимагає хоча б одну оцінену манатку.
- [ ] Equipped/priceless/protected/story/zero-value/missing items excluded.
- [ ] `12 → 13` refused: 13 рівень лишається battle-only.
- [ ] Pending Бочка блокує open/preview/confirm callback-и Манчкіна.

## Barrel / Шинок / Presence

- [ ] Pending Бочка блокує adventure/fight/hunt/cellar reward actions.
- [ ] Pending Бочка блокує level-barter progression/spending action-и.
- [ ] Pending Бочка не переносить presence із Бочки через stale callbacks.
- [ ] Manual `🍺 Перевірити бочку` лишається fallback і не дублює reward.
- [ ] `🍻 Шинок` є окремою місциною, а `👀 Хто поруч` показує локальний зріз.
- [ ] Beer spending не створює золото з повітря.

## Public Site

- [ ] `/health` працює.
- [ ] `/news` або renders news, або fail-ить помітно, якщо `news.md` відсутній.
- [ ] Homepage loads.
- [ ] `/presence` групує по місцинах і не показує exact timestamps.
- [ ] `/version` після deploy показує `0.1.0`.

## Release Gate

Core loop:

- [ ] Новий гравець може отримати першу манатку за кілька хвилин.
- [ ] Level 3+ має real solo fight.
- [ ] Бій має attack, special/class action і flee.
- [ ] Бій використовує HP/ману і зберігає state.
- [ ] Equipment affects combat через shared effective stats.
- [ ] Victory grants XP/gold/item через idempotent reward path.
- [ ] Repeated callback не дублює reward.
- [ ] Inventory показує items і item details.
- [ ] Дружня Скриня працює як перший item sink.
- [ ] Level-up 1-13 видимий.
- [ ] HP/mana attrition/recovery зрозумілі.
- [ ] `/news`, changelog, roadmap, balance notes і playtesting docs відповідають runtime.

No scope creep:

- [ ] Нема shops/selling/trading/crafting.
- [ ] Нема item-instance inventory.
- [ ] Нема achievements runtime.
- [ ] Нема group raid architecture.
- [ ] Нема broad scheduler/job architecture.
- [ ] Нема нової feature track тільки тому, що вона звучить весело.

Release confidence:

- [ ] Full check passed або failure documented as local tooling issue.
- [ ] Manual smoke passed.
- [ ] Known debts documented in `0.1.x` backlog.
- [ ] Player-facing copy українською.
- [ ] Public-facing news avoids implementation details.

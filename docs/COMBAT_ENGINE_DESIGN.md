# Combat Engine Design — покрокові бійки Квестарні

Created: 12026-06-13
Status: evolving combat design source-of-truth; `0.1.21` ships the first action-foundation subset.
Scope: solo PvE combat first, with the shared primitive also reused by turn-based duels. Group raids, shops, trading, crafting, item-to-level sinks and full economy are future slices.

## Навіщо це потрібно

Квестарня вже має `/fight` як безпечну бойову перевірку, але це ще не справжній combat engine. Повний рушій має зробити бійки короткими, кнопковими, смішними й різними, щоб гравець відчував манатки, рівень, расу, клас і дивну корчмарську біографію без читання табличного мануалу.

Головна обіцянка: **один бій — це 2–5 змістовних натискань, маленька історія, видимі циферки й шанс на дурнувату манатку**. Не симулятор Excel, але й не одна кнопка «перемогти».

## Принципи

- **Telegram-first.** Один екран на мобільному, короткий лог останнього ходу, 3–6 кнопок максимум, деталі за запитом.
- **Fun-per-turn.** Кожен хід має дати шкоду, контроль, смішний провал, шанс на відкуп або нову проблему.
- **Коротко, але не пласко.** Звичайний ворог — 2–5 ходів. Елітний ворог — 4–7. Бос/рейд — окрема система.
- **Вплив персонажа без обовʼязкового build-а.** Рівень, манатки, раса, клас і combo мають відчуватися, але не створювати одну правильну збірку.
- **Без жорстких покарань.** Поразка або втеча не краде цінні речі. Можливий малий кулдаун, ремонтний жарт або втрата XP саме з цього бою.
- **Детермінований домен.** Telegram — тільки інтерфейс. Бій приймає plain objects, seed/RNG і повертає результат. Callback-и ідемпотентні.
- **Munchkin як смак, не як копія.** Дивні race/class/item взаємодії, відкуп манатками й абсурдна системність — так. Прямі назви, структури карт чи один-в-один механіки — ні.

## Бойовий цикл

### Start

1. Handler `/fight`, `/hunt` або кнопка зі Столу зі справами перевіряє, що персонаж існує, не в pending raid і не має активного combat session.
2. Сервіс створює `CombatSession`/row у `combats` зі snapshot-ом героя, ворога, seed, resource state і timeout policy.
3. Presenter показує intro: ворог, HP героя й ворога, 2–4 головні дії, кнопку втечі й коротку фразу про таймаут: «Якщо герой замислиться надовго, рука сама щось зробить».

### Один натиск = один раунд

Для Telegram краще не робити окремий асинхронний хід ворога після кожного натиску. Один callback гравця розвʼязує:

1. дію гравця;
2. можливий реактивний trait ворога;
3. дію ворога, якщо він живий і не stunned/controlled/fled/surrendered;
4. перевірку кінця бою;
5. наступний екран або фінальний результат.

Це лишає бій покроковим для гравця, але не змушує чекати два повідомлення на кожен раунд.

### Finish statuses

- `won` — ворог переможений, full reward roll.
- `lost` — герой програв, без втрати цінних речей, малий cooldown/repair joke.
- `fled` — герой утік, XP немає.
- `surrendered` — ворог віддав манатки/золото/інформацію, XP немає або сильно reduced, бо це не перемога в бою.
- `refused` — ворог відмовився битися через нюанс героя/ворога, віддав щось або відкрив інший outcome, XP немає.
- `expired` — гравець пропав надто надовго; бій тихо закритий, reward немає, текст мʼякий.

## Таймаути й auto-actions

Початкові значення:

```text
first_reaction_timeout = ~23 секунд
normal_turn_timeout = ~23 секунд у поточному solo/training foundation slice
elite_turn_timeout = 60 секунд
hard_session_expiry = 10-15 хвилин
max_auto_turns_before_escape_or_expire = 2
```

Точні timestamp-и не показувати. Player-facing текст має бути приблизним: «ще трохи», «корчмар уже дивиться», «герой замислився надто героїчно».

Timeout має бути **source-of-truth у service/domain**, а не в Telegram presenter-і:

1. При створенні/оновленні ходу в `stateJson` пишеться deadline поточного ходу. У `0.1.21` solo/training fights use `turnExpiresAt`; broader `missedTurns`/`autoTurnCount` ladders remain future work.
2. In-process timer може викликати `advanceCombatTimeout(combatId)` і надіслати повідомлення, але це best-effort.
3. Після restart/deploy будь-яка наступна команда/callback, яка бачить overdue combat, спочатку викликає lazy timeout advancement.
4. Повторний timeout call з тим самим `expectedTurnToken` нічого не дублює.

Auto-action ladder:

- **Якщо герой мовчить після старту бою приблизно 23 секунди:** service/domain спершу намагається безпечний auto-action з доступних, а не відразу прострочує бій. У типових випадках це `attack`, а якщо герой має мало HP або стоїть на `coward`-сценарії, можна підняти `guard` або `escape` як більш обережний варіант.
- **Перший пропущений хід:** у `0.1.21` service commits a canonical basic attack when the player returns to the battle surface or presses an expired combat callback. Smarter class-shaped auto-actions remain future work.
- **Другий пропущений хід:** guard або спроба втечі, залежно від HP і odds.
- **Третій пропущений хід або hard expiry:** `expired` або auto-flee з мʼяким текстом. Reward не видавати.

Auto-action може перемогти ворога, якщо це перший/другий auto turn і стан бою нормальний. Але combat із переважно auto-turns не має ставати фармом без участі.

## Дії гравця

```ts
type CombatActionKind =
  | 'physical'
  | 'spell'
  | 'trick'
  | 'social'
  | 'item'
  | 'guard'
  | 'escape'
  | 'class-special'
  | 'race-special';
```

Перший production slice не мусить одразу мати всі типи. Мінімум для відчуття:

- `physical` — стабільна атака від зброї/сили/рівня;
- `spell` або `class-special` — дія з маною/resource cost;
- `trick` або `social` — контроль, дебаф, surrender/refusal шанс;
- `guard` — захист і маленьке відновлення мани/позиції;
- `escape` — спроба втечі.

### Фізичні удари

Фізичні дії спираються на STR, DEX, weapon base і level coefficient. Вони завжди доступні, навіть якщо зброя відсутня: «вдарити тим, що не просили вдаряти».

Варіянти:

- `steady-hit` — менша варіянтність, добрий default.
- `heavy-hit` — більша шкода, нижчий hit chance або більший incoming risk.
- `quick-hit` — менша шкода, вищий crit/dodge next turn.

### Магія

Магія спирається на INT, mana, class tags і focus/weapon if magical. UI завжди показує cost: `🔮 -2 мани`.

Якщо мани не вистачає, callback не списує ресурс і не зсуває turn. Presenter показує clean fallback: «Мани забракло. Посох пропонує просто стукнути.» Кнопки: дешевший cantrip, guard, escape.

Маг без мани не безпорадний: має cantrip/poke/guard/trick.

### Прийомчики, social і trick

Це не «слабша атака», а інший тип корисности:

- debuff ворога: -attack, -armor, нижчий chance викликати друга;
- control: skip enemy reaction, short stun, silence trait;
- surrender/refusal route: ворог може віддати манатки без XP;
- loot setup: маленький bonus до loot roll тільки після перемоги, не миттєвий дублікат;
- escape setup: наступна втеча легша.

### Guard

```text
damage_reduction = 35-50% incoming damage this round
mana_recover = 1 або 2, якщо class supports focus
status_cleanup = шанс скинути minor debuff
```

Guard не має бути найкращою атакою. Це safety valve для low HP, no mana, timeout і навчання.

Guard має мати кілька тематичних форм, але один простий rules contract:

- зброя/щит/броня можуть дати стабільніший block;
- голі руки лишають fallback-захист, щоб герой без відповідної манатки не втрачав дію повністю;
- воїн, гном, домовик, орк-інтелігент, козак-характерник, жрець і важка броня можуть мати малий edge у block/counter;
- контратака має бути рідкісною, once-per-turn і тестованою, без шансів на подвійне спрацювання від repeated callback;
- guard не має безкоштовно лікувати або перетворювати бій на нескінченний stall.

### Cooldowns for skills

Сильні вміння не мають натискатися щохідно. `0.1.21` starts with ability-keyed cooldown state and keeps the current class actions on a short foundation rule: the class action becomes available after one subsequent own committed action. Longer milestone abilities can use larger cooldowns later.

UI має показувати причину недоступности без фрустрації:

```text
🔮 Печатка готується: ще 2 ходи.
Мани забракло. Посох пропонує просто стукнути.
```

Validation order: якщо вміння на cooldown або бракує мани, callback не списує ману, не зсуває turn і не відкриває новий monster response.

### Втеча

```text
escape_chance = clamp(0.45 + (DEX + LUCK - monster_level * 2) * 0.01 + modifiers, 0.25, 0.80)
```

Success: `fled`, XP немає, gold немає, короткий flavor. Fail: ворог отримує реакцію або половинний удар; fail не має бути смертним у навчальних боях.

#### Coward mode

Якщо ворог або сценарій позначені як `coward`, бій може раніше схилятись до втечі, а не до добивання. Це має бути окремий safety valve, а не гарантована вигідна кнопка:

- якщо герой отримав сильний тиск або low HP, auto-action може пробувати `escape` раніше;
- якщо ворог `coward` і боїться темпу героя, може здатися після першого чи другого пропущеного ходу;
- threshold для first flee attempt має бути явним у service-логіці й тестах, а не захованим у presenter-і;
- repeated auto-flee / timeout call не має дублювати ні шкоду, ні статус, ні reward.

## Вплив рівня

Рівень має бути реальним важелем, а не тільки числом у `/hero`:

- HP max і mana max ростуть через effective-stats helper.
- Damage/defense мають окремий level coefficient.
- Доступні вороги й rewards мають level bands.
- Lower-level monsters можуть частіше surrender/refuse проти явно сильнішого героя.

Milestones:

- lvl 1 — basic physical + class-flavored option + escape.
- lvl 2 — guard або перший дешевий trick.
- lvl 3 — перше class-special уміння.
- lvl 5 — race-special або combo flavor з малим ефектом.
- lvl 10 — перша альфа-віха: особлива репліка, title/board entry, маленьке signature upgrade.
- lvl 14-23 — епічний діапазон із milestone-ами, але не просто більші числа.

Milestone має бути data-driven, щоб presenter міг сказати «що змінилося» без hard-coded текстового пошуку.

## Вплив манаток

Манатки впливають через **один equipment/effective-stats helper**, а не через розкидані `if itemId === ...` у presenter-ах.

Слоти:

- `weapon` — physical base, damage tags, action unlocks. Magical weapon може бути focus, якщо явно tagged.
- `chest`/armor — виживання, armor/resist/guard, але не free damage.
- `accessory` — situational tiny modifier: escape, resource discount, specific enemy type, surrender flavor.
- `head`/`legs` — future vocabulary; не показувати як активні, доки нема контенту.
- `consumable` — окремий item action із кількістю, підтвердженням і idempotency.

`requiredLevel`, `allowedRaceIds`, `allowedClassIds`, optional hidden `path` selectors — content metadata, не presenter magic.

Безцінні й trophy-речі не дають stat effects, доки явно не переведені в equippable/effect item.

## Вплив раси

Расові ефекти мають бути малими, читабельними й симульованими.

- **Людисько** — універсальний tiny bonus до safe/default outcomes.
- **Гном** — захист, armor, guard, підземелля/крафт.
- **Ельф** — crit/dodge/точність.
- **Бісини** — trick/social/INT/CHA, плутають демонів і надто самовпевнені формулювання.
- **Дрантогор** — STR/LUCK, сильний перший charge або «я так і планував» swing.
- **Домовик** — корчма, льох, дрібний лут, guard.
- **Русалка сухопутна** — magic/CHA/control, взаємодії з водою, чайниками й dry jokes.
- **Орк-інтелігент** — STR + INT, bonk із цитатою, edge проти straightforward і бюрократичних монстрів.
- **Мольфарська душа** — LUCK/magic/time-of-day/weather hooks, omen-style rerolls або tiny resist.

## Вплив класу

| Клас | Бойова фантазія | Приклади дій |
| --- | --- | --- |
| Воїн | стабільна шкода, витримка | `steady-hit`, `guard-break`, `shield-brace` |
| Маг | burst/control за ману | `spark`, `arcane-poke`, `small-stun`, cantrip без мани |
| Бард | debuff/social, chaos crit | `song-of-inconvenience`, `false-finale`, `mocking-chord` |
| Злодій | crit, ухилення, setup loot | `cheap-shot`, `pocket-sand`, `loot-mark` |
| Жрець | sustain/protection, anti-undead | `blessed-bonk`, `small-heal`, `ward` |
| Вареник-мант | food magic, self-heal, sticky control | `dough-snare`, `broth-heal`, `dumpling-smite` |
| Бюрокромант | печатки, дозволи, знерухомлення | `form-13-b`, `temporary-refusal-stamp`, `audit-stun` |
| Єгер | пастки, mark, beast bonus | `snare`, `mark-prey`, `ranger-shot` |
| Козак-характерник | контратаки, вдача, містика | `luck-counter`, `whirl-step`, `charmed-parry` |

## Hidden path

`path` (`sun`, `moon`, `boundary`) лишається внутрішнім selector-ом корчмарської анкети. `0.1.16` дає йому small derived effective-stat bonus, але не показувати ці назви або exact bonus breakdown гравцю.

Дозволені застосування: flavor рядки, rare item restrictions із in-world поясненням, NPC reactions, dreams/omens, seasonal selectors, відмова ворога від бою через «папери не так лежать», але без згадки internal path name.

Заборонено: `+10% damage because sun path`, player-facing «Ваш шлях: boundary», onboarding/remort preview exact path mechanics, біологічні або essentialist пояснення.

## Вороги й AI

```ts
interface MonsterDefinition {
  id: string;
  levelBand: { min: number; max: number };
  hpBase: number;
  attackBase: number;
  armor: number;
  resist?: number;
  tags: string[];
  traits: MonsterTrait[];
  personality: MonsterPersonality;
  rewards: RewardProfile;
}
```

Personality archetypes:

- `brave` — бʼється до кінця, мало surrender.
- `coward` — може втекти або відкупитися після сильного удару.
- `greedy` — реагує на манатки, bribe, shiny items.
- `bureaucratic` — чутливий до бюрокроманта, печаток, чеків, форм.
- `hungry` — реагує на food magic, шаурму, вареник-манта.
- `summoner` — може покликати друга/подругу/кума.
- `trickster` — карає repeated same action, любить counter-trick.
- `undead` — вразливий до жреця, байдужий до частини social checks.
- `beast` — єгер має зрозумілий edge.

Monster actions мають бути простими, але не однаковими. Кожен ordinary monster у майбутньому combat-variety slice має отримати хоча б одну дію поза basic attack: guard, heavy wind-up, weak debuff, small self-shield, once-per-fight skill, surrender cue або backup call. Це має жити в content/domain data, не в presenter-і.

### Context snapshots and barks

`0.1.21` adds the first contextual texture layer for persistent monster fights without adding monster abilities yet:

- combat start builds one `Europe/Kyiv` world snapshot from the service clock, location tags and party size;
- the snapshot is stored in `CombatState.context` and must not be recomputed on resume, replay or when the real clock crosses a boundary mid-fight;
- a monster can apply at most two authored `contextTraitIds`; effects are small, capped and restricted to combat stats such as damage multipliers, accuracy/evasion deltas and flat armor/resist/dexterity nudges;
- context never changes encounter eligibility, Yeger matching/progress, XP, gold, loot, authored level or stored reward replay;
- monster barks live in content/domain data, not presenter code; turn summaries store a `monsterBarkId`, and presenters resolve that stable id to Ukrainian copy.

The current implementation adapts the package data to the existing monster roster. It does not import the future 93-monster roster expansion.

## Відмова, здача і backup

### Ворог відмовляється битися

Умови можуть включати: гравець суттєво вищого рівня; class/race combo налякав або юридично збив ворога; на герої вдягнена тематична манатка; ворог має `coward`, `bureaucratic`, `greedy` або special trait; гравець обрав social/trick дію і пройшов check.

Outcome: `refused` або `surrendered`, XP немає, можна дати золото, junk, clue, reputation note або маленьку манатку. Текст має чітко сказати: «це не перемога в бою, тому досвіду нема».

Приклад:

> Гоблін з Excel дивиться на вашу печатку, блідне комірками й кладе на стіл `Скріпку службового страху`. Битися він відмовляється: «У мене формула не сходиться». XP: 0.

### Ворог кличе друга чи подругу

Trait `callsBackup`:

- trigger: HP < 50%, third round, failed player trick або specific monster tag;
- cap: максимум 1 extra enemy у solo MVP;
- friend має просту роль: extra attack, shield, heal або distraction;
- friend не подвоює rewards автоматично;
- presenter показує подію одним рядком.
- repeated або stale callback не може прикликати того самого помічника вдруге;
- target selection у solo MVP має лишатися простим: basic attack бʼє головного ворога, а підмога впливає одним маленьким рядком у turn log.

Приклад:

> Слизь невиконаних обіцянок пищить дедлайном. З-під столу вилазить ще одна, менша, але з календарем.

### Ворог здається

Surrender відрізняється від refusal: refusal може статися до фактичного бою, surrender — у середині бою після шкоди/control/social pressure. Для MVP краще почати з автоматичного surrender outcome без морального дерева, щоб не роздувати UX.

## Формули v0

```text
physical_damage = max(1, weapon_base + floor(STR * 0.65) + floor(level * 1.2) + action_bonus - target_armor)
spell_damage    = max(1, spell_base + floor(INT * 0.80) + floor(level * 1.1) + focus_bonus - target_resist)
trick_power     = floor((DEX + CHA + LUCK) / 3) + floor(level * 0.8) + action_bonus
hit_chance      = clamp(0.85 + (attacker_DEX - defender_DEX) * 0.01 + action_hit_mod, 0.70, 0.95)
crit_chance     = clamp(0.05 + DEX * 0.003 + LUCK * 0.002 + item_mod, 0.05, 0.25)
crit_multiplier = 1.5
monster_damage  = max(1, attack_base + floor(monster_level * 0.9) + trait_bonus - player_armor_or_guard)
```

Guardrails:

- Звичайний equal-level win rate: 75–90%.
- Average turns: 2–5.
- Клас/раса outlier: не більше ~15% win-rate над/під середнім у звичайних боях без поясненого matchup-а.
- One rare item не має ставати обовʼязковим для нормального progress.

## Rewards

Victory: XP, золото, loot roll, optional collection/joke badge, level-up check через progression helper.

Surrender/refusal: XP 0 або very small social XP only if later explicitly designed; reward budget нижчий за перемогу.

Flee/loss/expired: no XP/gold/items, no valuable item loss. Loss може мати repair joke або small cooldown. Expired — no reward і no shame text.

## UI contract

Turn screen:

```text
⚔️ Мімік-шаурма свариться начинкою

❤️ Ви: 18/24   🔮 7/12
🌯 Мімік: 11/18

Минулого ходу: Пательня переконання сказала «дзень», і це було аргументовано. -5 HP.
Мімік готується бризнути соусом.

Оберіть дію. Якщо герой зависне, рука сама щось утне.
```

Buttons:

```text
[🗡 Вдарити пательнею]
[🔮 Іскра з рукава -2 мани]
[🧾 Збити чеком]
[🛡 Пригнутись за столом] [🏃 Втекти]
```

Stale callback не змінює combat state, відповідає коротко й показує актуальний стан. Spell with no mana не списує ману й не споживає хід. No active combat дає кнопку назад до Столу зі справами.

## Data model

```ts
interface CombatStateV1 {
  version: 1;
  seed: string;
  turn: number;
  expectedTurnToken: string;
  status: 'active' | 'won' | 'lost' | 'fled' | 'surrendered' | 'refused' | 'expired';
  phase: 'player-turn' | 'finished';
  createdAt: string;
  updatedAt: string;
  nextTimeoutAt: string;
  hardExpiresAt: string;
  missedTurns: number;
  autoTurnCount: number;
  player: CombatActorState;
  enemies: CombatEnemyState[];
  effects: CombatEffect[];
  actionLog: CombatLogEntry[];
  reward?: MaterializedCombatReward;
}
```

Resource state must store current HP/mana inside combat session. Do not keep treating current HP/mana as automatically full once persistent combat ships.

Callback data має бути коротким:

```text
v1:cbt:a:{token}:{actionCode}
v1:cbt:i:{token}:{itemCode}
v1:cbt:f:{token}
```

`token` maps to active combat id + expected turn. Always validate ownership, active status, expected turn and action availability server-side.

## Idempotency and transactions

Mutation path:

1. load active combat row for update;
2. validate character ownership and expected turn;
3. if already resolved, return current state without mutation;
4. resolve action using deterministic RNG/state;
5. write new `stateJson` and status;
6. if finish, materialize reward exactly once;
7. update character XP/gold/items/resources in the same transaction or through a single idempotent reward claim.

Suggested keys:

```text
combat:{combatId}:turn:{turn}:action:{actionCode}
combat:{combatId}:timeout:{turn}
combat:{combatId}:finish
combat:{combatId}:reward
```

Never let repeated callback reroll damage, loot, surrender, backup call, XP or gold.

## Content examples

- **Мімік-шаурма** — `mimic`, `food`, `trickster`, `starter`; vulnerable to receipt/bureaucracy/social confusion.
- **Гоблін з Excel** — `bureaucratic`, `coward`, `humanoid`; refuses Bureaucramancer paperwork combos; may call another accountant.
- **Слизь невиконаних обіцянок** — `slime`, `deadline`, `summoner`; splits/calls friend at low HP.
- **Скелет-вахтер** — `undead`, `guard`, `night`; stronger at night, weak to Жрець, can refuse Домовик in корчмі.

## Implementation slices

1. **Domain combat state and action catalog.** `src/domain/combat/`, pure resolver, deterministic tests.
2. **Persistent solo combat sessions.** `combats` model, `combatService`, one active combat per character, HP/mana inside state.
3. **Telegram UI and callback parser.** Short callback tokens, `/fight` starts/resumes active combat.
4. **Timeout and auto-actions.** In-process timer with lazy fallback; no Redis/BullMQ dependency for first slice unless already present.
5. **Equipment/effective-stats integration.** One helper for level + base stats + equipment snapshot.
6. **Monster personalities and special outcomes.** Refusal/surrender/callsBackup traits and simulation guardrails.

## Testing checklist

- Domain formulas deterministic with fake RNG.
- Same callback twice does not change state twice.
- Stale action for old turn returns current state.
- Spell with no mana does not spend turn.
- Auto-timeout for same turn is idempotent.
- First auto action can finish; repeated auto farm expires/no reward.
- Surrender/refusal gives no XP.
- Backup call caps at one extra enemy in solo MVP.
- Equipment effects only from intended metadata.
- Race/class/path flavor does not leak hidden path names.
- Simulations: levels 1–13, all classes, all races, at least day/night phases.

## Definition of Done

A combat-engine PR is done only when:

- player can start/resume one active solo combat;
- each turn has several meaningful action choices;
- mana/resource cost is visible and safe;
- timeout/auto-action behavior is deterministic and idempotent;
- race/class/level/equipment influence comes through central helpers;
- refusal/surrender/backup are content traits, not hard-coded presenter hacks;
- normal fights average 2–5 turns in simulations;
- no valuable item loss, no gold steal, no pay-to-win path;
- docs and Codex prompt are updated with what shipped and what did not.

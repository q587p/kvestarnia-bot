# Battle Interventions — Витівка Прилавка

Цей документ фіксує майбутню механіку стартового втручання в solo-бій. Вона взята з локального planning archive `kvestarnia-battle-interventions-archive.zip` і лишається backlog-ом, не runtime-фічею поточного PR.

## Мета

Перед першим ходом eligible бою гравець отримує маленький стратегічний вибір:

1. **Підмога** — монстр стає слабшим, але нагорода нижча.
2. **Без витівок** — стандартний бій і стандартна нагорода.
3. **Перець** — монстр стає сильнішим, але за перемогу потенційно кращі XP і манатки.

Це не повний difficulty system і не соціяльний рейд. Це маленька корчемна ставка, яка дає гравцю контроль над ризиком без перебудови бойового рушія.

## In-world source

Рекомендована сутність: **Припічник**.

Припічник — малий дух корчемної печі, який живе поміж жаром, крихтами, старими борговими серветками й чужими героїчними перебільшеннями. Він не друг і не ворог. Він просто любить, коли бій «має смак».

Чому не сам Корчмар:

- Корчмар лишається стабільним ведучим, провідником і обличчям корчми.
- Припічник пояснює абсурдну, але казково-логічну зміну рівня монстра.
- У майбутньому це відкриває шлях до допомоги/завади від інших гравців, а Припічник лишається системним fallback-варіянтом.

## UX flow

Показувати тільки на старті eligible бою: після intro монстра і перед першою бойовою дією.

```text
З-за печі виглядає Припічник і міряє монстра ложкою.
«Можу трохи підсобити. А можу досипати перцю. Без образ, я за драму».
```

Кнопки:

```text
🕯 Підмога (-3 рів.)
🍺 Без витівок
🌶 Перець (+2 рів.)
```

Явніший варіянт для тестів, якщо короткі кнопки плутають:

```text
🕯 Легше: -3 рів., менше нагороди
🍺 Як є
🌶 Важче: +2 рів., краща нагорода
```

Після вибору показати короткий наслідок:

```text
🕯 Припічник шепоче у тріщину підлоги. Монстр раптом забуває половину страшних поз.
Рівень монстра: 7 → 4. Нагорода буде скромніша.
```

```text
🌶 Припічник досипає бойового перцю. Монстр стає впевненішим, ніж треба.
Рівень монстра: 7 → 9. За перемогу буде більше досвіду і кращий шанс на манатку.
```

Якщо гравець нічого не натиснув до стартового таймауту, safe default — `none`. Ніколи не auto-select `hinder`.

## MVP numbers

Рекомендована пара:

```ts
helpDelta = -3;
hinderDelta = +2;
```

Причини:

- `-3` відчутно допомагає, але не стирає бій повністю.
- `+2` дає ризик і простір для кращої нагороди, але не є пасткою на рівному місці.
- `±5` лишити на майбутні особливі події, високорівневі ставки або test mode.

## State model

Не мутувати базового монстра. Базовий і ефективний рівень мають жити окремо.

```ts
type BattleInterventionKind = "help" | "none" | "hinder";

type BattleIntervention = {
  kind: BattleInterventionKind;
  sourceType: "system";
  sourceKey: "prypichnyk_v1";
  levelDelta: -3 | 0 | 2;
  chosenAtTurn: 0;
};

type BattleMonsterLeveling = {
  baseLevel: number;
  effectiveLevel: number;
  intervention?: BattleIntervention;
};
```

Розрахунок:

```ts
const effectiveMonsterLevel = clamp(
  baseMonsterLevel + levelDelta,
  1,
  maxAllowedMonsterLevelForBattle
);
```

Для MVP max cap може бути `playerLevel + 8` або наявний cap генератора encounter-ів.

Усі бойові стати монстра беруть `effectiveLevel`; назва, опис, tags і базова ідентичність монстра не змінюються.

## Reward modifiers

Гравець має бачити trade-off:

- підмога робить бій легшим і зменшує reward;
- перець робить бій важчим і підсилює reward, якщо гравець переміг;
- перемога над монстром із `effectiveLevel > playerLevel` має давати мʼяку позитивну XP-надбавку.

Рекомендовані MVP-множники:

```ts
const INTERVENTION_REWARD_MULTIPLIERS = {
  help: {
    xp: 0.75,
    gold: 0.85,
    rareLootChance: 0.65,
    lootPowerOffset: -1
  },
  none: {
    xp: 1.0,
    gold: 1.0,
    rareLootChance: 1.0,
    lootPowerOffset: 0
  },
  hinder: {
    xp: 1.2,
    gold: 1.05,
    rareLootChance: 1.35,
    lootPowerOffset: 1
  }
};
```

Overlevel XP:

```ts
const overlevel = Math.max(0, effectiveMonsterLevel - playerLevel);
const overlevelXpMultiplier = clamp(1 + overlevel * 0.06, 1.0, 1.36);
```

Якщо поточна XP-формула вже сильно масштабується від рівня монстра, ця надбавка має бути ще мʼякшою.

## Reward summary copy

```text
Підмога Припічника зробила бій легшим, тож нагорода скромніша.
```

```text
Без витівок: стандартна нагорода.
```

```text
Перець Припічника зробив бій важчим, тож досвіду більше, а шанс на добру манатку вищий.
```

```text
Ти переміг монстра вищого рівня. Досвід отримує бойову надбавку.
```

## Eligibility

Увімкнути тільки для regular solo/random fights.

Вимкнути для:

- tutorial fight;
- story bosses;
- fixed-level/scripted encounters, де рівень має драматичний сенс;
- fixed-reward encounters;
- PvP, group, social fights, доки немає правил stacking-а;
- боїв, де reward вручну прописаний і не має проходити через level-aware pipeline.

Бажаний future flag на encounter template:

```ts
allowInterventions?: boolean;
```

Default: ordinary solo fights can allow; special fights мають явно opt in або opt out згідно з архітектурою.

## Callback and idempotency

Вибір можна зробити рівно один раз до першої бойової дії.

Вимоги:

- callback data містить battle id/token і selected kind, але не reward/level numbers;
- owner check обовʼязковий;
- battle має бути active і в pre-first-turn phase, наприклад `awaiting_intervention`;
- duplicate callback не застосовує delta вдруге;
- callback після старту/завершення бою відповідає коротко й не мутує state;
- timeout default to `none`;
- repeated timeout call не дублює state transition.

Error copy:

```text
Це не твій бій. Припічник робить вигляд, що тебе не почув.
```

```text
Витівку вже обрано. Припічник не любить, коли ложку смикають двічі.
```

```text
Запізно: бій уже пішов у хід. Припічник ховає перець до наступного разу.
```

```text
У цьому бою Припічник не втручається. Каже, сюжет не дозволяє.
```

## Future compatibility

Проєктувати як `intervention slot`, не як hardcoded Припічник-only if.

MVP:

```ts
type BattleInterventionSourceType = "system";
```

Майбутнє:

```ts
type BattleInterventionSourceType = "system" | "player" | "event";
```

Rules:

- system help, friend help, monster hindrance і event modifiers не мають нескінченно stack-атися;
- потрібні `maxTotalNegativeDelta` і `maxTotalPositiveDelta`;
- social help/hinder має мати opt-in, ownership checks, anti-abuse caps і не має давати спосіб фармити чужі бої.

The future player-help slice is intentionally narrower than a raid: one fight owner may invite at most two nearby helpers, each helper must explicitly accept, and the shared roster freezes at 2–3 total participants. This should add participants to a shared encounter rather than silently changing the monster's level or reward multiplier.

## Implementation slices

### PR 1 — Docs and pure formulas

- Add constants/config.
- Add pure functions:
  - `getEffectiveMonsterLevel`;
  - `getInterventionChoiceConfig`;
  - `getOverlevelXpMultiplier`;
  - `isBattleEligibleForIntervention`.
- Add unit tests.
- No Telegram UI yet.

### PR 2 — Start-of-battle UI

- Add pre-first-turn intervention phase.
- Add inline keyboard.
- Add callback parser/handler.
- Default to `none` on timeout.
- Store intervention in battle state.

### PR 3 — Reward and loot integration

- XP/gold/loot use intervention modifiers.
- Result summary explains reward shift.
- Add integration tests for lower/higher rewards.

### Future PR 4 — Opt-in player help

- Add a private owner-to-nearby-player invitation from an eligible active monster fight.
- Accept at most two helpers, with ownership, presence, combat-lock, remort-life and encounter-type checks.
- Freeze a 2–3 participant roster and reuse the shared round/journal/replay contract.
- Keep helper rewards bounded and explicit; no automatic loot multiplication or public matchmaking.
- Add stale/duplicate/expiry/leave/timeout and fourth-player regression coverage.

For a small MVP, PR 1 and PR 2 can be combined, but do not mix this with a broad combat-engine rewrite.

## Tests to require

Unit:

- `help` maps to `-3`, `none` to `0`, `hinder` to `+2`;
- effective level clamps at `1`;
- effective level respects upper cap;
- reward modifiers match MVP constants;
- overlevel XP is `1.0` when effective monster level <= player level;
- overlevel XP grows and caps above player level;
- eligibility excludes tutorial/story/fixed reward/social battles.

Integration:

- eligible battle starts in intervention selection phase;
- help lowers effective monster level and then starts combat;
- hinder raises effective monster level and then starts combat;
- none preserves level;
- timeout chooses none;
- other user callback rejected;
- duplicate callback idempotent;
- reward after help lower than standard equivalent;
- reward after hinder higher than standard equivalent and capped.

Copy:

- button labels fit Telegram width;
- Ukrainian copy does not hide reward trade-off behind jokes;
- no English user-facing leftovers except technical ids in docs/tests.

## Definition of Done

- Start-of-battle intervention keyboard appears only for eligible battles.
- Player can choose exactly once before first combat action.
- Timeout defaults to `none`.
- Base and effective monster levels are tracked separately.
- Combat stats use effective monster level.
- Rewards use intervention modifiers.
- XP has a capped positive multiplier for defeating a higher effective-level monster.
- Манатки are weaker after help and potentially better after hinder.
- Tutorial/story/fixed reward/social fights are excluded.
- Tests cover pure functions, callbacks, idempotency, rewards and eligibility.
- User-facing copy is Ukrainian and consistent with Квестарня’s tone.

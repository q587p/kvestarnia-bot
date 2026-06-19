# Quest Resolution Variety

## 1. Проблема

Поточний level 3+ adventure loop добре вирішує вибір **яку** справу взяти: персонаж отримує три deterministic проблеми на 93-хвилинний період, а пул уже вміє підмішувати race/class/title-сцени.

Слабке місце починається після вибору справи. Усі проблеми використовують одну глобальну трійку:

- `safe`;
- `flair`;
- `risky`.

Клас змінює переважно label середньої кнопки, але зміст дії не народжується зі сцени. Outcome теж має два універсальні маршрути: «справу закрито» або «справа вкусила й покликала бій». Через це 24 різні заголовки швидко відчуваються як одна система з переставленими іменниками.

Старі starter-сцени вже підказують кращий напрямок:

- шаурму можна тицьнути, попросити чек або відступити;
- мишу можна ловити сиром, вимітати або переконувати;
- кнопки та короткі outcome-вставки іноді реагують на race/class.

Наступний крок — не додати ще більше generic flavor, а зробити **контентно визначені методи розв’язання**.

## 2. Дизайн-цілі

### 2.1. Кожна справа має власні дієслова

Не «зробити обережно», а:

- підписати угоду з бочкою;
- переспівати казанок;
- підкупити двері чайовими;
- спіймати брехню дзеркала;
- витрусити слід із килима;
- викликати шолом на перевірку подвигів.

Гравець повинен розуміти сцену вже з кнопок.

### 2.2. Біографія змінює доступний спосіб дії

Для вибраної справи гравець бачить:

1. **Ситуаційну опцію** — авторський neutral fallback цієї конкретної сцени.
2. **Расову опцію** — спосіб, що випливає з race motif.
3. **Класову опцію** — спосіб, що використовує класову техніку або профіль уже наявного combat skill.
4. **Signature-опцію** — точна race+class комбінація; current title впливає на label/outcome й може мати explicit override.

У компактних starter-сценах можна лишати три кнопки, але resolver усе одно має побудувати race/class/signature candidates і обрати три без дублювання наміру. Для level 3+ справ рекомендовано чотири кнопки.

### 2.3. Методи відрізняються не лише шансом

Два методи не мають бути тією самою перевіркою з різними емоджі. Вони можуть відрізнятися:

- primary/secondary stat;
- technique/skill affinity;
- базовою ймовірністю;
- reward profile;
- реальним gold cost для підкупу;
- типом ускладнення;
- доступними item outcomes;
- текстом strong/success/mixed/complication.

### 2.4. Стати мають значення, але не визначають «правильний білд»

STR/DEX/INT/CHA/LUCK впливають на перевірку. Race/class/signature дають невеликі bounded modifiers. Жодна опція не має бути гарантованою, і жоден персонаж не має залишатися без атмосферного варіанта.

### 2.5. Ускладнення мають бути різними

Не кожна невдача породжує монстра. Сцена може:

- перейти в existing persistent fight;
- закритися з половинною винагородою й кумедним безладом;
- забрати домовлені чайові, але все ж спрацювати;
- дати XP без золота;
- не видати item;
- завершитися косметичним «боргом», соромом або репутаційною плямою без нового persistent state.

Негативний outcome усе одно має давати сцену й жарт, а не порожню відмову.

### 2.6. Рішення мають бути replay-safe

Повторний callback:

- не дає другу винагороду;
- не списує gold cost вдруге;
- не reroll-ить outcome;
- не запускає другий fight handoff;
- або відтворює той самий stable result, або показує безпечний already-completed state.

## 3. Новий player flow

### 3.1. Екран трьох справ

Лишається майже без змін:

- три deterministic різні проблеми;
- хоча б одна персоналізована problem candidate, коли вона існує;
- компактний title + client line;
- 93-хвилинний period і dev reroll лишаються.

Персоналізація на цьому екрані відповідає за **те, які справи прийшли**. Новий resolver відповідає за **як саме герой може їх розв’язати**.

### 3.2. Екран вибраної справи

Приклад структури:

```text
📌 Бочка вимагає орендну угоду

На бочці зʼявився папірець…

Можливі способи:
🪵 Перевірити клепки й знайти справжнього мешканця
🧬 [Домовик] Виставити порожнечі рахунок за підпілля
🎭 [Бюрокромант] Оформити форму 13-Б на нежилу тару
🏷️ [Архівний Дух] Визнати бочку тимчасовим відділенням архіву

Корчмар: «Метод ваш. Наслідки, як завжди, уже чиїсь».
```

Позначки `[Домовик]` у player-facing тексті не обов’язкові. Краще використовувати емоджі та природний label. У dev/debug presenter можна показувати source.

### 3.3. Qualitative hints

Не показувати точні формули або відсотки у звичайному UI. Під текстом сцени можна коротко описати методи:

- `надійний, скромна винагорода`;
- `ваша сильна сторона, звичайна винагорода`;
- `непевний трюк, щедріший результат`;
- `коштує 2 золота, зате проблему легше переконати`.

Hint є властивістю методу, а не глобального safe/medium/risky tier.

## 4. Content model

Рекомендований поділ:

- `src/content/questResolution.ts` — типи, technique registry, race/class/signature profiles;
- `src/content/adventureResolutionContent.ts` — methods/outcomes для level 3+ problems;
- `src/content/starterQuestResolutionContent.ts` — шаурма й миша або adapters над тим самим contract;
- `src/domain/quests/questChecks.ts` — pure deterministic check math;
- `src/domain/quests/questMethodResolver.ts` — pure selection/coverage/deduplication;
- service layer — persistence, costs, claim, fight handoff;
- presenter — тільки готові labels/hints/outcome beats.

### 4.1. Базові типи

```ts
export type QuestMethodSource =
  | "scene"
  | "race"
  | "class"
  | "signature"
  | "title";

export type QuestTechniqueId =
  | "force"
  | "finesse"
  | "arcana"
  | "investigation"
  | "persuasion"
  | "deception"
  | "authority"
  | "performance"
  | "tracking"
  | "traps"
  | "ritual"
  | "craft"
  | "domesticity"
  | "bribery"
  | "improvisation";

export type QuestResolutionGrade =
  | "strong-success"
  | "success"
  | "mixed-success"
  | "complication";

export type QuestConsequenceKind =
  | "full-reward"
  | "reduced-reward"
  | "xp-only"
  | "gold-cost-success"
  | "fight-handoff"
  | "cosmetic-mess";

export interface QuestCheckSpec {
  primaryStat: StatKey;
  secondaryStat?: StatKey;
  techniques: QuestTechniqueId[];
  baseChance: number;
  classAffinity?: number;
  raceAffinity?: number;
  signatureAffinity?: number;
}

export interface QuestMethodDefinition {
  id: string;              // compact stable id inside this scene
  source: QuestMethodSource;
  label: string;
  hint: string;
  intent: "fight" | "negotiate" | "deceive" | "bribe" | "investigate" | "ritual" | "craft" | "sneak";
  check: QuestCheckSpec;
  rewardProfile: "modest" | "standard" | "generous";
  goldCost?: number;
  combatSkillId?: string;
  consequenceByGrade: Record<QuestResolutionGrade, QuestConsequenceKind>;
  outcomeText: Record<QuestResolutionGrade, readonly string[]>;
}

export interface QuestResolutionScene {
  sceneId: string;
  methods: readonly QuestMethodDefinition[];
  raceOverrides?: readonly QuestMethodOverride[];
  classOverrides?: readonly QuestMethodOverride[];
  comboOverrides?: readonly QuestMethodOverride[];
  titleOverrides?: readonly QuestMethodOverride[];
}
```

Це illustrative shape, а не вимога буквально копіювати кожне поле. Важливий контракт: method є контентною одиницею, а не одним із трьох глобальних tier ids.

### 4.2. Stable method identity

Callback повинен передавати compact method key, наприклад:

```text
v2:adv:a:<period>:<problem>:<method>
```

Обмеження:

- загальна довжина до 64 bytes;
- `problemId` і `methodId` мають бути allowlisted;
- старі `v1:adv:a:*:*:safe|flair|risky` не повинні завершувати нову справу; вони відкривають актуальний problem/offer або stale-safe screen;
- starter callback ids можна лишити сумісними, якщо action id зберігає сенс, або додати versioned parser з refresh для legacy.

### 4.3. Method slot resolver

Для level 3+ selected problem resolver повертає до чотирьох методів:

1. `scene` — один унікальний neutral method;
2. `race` — method, сумісний із race motifs героя;
3. `class` — method, сумісний із class techniques;
4. `signature` — exact combo override або composed race+class method, із title flavor override за наявності.

Правила deduplication:

- різні buttons не можуть мати однаковий `intent + primaryStat + normalized label`;
- signature не копіює class label із заміненим одним іменником;
- якщо race і class природно ведуть до одного intent, один із них бере alternate technique цієї сцени;
- не більше двох methods з однаковим primary stat;
- при неможливості зібрати чотири справді різні методи додати другий `scene` method, а не показувати декоративний дубль.

### 4.4. Combo і title

Exact combo identity має будуватися з `raceId + classId`, не з player-facing title text. Title може:

- змінити label;
- додати outcome-line;
- вибрати explicit override для канонічних титулів;
- дати малий signature affinity.

Title не повинен бути primary key механіки, бо він залежить від pronoun forms і може змінюватися редакційно.

## 5. Check resolution

### 5.1. Джерело статів

Використовувати той самий canonical effective-stat pipeline, який уже використовують profile/combat/equipment. Не складати race/class/item bonuses вручну в quest service.

### 5.2. Рекомендована формула

```text
chance = baseChance
       + primaryStatBonus
       + secondaryStatBonus
       + classAffinity
       + raceAffinity
       + signatureAffinity
       + smallLuckAdjustment
       + boundedEquipmentAffinity
```

Guardrails:

```text
primaryStatBonus   = clamp((primary - 5) * 3, -9, +18)
secondaryStatBonus = clamp(secondary - 5, -3, +6)
classAffinity      = 0..6
raceAffinity       = 0..4
signatureAffinity  = 0..3
smallLuckAdjustment = clamp(floor((luck - 5) / 2), -2, +4)
boundedEquipmentAffinity = 0..2 (можна лишити 0 у першому slice)
final chance       = clamp(chance, 45, 88)
```

Точні коефіцієнти можна підкрутити симуляцією, але caps і відносна вага важливіші за конкретні числа.

### 5.3. Deterministic roll

```text
seed = quest-resolution-v1
     + characterId
     + period/storage key
     + sceneId
     + methodId
```

Не використовувати `Math.random()` у presenter/service. Roll має бути pure/testable й стабільним для повторного callback.

### 5.4. Grade bands

При `roll` у діапазоні 1..100:

```text
strongSuccessThreshold = max(5, floor(chance * 0.20))

roll <= strongSuccessThreshold  -> strong-success
roll <= chance                  -> success
roll <= min(96, chance + 15)    -> mixed-success
else                            -> complication
```

Strong success не мусить давати більше power; головна нагорода — кращий authored outcome. Якщо потрібний bonus, максимум `+1 XP` або cosmetic item note і тільки idempotently.

### 5.5. Що бачить гравець

Production UI не показує `67%`. Він показує qualitative band, розрахований із final chance:

- `дуже непевно`;
- `непевно`;
- `добрі шанси`;
- `майже надійно`.

Exact chance дозволений у local dev trace/tests.

## 6. Reward і consequence profiles

Щоб не роздути economy, зберегти приблизний поточний envelope:

| Profile | Full reward | Типовий контекст |
|---|---:|---|
| modest | 4 XP / 2 gold | розслідування, обережна угода |
| standard | 7 XP / 4 gold | класова/расова сильна сторона |
| generous | 10 XP / 7 gold | ризиковий трюк, бійка, складний обман |

Це не означає, що кожна сцена мусить мати всі три профілі.

### 6.1. Strong success

- full reward;
- authored strong outcome;
- optional tiny flavor-only flourish;
- existing item grant лише якщо method явно його визначає.

### 6.2. Success

- full reward;
- normal authored outcome.

### 6.3. Mixed success

- `ceil(xp * 0.5)` і `floor(gold * 0.5)` або `xp-only`, залежно від method;
- без bonus item;
- справа закрита, але лишає сценічний безлад.

### 6.4. Complication

Method визначає consequence:

- `fight-handoff`: без immediate reward, existing persistent fight; якщо fight не стартує, claim/cost не витрачаються;
- `reduced-reward`: мала consolation reward і authored mess;
- `xp-only`: досвід є, золото втекло разом із гідністю;
- `gold-cost-success`: підкуп спрацював, але заплачене не повертається;
- `cosmetic-mess`: no power penalty, але окремий memorable result.

Не вводити в цьому slice:

- item loss;
- negative XP;
- зниження рівня;
- довгі punitive cooldowns;
- випадкове списання великого золота;
- нову бойову систему.

## 7. Підкуп і ресурсні витрати

Підкуп має бути справжнім методом, а не словом без механіки.

Перший slice підтримує лише малий `goldCost`:

- `1..3` gold для звичайних справ;
- cost видно до натискання;
- insufficient-gold має окремий scene-specific текст і не витрачає claim;
- debit + reward claim відбуваються в одній транзакції;
- repeated callback не списує gold вдруге;
- net gold reward може бути нульовою або меншою, зате шанс вищий.

Ману в quest methods у цьому slice **не витрачати**. Class option може посилатися на наявний combat skill id і використовувати той самий primary stat, але quest resolution не викликає damage resolver. Mana spending можна додати окремим task після стабілізації атомарних resource costs.

## 8. Reuse наявних combat skills

Class methods мають використовувати stable skill identity як content affinity:

- `skill.forceful-strike` → force/intimidation;
- `skill.hot-spell` → arcana/alteration; для Вареник-манта player-facing method лишається тістологічним, навіть якщо combat profile спільний;
- `skill.form-thirteen-b` → authority/investigation;
- `skill.dangerous-couplet` → performance/persuasion;
- `skill.trick-shot` → finesse/deception/traps/tracking залежно від класу;
- `skill.strict-blessing` → ritual/authority;
- `skill.steppe-side-eye` → improvisation/intuition/intimidation.

Не імпортувати combat damage numbers у quest math. Reuse означає єдину class identity/stat vocabulary, а не удар по казанку через `resolveCombatTurn()`.

## 9. Starter shawarma і cellar mouse

### 9.1. Шаурма

Поточні `poke / receipt / flee` можна зберегти як legacy base intents, але UI має будувати personalized methods:

- race method;
- class method;
- signature method;
- за потреби один scene fallback.

Outcome має враховувати `method + grade`, а не лише старий action. Existing trophy/item grants можна прив’язати до intent:

- inspection/receipt → formal receipt;
- force/poke → wrapper;
- retreat/deception → без item або інший existing-safe outcome.

Не розкривати міміка зарано у start copy.

### 9.2. Миша

Поточні intents `cheese-trap / sweep-bravely / negotiate` лишаються корисними, але не повинні бути трьома labels для всіх.

Resolver має вміти запропонувати:

- negotiation;
- trap;
- domesticity/cleaning;
- deception;
- bribe;
- ritual/authority;
- class signature.

Existing item grants мають мапитися на intent, не на race/class label. Cooldown і level gates не змінюються.

## 10. Outcome presentation

Presenter отримує готовий result object:

```ts
interface PresentedQuestResolution {
  sceneTitle: string;
  methodLabel: string;
  grade: QuestResolutionGrade;
  headline: string;
  body: string[];
  biographyLine?: string;
  reward: AdventureReward;
  goldCost?: number;
  followup?: "fight" | "quest-table" | "cellar";
}
```

Порядок повідомлення:

1. унікальний headline сцени;
2. 1–2 authored outcome paragraphs;
3. максимум одна biography/signature line;
4. cost/reward lines;
5. follow-up button.

Заборонені універсальні фінали як єдиний текст для всього пулу:

- «справа погодилась бути вирішеною»;
- «проблема вкусила у відповідь»;
- «метод не прийнято без заперечень».

Їх можна лишити fallback-ом для невідомого legacy content, але coverage tests не повинні дозволяти active scene звертатися до fallback.

## 11. Content coverage contract

Для кожної active scene:

- мінімум 2 scene methods;
- покриття всіх active races через race motif binding або explicit override;
- покриття всіх active classes через technique binding або explicit override;
- signature method для кожної valid onboarding race+class комбінації;
- мінімум 3 grade-specific outcome texts на method family; complication не може бути одним global рядком;
- мінімум 2 consequence kinds на сцену;
- не більше одного fight-handoff method, якщо сама сцена не є явно бойовою;
- кнопки після resolver не дублюють normalized labels/intents;
- player-facing text український і HTML-escaped.

Автоматичні matrix tests мають пройти:

```text
for every active problem
  for every active race
    race method exists
  for every active class
    class method exists
  for every valid race+class combo
    signature method exists
    3..4 distinct methods are renderable
```

## 12. Backward compatibility та persistence

### 12.1. Adventure period

Не міняти:

- 93-minute bucket;
- три problem offers;
- deterministic offer seed;
- reroll marker;
- level gate;
- active-fight priority;
- current daily-action idempotency authority.

### 12.2. Callback compatibility

- Нові methods отримують versioned callback.
- Старі `safe/flair/risky` callbacks не повинні silently map-итися на новий випадковий метод.
- Legacy callback відкриває поточний selected problem/offer із поясненням, що старий папірець замінено.
- Старі шаурма/миша callbacks лишаються idempotent.

### 12.3. Fight handoff

Зберегти чинний принцип:

- спочатку визначити deterministic result;
- для `fight-handoff` спробувати existing persistent fight path;
- якщо fight start заблокований rest/active state/іншим guard-ом, не витрачати adventure claim і gold cost;
- якщо handoff успішний, повторний callback не створює другу сесію.

### 12.4. Result replay і мінімальний ledger extension

У поточному snapshot `daily_actions` зберігає лише `key`, `localDate`, `rewardXp`, `rewardGold` і `createdAt`. Цього досить для старого binary claim, але недостатньо для чесного replay нового результату: після першого натискання герой може отримати рівень, змінити effective stats або спорядження, тому pure recomputation із поточного персонажа потенційно змінить grade. Окремо немає поля, яке відрізняє gross reward від реального `spentGold`.

Рекомендований вузький extension:

```prisma
model DailyAction {
  // existing fields
  spentGold Int   @default(0) @map("spent_gold")
  resultJson Json? @map("result_json")
}
```

`resultJson` для нових quest claims має бути versioned і містити щонайменше:

```ts
interface QuestResolutionClaimPayloadV1 {
  version: 1;
  sceneId: string;
  methodId: string;
  grade: QuestResolutionGrade;
  consequence: QuestConsequenceKind;
  outcomeId: string;
  reward: { xp: number; gold: number; itemGrants: Array<{ itemId: string; quantity: number }> };
  spentGold: number;
  check: {
    version: "quest-check-v1";
    chance: number;
    roll: number;
    primaryStat: StatKey;
    secondaryStat?: StatKey;
    effectiveStatsSnapshot: Record<StatKey, number>;
  };
}
```

Player-facing presenter не показує exact chance/roll, але audit/replay може їх зберігати.

Repository path має створювати ledger row, умовно списувати `spentGold`, додавати reward і grant items в одній транзакції. Для конкурентного натискання перевірка золота має бути transaction-safe, а unique claim key лишається authority. Existing rows отримують `spentGold = 0`, `resultJson = null` і продовжують працювати як legacy.

Для repeatable cellar cooldown exact old-result replay не обовʼязковий: повторне натискання під час cooldown повертає стабільний cooldown state. Але якщо активується платний mouse method, `CooldownRepository` має отримати окремий atomic paid-claim path або optional `spentGold` із чітким `insufficient-gold` result; не списувати золото в service окремим запитом.

Якщо реалізація знаходить уже наявний загальний audit/result ledger, який дає ту саму атомарність і replay, можна використати його замість цих двох полів. У поточному snapshot такого поля в `DailyAction` немає, тому migration є очікуваним і виправданим мінімальним persistence change, а не broad quest-engine schema.

## 13. Розбиття реалізації

### Slice A — domain/content foundation

- types;
- class/race technique profiles;
- check resolver;
- method slot resolver;
- content coverage tests;
- без Telegram wiring.

### Slice B — level 3+ adventure loop

- content methods для active problem pool;
- new callbacks;
- service resolution;
- varied outcomes/consequences;
- bribe transaction;
- presenter/keyboard;
- legacy callback refresh.

### Slice C — starter scenes

- shawarma adapter/content;
- mouse adapter/content;
- preserve rewards, cooldowns, level gates and item grants;
- remove one-off label switch trees where new resolver supersedes them.

Один PR може охопити всі три slice лише якщо diff лишається reviewable і focused tests проходять. Інакше version task дозволено розбити на foundation + runtime без зміни design contract.

## 14. Definition of Done

Фіча готова, коли:

- вибрана level 3+ справа не показує global safe/flair/risky labels;
- race, class і exact combo/signature героя реально породжують різні кнопки;
- усі 24 general problems мають власні method/outcome seeds;
- generated race/class/title problems також використовують scene-aware methods;
- шаурма й миша працюють через той самий contract або тонкі adapters;
- STR/DEX/INT/CHA/LUCK змінюють deterministic odds у bounded межах;
- class methods reuse combat skill identity/stat mapping без combat damage math;
- є щонайменше negotiation, deception, fight, bribe, investigation, ritual/performance/trap methods у загальному пулі;
- outcome може бути strong/success/mixed/complication;
- не всі complications ведуть у fight;
- reward/cost replay ідемпотентний;
- callbacks до 64 bytes;
- matrix/focused/full tests проходять;
- player-facing exact percentages і hidden path ids не витікають.

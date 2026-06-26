# Daily Korchma Rounds — canonical design

Status: proposed future `0.2.x` runtime slice, captured during the `0.2.5` Bard Performance branch; not implemented until the matching version task is explicitly activated.

This document is the canonical product/persistence contract for the first `Корчмарський обхід` implementation. If the release number changes before activation, rename the task file and release surfaces without changing the feature contract silently.

---

# Game Design — «Корчмарський обхід»

Підготовлено: 12026-06-25

## 1. Fantasy

У Корчмаря є **Книга Негайних Дрібниць**. Щодня вона знаходить три речі, які формально не загрожують світові, але можуть зіпсувати перевірку, вечерю або настрій меблів.

Книга визнає обхід завершеним після двох підписів. Третя справа отримує штамп:

> **«НЕ СЬОГОДНІШНЯ КАТАСТРОФА»**

Тон: побутова корчмарська бюрократія, абсурд, тепло, без приниження пригодника.

## 2. Availability

- мінімальний рівень: `3`;
- доступ: через `Стіл зі справами`;
- slash command у MVP не додається;
- один offer на calendar day у `Europe/Kyiv`;
- reset lazy: перший запит у новий день дає новий offer;
- немає carryover, streak або missed-day debt;
- при `0 HP` — заблоковано чинною recovery логікою;
- під час active combat або pending Barrel raid — чинні guards мають перевагу.

## 3. Daily plan

Кожен plan містить рівно три scene IDs:

1. **одна outdoor scene** у `location.korchma.yard`;
2. **дві interior scenes**;
3. interior scenes мають різні `locationId`.

Plan детермінований:

```text
seed = daily-korchma-round:v1:<characterId>:<kyivDayKey>
```

Але після першого відкриття IDs freeze-яться у persisted offer row, щоб deploy або content reorder не змінив уже видану трійку.

### Selection rules

- scene registry має `id`, `locationId`, `zone`, `title`, `hook`, `actions`;
- один ID ніколи не повторюється в offer;
- дві interior scenes не можуть мати однакову локацію;
- після вибору три сцени seeded-shuffle-яться для presentation;
- content validation падає в test/startup, якщо немає хоча б:
  - 1 outdoor scene;
  - 2 різних interior location groups;
  - 3 actions у кожній scene;
  - унікальних scene/action IDs.

## 4. Player flow

### 4.1 Quest Hub

Рядок до початку:

```text
🧾 Корчмарський обхід
Три дрібні катастрофи. Двох підписів достатньо.
```

Progress:

```text
🧾 Корчмарський обхід — 1/2
Ще одна дрібниця — і Книга перестане дивитися осудливо.
```

Turn-in ready:

```text
🧾 Корчмарський обхід — 2/2
Корчмар чекає на два підписи.
```

Completed:

```text
🧾 Корчмарський обхід — сьогодні закрито
Книга лежить рівно, що для неї підозріло.
```

Locked:

```text
🧾 Корчмарський обхід
Відкриється з 3 рівня.
```

### 4.2 Overview

```text
🧾 Корчмарський обхід

Книга Негайних Дрібниць знайшла три справи.
Владнайте будь-які дві. Третю сьогодні офіційно не помітять.

○ 🪣 Задвірок — Вивіска подала заяву на іншу професію
○ 📰 Дошка вістей — Чутка загубила першоджерело
○ 🛢️ Бочка — Порожнеча вимагає оренду

Підписи: 0/2
Діє до нового київського дня.
```

Buttons route to locations:

```text
🪣 До задвірка
📰 До дошки
🛢️ До бочки
⬅️ До Столу
```

Натискання route button **не завершує** step.

### 4.3 Location surface

Коли поточна локація має active incomplete scene:

```text
🧾 Сьогоднішня дрібниця:
«Чутка загубила першоджерело»
```

Button:

```text
🧾 Владнати дрібницю
```

Після відкриття:

```text
📰 Чутка загубила першоджерело

На дошці висить запис: «Кажуть, що хтось точно щось чув».
Хтось не підписався.
```

Три authored action buttons. Усі завершують step; немає stat check, injury, fight handoff або resource cost.

### 4.4 First completed step

Result card:

```text
✅ Підпис поставлено

<authored outcome>

Обхід: 1/2.
```

Buttons:

```text
🧾 До обходу
⬅️ До місця
```

### 4.5 Second completed step

```text
✅ Двох підписів досить

<authored outcome>

Третю справу Книга урочисто визнала «не сьогоднішньою катастрофою».
Поверніться до Столу зі справами.
```

Buttons:

```text
📋 Здати обхід
⬅️ До місця
```

Після цього третя scene більше не приймає completion callback.

### 4.6 Turn-in

Pre-claim не показує exact reward:

```text
📋 Обхід готовий до здачі

Два підписи на місці. Третя справа виглядає ображено, але юридично безсила.
```

Button:

```text
📋 Здати обхід
```

Result:

```text
✅ Корчмарський обхід закрито

Корчмар звірив підписи й поставив печатку так упевнено,
ніби саме це весь день тримало світ.

Отримано:
+4 XP
+2 золота
```

### 4.7 Already completed replay

```text
✅ Сьогоднішній обхід уже закрито

Книга лежить рівно, що для неї підозріло.

Отримано:
+4 XP
+2 золота
```

Stored reward values, chosen scenes and omitted scene replay-яться з final claim.

## 5. New location — «Задвірок корчми»

### Identity

```text
locationId: location.korchma.yard
title: Задвірок корчми
regionName: Корчма Квестарні
showNames: true
insideKorchma: false
```

### Entry

На `Перед корчмою`, для level 3+:

```text
🪣 У задвірок
```

### Surface

```text
🪣 Задвірок корчми

Тут живуть криниця, вивіска, мотузка, дорожній пил
і кілька речей, які Корчмар не хотів бачити в залі.
```

Buttons:

- `🧾 Владнати дрібницю` — якщо today plan має incomplete yard scene;
- `🧾 Переглянути обхід` — якщо daily active, але yard scene уже done або omitted;
- `🚪 До дверей`.

### Presence

- окрема public presence location;
- не входить до Korchma interior group;
- не дає доступу до interior-only commands;
- arrivals/online можуть показувати `Задвірок корчми`;
- current-location reply keyboard має коректну назву;
- movement copy: `Ви обійшли корчму й зайшли у задвірок.`

## 6. Content model

```ts
interface DailyKorchmaScene {
  id: string;
  locationId: string;
  zone: "yard" | "interior";
  icon: string;
  title: string;
  hook: string;
  actions: readonly DailyKorchmaAction[];
}

interface DailyKorchmaAction {
  id: string;
  icon: string;
  label: string;
  outcome: string;
}
```

Constraints:

- scene id: stable kebab-case, max 32 chars;
- action id: stable kebab-case, max 20 chars;
- exactly 3 actions per MVP scene;
- no dynamic race/class/name insertion in authored outcome;
- no exact reward in pre-commit copy;
- one action = one deterministic outcome;
- no RNG after offer selection.

## 7. Persistence contract

### Keys

```text
quest.korchma-round.offer
quest.korchma-round.step
quest.korchma-round.reward
```

Ці keys **не** додаються до `REMORT_RESET_DAILY_ACTION_KEYS`.

### Offer row

```text
key       = quest.korchma-round.offer
localDate = <YYYY-MM-DD in Europe/Kyiv>
reward    = 0 / 0
```

`resultJson`:

```json
{
  "version": 1,
  "dayKey": "2026-06-25",
  "dayToken": "20260625",
  "contentVersion": "v1",
  "requiredSteps": 2,
  "sceneIds": [
    "yard-sign-career",
    "news-rumor-source",
    "barrel-rent-emptiness"
  ]
}
```

### Step row

```text
key       = quest.korchma-round.step
localDate = <dayKey>:<sceneId>
reward    = 0 / 0
```

`resultJson`:

```json
{
  "version": 1,
  "dayToken": "20260625",
  "sceneId": "news-rumor-source",
  "actionId": "ask-rumor",
  "outcomeId": "news-rumor-source:ask-rumor",
  "locationId": "location.korchma.news_corner",
  "remortCount": 0
}
```

### Reward row

```text
key        = quest.korchma-round.reward
localDate  = <dayKey>
rewardXp   = 4
rewardGold = 2
```

`resultJson`:

```json
{
  "version": 1,
  "dayToken": "20260625",
  "completedSceneIds": [
    "news-rumor-source",
    "barrel-rent-emptiness"
  ],
  "omittedSceneId": "yard-sign-career",
  "reward": { "xp": 4, "gold": 2 }
}
```

### Why no schema change

- offer is one replay-safe zero-reward claim;
- service reads at most three known step identities;
- final claim is already transaction-safe;
- a crash after the second step but before turn-in loses no progress;
- a crash after reward creation replays the existing reward row.

## 8. Service states

Suggested lookup union:

```ts
type DailyKorchmaRoundLookup =
  | { state: "no-character" }
  | { state: "level-locked"; requiredLevel: number }
  | { state: "hp-blocked" }
  | { state: "active-fight" }
  | { state: "pending-raid" }
  | { state: "ready"; offer; completedSceneIds; remainingSceneIds }
  | { state: "turn-in-ready"; offer; completedSceneIds; omittedSceneId }
  | { state: "completed"; offer; rewardRecord };
```

Suggested mutation states add:

- `stale-day`;
- `stale-life`;
- `wrong-location`;
- `unknown-scene`;
- `already-completed`;
- `step-replay`;
- `reward-replay`.

## 9. Callback contract

Compact namespace example:

```text
v1:dkr:o:<dayToken>
v1:dkr:s:<dayToken>:<sceneKey>
v1:dkr:a:<dayToken>:<sceneKey>:<actionKey>:<lifeToken>
v1:dkr:c:<dayToken>:<lifeToken>
```

Requirements:

- under Telegram 64-byte limit;
- parser rejects unknown version/type;
- day token must equal current Kyiv day;
- scene must belong to persisted offer;
- action must belong to scene;
- current presence location must equal scene location before step mutation;
- life token rejects a card rendered before remort;
- service rechecks all invariants; keyboard visibility is not authorization.

## 10. Remort semantics

- Offer/steps/reward survive remort within the same day.
- Old pre-remort action/claim buttons return stale-life copy and no mutation.
- Fresh overview creates buttons with current remort count.
- Completed steps remain valid.
- Unclaimed final reward goes to the current life when explicitly turned in.
- Reward remains once per day, so remort cannot duplicate it.

Player-facing stale-life copy:

```text
Цей папірець памʼятає попереднє життя.
Книга просить відкрити сьогоднішній обхід ще раз.
```

## 11. Guards and conflicts

### Active combat

Daily callback namespace is **not** added to combat-lock safe allowlist. Existing redirect to the active fight wins.

### Pending Barrel raid

Existing pending-raid guard blocks starting or completing the daily. Read-only completed replay may remain visible only if current guard conventions already allow it; do not widen allowlists solely for this feature.

### Wrong location

Old action buttons cannot complete remotely:

```text
Ця дрібниця лишилася в іншому кутку.
Папірець із собою прийшов, а проблема — ні.
```

Return a route button to the required place.

### Day rollover

```text
Цей папірець учорашній.
Він ще має амбіції, але вже не має повноважень.
```

Show/open the new current offer without mutating the old one.

## 12. Reward and economy

- fixed `4 XP + 2 gold`;
- exact values only after claim/replay;
- no per-step rewards;
- no item rolls;
- no consumable integration;
- no luck/class/race modifier;
- no level scaling;
- no third-step bonus;
- no streak multiplier.

## 13. Non-goals

- no daily checklist over fights, gifts, sales, drinks or inventory use;
- no mandatory other player;
- no combat handoff;
- no stats/grades/injury;
- no food, bandage or one-use item reward;
- no achievement/streak/calendar collection;
- no notification scheduler;
- no missed-day catch-up;
- no reroll;
- no broad Korchma layout rewrite;
- no Mini App;
- no new Prisma model;
- no refactor of the 93-minute Adventure system.

## 14. Future content families

Після telemetry, на тому самому persistence/location foundation можна додати окремими slices:

1. **«Чутка на ніжках»** — Дошка вістей → одна підозрювана локація → повернення.
2. **«Посилка без адреси»** — два можливі одержувачі, обрати одного; різний punchline, одна reward.
3. **«Інвентаризація неможливого»** — три objects, two-of-three, rare class-flavor action.
4. **Seasonal wrappers** — тільки copy/content pool, без нового reward tier.

Жоден із них не входить до першої реалізації.

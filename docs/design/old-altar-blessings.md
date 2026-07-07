# Old Altar Blessings — design

## Product intent

Add a small, flavorful altar surface to the Korchma Yard that:

- gives `Задвірок корчми` a persistent reason to exist;
- extends the shipped Priest blessing rather than replacing it;
- creates a tiny gold sink now and a safe item sink later;
- uses current timed status/effective-stat machinery;
- avoids travel/death/ambush mechanics that the game does not currently have.

Player-facing name: **🪨 Старий жертовник**.

Technical feature slug: `old-altar-blessings`.

## Current-state anchors

The design relies on these existing repo surfaces:

- `src/bot/presenters/tavernPresenter.ts`
  - `presentKorchmaYard` currently renders the yard as a light scene.
- `src/bot/keyboards/tavernKeyboard.ts`
  - `buildKorchmaYardKeyboard` currently has only `До обходу` and back.
- `src/services/presenceService.ts`
  - `location.korchma.yard` already exists and is a specific public presence location.
- `src/domain/noncombat/classNoncombatTechniques.ts`
  - Priest blessing has existing constants and plan logic.
- `src/services/classNoncombatService.ts`
  - Priest blessing uses canonical effective summaries and durable mutation.
- `src/domain/noncombat/priestBlessingBonus.ts`
  - Blessing bonus normalization can already apply one basic stat bonus to a `CharacterSummary`.
- `src/bot/presenters/classNoncombatPresenter.ts`
  - Existing Priest blessing copy and target notification patterns.

## MVP location decision

Do **not** add a new presence location in the MVP.

Add an altar card opened from the existing yard:

```text
Перед корчмою
  -> 🪣 У задвірок
      -> 🪨 Старий жертовник
```

The altar card is a scene/action surface, not a separate current location. When a player opens it, their presence remains `location.korchma.yard`.

Reasons:

- same-location Priest targeting already works with active location snapshots;
- fewer routing/test changes;
- no new main-menu location label;
- the yard gets content without becoming another broad hub;
- the optional future `Тихий Корінь` location can be added after playtest evidence.

## MVP user flows

### Open yard

`Перед корчмою` should surface `🪣 У задвірок` whenever the altar feature is enabled, not only when the daily yard scene is active. The existing quest marker behavior for daily yard should be preserved.

Yard card should mention the altar briefly:

```text
За дровами темніє старий камінь. Корчмар каже, що це просто жертовник.
Жертовник мовчить так, ніби записує заперечення.
```

Yard buttons:

```text
🪨 Старий жертовник
🧾 До обходу / current daily round affordance when applicable
⬅️ До дверей
```

### Open altar

Any character can open the altar.

Altar card:

- shows current `Благовоління` balance for the current character/remort life;
- explains that offerings are stored and can power Priest rites;
- shows Priest ritual options only for eligible Priests with enough mana/context;
- keeps copy short.

Buttons:

```text
🙏 Попросити благословення
🎁 Принести требу
📜 Як це працює
⬅️ До задвірка
```

If the actor is a level 3+ Priest, show:

```text
✨ Провести обряд
```

### Offer gold

MVP offering type: gold only.

Flow:

```text
🎁 Принести требу
  -> choose fixed offering amount
  -> confirmation card
  -> durable transaction
  -> result card
```

Initial fixed option:

```text
13 gold -> 1 Благовоління
```

Daily cap:

```text
max 3 Благовоління from gold offerings per current character per Kyiv day
```

Why fixed option instead of free input:

- Telegram buttons are simpler;
- replay/stale handling is easier;
- balance is predictable;
- avoids turning altar into a flexible bank.

### Ask for blessing

Non-Priests can see explanation and, if an eligible active Priest is same-yard, a pointer to `Хто поруч` / ordinary Priest aid. MVP should not implement a direct request/accept flow.

Reason: direct Priest aid currently has no offer/accept flow; adding a request workflow is a larger social contract task.

### Priest conducts altar rite

Eligible actor:

- current character exists;
- class is `class.priest`;
- level >= existing `CLASS_NONCOMBAT_MIN_LEVEL`;
- not blocked by combat or raid;
- currently at `location.korchma.yard`;
- has enough mana;
- current character/remort life has enough `Благовоління`.

Target scope:

- self;
- active same-yard targets using existing active cutoff semantics.

Flow:

```text
✨ Провести обряд
  -> choose target
  -> choose blessing type
  -> confirmation/result
```

Blessing types:

| id | Player-facing | Stat |
|---|---|---|
| `old-altar.strength` | `Тверда рука` | `strength` |
| `old-altar.dexterity` | `Легкий крок` | `dexterity` |
| `old-altar.intelligence` | `Ясний розум` | `intelligence` |
| `old-altar.charisma` | `Ласкаве слово` | `charisma` |
| `old-altar.luck` | `Добра прикмета` | `luck` |

Effect:

- one visible Priest blessing status;
- duration `13 minutes`;
- no stacking with any active Priest blessing;
- same actor-target repeat wait `93 minutes`;
- bonus amount `+1..+3` chosen stat;
- target notification for another target after durable mutation;
- actor receives result card.

## Formula

The MVP can reuse current Priest blessing power calculation with selected stat support and a lower clamp.

Recommended domain helper:

```ts
export type OldAltarBlessingStat = "strength" | "dexterity" | "intelligence" | "charisma" | "luck";

export interface OldAltarBlessingPlan {
  bonusStat: OldAltarBlessingStat;
  bonusAmount: number; // 1..3
  manaCost: number;
  favorCost: number;
  levelDiff: number;
}
```

Recommended amount:

```text
base = existing buildPriestBlessingPlan(...).bonusAmount
bonusAmount = clamp(base, 1, 3)
favorCost = bonusAmount
manaCost = existing cost by bonus amount, using current Priest table for +1..+3
```

This keeps current logic familiar and prevents selected-stat blessings from overtaking direct +luck blessing.

## Data model

Prefer a tiny ledger plus account balance. Names can adjust to existing Prisma conventions.

### `old_altar_accounts`

Purpose: current character/remort-life favor balance.

Fields:

```text
id
telegramUserId
characterId
remortCount
favorBalance
createdAt
updatedAt
```

Constraints:

```text
unique(characterId, remortCount)
```

### `old_altar_offerings`

Purpose: replay-safe offering audit.

Fields:

```text
id
telegramUserId
characterId
remortCount
offeringType     // gold in MVP; item later
goldSpent
itemInstanceId   // null in MVP
itemKey          // null in MVP
itemName         // null in MVP
quantity
favorGranted
localDate        // Kyiv date for daily cap
completedAt
statSnapshotJson
```

### `old_altar_blessing_spends`

Purpose: associate favor spend with an existing Priest blessing action/status.

Fields:

```text
id
telegramUserId            // Priest actor
characterId               // Priest actor character
remortCount
priestAidActionId          // reference existing Priest aid action if available
priestBlessingId           // reference existing active/durable blessing row if available
targetTelegramUserId
targetCharacterId
favorSpent
bonusStat
bonusAmount
completedAt
statSnapshotJson
```

Alternative:

If it is cleaner, extend the existing Priest aid/blessing records with nullable source/favor fields. The separate spend table is safer if the existing class noncombat schema is intentionally narrow.

## Service design

Recommended new service:

```text
src/services/oldAltarService.ts
```

Responsibilities:

- open altar card;
- offer gold preview/confirmation/complete;
- read current favor balance;
- enforce Kyiv-day gold-offering cap;
- list eligible same-yard targets for Priest ritual;
- plan selected-stat altar blessing;
- perform transaction: spend favor + mana + create Priest blessing + action/audit;
- return typed result objects for presenters;
- no Telegram imports.

Recommended domain:

```text
src/domain/oldAltar/oldAltarBlessings.ts
```

Responsibilities:

- constants;
- blessing type definitions;
- plan function;
- cost/favor math;
- safe labels for stat names if useful.

Recommended repository:

```text
src/db/repositories/oldAltarRepository.ts
src/db/repositories/prismaOldAltarRepository.ts
```

Responsibilities:

- current account/balance;
- daily offering cap read;
- complete gold offering transaction;
- complete altar blessing transaction;
- enforce remort/current character guards;
- replay/idempotency behavior.

## Bot surfaces

Recommended files:

```text
src/bot/callbacks/oldAltarCallbackData.ts
src/bot/commands/oldAltarCommand.ts
src/bot/keyboards/oldAltarKeyboard.ts
src/bot/presenters/oldAltarPresenter.ts
```

Routing changes:

- `tavernKeyboard.ts`: add `🪨 Старий жертовник` button in yard keyboard.
- `tavernPresenter.ts`: mention the altar in yard copy.
- `createBot.ts` / module registration: register altar callback handler.
- `botServices.ts`: wire `oldAltar` service.

Callback constraints:

- keep callback data under Telegram limit;
- use short action tokens;
- encode target selection compactly;
- recheck actor/target remort counts server-side;
- stale callbacks must return safe no-op cards with attached navigation.

## Interaction with existing Priest aid

Do not remove or weaken:

- direct heal;
- direct +luck blessing from `Хто поруч`;
- self-heal/self-bless hero shortcuts.

Altar blessing is additional and location-bound. It should block if the target already has any active Priest blessing, because the current bonus helper applies one active blessing and non-stacking keeps the mental model simple.

## Economy classification

MVP:

- gold sink: yes;
- item sink: no, follow-up;
- gold faucet: no;
- player-to-player transfer: no;
- XP: no;
- quest progress: no;
- hunt/Yeger progress: no;
- combat reward multiplier: no.

## Privacy and notifications

- Offerings are private and should not emit public feed rows in MVP.
- Blessing another character should send the target a private notification, mirroring current Priest blessing behavior.
- Do not broadcast “who paid how much” to nearby players.

## Open questions for implementation

1. Should the altar card be available from level 1, or only from level 3+?
   - Recommendation: available from level 1 for flavor/offering, but Priest rite requires level 3+ Priest.
2. Should gold offering consume `gold` or a future `silver` currency?
   - Recommendation: use current `gold` field; currency terminology rename is a separate task.
3. Should direct Priest +luck blessing and altar chosen-stat blessing share the exact active row/table?
   - Recommendation: yes if the schema allows nullable `bonusStat`; no separate status type.
4. Should achievements ship in MVP?
   - Recommendation: no unless the implementation stays smaller than expected.

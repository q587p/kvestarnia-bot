# Adventure Quest Readability and Local Failure

Target version: `0.2.14`.

## Problem

The current authored Adventure Choice system has scene-specific method buttons and grade-specific outcomes, but playtest feedback says the selected adventure card still does not always read like a quest. The card can show a funny title and hook, then immediately list methods, without a clear player-facing statement of what is wrong or what the hero is trying to fix.

In practical terms, the player may understand that a barrel, helmet, calendar, receipt, bench or sign is being silly, but not the actionable objective behind the methods.

This task should make the selected quest screen answer three questions before the method list:

1. Who brought the problem?
2. What exactly is wrong?
3. What are these methods trying to accomplish?

The fix should preserve the current Kvestarnia voice: short Ukrainian copy, absurd concrete objects, no dry technical wording, no exact hidden odds.

## Desired selected-card shape

Recommended shape for a level 3+ Adventure selected problem:

```text
📌 <title>

<one-paragraph hook / scene beat>

<i>Замовник:</i> <client>
<i>Проблема:</i> <concrete thing that is wrong>
<i>Ціль:</i> <what the hero is trying to fix / return / prevent>

Можливі способи:
...

Корчмар: «Метод оберіть самі. Потім не кажіть, що метод обрав вас.»
```

The exact labels may change if a shorter Ukrainian card works better, but the card must clearly separate flavor from objective. `Проблема` and `Ціль` may be merged into one line only when the line stays concrete and action-readable.

## Content model recommendation

Add explicit objective/problem copy to Adventure problem content instead of relying on method hints to explain the scene.

Possible small type extension:

```ts
export interface AdventureChoice {
  id: AdventureProblemId;
  title: string;
  hook: string;
  client: string;
  problem: string;   // what is wrong, concrete and scene-specific
  goal: string;      // what methods are trying to achieve
}
```

Names can differ (`problemLine`, `objective`, `resolutionGoal`) if the current code suggests a better fit. The important part is that every current Adventure problem id can render an explicit player-facing problem/goal before method choices.

Do not store this in the database. It is content/presenter copy only.

## Copy rules

Good lines are concrete and solve-oriented:

- `Проблема: бочка оголосила порожнечу мешканцем і вимагає оренду за місце між клепками.`
- `Ціль: повернути бочку до стану «тара», не «гуртожиток для ніщо».`
- `Проблема: календар розмножив пʼятниці й витіснив четвер із тижня.`
- `Ціль: зібрати тиждень назад так, щоб обід не провалився між датами.`

Avoid generic/meta lines:

- `Проблема потребує вирішення.`
- `Треба розібратися з ситуацією.`
- `Допоможіть клієнту.`
- `Цими методами можна закрити справу.`

Avoid explaining internal mechanics:

- no `race`, `class`, `signature`, `method`, `grade`, `consequence` in player-facing copy;
- no exact chances or formulas;
- no promise of exact rewards before resolution.

Use `«»` quotes where needed, Holocene visible dates only in release docs/news if dates appear, `міт*` with `т`, and `соціяльн*` with `я` where applicable.

## Coverage target

At minimum, every active level 3+ Adventure problem must have explicit problem/goal copy:

- all current general ids: `stew`, `barrel`, `helmet`, `calendar`, `receipt`, `bench`, `cloak`, `spoon`, `mirror`, `boots`, `chimney`, `candle`, `chair`, `broom`, `door`, `map`, `teapot`, `menu`, `sign`, `portrait`, `key`, `ledger`, `rug`, `bell`;
- generated race families: survey, mug, portrait;
- generated class families: manual, uniform, exam;
- generated title family.

The offer list can remain compact. The selected quest card is the primary surface that must become readable as a quest.

## Optional hook polish

If the new `problem`/`goal` line merely repeats an old hook, rewrite the hook so the three layers differ:

- `hook` = scene arrival / weirdness;
- `client` = who cares;
- `problem` = concrete wrong state;
- `goal` = intended resolution.

## Local failure consequence

The existing quest grades and consequences already support partial/negative results, but most non-combat complications still read as “the thing is somehow closed with a mess.” Add a narrow, authored no-reward local failure for clearly risky methods.

Recommended consequence name:

```ts
"local-failure"
```

Alternative acceptable names: `"no-reward-failure"`, `"failed-attempt"`. Prefer one that reads clearly in code and stored result JSON.

Behavior:

- Only appears as an authored `complication` consequence for selected risky/fragile methods.
- Consumes the current Adventure 93-minute claim, like other completed outcomes.
- Grants `0 XP`, `0 gold`, no item grants.
- Does not start a fight.
- Does not spend extra gold beyond already-committed explicit method cost; for paid methods, be careful whether failure should retain the visible cost. If this is ambiguous, do not put local failure on paid methods in this slice.
- Replays safely from the stored claim/result JSON.
- The already-completed copy must not imply that the quest was successfully closed; use wording like `спробу на найближчий час уже використано`.
- Does not count as a resolved Adventure achievement. Monster-flavored Adventure complication achievements count stored fight handoffs, not local no-fight failures.

Recommended result-copy direction:

```text
❌ Справу не закрито

<title>

<i>Метод:</i> <method label>

<method-specific failure beat>

Винагорода за справу: 0 XP, 0 золота.
Наступні три справи будуть доступні через 93 хвилини від цього завершення.
```

Keep the result funny, not punitive. The point is local texture and stakes, not a new frustration loop.

## Balance / product constraints

- Do not add a global random failure roll after the deterministic grade.
- Do not make every quest able to fail completely.
- Do not make the safest-looking methods feel like hidden traps.
- A small first slice is enough: one to three local-failure methods across the active pool is acceptable if tests and presenter behavior are solid.
- Preserve fight handoff as a separate consequence, not the only way to lose.
- Preserve existing reward envelope for successes and mixed successes.
- No schema migration should be required unless the implementation discovers an existing persistence type cannot safely store the new consequence string. Prefer backward-compatible JSON/type changes.

## Test expectations

Add or update tests so regressions are visible:

- content test: every active Adventure problem has non-empty concrete problem/goal copy;
- content test: problem/goal copy rejects generic placeholder phrases;
- presenter test: selected Adventure problem card renders client/problem/goal before `Можливі способи`;
- service/domain tests: local failure grants no XP, no gold, no items, consumes the period and replays safely;
- presenter test: local failure result does not say `Справу закрито` and does not show normal reward framing as if it succeeded;
- existing quest resolution, callback, idempotency and fight handoff tests stay green.

## Manual QA

Use a local/dev deterministic setup to force or sample:

1. Open `/adventure` at level 3+.
2. Select several general and generated problems.
3. Verify each selected card has clear `Замовник`, `Проблема` and `Ціль`/objective text before method buttons.
4. Confirm method buttons still fit Telegram and remain scene-action labels, not internal class/race labels.
5. Complete a normal success, mixed result, fight handoff and local failure if forceable.
6. Replay old buttons and duplicate taps; confirm no duplicate reward, no duplicate gold cost, no second fight.
7. Confirm already-used period copy covers both success and failure cases.

## Implementation note

The `0.2.14` slice keeps local failure inside the existing Adventure Choice claim/result path. It adds no schema, no new persistent player state, no remort/reset behavior, no new player action, no achievement hook and no new `/dev_*` command; `/dev_adventure_reset` remains the narrow local helper for rerolling the current period during QA.

# PLAYTESTING addendum — Daily Korchma Rounds

Merge this section into `docs/PLAYTESTING.md` when the matching version task is activated.

## Daily Korchma Rounds

### Happy path

1. With a level 3+ character, open `Стіл зі справами` and open `Корчмарський обхід`.
2. Confirm three stable scenes: exactly one at `Задвірок корчми` and two in different interior locations.
3. Complete one scene at its required location; confirm `1/2` and no XP, gold, item, HP or mana change.
4. Repeat the same callback; confirm replay/no duplicate.
5. Complete a second scene in another location; confirm `2/2` and the third is marked unavailable.
6. Return to the Quest Table and claim; confirm level-scaled XP/gold, no item, and exact stored replay values.
7. Repeat claim and restart the bot; confirm the stored result replays without another mutation.

### Safety and routing

1. Press a scene action after moving away; confirm wrong-location no-op and a route back.
2. Cross Kyiv midnight and press an old callback; confirm stale-day no-op and current-day recovery.
3. Start active combat and attempt a step/claim; the combat redirect wins and progress stays unchanged.
4. Enter a pending Barrel raid and attempt a step/claim; the existing raid guard wins.
5. Complete one step, remort, then press the old card; confirm stale-life no-op.
6. Open a fresh post-remort card; confirm same-day progress remains and the final reward still exists only once.
7. Verify `Задвірок корчми` appears as a public outside location, is not accepted as Korchma interior, and has working entry/return/current-location behavior.

### Gates and regressions

1. Level 2 is locked; level 3 is available.
2. HP 0 cannot mutate; HP 1 can proceed.
3. Complete a normal 93-minute Adventure before/after the daily route; its offer, period, callbacks and reward are unchanged.
4. Smoke Yeger, Shynok, Cellar, Barrel, problem-chain and ordinary fight navigation.

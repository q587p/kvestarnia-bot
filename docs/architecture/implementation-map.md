# `0.2.2` Implementation Map

This is a move map, not a requirement to use every exact filename. Recheck the post-`0.2.1` tree before editing.

`0.2.2` implementation note: the shipped code keeps the coarse registrar implementation in `src/bot/featureRegistrars.ts` while `src/bot/createBot.ts` remains the ordered shell. Middleware and app composition follow the target file split.

## Source-to-target map

| Current owner | Extract to | Notes |
|---|---|---|
| `src/bot/createBot.ts` `BotServices` | `src/bot/botServices.ts` | keep the bot-facing contract transport-specific but implementation-free |
| `src/bot/createBot.ts` `BotOptions` | `src/bot/botOptions.ts` | support URL/status and bot username |
| combat lock registration/helpers | `src/bot/middleware/registerCombatLockMiddleware.ts` | preserve allowlist, redirect and presence behavior |
| presence middleware registration | `src/bot/middleware/registerPresenceMiddleware.ts` | continue using `presence/presenceRouting.ts` |
| pending raid edit/block helper | `src/bot/middleware/pendingRaidGuard.ts` if clean | do not invent a universal policy engine |
| onboarding/menu callbacks | character/core registrar | choose one owner and document it |
| item/equipment/chest/level barter callbacks | inventory registrar | gifting may remain social if that ownership is clearer |
| tavern/place/Shynok/cellar callbacks | tavern registrar | keep location movement/presence helpers nearby |
| adventure/quest/Yeger/hunt/bestiary callbacks | quest registrar | persistent fight start can be delegated to a narrow combat helper |
| fight/training callbacks | combat registrar | keep duel separate if it reduces coupling |
| duel/nearby duel/gifting notices | social registrar | do not duplicate notification helpers |
| repository construction in `src/bot.ts` | `src/app/createRepositories.ts` | concrete Prisma implementations |
| service construction in `src/bot.ts` | `src/app/createServices.ts` | explicit typed object |
| health/bot/scheduler/deploy lifecycle | `src/app/createRuntime.ts`, `runtimeLifecycle.ts` | no import-time start |

## Files intentionally left in place

- `src/bot/commands/**`;
- `src/bot/callbacks/**`;
- `src/bot/keyboards/**`;
- `src/bot/presenters/**`;
- `src/domain/**`;
- repository interfaces and Prisma implementations;
- Prisma schema and migrations;
- callback data formats;
- combat stored state;
- content files.

Move only when ownership clearly improves and tests prove parity.

## Suggested checkpoints

### Checkpoint 1 — Characterization

- record current command/callback registration order;
- add focused guard/routing tests;
- run baseline `npm run check`;
- commit before movement.

### Checkpoint 2 — Contracts and middleware

- move `BotServices` / `BotOptions`;
- extract middleware without semantic edits;
- run bot routing/lock/presence tests.

### Checkpoint 3 — Feature registrars

- move one vertical slice at a time;
- preserve regexes and parser behavior;
- run focused tests after each slice;
- keep `createBot.ts` compiling at every checkpoint.

### Checkpoint 4 — Composition and lifecycle

- create repository/service/runtime factories;
- keep `src/bot.ts` executable;
- add start/stop tests where practical;
- verify BOT_TOKEN-missing behavior.

### Checkpoint 5 — Architecture gates and release surfaces

- add source-boundary tests;
- run full check and Prisma validation;
- update version/changelog/news/docs;
- perform manual Telegram smoke.

## Architecture test ideas

Use direct source inspection where it gives a clear invariant:

```ts
expect(read("src/bot/createBot.ts")).not.toMatch(
  /\.\/presenters\/|\.\/keyboards\/|\.\/callbacks\//
);
```

Use recursive import scanning for the domain boundary:

```ts
for (const file of listTsFiles("src/domain")) {
  expect(read(file)).not.toMatch(/from ["']grammy["']/);
  expect(read(file)).not.toMatch(/from ["'][^"']*\/bot\//);
}
```

Do not assert an exact line count as the only architecture gate. An import/ownership invariant is harder to game and better reflects the decision.

## Manual smoke ownership

Each registrar should have at least one representative live route in the final smoke:

- core: help or version;
- character: start/hero/remort-safe surface;
- inventory: item/equipment/chest;
- tavern: place/Shynok;
- quest: quest/adventure/Yeger;
- combat: persistent fight plus active lock;
- social: duel or gifting.

Also test a pending raid block and one stale callback.

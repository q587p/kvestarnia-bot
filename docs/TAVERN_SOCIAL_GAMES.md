# Tavern Social Games Backlog

This document preserves the useful planning material from the local archive
`tavern-social-games.zip`. It is future design input only: the current PR must
not add runtime social-game code, Prisma schema, migrations, callbacks,
economy changes, rewards or player-visible menu entries for these ideas.

## Product Shape

`Ігри за столом` is a future Shynok/Korchma social surface for short opt-in
activities between adventurers. The core promise is not a full board-game
client inside Telegram. A player should create or join a table, place a small
bounded stake when the feature explicitly allows it, choose one intent, and get
a compact result scene.

The feature should feel like a Kvestarnia tavern moment:

- short Telegram-native menus;
- explicit opt-in and clear cancellation/refund paths;
- funny outcomes before competitive pressure;
- no pay-to-win and no power snowball;
- no hidden conversion of social games into a gold faucet;
- no Mini App requirement.

## MVP Candidates

### Tavlei

Tavlei is a 1v1 table game for adventurers who want to look thoughtful while a
scratched board silently judges them.

Future MVP shape:

- 2 players;
- equal stake, if wagers are enabled for the slice;
- one tactic choice per participant;
- deterministic resolver from frozen character snapshot, tactic matchup, seed
  RNG and small capped character influence;
- win/loss/draw result, with draw refund or rematch path;
- compact result card and optional recent tavern activity line.

Suggested tactics from the archive:

- `Обачна оборона`;
- `Тиха пастка`;
- `Гострий дебют`;
- `Довга партія`.

Implementation guardrails:

- low-level players must not be automatically hopeless;
- result calculation must be deterministic and testable;
- stale callbacks must not re-pay, re-resolve or reopen a closed table;
- no ranking or tournament power in the first Tavlei slice.

### Kosti

Kosti is the louder table: more players, more luck, more claims that the dice
were "almost certainly listening".

Future MVP shape:

- 2-7 players;
- equal stake, if wagers are enabled for the slice;
- open lobby with timeout;
- one style and one sign choice per participant;
- 5d6 deterministic roll per participant from session seed;
- main winner for the main pool;
- optional sign-pool split for fulfilled signs;
- safe refund on expiry or failed resolve.

Suggested styles from the archive:

- `Тримати руку`;
- `Гнати банк`;
- `Ловити знак`.

Suggested signs:

- `Дві пари`;
- `Трійня`;
- `Висока рука`;
- `Шлях`;
- `Вежа`.

Implementation guardrails:

- conserve the pot in every terminal path;
- define all remainder handling explicitly;
- avoid exact odds in pre-commit player-facing text;
- keep the result readable for all participants on one mobile screen.

## Required Foundation

Before either game ships, the implementation needs a small generic table-game
foundation rather than game-specific ad hoc state.

Minimum service concepts:

- session lifecycle: `OPEN -> READY -> RESOLVING -> COMPLETED`;
- terminal refund states for cancel, expiry and failed resolve;
- participant rows with one active stake session limit where practical;
- transaction-safe stake reservation, refund and payout;
- idempotent callbacks and stale callback fallback;
- deterministic resolver seed stored on the session;
- opportunistic expiry on relevant menu opens plus a repair path if needed;
- combat/search/action locks respected by create, join and decision actions.

The archive sketches Prisma models for `TavernGameSession`,
`TavernGameParticipant` and an optional ledger. A future implementation should
first audit the current economy/session patterns and reuse existing ledger
helpers where possible instead of adding a parallel money system by default.

## Abuse And Economy Guardrails

This feature has higher abuse risk than rewardless social surfaces because it
can move gold between characters.

Future slices must answer these before runtime:

- maximum stake;
- daily net win cap or equivalent anti-transfer limit;
- repeated-pair audit;
- active-session limit;
- timeout/refund behavior;
- transaction boundaries for reserve/refund/payout;
- safe handling of orphan escrow;
- whether the first public release should ship without gold wagers.

No house payout should exist in the MVP. If gold is involved, payouts come from
the participants' pot only, minus any explicitly documented fee if such a fee is
ever added.

## Suggested Future Slice Order

1. **Audit only.** Find the current Shynok/Korchma menu flow, economy mutation
   path, callback router pattern, combat/search locks and existing ledger
   options. Leave an implementation note; do not add runtime.
2. **Core table engine.** Add the session model, migration, escrow helpers,
   expiry/refund path and resolver interface behind a feature flag.
3. **Tavlei.** Ship one 1v1 game using the shared engine.
4. **Kosti.** Add the 2-7 player dice table once the engine is proven.
5. **Polish.** Add more result templates, recent tavern activity, telemetry,
   caps and manual QA cleanup.

## Deferred Social Activities

The archive also includes useful later ideas. They should stay behind Tavlei and
Kosti unless a future product decision changes the order.

- `Байки біля вогню`: low-stakes story prompts for 2-5 players.
- `Суперечка на славу`: argument style checks for small social recognition.
- `Спір на силу`: arm-wrestling or similar stat-flavored quick checks.
- `Корчемний турнір`: periodic bracket or table event with cosmetic/social
  recognition, not combat power.
- `Карти мандрівника`: defer because cards pull the design toward collection,
  deck balance and a larger tutorial.

## Test Expectations For A Future Runtime PR

At minimum, future implementation needs:

- resolver unit tests for Tavlei tactic matchups and Kosti dice ranking/signs;
- economy tests for insufficient gold, duplicate joins, double resolve,
  expiry refund and failed-resolve refund;
- integration tests for create, join, decision, cancel, expiry and stale
  callback flows;
- concurrency tests for last-seat joins and resolve/refund races;
- manual Telegram QA with two users for Tavlei and three users for Kosti.

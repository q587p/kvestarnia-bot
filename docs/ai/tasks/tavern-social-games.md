# Tavern Social Games

Base context: `main@0.2.20`.

This is the next version task after `0.2.20` landed in `main`. Use the repo versioning skill and current repository rules to determine the exact next version and changelog/update location.

## Goal

Make the tavern a small socialization center by adding lightweight table games that resolve automatically after a small number of player choices.

MVP games:

- `Tavlei`: a 1v1 intellectual duel with a shared stake, one tactic choice, character stats, and light luck.
- `Kosti`: a 2-6 player dice table with a shared stake, a style choice, a chosen sign, strong luck, and a small tactical layer.

## Player experience

A player opens the tavern and sees a new hub:

```text
🏚 Шинок
├─ 🍺 Напої
├─ 🍻 Почастувати всіх
├─ 🎲 Ігри за столом
└─ ↩ Назад
```

Inside `🎲 Ігри за столом`, the player can view open tables, create a Tavlei or Kosti table, read short rules, join a table, make one choice, and receive an automatic result.

## Scope

Implement:

1. Tavern games hub and open table list.
2. Session model/service for stake-based tavern games.
3. Escrow-safe create/join/refund/payout flow.
4. Tavlei game definition and Telegram flow.
5. Kosti game definition and Telegram flow.
6. Expiration/refund handling without requiring a background worker for MVP.
7. Anti-abuse limits and telemetry/logging consistent with existing project patterns.
8. Tests and documentation updates.

## Out of scope

Do not implement in this task:

- real interactive board play;
- NPC gamblers with meaningful payout;
- tournaments or leaderboards;
- spectator betting;
- direct drink bonuses to gambling outcomes;
- a full replacement of the tavern, economy, router, or character systems.

## Patch-first integration rules

Before writing code, audit the current repo and reuse existing patterns for:

- tavern menu and navigation;
- Telegram callback router;
- combat lock / routing guard;
- character gold mutation;
- ledger/economy audit events;
- Prisma migration naming;
- config/feature flags;
- telemetry/logging;
- tests and local checks;
- version/changelog workflow.

If an equivalent generic session, ledger, or feature flag mechanism already exists, extend it instead of creating a parallel system.

## MVP lifecycle

Recommended session states:

```text
OPEN -> READY -> RESOLVING -> COMPLETED
  │       │          │
  │       │          └-> FAILED_SAFE_REFUND
  │       └-> EXPIRED_REFUND
  └-> CANCELLED_REFUND
```

Recommended participant states:

```text
JOINED -> DECIDED -> COMPLETED
JOINED -> LEFT_REFUNDED
```

A session is terminal after `COMPLETED`, `CANCELLED_REFUND`, `EXPIRED_REFUND`, or `FAILED_SAFE_REFUND`.

## Functional requirements

### Games hub

- Add `🎲 Ігри за столом` to the tavern menu.
- Add an open tables list.
- Show game, seats, stake, creator, and approximate time left.
- Hide or disable actions according to existing combat lock rules.
- Return friendly text for full, expired, completed, stale, or insufficient-gold actions.

### Create session

- Validate feature flag, game key, stake, and current player state.
- Enforce max stake and active stake session limit.
- Reserve creator stake in a transaction.
- Create session and creator participant.
- For Tavlei, wait for exactly one opponent.
- For Kosti, allow 2-6 players and a creator-controlled or timeout-driven resolve path.

### Join session

- Validate session is joinable and not expired.
- Reject joining the player's own 1v1 Tavlei table.
- Reject duplicate participation.
- Reject if player lacks gold or already has another active stake session.
- Reserve stake in the same transaction that adds the participant.
- For Tavlei, move to `READY` when the second player joins.
- For Kosti, remain joinable until full, creator resolves, or join timeout triggers.

### Submit decision

- Validate participant and current state.
- Store the decision once.
- Ignore duplicate callbacks or return the current view.
- Default missing decisions on timeout according to the game definition.
- Resolve automatically when all required decisions are present.

### Resolve

- Acquire a transaction-safe lock or use an equivalent existing safe transition pattern.
- Make resolve idempotent.
- Use a stable seed stored on the session.
- Compute result deterministically from seed + participants + decisions.
- Assert payout conservation before mutating gold.
- Apply payouts and ledger/audit events in the same transaction.
- Move to a terminal state.
- Render participant-facing result and a short tavern feed/recent-activity text if the project has such a pattern.

### Expire/refund

No background worker is required for MVP if the project does not already have one. It is acceptable to expire sessions opportunistically when opening tavern games, listing tables, joining, or resolving.

- Open session with too few players after join timeout: refund all reserved stakes.
- Creator cancels before any other player joins: refund creator.
- Ready session after decision timeout: default decisions and resolve, unless the existing project UX strongly prefers refund.
- Unexpected resolve failure: safe refund and terminal `FAILED_SAFE_REFUND` state.

## Data model guidance

Use existing models if available. If not, add minimal Prisma models equivalent to:

- `TavernGameSession`: game key, status, creator, stake, pot, seed, rules/result JSON, timestamps, expiration timestamps.
- `TavernGameParticipant`: session, character, stake, status, decision/result JSON, joined/decided timestamps.
- Optional `TavernGameLedger` only if the project has no suitable economy ledger/audit mechanism.

Required constraints/indexes:

- unique participant per session;
- status/game indexes for active table list;
- expiration indexes;
- active participant lookup by character;
- session ledger lookup if adding a dedicated ledger.

## Acceptance criteria

- Tavern menu exposes `🎲 Ігри за столом` behind the configured feature flag.
- Open tables list works for Tavlei and Kosti.
- Tavlei can be created, joined, decided, resolved, drawn/refunded, and completed.
- Kosti can be created, joined by 2-6 players, decided, resolved, split between main and sign pools, and completed.
- Escrow, refunds, and payouts are idempotent and transaction-safe.
- Duplicate/stale callbacks never double-subtract or double-pay.
- Combat lock behavior matches the existing project policy and is not bypassed.
- Payouts never exceed the pot, and gold never becomes negative.
- Feature flags/config limits exist for the whole feature and per-game enablement.
- Tests cover resolver logic, economy invariants, stale callbacks, expiration/refund, and at least one Telegram UI smoke path.
- Docs/changelog/version are updated according to repo rules.
- No PR number appears in new artifact names, migration names, docs, tasks, or prompts.

## Suggested implementation sequence

1. Audit current tavern, callback, economy, combat lock, config, tests, and version/changelog patterns.
2. Add documentation files if they fit the repo docs structure.
3. Add schema/migration or adapt existing generic session/ledger patterns.
4. Add game registry and session service.
5. Add escrow/refund/payout helpers or extend existing economy helpers.
6. Add Tavlei resolver tests, then Tavlei flow.
7. Add Kosti resolver tests, then Kosti flow.
8. Add feature flags, limits, telemetry/logging, expiration/refund handling.
9. Add Telegram smoke tests and manual QA notes.
10. Run repo checks and update version/changelog according to repo rules.

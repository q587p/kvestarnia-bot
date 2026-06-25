# Group Raid Session Model

Status: proposed persistence and concurrency contract

## Principles

- Relational rows own membership and rewards; do not store the authoritative participant list only inside JSON.
- Domain resolution is pure and independent of Telegram.
- Every transition is replay-safe under duplicate callbacks, scheduler overlap, process restart and stale cards.
- A raid session has one server-owned opaque token and one canonical version.
- Participant snapshots and boss scale freeze at active start.
- Terminal session state and per-participant settlement are recoverable substeps.
- No Redis/BullMQ dependency is required for the first release.

## Proposed models

Names are proposals. Match current Prisma naming conventions when implementing.

### `GroupRaidSession`

```text
id                    String @id @default(uuid())
inviteToken           String @unique
encounterKey          String
periodId              String
status                String  // recruiting|active|won|lost|expired|cancelled|invalidated
leaderCharacterId     String
originLocationId      String
contextChatId         BigInt?
rulesVersion          String
participantCap        Int     // 8
minimumParticipants   Int     // 1
joinUntilAt           DateTime
startedAt             DateTime?
roundExpiresAt        DateTime?
completedAt           DateTime?
expiresAt             DateTime
turn                  Int     // 0 while recruiting, 1+ active
version               Int
stateJson             Json?
resultJson            Json?
activeLeaderKey       String? @unique
createdAt             DateTime
updatedAt             DateTime
```

Indexes:

- `(status, joinUntilAt)`;
- `(status, roundExpiresAt)`;
- `(periodId, encounterKey)`;
- `(leaderCharacterId, status)`.

`activeLeaderKey` is nullable and exists only while recruiting/active. It prevents duplicate leader creates without making terminal history disappear.

### `GroupRaidParticipant`

```text
id                    String @id @default(uuid())
sessionId             String
characterId           String
remortCount           Int
status                String // joined|active|knocked-out|withdrawn|ineligible|settled
joinSource            String // leader|nearby|deep-link|dev
joinedAt              DateTime
leftAt                DateTime?
snapshotJson          Json?
runtimeJson           Json?
contributionJson      Json?
resourceSettlementJson Json?
chatId                BigInt?
messageId             Int?
activeMembershipKey   String? @unique
createdAt             DateTime
updatedAt             DateTime

unique(sessionId, characterId)
index(characterId, status)
index(sessionId, status)
```

`activeMembershipKey` can be the character id while the membership is live and null after leave/terminal settlement. It prevents one character from joining two live raid sessions even before combat leases exist.

Store only frozen/audit data in `snapshotJson`; do not treat a mutable content lookup as the historical result source.

### `GroupRaidRoundAction`

Added in the boss runtime slice:

```text
id                    String @id @default(uuid())
sessionId             String
turn                  Int
actorCharacterId      String
actionKey             String
actionPayloadJson     Json?
resultJson            Json?
submittedAt           DateTime
createdAt             DateTime

unique(sessionId, turn, actorCharacterId)
index(sessionId, turn)
index(actorCharacterId)
```

The unique triple makes duplicate button presses converge to one queued action. An old version callback may replay the current card but cannot overwrite a committed action.

### `GroupRaidParticipantReward`

```text
id                    String @id @default(uuid())
sessionId             String
characterId           String
periodId              String
status                String // pending|processing|applied|forfeited
rewardJson            Json
processingStartedAt   DateTime?
appliedAt             DateTime?
lastError              String?
createdAt              DateTime
updatedAt              DateTime

unique(sessionId, characterId)
index(characterId, periodId)
index(status, processingStartedAt)
```

A separate reward row is preferable to one giant all-or-nothing group transaction. It provides exactly-once per-character retry after a process crash while preserving one canonical session result.

## Reuse and cautions

### `ActiveCombatLease`

Use one lease per active participant:

```text
kind = "group-raid"
referenceId = session.id
```

Acquire leases only at active start, in the same logical transition that freezes snapshots. Release them on every terminal/repair path.

### Existing `User.currentRaidId`

The schema already contains a `currentRaidId` field. Do not make it authoritative until current runtime usage and migration history are inspected. Prefer participant rows plus `ActiveCombatLease`; populate or retire the user field only through an explicit compatibility decision.

### Barrel period helpers

Extract/reuse the existing canonical `getBarrelRaidPeriod(...)`, Kyiv timezone and audit-break behavior. Do not create a second hourly bucket calculation.

### Daily success gate

Create one helper such as `hasCompletedBarrelPeriod(characterId, periodId)` that recognizes both legacy and Senior Brother success. Call it with the session's frozen `periodId`, not a freshly calculated wall-clock period. All beer/round access and create/join checks use it. Never let the new path create a second independent success faucet.

## State machine

```text
create -> recruiting
recruiting -> active      (manual early start or deadline start)
recruiting -> cancelled   (last participant leaves / leader cancels)
recruiting -> expired     (deadline recovery finds no eligible participants)
active -> won
active -> lost
active -> invalidated     (malformed state or unrecoverable life mismatch; no reward)
terminal -> terminal      (replay only)
```

No transition returns from active/terminal to recruiting.

## Recruitment transactions

### Create

1. Resolve character and current period.
2. Revalidate level, audit-break creation policy, success gate, active membership and incompatible locks.
3. Calculate/freeze `joinUntilAt` through the existing Barrel wait logic.
4. Insert session plus leader participant with unique live keys.
5. On unique conflict, return the canonical existing live session.

### Join

1. Resolve opaque token to session.
2. Canonicalize passive expiry before checking status.
3. Revalidate character, the session's frozen period, level, success for that period, membership and capacity.
4. Insert participant with unique `(session, character)` and `activeMembershipKey`.
5. Duplicate join returns canonical membership/card.
6. Capacity race is resolved transactionally; never exceed `8`.

### Leave

- Allowed only while recruiting.
- Null the active membership key and mark left exactly once.
- If leader leaves, transfer to earliest remaining joined participant using deterministic `(joinedAt, id)` order.
- If no one remains, cancel and clear the session live key.

### Start

Use CAS on `(id, status=recruiting, version, joinUntil/manual rule)`.

Within the start transaction or a recoverable start protocol:

1. lock/claim the session transition;
2. re-read all participants;
3. canonicalize resources;
4. remove ineligible rows;
5. acquire combat leases for every valid participant;
6. freeze snapshots and applicable next-PvE buffs;
7. consume those buffs once;
8. calculate `N`, `raidLevel`, boss stats and HP;
9. persist active state, first round deadline and incremented version.

If partial lease acquisition cannot be made safely in one transaction, do not leave a half-active session. Use a `starting` internal status with explicit repair or retry the transaction after excluding conflicts; document the chosen invariant in code/tests.

## Round protocol

### Submit action

- Parse compact callback data, but trust only the server row.
- Re-read session, participant and action availability.
- Require active status, matching current turn, actor active/alive and deadline not passed.
- Insert the unique round-action row.
- Store no RNG result at submit time.
- If every currently acting participant has submitted, attempt resolver CAS.
- Duplicate/stale action returns current state without mana/cooldown/RNG mutation.

### Resolve round

One resolver wins a CAS claim for `(sessionId, status=active, turn, version)` when either:

- all required actions exist before the deadline; or
- `roundExpiresAt <= now`.

Build missing timeout actions as auto-defend in memory, derive deterministic RNG from session/rules/turn, call pure domain resolution, persist one next state/version, then record per-action result summaries.

Scheduler and player callback may race; only one advances the turn.

### Telegram updates

- Each participant has a private stored message reference.
- Shared/group card is spectator-safe and contains no private resources or actions.
- Editing is best-effort. On edit failure, send a replacement and update the stored reference.
- Telegram failure never rolls back the committed game state.

## Terminal settlement

### Step 1: terminalize session

CAS the active session to `won/lost/invalidated`, store result, final participant runtime, reward plan and completion timestamp, clear the session live key. This step is deterministic and never grants twice.

### Step 2: settle participants

For each participant independently and replayably:

- persist terminal HP/mana/regeneration timestamps once;
- finalize consumed buffs once;
- create/get one reward row;
- apply stored XP/gold/item grants through guarded repository operations;
- write Senior/legacy Barrel success only for a won eligible participant;
- release active membership key and combat lease;
- mark settlement applied.

A scheduler/recovery path scans terminal sessions with unsettled participants. Duplicate workers converge through reward and resource-settlement status/CAS.

Do not call the raid complete for operational monitoring until every participant is settled or explicitly repaired/forfeited, but player-visible terminal state may be replayed from the stored result while a retry occurs.

## Restart and repair

On boot and periodically:

- expire overdue recruiting sessions;
- start deadline-ready sessions or leave them lazily startable, according to the chosen notification policy; audit break never strands a session that already exists;
- resolve due active rounds;
- repair terminal sessions with pending settlement;
- release orphan group-raid leases only after proving the referenced session is terminal/missing and recording the repair;
- invalid malformed active state without rewards rather than guessing combat results.

Add dev-only controls for local QA:

- create a controlled recruiting session;
- advance recruiting deadline;
- advance active round deadline;
- inspect/repair session summary;
- stop/cancel a dev session through canonical transitions.

## Deep-link and callback contract

- Deep link payload should be compact, e.g. `raid_<opaqueToken>`.
- Callback payloads stay below Telegram's limit and carry only compact token/action/version hints.
- Server state owns actor, session, turn, eligibility and rewards.
- Never expose numeric DB ids or Telegram ids.
- A forwarded result card must not become a join token after recruiting ends.

## Presence integration

- `👀 Хто поруч` may offer `⚔️ Покликати в рейд` only for the actor's live recruiting session.
- Filter out self, under-level, already-successful, incompatible-active and already-joined targets without revealing why to other players.
- The target receives a private invitation; the public nearby list does not reveal acceptance.
- Joining writes the Barrel presence only after the join transaction succeeds.
- Combat lock redirects active participants to their raid card while still allowing approved side surfaces under the current central policy.

## Minimum integration tests

- concurrent create by one leader;
- concurrent final-slot joins;
- duplicate join/leave/cancel;
- leader leave transfer;
- join at exact expiry boundary;
- manual start racing deadline start;
- participant becomes invalid during recruiting;
- partial lease conflict at start;
- duplicate action and older-version callback;
- all-actions resolver racing timeout resolver;
- crash after terminal session but before any/some rewards;
- duplicate reward worker;
- success gate blocks second session/reward;
- legacy pending/session remains legacy;
- remort/delete/restart leaves no live membership or combat lease orphan;
- Telegram edit/send failure does not duplicate state transitions.

# Party Combat Evolution Plan

Status: canonical `0.4.x` boundary; rewardless runtime and hardening are
implemented through repository version `0.4.1`.

## Decision

Build generic 2–3 player versus 2–3 enemy combat beside the existing Big Barrel
runtime. Reuse recruitment, actor-action primitives and concurrency patterns, but
do not widen `PartyBossSession` or add group orchestration to `FightService`.

The first production consumer is a small authored party expedition. A guild may
create an ordinary party, but does not own combat state.

## Why a separate runtime

The current orchestration layers encode different cardinalities and policies:

- persistent PvE owns one hero and one/two enemies, including a legacy singular
  monster mirror and threat-escalation rules;
- turn duels own exactly challenger and target;
- PartyBoss owns a singular boss plus Big-Barrel-specific taunt, ward, protocol,
  music, AI and settlement;
- `FightService` is already a large application service and is not the place for
  a fourth workflow.

Renaming or widening PartyBoss would risk the shipped raid without providing
ally targeting, participant delivery, repair or per-player settlement. A new
model keeps migration optional and testable.

## Reuse

- `PartySession` / `PartyParticipant` recruitment and leader rules;
- `ActiveCombatLease` as global incompatible-combat exclusion;
- actor action resolution, availability, cooldown and stable RNG helpers;
- PartyBoss unique actor/turn action and optimistic turn CAS;
- turn-duel strict parsing/repair and canonical participant-card convergence;
- deadline scheduler and server-owned timeout fallback concepts;
- combat simulation and effective-stat snapshot helpers.

Do not reuse an entire solo, duel or PartyBoss aggregate.

## Persistence shape

### GroupCombatSession

- `id`, `partySessionId`, `encounterKey`, `rulesVersion`;
- `status`, `turn`, `version`, `turnExpiresAt`;
- strict versioned `stateJson` and terminal `resultJson`;
- one immutable terminal `settlementPlanJson`;
- timestamps and an active-party uniqueness fence.

### GroupCombatParticipant

- session and same-life character identity;
- stable roster order and frozen combat snapshot;
- current canonical Telegram chat/message reference and reference version;
- contribution summary;
- resource/reward settlement status, attempts and receipt identity;
- unique session + character-life membership.

### GroupCombatAction

- session, turn, actor and explicit target identity;
- action kind, server-owned payload and deterministic result inputs;
- timestamps;
- unique session + turn + actor.

### Optional GroupCombatRound

Use a separate round summary only if product requires a complete journal. If
state keeps only the latest bounded recap, call it a recap rather than a complete
journal.

Enemies may stay in versioned state JSON for the bounded 3×3 scope. The parser
must validate rules version, session/party identity, turn, unique actor/enemy ids,
roster equality, finite numbers and terminal invariants.

## Round contract

1. The session transaction validates actor life, membership, lease and current
   turn from authoritative rows.
2. An action names a supported self/ally/enemy target. The server re-resolves the
   target; callback payloads never carry trusted stats or effects.
3. One action per living participant is inserted under a unique key.
4. The last required action and the timeout resolver race through the same
   `(id, status, turn, version)` CAS.
5. A deterministic pure resolver applies player actions, support effects, enemy
   AI/responses, statuses and terminal rules.
6. Only the CAS winner advances state, writes round summary/contribution and
   emits durable outbox/activity effects.
7. Telegram delivery observes committed DB state. Failure cannot affect the
   round and later refresh converges on the canonical participant card.

Timeout is a server-owned safe action. It must not spend an item or scarce
resource and must have an explicit inactivity/forfeit policy.

The non-production GroupCombat proof uses a distinct recruitment contract:
2–3 participants, a three-minute deadline and automatic scheduled start from
the current eligible roster. The scheduled start is system-owned and resolves
the current leader and joined roster transactionally instead of authorizing
against a due-list snapshot; manual early start still requires the current
leader. Invalid closure is conditional on the exact PartySession version
observed by that failed start. Terminal private participant callbacks from the superseded
recruiting card render the immutable combat result; public or foreign callbacks
stay non-disclosing.

## Targeting and ability parity

`CombatTargetScope` already includes ally scopes. The group resolver must cover
current recipe kinds rather than silently treating them as self-only:

- self and single ally;
- all allies including self;
- lowest-HP ally;
- one enemy and all enemies where authored;
- heal, guard, response reduction, counter and status effects;
- mana/cooldown/fumble and unavailable-action no-op rules.

Matrix tests must include Priest, Bard, Varenyk-mancer, Dwarf, Domovyk and
Molfar support behavior before a reward-bearing encounter. Re-run Big Barrel
simulations if a shared primitive changes its balance.

## Lifecycle and repair

Before introducing `group-combat`, centralize a typed lease-owner registry used
by restart, remort, dev reset, timed status release and repair.

- `/restart` and `/remort` are blocked transactionally during active multi-actor
  combat in the initial policy. Middleware only explains the blocker.
- strict parser failure CAS-invalidates the session without rewards;
- repair releases participant leases and all frozen timed statuses that can be
  recovered safely;
- orphan leases are detected by kind/reference and released idempotently;
- one malformed row cannot prevent healthy due sessions from resolving;
- shutdown awaits active scheduler work at a safe boundary and starts no new
  work after close.

Any future cancel-all remort policy needs separate product approval, atomic
survivor resource/item settlement and participant notifications.

## Settlement

The resolution transaction records a terminal plan, not every participant's
entire reward mutation for an unbounded raid.

Each participant has an idempotent settlement receipt. Resource, reward and
activity mutations can retry independently while preserving one
terminal plan. Partial delivery does not roll back combat. Participant count
alone never multiplies encounter loot. A pending settlement row is canonical
only with zero attempts, no receipt and no settlement timestamp; a completed
row requires at least one attempt, its immutable canonical receipt and a
settlement timestamp.

Contribution may include damage, healing, guard prevented, control, damage
taken and committed actions. The terminal card explains those dimensions.
GroupCombat has no generic Aid action: ally support comes from authored
class/race ability profiles, whose contribution remains eligible.

## Performance budgets

The target runtime is the small hosted baseline (0.5 CPU / 512 MB):

- due scan reads lean ids/deadlines, not full history;
- action resolution loads current-turn actions only;
- state and active-card text have explicit size caps;
- participant notifications are bounded O(P) and edit canonical cards;
- idle scheduler work is zero or a documented low-frequency recovery sweep;
- first load proof covers concurrent 3×3 sessions over 13–25 turns.

The `0.4.1` measured contract is manual start `32/32`, authoritative due start
`31/32`, queued action `20/20`, direct single resolving action `22/35`,
concurrent duplicate-final pair `31` aggregate and due-id scan `1/1`. Start
performs bounded reads over the allowlisted supported combat items for the
frozen 2–3-person roster.
Versioned state is capped at `32,768` UTF-8 bytes and the 24-case 2×2/3×3,
13/25-turn support simulator observed `5,066`; participant cards are capped at
Telegram's `4,096` UTF-8 bytes and reuse the canonical message.

## Delivery sequence

- `0.3.16`: lifecycle, parser/repair and concurrency prerequisites.
- `0.4.0`: flagged rewardless 2–3×2–3 proof with one authored encounter.
- `0.4.1`: implemented ability parity, AI/items/status hardening, immutable
  settlement skeleton and load/simulator coverage; production exposure and
  manual Telegram QA remain separate gates.
- `0.4.2`: first reward-bearing production-capable consumer: the exact
  left-passage pending encounter, reserved by a 2–3-person `PartySession`;
  production entry remains default-off.
- `0.4.3`: independent guild membership shell.
- `0.4.4`: guild weekly objective using the same party/group-combat runtime.
- `0.4.5`–`0.4.11`: bounded Korchma/social-economy catch-up tasks may reuse the
  proven status/item boundaries without becoming group-combat runtime owners.
- `0.4.12`: cosmetic guild progression after observed weekly data.

## Explicit non-goals

- widening or migrating Big Barrel during the first proof;
- >3×3 combat, raid finder or public matchmaking;
- guild bank, trade custody, wars or PvP;
- Redis, Mini App or a broad repository rewrite;
- claiming a complete journal when only the latest rounds are retained.

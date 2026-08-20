# Referral Foundation design

Canonical source: `../../CONTRACT.md`.

## Goal

Add one public, player-initiated invitation loop that is worth using:

- a valid link atomically records one first-touch referral for a fresh player;
- the inviter can see a small level-progress card for arrived invitees;
- existing level achievements `3/5/8/13` create exact item, Iskrokamin and ordinary-gold bundle entitlements;
- the bot delivers each whole bundle automatically and sends one stage notification;
- replay, restart, remort and concurrency cannot duplicate or split economic grants.

This is not a growth platform, a paid acquisition program or a general social graph.

## Frozen policy

Keep one typed, code-owned constant and snapshot-test every field:

```ts
const REFERRAL_POLICY_V1 = {
  version: 1,
  rewardFamily: "REFERRAL_INVITER_LEVEL_TRACK",
  stages: [
    {
      key: "LEVEL_3",
      level: 3,
      achievementId: "achievement.level.3",
      gold: 50,
      itemGrants: [
        { itemId: "item.dense-bandage", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 5 }
      ]
    },
    {
      key: "LEVEL_5",
      level: 5,
      achievementId: "achievement.level.5",
      gold: 120,
      itemGrants: [
        { itemId: "item.field-kit", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 13 }
      ]
    },
    {
      key: "LEVEL_8",
      level: 8,
      achievementId: "achievement.level.8",
      gold: 760,
      itemGrants: [
        { itemId: "item.field-kit", quantity: 2 },
        { itemId: "item.iskrokamin", quantity: 65 }
      ]
    },
    {
      key: "LEVEL_13",
      level: 13,
      achievementId: "achievement.level.13",
      gold: 900,
      itemGrants: [
        { itemId: "item.field-kit", quantity: 3 },
        { itemId: "item.iskrokamin", quantity: 193 }
      ]
    }
  ]
} as const;
```

Snapshot-test the entire array, canonical `itemId` ordering and absence of duplicate item IDs. The live achievement catalog is the player-facing meaning of each stage. The payout producer must use the canonical transaction-level level crossing, not depend on best-effort `AchievementService.trackEventSafely` succeeding. The four rows total `1830` gold and `276` Iskrokamin: L3 maps `+1`, L5 maps `+2`, L8 combines `+3/+4`, and L13 covers the most expensive currently supported single `+5` attempt; this policy adds no `+6` upgrade.

## Player flow

### Inviter

1. Open `📰 Дошка корчми → 📨 Поклик до Квестарні` or `/invite`.
2. See exact per-stage rewards, stable link, accepted-and-arrived count and stage counters; no separate aggregate reward-total line is rendered.
3. Press `📝 Згенерувати запрошення`, cycle through 13 distinct texts with `🎲 Перегенерувати текст`, then open Telegram’s user-controlled share chooser without rotating the stable URL.
4. Receive a concise private join notice with the new Character name, race, class and title after first Character creation.
5. Receive one private payout notice after each automatic item-and-gold bundle commits.
6. Open `👥 Мої покликані` to see five accepted-and-arrived players per page.

There is no ordinary claim action.

### Invitee

1. Open a `ref1_*` deep link.
2. The eligible first-touch relation is accepted in the same transaction that creates the fresh User and freezes the reward policy.
3. Continue directly into the ordinary onboarding path without a consent card or referral buttons.

The invitation must not trap onboarding. An unavailable, invalid, disabled, self or existing-user referral falls through to ordinary `/start` with a short explanation. Legacy `PENDING` rows resolve automatically before Character creation; foundation-off converts such rows to ordinary non-referral onboarding, and an inconsistent `PENDING + current Character` never binds retroactively.

## Start routing

Current `0.4.5` registration installs presence middleware before the ordinary start handler, and presence upserts `User`. Referral freshness therefore cannot be decided inside the existing late `/start` handler.

Recognize exact-shape `ref1_*` before presence middleware and run one short serializable capture transaction. It first resolves a stored code and checks the global flag, self-referral and absence of a canonical User for the incoming Telegram ID. Only that eligible path creates the User and its `ACCEPTED` attribution, acceptance timestamp and reward-plan version together. Unknown, malformed, foundation-disabled, self or genuinely existing-user paths create no attribution and continue ordinary start/presence handling. A concurrent presence/onboarding `User.upsert` or second referral capture is resolved through the unique Telegram ID and invitee-attribution keys: retry and re-read the persisted winner. If bounded write-conflict retries end while both User and attribution remain absent, return a neutral retry card without calling presence or onboarding; the same valid link stays eligible for an atomic retry. Never manufacture `existing-user` from an absent User.

The User insert and attribution insert are one atomic unit: an injected failure between them rolls both back, so retry cannot mistake an orphan capture-created User for a pre-existing player.

Do not add a second ad-hoc parser. Extend the canonical `parseStartPayload` union with an exact, length-bounded referral variant and prove all existing variants remain unchanged:

- no payload;
- duel;
- party;
- guild invite;
- `nyz_left_attack_*`;
- tavern game;
- support thanks;
- unknown.

A referral parser accepts only the exact version prefix and URL-safe token shape. It never treats malformed `ref*` values as another invitation family.

## Suggested persistence model

Names may adapt to repository conventions; invariants may not.

### ReferralInviteCode

```text
id
inviterUserId unique
token unique
inviterNameSnapshot
createdAt
```

Generate `token` as exactly `randomBytes(12).toString("base64url")` (16 URL-safe characters, 96 random bits) and build the payload as `ref1_<token>`. The opaque public token is stored so the same link can be shown again; it is not an authentication secret, has no signing key and does not expire or rotate in v1. Distinguish unique conflicts: a token-key `P2002` regenerates with bounded retry, while an inviter-key `P2002` from concurrent `/invite` creation re-reads and returns the winning stable code. Store a sanitized plain-text Character-name snapshot for landing fallback; never store pre-escaped markup or guild identity. Never log a full link/token.

### ReferralAttribution

```text
id
inviterUserId
inviteeUserId unique
inviteCodeId
status                 // PENDING | ACCEPTED | DECLINED
capturedAt
acceptedAt nullable
declinedAt nullable
arrivedAt nullable
rewardPlanVersion nullable
createdAt
updatedAt
```

Required constraints:

- inviter and invitee must differ;
- invitee uniqueness enforces first touch;
- fresh rows are created `ACCEPTED`; only legacy `PENDING → ACCEPTED` or `PENDING → DECLINED` remains;
- no rebind, reopen or status reset;
- User relations survive Character deletion and remort.

The capture transaction freezes the current reward-plan version on the attribution. Every later stage resolves through that frozen plan. First Character creation then sets `arrivedAt` idempotently and creates one deduplicated join-notification event from the current safe Character name plus canonical race, class and combo title. It also returns the frozen referral-arrival context to the canonical onboarding publication path, which emits `referral.arrived` instead of ordinary `character.created` under the same `character.created:<characterId>` dedupe key. Integrate this with the canonical create-if-missing transaction or an equivalent durable operation; do not emit a named join notice or public referral relationship before a Character exists.

Legacy accept/decline callbacks bind the invitee User and converge through automatic pending resolution; dashboard, refresh and pagination callbacks bind the inviter User. A wrong actor or stale state returns the canonical stale alert and changes/exposes nothing.

An impossible legacy conflict—`PENDING` attribution with an existing current Character—fails referral acceptance closed. Mark/resolve it as declined through an audited idempotent path, preserve the Character and never backfill stage rewards.

### ReferralReward

```text
id
attributionId
beneficiaryUserId      // inviter
rewardFamily
milestoneKey
sourceAchievementId
rewardPlanVersion
rewardGold              // positive integer ordinary game gold
rewardItemsJson         // strict schema; canonical itemId order; no duplicates
state                   // PENDING | GRANTED
earnedAt
deliveryAttemptCount
nextAttemptAt
lastFailureCode nullable // bounded enum, no free-form/identity data
grantedAt nullable
grantedCharacterId nullable
grantedRemortCount nullable
actualGrantJson nullable
createdAt
updatedAt

unique(attributionId, beneficiaryUserId, rewardFamily, milestoneKey)
```

`rewardPlanVersion` and the whole frozen bundle are evidence, not uniqueness. Use the live `DuelTournamentClaim.rewardGold + rewardItemsJson` bundle shape as a persistence precedent, not its looser replay handling. Enforce `rewardGold > 0` in the additive SQLite migration and strictly validate every JSON field and positive integer quantity in the payout service. Reject malformed, extra, missing or duplicate components rather than merging or clamping them. Attribution/User deletion is restricted. `grantedCharacterId` is nullable `SetNull`; a Character cascade must never erase the anti-replay receipt.

The only accepted `rewardItemsJson` shape is a normalized array; `rewardPlanVersion` supplies the policy version:

```ts
Array<{ itemId: string; quantity: number }> // strictly ascending itemId
```

Each stage persists one parent row. Gold and item entries are components of that row, never independent claimable entitlements.

`actualGrantJson` uses the same item ordering and freezes `{ gold, balanceAfter, items }` from the successful transaction. It is evidence for reconciliation and post-commit achievement tracking, not a second authority that can be replayed.

Add access-path indexes deliberately, not just uniqueness constraints:

- attribution dashboard/list: `(inviterUserId, status, arrivedAt, id)`;
- bounded automatic payout: `(state, nextAttemptAt, earnedAt, id)` and beneficiary wake-up: `(beneficiaryUserId, state, nextAttemptAt, earnedAt, id)`;
- durable outbox retry: `(kind, state, nextAttemptAt, createdAt, id)` and expired-lease recovery `(kind, state, claimedUntil, createdAt, id)`, plus a unique logical event key.

Keep ordinary flag-off reads free of referral joins. Verify SQLite query plans for bounded worker, inviter retry and five-row list paths on a production-like fixture.

### ReferralNotificationOutbox

```text
id
logicalKey unique
kind                   // REFERRAL_JOINED | REFERRAL_PAYOUT_GRANTED | REFERRAL_ACHIEVEMENT_UNLOCKED
recipientUserId
payloadJson
state                  // PENDING | PROCESSING | SENT
attemptCount
nextAttemptAt
claimToken nullable
claimedUntil nullable
sentAt nullable
createdAt
```

Logical event keys:

- `REFERRAL_JOINED:<attributionId>`;
- `REFERRAL_PAYOUT_GRANTED:<rewardId>`;
- `REFERRAL_ACHIEVEMENT:<characterId>:<achievementId>`.

The outbox stores a sanitized plain-text current name when safely available (otherwise null for the neutral payout variant), the canonical arrival race/class/title, and the exact frozen payout gold plus complete item-grant array. Escape dynamic text exactly once in the Telegram presenter; never store pre-escaped markup. No raw token, Telegram username, guild identity or share destination enters payloads. Arrival and payout presenters stay concise: no reward ladder on arrival and no upgrade-cost or total-track explanation after payout.

A bounded due worker runs on cold start and its normal schedule. It atomically leases one due `PENDING` row—or an expired `PROCESSING` row—by CAS to `PROCESSING` with a random `claimToken`, bounded `claimedUntil` and incremented attempt count. It commits that lease before calling Telegram. Only the lease holder may CAS its token to `SENT`; a known failure reschedules with capped backoff, while a crashed worker is recovered after lease expiry. Join rows remain eligible for already accepted/arrived relations when foundation entry is off. Payout rows are queried/leased only while `REFERRAL_REWARD_PAYOUTS_ENABLED=true`; a flag flip after grant leaves their outbox rows due, not falsely sent. Two healthy workers therefore do not routinely send the same event. A crash after Telegram accepted the message but before `SENT` remains the documented rare at-least-once duplicate gap; it never touches inventory or reward state. Wire this scheduler and the bounded pending-payout reconciler through the actual `src/app/createRuntime.ts` start/stop lifecycle with an immediate startup tick, non-overlap guard, clean stop and factory/runtime tests; bot construction alone is not runtime delivery.

## Milestone producer

`recordLevelMilestones` is the existing transaction-level source used by the principal reward repositories for levels `2..13`. Extend that canonical persistence boundary, or an equally complete central transaction hook, so every accepted referral level crossing creates User-level reward rows before Character-bound milestone evidence can be deleted by restart/remort.

Rules:

1. Resolve the invitee User from the current Character inside the transaction.
2. Ignore users without an `ACCEPTED` attribution.
3. Resolve the attribution’s frozen reward-plan version; for every stage crossed by `oldLevel → newLevel`, insert one parent reward row containing the complete normalized gold-and-items bundle with `on conflict do nothing`.
4. A jump to level 8 creates `LEVEL_3`, `LEVEL_5` and `LEVEL_8`.
5. A remort crossing calls the same producer; stable uniqueness makes it a no-op for already earned stages.
6. Foundation-entry flag state must not suppress progress for already accepted relations.
7. Persisting the entitlement is part of the canonical database transaction; Telegram and achievement presentation are not.

The inviter also receives rewardless visible achievements for the first and thirteenth arrived invitees. Their progress comes from the authoritative count of `ACCEPTED` rows with `arrivedAt`, not callback or notification delivery. Achievement rows and their uniquely keyed private notifications reconcile before the durable arrival row is marked complete, so failure remains recoverable on a later scheduler tick or service recreation without duplicating an unlock.

Tests must enumerate every level-changing repository/service path. Do not use a CharacterAchievement row as the receipt: `/restart` deletes it, and best-effort achievement tracking may fail after gameplay commit.

## Automatic delivery

After the level transaction commits, the post-update referral middleware wakes the shared non-overlapping scheduler for newly inserted rewards. If a tick is already in flight, queue exactly one follow-up tick. The normal interval, cold start and later interaction remain recovery paths; opening the inviter dashboard is never required.

For each pending row, in deterministic order:

1. Exit without mutation when `REFERRAL_REWARD_PAYOUTS_ENABLED=false`.
2. Start a short `Serializable` Prisma transaction using the repository’s bounded `P2034` retry convention.
3. Re-read the exact due `PENDING` row and beneficiary User. Resolve its immutable policy version and require an exact match across milestone, source achievement, positive gold and the complete normalized item array. Missing, extra, duplicate or unknown items, wrong positive quantities or gold, non-integers, non-positive values, overflow or malformed JSON fail closed: the row remains pending, records a bounded failure code/backoff, emits bounded telemetry and never substitutes or partially grants a component. Retain every issued policy definition while durable rows reference it.
4. Resolve the current Character. If absent, leave the row pending and move `nextAttemptAt` with capped backoff.
5. Compare-and-set the reward `PENDING → GRANTED`, storing Character/remort/life evidence. If it updates zero rows, exit/roll back immediately without economic mutation.
6. Increment `Character.gold` by the frozen positive amount and capture the committed `balanceAfter`.
7. In deterministic `itemId` order, upsert/increment every frozen `CharacterItem` stack.
8. Store canonical `actualGrantJson` for the complete applied bundle and create one unique stage payout-notification outbox row.
9. Commit before any Telegram call.

The winner-gating compare-and-set, gold increment, every item increment, actual-grant evidence and outbox creation succeed together or roll back together. Concurrent workers/replayed callbacks converge on one `GRANTED` row and one complete economic bundle.

Two different entitlements may legitimately target the same Character gold balance and `(characterId,itemId)` stacks. Their serializable increments must both survive contention and accumulate; entitlement uniqueness prevents duplicates but must not collapse distinct invitees into one grant or treat every `P2002` as a replay.

Initialize `nextAttemptAt=earnedAt`. The worker scans due rows in `(nextAttemptAt, earnedAt, id)` keyset order with a bounded scan budget. A no-Character/corrupt row receives a future due time, so it cannot occupy every oldest batch; Character creation/restart completion explicitly wakes that beneficiary's pending rows by making them due. Use only bounded `lastFailureCode` values such as `NO_CHARACTER`, `INVALID_BUNDLE`, `UNKNOWN_ITEM`, `INVALID_QUANTITY`, `INVALID_GOLD` and `TRANSIENT`, never exception text or identity data.

A normal active combat/search/party may keep its frozen inventory snapshot; that does not prevent the account-level bundle grant. Restart/remort serialization decides which life receives it:

- restart wins first: no Character, so payout stays pending;
- payout wins first: the whole bundle is granted once and later restart may delete its items and gold normally;
- remort wins first: the whole bundle targets the same Character ID in the new-life state;
- payout wins first: later remort applies ordinary gold reset and item reset/selection rules, with no referral regrant.

After successful grant, pass the actual item grants to the existing best-effort `item.received` achievement path and emit one best-effort `gold.balance` event with committed `balanceAfter` and a stable referral-payout source ID. Only the newly granted winner tracks them. Do not emit `item.crafted` for dense bandage or field kit; achievement failure cannot roll back or replay the bundle.

### Recovery

Retry pending rows:

- immediately after milestone commit;
- after inviter `/start`, `/invite` and other cheap safe interaction hooks;
- immediately after successful inviter Character creation/recreation or remort completion;
- in a bounded due-time/keyset background scan;
- through the same bounded internal reconciler when it is woken by startup or an ordinary safe interaction.

A retry never changes any frozen component. Missing content IDs or invalid gold/items fail closed, back off and emit bounded telemetry; do not merge, compensate or substitute any component.

## Notifications

### Join

Sent once after automatic first-touch acceptance and first Character creation. Use the exact `Inviter join notification` template in `../content/referral-ui-copy.md`; it contains only the separately sanitized Character name, race, class and title. It does not repeat the reward ladder or explain payout rules. Do not infer gender from Telegram profile data.

### Payout

Sent once logically after the committed full bundle. Use the exact neutral `Automatic payout notifications` template in `../../copy/ukrainian-ui-copy.md` with the frozen level, gold and every item/quantity. Use a current separately sanitized invitee Character name when available and the copy sheet’s unnamed fallback otherwise; notification creation must never retain or require a stale name.

## Public Chronicle arrival

The accepted relation is public only at first Character arrival. The shared invitation copy states that opening a valid fresh-player link binds the referral automatically; no separate consent card is shown. Extend the ActivityEvent union and presenter with `referral.arrived`:

```text
eventType: referral.arrived
category: adventurer
severity: normal
actorCharacterId: invitee first Character
actorDisplayName: frozen sanitized invitee name
subjectKind: referral-inviter
subjectId: inviter internal User id
subjectName: frozen sanitized inviter Character snapshot
sourceType: referral-attribution
sourceId: attribution id
dedupeKey: character.created:<inviteeCharacterId>
occurredAt: attribution.arrivedAt
```

The shared dedupe key is deliberate: a referred Character gets one arrival row, not generic `character.created` plus a second referral row. The authoritative Character/arrival transaction freezes the original Character ID, sanitized invitee name and arrival time on the attribution. The canonical onboarding service chooses the referral event before either publisher is called, while a bounded scheduler scans persisted arrivals without a Chronicle completion mark, republishes with the same dedupe key after failure/restart and marks completion only after the correct `referral.arrived` row exists. The renderer uses a gender-neutral structure, escapes each name exactly once and deliberately ignores guild-aware identity decoration:

```text
🤝 12:34 | Новий пригодник у Квестарні: «INVITEE», за покликом «INVITER».
```

The event appears in `all` and `adv`, not `imp` or `itm`. Link open, pending capture, decline and acceptance without Character arrival create none. Later referral milestones and payouts create no referral-specific ActivityEvent and expose no reward amounts; ordinary `character.level_reached` publication remains unchanged. Repository/service recreation and callback replay preserve the original `arrivedAt` and one deduped row. Internal attribution/source IDs may support access-controlled investigation, but the public presenter exposes no Telegram identity, token, link, guild, location, level, inventory, gold or reward detail. Chronicle visibility may reveal a suspicious pattern; it never automatically establishes abuse or changes payout state.

Telegram cannot provide end-to-end exactly-once delivery. The outbox may very rarely resend after an ambiguous send/ack crash gap, but the complete economic receipt remains exact-once.

## Dashboard projection

Aggregate from accepted attributions and durable reward rows:

Before the stable share link, show the exact four-stage reward table without a separate aggregate `Разом — …` line. Policy and economic evidence still verify the totals. This private inviter dashboard is the owner-approved referral-only exception to the general hidden-future-reward rule; invitation copy, lore and news do not inherit it. Invitation-copy regeneration cycles through 13 distinct Ukrainian texts and never replaces the stable referral token.

```text
arrivedTotal
grantedStageTotal
pendingStageTotal
earnedByMilestone[3|5|8|13]
```

For each accepted attribution with `arrivedAt`, read:

- separately sanitized current Character name, or a neutral unnamed no-current-character label;
- current level if a Character exists;
- historical stage checkmarks from reward rows.

Do not infer a historical checkmark from current level alone. After restart, current level can be lower than checked stages.

Use page size `5`, deterministic acceptedAt/id order, owner-bound callbacks and stale-page clamping. Dashboard refresh regenerates current state; it does not replace the stable referral link.

## Privacy and escaping

In the private referral dashboard, the inviter may see only the automatically bound relation after Character arrival. The public Chronicle arrival relation is governed by the section above:

- sanitized Character name;
- current numeric level;
- four historical stage states.

Never expose:

- Telegram ID, username or display name;
- exact location, presence, last-seen or online state;
- quests, fights, inventory, gold or remort state;
- guild crest/name/custom emoji;
- which chat/channel received the shared link.

Create a referral-specific name-only presenter. Sanitize length/control characters, then HTML-escape exactly once at presentation. Callback payloads contain opaque internal IDs, never names or tokens.

## Flags and disabled-mode truth table

| Foundation | Payouts | New capture/accept | Accepted milestone rows | Bundle delivery |
|---|---|---|---|---|
| OFF | OFF/ON | blocked | recorded | only if payouts ON |
| ON | OFF | allowed | recorded | queued pending |
| ON | ON | allowed | recorded | automatic |

Both flags default to false in committed `.env.example`. For the requested local/manual happy path, preserve secrets and set both to `true` in the developer’s untracked root `.env`; toggle payouts off/on during the matrix. Do not refresh the isolated bot without a request, but when the maintainer explicitly asks to start/restart/refresh/restore it, perform that action immediately under the current `AGENTS.md` rule and report afterward. Ordinary flag-off hot reads should not join referral tables unnecessarily.

## 0.4.5 coexistence

- Keep the canonical main reply keyboard at three rows.
- Put the entry on the Korchma board and keep `/invite` fallback.
- Public referral attribution never joins or suggests a guild.
- Private target-bound guild invitation flows remain unchanged.
- User-level guild membership and User-level referral attribution can coexist without sharing tables or rewards.
- The referral list must not inherit live guild identity decoration.
- Branch from fresh merged `main`; do not rewrite `0.4.5` history.

## Telemetry

Bounded enum labels only:

- capture: accepted, existing-user, self, malformed, disabled, rebind;
- attribution: accepted, declined, race-lost;
- milestone: `LEVEL_3|LEVEL_5|LEVEL_8|LEVEL_13`, inserted/duplicate;
- payout: granted, pending-no-character, pending-disabled, invalid-bundle, retry, failed;
- notification: joined/payout, sent/retry/failed;
- dashboard and share opens.

Never label metrics with token, Telegram ID, Character name, guild or destination chat. Measure accepted-to-stage conversion, time-to-stage, pending age, granted stage bundles, configured gold issued and item units issued by bounded plan/stage labels.

## Non-goals

- premium/referral currency, purchase-linked rewards or spending percentages; ordinary game gold is deliberately in the frozen policy;
- reward marketplace or referral token;
- invitee item package;
- multi-level referral tree;
- IP/device identity, CAPTCHA or automated fraud scoring;
- public referral leaderboard, public payout details or public names beyond the single Chronicle arrival relation;
- guild auto-join or guild contribution;
- cosmetic aggregate title track;
- retroactive attribution of existing Users;
- exact-once Telegram delivery.

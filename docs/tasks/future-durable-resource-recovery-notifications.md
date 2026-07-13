# Durable HP Recovery Notifications

Status: implemented behind a disabled-by-default production flag in PR #159.

## Goal and scope

Send one short private Telegram nudge only when the server observes passive HP recovery reaching canonical effective full HP. Lazy `/hero`, `/fight`, and callback resource synchronization remains a fallback but never renders or initiates the delayed notice. Mana notifications, balance changes, and recurring character reconciliation are out of scope.

Player copy:

> ❤️ Життя відновилося повністю.
>
> Організм подав заявку на продовження пригод і сам її погодив.

## Durable state machine

`HpRecoveryNotification` stores one unique row per character with a monotonically increasing generation and current-life `remortCount` token. Producers atomically reset the row in the same transaction as authoritative HP, recovery-anchor, level, equipment, direct-heal, terminal-combat, or remort writes.

- `waiting`: indexed by `status + nextAttemptAt`; eligible for a bounded claim.
- `checking`: owns a pre-send lease. Fresh work is not stolen; stale work resumes after restart.
- `ready`: passive recovery was recomputed as full and HP was CAS-persisted in the same transaction.
- `sending`: final life/generation/resource/combat guard passed before the network call.
- `sent`: delivery completed and never resumes.
- `suppressed`: direct/lazy full heal, resource/equipment/life drift, permanent Telegram failure, or ambiguous stale send; never resumes.

An older generation cannot rebase, mark ready, send, or finalize a newer generation. Any `ActiveCombatLease` kind defers processing. Remort advances the current-life token and suppresses the previous-life row.

## Canonical recovery snapshot

The worker bulk-loads only Character resource/profile fields, User Telegram id, remort count, active equipment, equipment-attunement actions, Shynok recovery state, and ActiveCombatLease. Static item and set data is resolved in memory. It reuses `summarizeCharacter`, effective-stat/set-bonus rules, tuning-versus-attuned rules, Shynok recovery windows, and `applyPassiveResourceRegeneration`.

The worker never calls `HeroService` and does not load inventory, achievements, cosmetic titles, priest presentation state, or other hero-card data. Stored `hpMax` is only the base value and is never used alone as the full-HP correctness test.

## Performance budget

- Cadence: 60 seconds by default, injectable in tests.
- Batch limit: 13 by default, injectable in tests.
- Idle tick: one bounded indexed due lookup and no character fan-out.
- Due batch: one bulk Character snapshot repository call for 1..13 rows, followed by per-row guarded CAS writes only for claimed work.
- Indexes: `(status, nextAttemptAt)` and `(status, processingStartedAt)` plus unique `characterId`.
- No migration backfill and no recurring full-character reconciliation scan.

## Delivery guarantee

Telegram `sendMessage` has no idempotency key, so the contract is deliberately anti-spam at-most-once across ambiguous network outcomes, not impossible exactly-once delivery.

- Success becomes `sent`.
- Known retryable 429/5xx failures return to `ready` with bounded backoff.
- Known blocked/chat-not-found failures become `suppressed`.
- Unknown/ambiguous failures remain `sending`; a stale sending lease is suppressed after restart and is not resent.
- Rows are sent sequentially and one row failure does not abort later rows.

## Rollout and lifecycle

`HP_RECOVERY_NOTIFICATIONS_ENABLED=false` is the default. When disabled, producers do not create backlog rows and runtime does not construct or start the scheduler. When enabled, the scheduler is constructed only after the DB readiness probe, starts only from grammY `onStart`, and drains its in-flight tick exactly once before Prisma disconnect. Polling-start failure, polling failure after `onStart`, normal stop, and concurrent stop preserve the current runtime readiness contract.

No package version, changelog, or player news entry is attached to this disabled rollout slice. Achievement, quest overview, and lore updates are not needed: this is a passive operational nudge, not a new player action, quest state, location, item rule, or discoverable gameplay surface.

## Manual Telegram QA

Use an isolated non-production runtime and a test account:

1. Set `NODE_ENV=development` and `HP_RECOVERY_NOTIFICATIONS_ENABLED=true`, migrate, then refresh the local bot snapshot.
2. Run `/dev_hp_recovery_due`. It wounds the current character, moves the recovery anchor into the past, and creates a due queue generation; it never sends the notice directly.
3. Without pressing `/hero`, `/fight`, or a menu callback, wait for the next scheduler tick and verify exactly one private notice with the copy above.
4. Repeat while any solo, training, starter, duel, or party-boss combat lease is active; verify delivery waits and does not duplicate after combat.
5. Prepare another due row, then fully heal or run a lazy resource sync before delivery; verify no stale notice appears.
6. Prepare another due row, restart before checking, and verify stale checking resumes once. Simulate an ambiguous send crash and verify stale `sending` is suppressed rather than resent.

Production cannot register, list, or mutate through `/dev_hp_recovery_due`, even when the rollout flag is enabled.

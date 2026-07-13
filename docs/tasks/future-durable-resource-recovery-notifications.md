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
- `checking`: owns a pre-send lease fenced by the exact claimed `processingStartedAt`. Fresh work is not stolen; stale work resumes after restart, and the expired worker cannot rebase, suppress, mark ready, or clean up the reclaimed generation.
- `ready`: passive recovery was recomputed as full and HP was CAS-persisted in the same transaction.
- `sending`: final life/generation/resource/combat guard passed before the network call.
- `sent`: delivery completed and never resumes.
- `suppressed`: direct/lazy full heal, resource/equipment/life drift, permanent Telegram failure, or ambiguous stale send; never resumes.

An older generation or expired checking claim cannot rebase, mark ready, send, or finalize newer work. Any `ActiveCombatLease` kind defers processing. Remort advances the current-life token and suppresses the previous-life row. The ready-to-send transaction revalidates the narrow effective-state fingerprint and suppresses delivery when `User.lastActionAt > readyAt`, so a card interaction that already exposed the recovered state wins unless delivery was already claimed.

## Canonical recovery snapshot

The worker bulk-loads only Character resource/profile fields, User Telegram id and `lastActionAt`, remort count, active equipment, still-relevant equipment-attunement actions, Shynok recovery state, and ActiveCombatLease. Static item and set data is resolved in memory. It reuses `summarizeCharacter`, effective-stat/set-bonus rules, tuning-versus-attuned rules, Shynok recovery windows, and `applyPassiveResourceRegeneration`. The effective-state fingerprint covers profile/progression/stats, current life, equipment identity and timestamps, pending attunement, Shynok state, and player activity; it is reloaded immediately before the HP CAS and immediately before the delivery claim.

A base-full character with a still-tuning equipped item is rescheduled to the earliest matching `readyAt`, not suppressed. After readiness, canonical equipment and set effects are recomputed; unequip/replacement advances the producer generation and prevents stale activation. Attunement history is restricted to the canonical 42-minute maximum plus a two-minute clock tolerance, so completed historical rows cannot grow the worker snapshot indefinitely.

The authoritative producer audit covers terminal solo/training/starter combat, Big Barrel victory and loss/attempt settlement after XP/level rewards, turn-based duel XP/level settlement before lease release, DailyAction and Cooldown HP loss/rewards, class noncombat damage/healing, level barter, Cellar grownup rewards, equipped-item upgrade replacement, equipment changes and attunement creation/cancellation, item healing, Shynok resource settlement and drink activation/replacement, lazy Character resource CAS, and remort invalidation. Each producer call shares the mutation transaction. Passage-search `recordLevelMilestones` currently follows gold/item-only loot and does not write XP, level, HP, recovery anchors, or equipment effects, so it has no recovery producer write.

The worker never calls `HeroService` and does not load inventory, achievements, cosmetic titles, priest presentation state, or other hero-card data. Stored `hpMax` is only the base value and is never used alone as the full-HP correctness test.

## Performance budget

- Cadence: 60 seconds by default, injectable in tests.
- Batch limit: 13 by default, injectable in tests.
- Idle tick: one bounded indexed due lookup and no character fan-out.
- Due batch: one bulk Character snapshot load for 1..13 rows; actual SQLite statement-count coverage proves the relation SELECT count is constant from one to thirteen candidates. Only rows that are genuinely ready receive bounded single-row final snapshot reloads and guarded CAS writes.
- Claim cost: one indexed due SELECT plus at most one row CAS per claimed candidate; delivery stays sequential.
- Indexes: `(status, nextAttemptAt)` and `(status, processingStartedAt)` plus unique `characterId`.
- No migration backfill and no recurring full-character reconciliation scan.

## Delivery guarantee

Telegram `sendMessage` has no idempotency key, so the contract is deliberately anti-spam at-most-once across ambiguous network outcomes, not impossible exactly-once delivery.

- Success becomes `sent`.
- Known retryable 429 failures return to `ready` with bounded backoff and honor Telegram `retry_after`.
- Known blocked/chat-not-found failures become `suppressed`.
- 5xx, unknown network outcomes, and crashes after `sendMessage` are ambiguous and remain `sending`; a stale sending lease is suppressed after restart and is not resent.
- Thirteen total attempts or 24 hours without queue progress suppresses the low-value nudge. This same 24-hour stale cutoff prevents days-old nonterminal rows from sending after flag disable/re-enable; suppression happens only when a stale row becomes due, with no backlog scan.
- Rows are sent sequentially and one row failure does not abort later rows.

## Rollout and lifecycle

`HP_RECOVERY_NOTIFICATIONS_ENABLED=false` is the default. When disabled, producers do not create backlog rows and runtime does not construct or start the scheduler. When enabled, the scheduler is constructed only after the DB readiness probe, starts only from grammY `onStart`, and drains its in-flight tick exactly once before Prisma disconnect. Runtime stop fences a delayed `onStart`, including shutdown while polling startup is still pending. Polling-start failure, polling failure after `onStart`, normal stop, and concurrent stop preserve the current runtime readiness contract.

No package version, changelog, or player news entry is attached to this disabled rollout slice. Achievement, quest overview, and lore updates are not needed: this is a passive operational nudge, not a new player action, quest state, location, item rule, or discoverable gameplay surface.

## Manual Telegram QA

Status: required from the maintainer; not claimed as completed by this PR follow-up.

Use an isolated non-production runtime and a test account:

1. Set `NODE_ENV=development` and `HP_RECOVERY_NOTIFICATIONS_ENABLED=true`, migrate, then refresh the local bot snapshot.
2. Run `/dev_hp_recovery_due`. It wounds the current character, moves the recovery anchor into the past, and creates a due queue generation; it never sends the notice directly.
3. Without pressing `/hero`, `/fight`, or a menu callback, wait for the next scheduler tick and verify exactly one private notice with the copy above.
4. Repeat while any solo, training, starter, duel, or party-boss combat lease is active; verify delivery waits and does not duplicate after combat.
5. Prepare another due row, then fully heal or run a lazy resource sync before delivery; verify no stale notice appears.
6. Prepare another due row, restart before checking, and verify stale checking resumes once. Simulate an ambiguous send crash and verify stale `sending` is suppressed rather than resent.

Production cannot register, list, or mutate through `/dev_hp_recovery_due`, even when the rollout flag is enabled.

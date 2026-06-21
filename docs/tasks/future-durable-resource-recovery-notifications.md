# Future — Durable Resource Recovery Notifications

Status: queued follow-up, not shipped in `0.1.21`.

## Goal

Send occasional full-health recovery nudges only after the notification system is durable, stat-aware and safe around combat.

## Required design constraints

- Discover due characters using effective HP from level, remort and equipment, not only stored `hpCurrent/hpMax`.
- Exclude every character with an active combat lease: solo fights, training fights, starter fights and duels.
- Use one-shot notification state with retry semantics so Telegram delivery failure does not consume the only notice.
- Keep delivery multi-process safe with a claim/lease or outbox-style contract.
- Suppress the notification if a fight, duel or other runtime action independently changed HP after the candidate was discovered.
- Keep lazy `/hero` and `/fight` resource synchronization as the fallback path.

## Non-goals

- No schema or outbox changes in `0.1.21`.
- No notification after active combat starts.
- No player-facing promise until delivery semantics are implemented and tested.

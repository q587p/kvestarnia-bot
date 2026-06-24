# Codex prompt - Senior Barrel Brother read-only review

```text
Use $kvestarnia-second-codex-readonly.

Review the Senior Barrel Brother group raid PR against main.
Mode: READ ONLY, report only.
Scope: changed files first; inspect direct persistence/combat/reward/presence dependencies only when needed.

Read:
- the actual version task doc
- docs/design/SENIOR_BARREL_BROTHER_GROUP_RAID.md
- docs/design/SENIOR_BARREL_BROTHER_BALANCE.md
- docs/architecture/GROUP_RAID_SESSION_MODEL.md
- AGENTS.md

Focus on:
- session and participant uniqueness/cap races
- start revalidation and partial combat-lease failure
- action CAS, deadline boundary and scheduler/callback overlap
- deterministic simultaneous resolution and phase double-trigger bugs
- stale callbacks spending mana/cooldown/RNG or changing contribution
- restart during recruiting, active round, terminalization and partial settlement
- duplicate HP/mana/buff/reward/success/spotlight application
- legacy pending and level 1-7 Barrel compatibility
- beer-gate/double-faucet regressions
- presence/deep-link privacy and Telegram HTML/callback limits
- feature flag/kill switch behavior for already-active sessions
- simulator evidence versus documented bands
- missing tests and realistic multi-account Telegram checks

Do not edit, commit, push, format, auto-fix, change migrations/lockfiles/snapshots/config, or create an alternative implementation.

Output:
- blockers
- important issues
- minor issues
- missing automated tests
- manual Telegram checks
- balance/economy concerns
- safe notes

No tutorial.
```

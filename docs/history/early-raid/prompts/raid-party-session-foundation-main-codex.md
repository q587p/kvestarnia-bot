# Codex prompt - Raid Party Session Foundation

```text
Use $kvestarnia-version-task.

Implement exactly one versioned task:
docs/history/early-raid/tasks/0.2.x-raid-party-session-foundation.md

Context:
docs/ai/context.md
docs/history/early-raid/group-raid-session-model.md
docs/history/early-raid/repository-change-map.md

Follow AGENTS.md.
Start from updated main and inspect the actual architecture after the preceding 0.2.x work.
Choose the next free version, rename the active task/release surfaces accordingly, and keep artifact names independent of PR numbers.
Use high reasoning for persistence, concurrency, expiry, deep links and privacy.
Use a minimal reviewable diff.

Hard scope:
- relational recruiting session + participant foundation
- opaque deep link and nearby targeted invite
- join/rejoin/leave/leader transfer/cap/expiry
- dev-only or disabled-by-default creation and QA controls
- restart/concurrency/privacy coverage

Do not implement:
- production Big Barrel Brother route
- combat, rounds, HP/mana, boss, leases or rewards
- matchmaking, guilds, permanent parties, Redis/BullMQ or Mini App

Critical properties:
- one live session per leader
- one live membership per character
- concurrent cap never exceeds 8
- duplicate and stale callbacks replay canonical state
- no production Barrel behavior/economy regression
- no private id/location leakage

Run focused domain/parser/repository/service/presence tests first, then migration validation and full npm run check.
Open/update a ready main-targeting PR only when the task is complete and mergeable.

Final output:
- changed files
- behavior changed
- migration/deploy notes
- tests run
- manual Telegram QA
- risks/follow-ups
- PR link and completion status

No tutorial.
```

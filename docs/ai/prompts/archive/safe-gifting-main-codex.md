# Codex prompt - first 0.2.x task

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/0.2.0-safe-gifting-mvp.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Start from updated main after the Phase 2 MVP closeout.
Work on this versioned task only.
Use a minimal diff.
Inspect existing nearby-duel targeting, Shynok sale reservation checks, Mantok Chest protection and level-barter transactions before designing new helpers.
Run pure/focused tests first and Prisma integration tests before broad bot tests.

Hard scope:
gift exactly one eligible item stack unit with sender preview and recipient accept.
No item-for-item trade, no gold, no market, no item instances, no reward/referral bonus.

Critical properties:
- transactional exactly-once item movement
- competing-operation reservation safety
- stale preview rejection
- replay-safe terminal states
- active-combat/privacy gates
- no protected/equipped/story item movement
- restart-safe canonical state

Final output:
- changed files
- behavior changed
- tests run
- migration/deploy notes
- manual Telegram QA
- risks/follow-ups
- completion status

No tutorial.
```

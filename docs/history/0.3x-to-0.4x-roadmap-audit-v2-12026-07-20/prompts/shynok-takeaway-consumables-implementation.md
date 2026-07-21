# Shynok Take-away Consumables implementation

```text
Use $kvestarnia-version-task.
Use $balance-review for the bounded shelf and prices.

Implement:
docs/tasks/0.4.9-shynok-takeaway-consumables.md

Context:
docs/ai/context.md
docs/tasks/0.4.8-consumable-manatka-uses.md
docs/design/shynok-drinks-and-mantok-sales.md

Follow AGENTS.md. Use a minimal diff and at most three already-supported catalog
entries. Keep immediate drinking, food and take-away purchase distinct. Gold
decrement and one-unit inventory grant must share one replay-safe transaction.
Freeze pending-order cancellation, completed-stack cleanup and active-effect
remort behavior. Run duplicate/concurrent/stale/remort tests before UI polish.

No broad shop, dynamic pricing/stock, combat coffee, item instances, gifting at
checkout, resale coupling or new use effects.

Final output:
- changed files
- behavior changed
- tests / migration / QA evidence
- balance decisions
- risks / follow-ups
- completion status

No tutorial.
```

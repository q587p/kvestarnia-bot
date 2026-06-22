# Codex prompt — Shynok drinks and manatka sales

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/0.1.24-shynok-drinks-and-mantok-sales.md

Product/mechanics authority:
docs/SHYNOK_DRINKS_AND_MANTOK_SALES.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Work on this versioned task only.
Start from updated main after 0.1.23 is merged; do not create a stacked PR unless explicitly approved.
Inspect the current Shynok, KorchmaRoundPurchase, combat-state/recovery and Mantok Chest selector paths before editing.
Keep Telegram out of domain logic.
Use server-owned opaque tokens, atomic transactions and replay-safe stored results.
Do not broaden this into coffee, a general shop, item instances, PvP drink power or a full inventory rewrite.
Run focused tests first, then the full required checks and a fixed-seed no-drink combat comparison.
Update all release surfaces in lockstep and open a ready PR to main.

Final output:
- changed files
- behavior changed
- tests/checks run
- migration/deploy note
- risks / follow-ups
- PR URL
- completion status

No tutorial.
```

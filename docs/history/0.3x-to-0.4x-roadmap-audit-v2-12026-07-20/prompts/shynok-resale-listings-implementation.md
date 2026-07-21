# Shynok Resale Listings implementation

```text
Use $kvestarnia-version-task.
Use $balance-review for threshold, pricing and economy evidence.

Implement:
docs/tasks/0.4.10-shynok-resale-listings.md

Context:
docs/ai/context.md
docs/tasks/0.2.x-shynok-resale-and-korchmar-recycling.md
docs/design/shynok-drinks-and-mantok-sales.md

Follow AGENTS.md. Use a minimal diff. Preserve the shipped 42% rounded-up seller
payout. Listing intake and its unique sale/line receipt commit in that same sale
transaction. Use a semantic fingerprint and inclusive goldValue >= 93 threshold.
Each opaque buyer-life purchase intent owns one terminal receipt; claim, gold,
listing and inventory mutate once. Run sale replay and two-buyer races first.

No recycling, scheduler, player-set prices, seller royalties, auctions, trade,
item instances or broad market.

Final output:
- changed files
- behavior changed
- tests / simulations / migration / QA evidence
- risks / follow-ups
- completion status

No tutorial.
```

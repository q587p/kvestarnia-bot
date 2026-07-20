# Old Altar Blessings implementation

```text
Use $kvestarnia-version-task.
Use $ukrainian-rpg-content for player-facing Ukrainian copy.
Use $balance-review for the gold/favor/mana and status contract.

Implement:
docs/tasks/0.4.5-old-altar-blessings-mvp.md

Context:
docs/ai/context.md
docs/design/old-altar-blessings.md
docs/balance/old-altar-blessings-balance.md
docs/content/old-altar-blessings-copy.uk.md
docs/qa/old-altar-blessings-qa.md

Follow AGENTS.md. Use a minimal diff. Start by tracing active Priest blessing
through /hero, solo, training, turn duel, PartyBoss and GroupCombat summary/freeze
paths. Satisfy the task's truthful-effect activation gate before schema/UI work.
Use canonical ActiveCombatLease blocking and one-transaction offering/rite
mutations. Also apply the task's legacy busy-flow, PartySession-preparation and
actor+target remort-life cleanup policy; bare durable cooldown rows are not a
life boundary.

No manatka offerings, root-grove location, guild power, reward multiplier, item
instances, market or broad noncombat engine.

Run focused domain/repository/summary/routing tests first, then migration/restore,
npm run check and the task QA matrix.

Final output:
- changed files
- behavior changed
- tests / migration / QA evidence
- balance and achievement/lore decisions
- risks / follow-ups
- completion status

No tutorial.
```

# Shynok Food Buffs implementation

```text
Use $kvestarnia-version-task.
Use $balance-review for prices, effects, simulations and no-food baseline.
Use $ukrainian-rpg-content for the authored menu and result copy.

Implement:
docs/tasks/0.4.7-shynok-food-buffs-mvp.md

Context:
docs/ai/context.md
docs/design/game-design.md
docs/balance/notes.md

Follow AGENTS.md. Stop without editing if the task does not already contain the
human-accepted exact meal catalog and interaction matrix. Use a minimal diff.
Preserve one active food buff in food-owned storage, separate from drinks and
other statuses. Implement only the frozen effects through canonical helpers and
prove every advertised combat/expiry/remort boundary. Run races and simulations
before UI.

No five-buff stacking, cooldown rebound, broad shop, item instances, reward
multiplier or required paid preparation.

Final output:
- changed files
- behavior changed
- tests / simulations / migration / QA evidence
- balance and copy decisions
- risks / follow-ups
- completion status

No tutorial.
```

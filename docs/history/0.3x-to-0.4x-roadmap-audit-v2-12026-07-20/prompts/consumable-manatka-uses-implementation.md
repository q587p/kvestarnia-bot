# Consumable Manatka Uses implementation

```text
Use $kvestarnia-version-task.
Use $balance-review for the curated use catalog.

Implement:
docs/tasks/0.4.8-consumable-manatka-uses.md

Context:
docs/ai/context.md
docs/tasks/0.2.x-consumable-manatka-uses.md
docs/phase2/ITEM_TAGS_AND_CONSUMABLES.md

Follow AGENTS.md. Stop without editing if the task does not already contain the
human-accepted exact item/effect allowlist. The current ItemUseOrder is HP-heal
specific: implement only the frozen HP-only catalog or the one explicitly scoped
typed extension. Use a minimal diff, consolidate/reuse destructive-inventory
guards and prove behavior for already-owned legacy stacks deliberately.

No take-away purchase shelf, automatic legacy effect_id interpretation, combat/
party/raid effects, item instances, market or crafting.

Final output:
- changed files
- behavior changed
- activated/rejected item catalog
- tests run
- balance / migration / QA evidence
- risks / follow-ups
- completion status

No tutorial.
```

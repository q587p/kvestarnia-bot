Use $kvestarnia-version-task.

Implement a docs-only roadmap refresh after Player Abilities MVP is merged.

Context:
docs/ai/context.md

Read:
- docs/product/roadmap.md
- docs/history/phase2/deferred-0.2.md
- docs/backlog/UNFINISHED_CHARACTER_AND_0_1X_TAILS.md
- docs/tasks/README.md
- docs/phase2/SOCIAL_COMBAT_PLAN.md
- docs/phase2/ITEM_TAGS_AND_CONSUMABLES.md
- docs/history/phase1/achievements-phase1.md

Goals:
- mark Race/Player Abilities as shipped/active, not proposed next;
- record next recommended order: public sync, achievements/title records, daily korchma rounds, combat balance/monster signatures, inventory/equipment clarity, postal delivery, party foundation;
- keep party/raid as later, not immediate next;
- keep docs concise and avoid duplicating long design text.

Docs-only constraints:
- do not bump package.json;
- do not update CHANGELOG.md/news.md unless explicitly requested;
- do not change runtime code, schema, migrations or lockfiles.

Run markdown/link checks if available.
Final output: changed files, tests run, risks, completion status. No tutorial.

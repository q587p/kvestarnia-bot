# Kharakternyk Ward Signs Main Codex Prompt

```text
Use $kvestarnia-version-task.
Use $balance-review.
Use $ukrainian-rpg-content for player-facing Ukrainian copy.

Implement:
docs/tasks/0.2.x-kharakternyk-ward-signs.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Activate this draft as the next concrete 0.2.x version only after the current release/polish queue allows it, then rename docs consistently.
Work on this versioned task only.
Use a minimal patch-first diff.

Hard scope:
- existing class.kharakternyk only;
- Big Barrel Brother / party-session recruiting lobby only;
- one ward sign per lobby/session;
- deterministic mana/support/replay behavior;
- one-use mitigation of the first typed boss special / area attack;
- compact Telegram callbacks and short Ukrainian copy;
- focused tests for placement, support, roster freeze, trigger, replay safety and presentation.

Do not:
- start from deprecated race.kharakternyk;
- add new classes, races, locations, shops, crafting, loot, XP/gold rewards, item transfers, public feed rows or permanent buffs;
- implement a universal noncombat engine;
- parse Ukrainian combat log strings to detect boss specials;
- expose exact hidden support-cost thresholds in player-facing pre-commit copy.

Run focused tests first, then:
- npm run typecheck
- npm run check

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

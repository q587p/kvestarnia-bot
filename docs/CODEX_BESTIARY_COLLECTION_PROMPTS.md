# Codex Bestiary Collection Prompts

> Status after `0.0.19`: parked. Бестіарій лишається data/content foundation і read-only довідником. Не використовувати ці prompts як наступний implementation track, доки не закриті combat engine → equipment stat effects → loot engine → level 1-13. Повертатися сюди тільки після Phase 1 finish або якщо конкретний bestiary patch прямо потрібен для combat/loot safety.

Нижче — parked copy-paste prompts для майбутніх implementation PRs після Phase 1 finish.

## Future Prompt 1 — Bestiary Collection Schema Shell

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Add a tiny schema shell for bestiary collection / hunt journal projections without creating a second reward source.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/TECHNICAL_PLAN.md
- docs/ROADMAP.md
- docs/BESTIARY_COLLECTION_DESIGN.md
- docs/BESTIARY_COLLECTION_DATA_MODEL_NOTES.md
- docs/MONSTER_LOOT_DROPS.md
- docs/MONSTER_FLAVOR_ROUTING.md
- current Hunt Contract Ledger / hunt runtime service files
- tests/**

Required changes:
- add the smallest possible schema/projection shell for collection states;
- keep reward source of truth in the Hunt Contract Ledger or daily action ledger;
- make reset/deletion behavior explicit;
- keep the new data structures projection-only unless the design explicitly needs otherwise.

No-goals:
- no `/bestiary` runtime UX yet;
- no combat engine;
- no reward replay UI;
- no random loot engine;
- no power bonuses;
- no public sharing.

Safety / privacy / balance guardrails:
- do not create a second reward source;
- keep collection per character by default;
- preserve idempotency for repeated callbacks;
- make sure stale callbacks do not create new journal rows with new rewards.

Tests to run:
- schema validation tests;
- uniqueness / idempotency tests for the new projection rows;
- cleanup/reset tests;
- `git diff --check`;
- repo normal test commands if schema changes touched runtime.

Final response checklist:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

## Prompt 2 — `0.0.21 — Hunt Journal Read Model`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Add a Hunt Journal read model that shows recent contracts, completed actions, and replayable reward summaries without changing reward generation.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BESTIARY_COLLECTION_DESIGN.md
- docs/HUNT_JOURNAL_PROGRESS_PLAN.md
- docs/BESTIARY_COLLECTION_DATA_MODEL_NOTES.md
- docs/MONSTER_LOOT_DROPS.md
- docs/MONSTER_FLAVOR_ROUTING.md
- current Hunt Contract Ledger service / presenters / callbacks
- tests/**

Required changes:
- implement a compact journal read model for recent hunts;
- show original reward summary on replay instead of a flat dead-end message;
- show completed actions like strike/trick/retreat in a readable way;
- keep the flow idempotent.

No-goals:
- no reward generation;
- no combat engine;
- no random loot engine;
- no shop/sell/trade/crafting;
- no group hunts;
- no public sharing.

Safety / privacy / balance guardrails:
- keep the journal per character by default;
- no exact public timestamps in share surfaces;
- no hidden power bonus from collection state;
- reward replay must read the existing ledger result, not recalculate it.

Tests to run:
- journal read model tests;
- replay display tests;
- stale callback / repeated action tests;
- presenter text tests;
- `git diff --check`;
- repo normal test commands.

Final response checklist:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

## Prompt 3 — `0.0.22 — Bestiary Detail Collection States`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Use collection states inside bestiary detail screens so players can see whether a monster is locked, seen, encountered, resolved, trophySeen, or studied.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BESTIARY_COLLECTION_DESIGN.md
- docs/HUNT_JOURNAL_PROGRESS_PLAN.md
- docs/BESTIARY.md
- docs/MONSTER_LOOT_DROPS.md
- docs/MONSTER_FLAVOR_ROUTING.md
- current bestiary / monster detail presenter files
- tests/**

Required changes:
- add state-aware bestiary detail copy;
- show locked/seen/resolved/studied strings in Ukrainian;
- keep the UI short and mobile-friendly;
- respect privacy defaults.

No-goals:
- no guaranteed drops;
- no equipment effects;
- no stat bonuses;
- no public sharing by default;
- no combat rework.

Safety / privacy / balance guardrails:
- do not expose hidden internal ids unnecessarily;
- no FOMO language;
- no power progression from collection states;
- trophy notes are hints, not promises.

Tests to run:
- presenter tests for each state;
- collection state transition tests;
- privacy redaction tests;
- `git diff --check`;
- repo normal test commands.

Final response checklist:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

## Prompt 4 — `0.0.23 — Weekly Field Notes Digest`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Add a lightweight weekly field-note digest that summarizes bestiary / hunt journal progress without turning the game into a grind checklist.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BESTIARY_COLLECTION_DESIGN.md
- docs/HUNT_JOURNAL_PROGRESS_PLAN.md
- docs/BESTIARY_COLLECTION_DATA_MODEL_NOTES.md
- docs/BESTIARY_COLLECTION_BACKLOG.md
- current journal / collection / bestiary read model files
- tests/**

Required changes:
- implement a compact weekly digest view or message;
- summarize recent contracts, resolved actions, and a few newly studied monsters;
- keep it optional and low-pressure;
- do not require public sharing.

No-goals:
- no leaderboard;
- no public social feed;
- no rewards for digest completion;
- no Redis jobs unless the project already needs them elsewhere;
- no collection power bonuses.

Safety / privacy / balance guardrails:
- keep it per character by default;
- no exact timestamps in public surfaces;
- no pressure to finish all monsters;
- digest should not outcompete actual gameplay loops.

Tests to run:
- digest formatter tests;
- privacy/redaction tests;
- idempotency tests if any scheduled event exists;
- `git diff --check`;
- repo normal test commands.

Final response checklist:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

# Design and Content Docs

Use these docs when changing mechanics, content, authored copy, monsters, quests, loot, achievements, lore-facing systems or social gameplay.

## Core design

- [`game-design.md`](game-design.md) — core loop, character, combat, progression and social mechanics.
- [`content-style-guide.md`](content-style-guide.md) — Ukrainian tone, humor, quotes and Telegram message format.
- [`terminology.md`](terminology.md) — canonical names and phrasing.
- [`../balance/notes.md`](../balance/notes.md) — formulas, economy, RNG and balance guardrails.

## Character, identity and non-combat tools

- [`character-creation.md`](character-creation.md) — character creation options and constraints.
- [`character-flavor.md`](character-flavor.md) — race/class/path flavor hooks.
- [`character-impact-loop.md`](character-impact-loop.md) — character identity impact loop.
- [`player-identity-abilities.md`](player-identity-abilities.md) — current/planned race, class and title abilities.
- [`noncombat-techniques.md`](noncombat-techniques.md) — class/race/signature non-combat technique planning.

## Combat, equipment and battle systems

- [`combat-action-variants-plan.md`](combat-action-variants-plan.md) — future combat action variant planning.
- [`battle-interventions.md`](battle-interventions.md) — battle intervention design notes.
- [`../architecture/combat-engine-design.md`](../architecture/combat-engine-design.md) — combat engine design if the change touches engine structure.
- [`loot-expansion-canonical-ids.md`](loot-expansion-canonical-ids.md) — canonical ids and generated loot adapter boundary.
- [`mantok-ability-grants-foundation.md`](mantok-ability-grants-foundation.md) — Mantok Ability Grants design when present in the active branch.

## Monsters, loot and encounters

- [`bestiary.md`](bestiary.md) — first roster and reaction hooks.
- [`monster-loot-drops.md`](monster-loot-drops.md) — monster-to-item mapping for controlled drops.
- [`monster-flavor-routing.md`](monster-flavor-routing.md) — selector priority for race/class/path/combo monster flavor.
- [`monster-encounter-authoring-guide.md`](monster-encounter-authoring-guide.md) — monster encounter authoring notes.
- [`bestiary-collection-design.md`](bestiary-collection-design.md) — future collection design notes.

## Quests, checks and authored resolution

- [`adventure-quest-readability-and-local-failure.md`](adventure-quest-readability-and-local-failure.md) — Adventure Choice readability and local failure design notes.
- [`quest-contract-authoring-guide.md`](quest-contract-authoring-guide.md) — quest contract authoring guide.
- [`quest-resolution-variety.md`](quest-resolution-variety.md) — authored quest methods, result grades, costs and idempotent rewards.
- [`quest-skills-and-checks.md`](quest-skills-and-checks.md) — deterministic quest-resolution math and chance bands.
- [`quest-resolution-content-seeds.md`](quest-resolution-content-seeds.md) — content direction for quest-resolution scenes.
- [`quest-flavor-routing.md`](quest-flavor-routing.md) — quest flavor routing notes.
- [`../references/problem-quest-chain.md`](../references/problem-quest-chain.md) — internal reference notes for Korchmar problem chain.

## Achievements, social loops and lore-facing systems

- [`achievements-catalog.md`](achievements-catalog.md) — shipped rewardless achievement catalog.
- [`achievements-design.md`](achievements-design.md) — achievement design notes.
- [`daily-korchma-rounds.md`](daily-korchma-rounds.md) — daily `Корчмарський обхід` design.
- [`tavern-social-games.md`](tavern-social-games.md) — tavern social games design.
- [`shynok-drinks-and-mantok-sales.md`](shynok-drinks-and-mantok-sales.md) — Shynok drinks and Mantok sales design.
- [`kvestarnia-lore-board.md`](kvestarnia-lore-board.md) — lore board design if present.
- [`latest-events-feed.md`](latest-events-feed.md) — latest events feed design if present.
- [`referral-system.md`](referral-system.md) — 0.4.6 first-touch referral, privacy, lifecycle, payout and Chronicle contract.

## Raid and party design

- [`guilds-and-party-progression.md`](guilds-and-party-progression.md) — canonical `0.4.x` product boundary for temporary parties, 2–3×2–3 expeditions, guild foundation and weekly goals.
- [`bard-inspiration-and-raid-lament.md`](bard-inspiration-and-raid-lament.md) — `0.3.14` Bard Inspiration, shared local music availability and Big Barrel Lament contract.
- [`../history/early-raid/`](../history/early-raid/) — historical Big Barrel group-raid design, balance, copy and QA package.
- [`raid-role-flavor-notes.md`](raid-role-flavor-notes.md) — raid role flavor notes if present.
- [`../history/phases/phase2/planning/group-combat-and-raids.md`](../history/phases/phase2/planning/group-combat-and-raids.md) — closed Phase 2 raid-growth planning.

## Guardrails

- Player-facing copy stays Ukrainian.
- Do not copy protected scenes, characters, unique places or long quotes from inspiration sources.
- Do not reveal exact hidden odds or future rewards in pre-commit player choices.
- Update task docs and release surfaces only when the active task requires it.

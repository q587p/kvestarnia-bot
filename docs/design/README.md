# Design and Content Docs

Use these docs when changing mechanics, content, authored copy, monsters, quests, loot, achievements or lore-facing systems.

## Core design

- [`../GAME_DESIGN.md`](../GAME_DESIGN.md) — core loop, character, combat, progression and social mechanics.
- [`../CONTENT_STYLE_GUIDE.md`](../CONTENT_STYLE_GUIDE.md) — Ukrainian tone, humor, quotes and Telegram message format.
- [`../TERMINOLOGY.md`](../TERMINOLOGY.md) — canonical names and phrasing.
- [`../BALANCE_NOTES.md`](../BALANCE_NOTES.md) — formulas, economy, RNG and balance guardrails.

## Monsters, loot and encounters

- [`../BESTIARY.md`](../BESTIARY.md) — first roster and reaction hooks.
- [`../MONSTER_LOOT_DROPS.md`](../MONSTER_LOOT_DROPS.md) — monster-to-item mapping for controlled drops.
- [`../MONSTER_FLAVOR_ROUTING.md`](../MONSTER_FLAVOR_ROUTING.md) — selector priority for race/class/path/combo monster flavor.
- [`../MONSTER_ENCOUNTER_AUTHORING_GUIDE.md`](../MONSTER_ENCOUNTER_AUTHORING_GUIDE.md) — monster encounter authoring notes.
- [`../LOOT_EXPANSION_CANONICAL_IDS.md`](../LOOT_EXPANSION_CANONICAL_IDS.md) — canonical ids and generated loot adapter boundary.

## Quests, checks and non-combat tools

- [`../QUEST_RESOLUTION_VARIETY.md`](../QUEST_RESOLUTION_VARIETY.md) — authored quest methods, result grades, costs and idempotent rewards.
- [`../QUEST_SKILLS_AND_CHECKS.md`](../QUEST_SKILLS_AND_CHECKS.md) — deterministic quest-resolution math and chance bands.
- [`../QUEST_RESOLUTION_CONTENT_SEEDS.md`](../QUEST_RESOLUTION_CONTENT_SEEDS.md) — content direction for quest-resolution scenes.
- [`../NONCOMBAT_TECHNIQUES.md`](../NONCOMBAT_TECHNIQUES.md) — class/race/signature non-combat technique planning.
- [`../DAILY_KORCHMA_ROUNDS.md`](../DAILY_KORCHMA_ROUNDS.md) — daily `Корчмарський обхід` design.

## Identity, achievements and lore

- [`../PLAYER_IDENTITY_ABILITIES.md`](../PLAYER_IDENTITY_ABILITIES.md) — current/planned race, class and title abilities.
- [`../ACHIEVEMENTS_CATALOG.md`](../ACHIEVEMENTS_CATALOG.md) — shipped rewardless achievement catalog.
- [`../ACHIEVEMENTS_DESIGN.md`](../ACHIEVEMENTS_DESIGN.md) — achievement design notes.
- [`../PROBLEM_QUEST_CHAIN_REFERENCES.md`](../PROBLEM_QUEST_CHAIN_REFERENCES.md) — internal reference notes for Korchmar problem chain.
- [`kvestarnia-lore-board.md`](kvestarnia-lore-board.md) — lore board design if present.
- [`latest-events-feed.md`](latest-events-feed.md) — latest events feed design if present.

## Future raid package docs in this folder

- [`BIG_BARREL_BROTHER_GROUP_RAID.md`](BIG_BARREL_BROTHER_GROUP_RAID.md) — future group raid flow.
- [`BIG_BARREL_BROTHER_BALANCE.md`](BIG_BARREL_BROTHER_BALANCE.md) — future balance model and reward guardrails.

## Guardrails

- Player-facing copy stays Ukrainian.
- Do not copy protected scenes, characters, unique places or long quotes from inspiration sources.
- Do not reveal exact hidden odds or future rewards in pre-commit player choices.
- Update task docs and release surfaces only when the active task requires it.

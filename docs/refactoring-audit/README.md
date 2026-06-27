# Kvestarnia Refactoring Audit Package

Audit date: `12026-06-27` Kyiv/Holocene.
Repo observed: `q587p/kvestarnia-bot`, `main` snapshot still reporting package version `0.2.6` while the active planning context is `0.2.7 — Player Abilities MVP`.

This package is intentionally named by topic, not by PR number. The prompts are files, not pasted long blocks, so they can be reused by separate Codex threads.

## Contents

- `analysis/refactoring-audit.md` — executive analysis and priority order.
- `analysis/hotspot-inventory.md` — file-by-file hotspot table with suggested action.
- `docs/refactoring-principles.md` — guardrails for safe refactoring in this project.
- `docs/bot-game-best-practices.md` — Telegram bot and RPG-loop best practices mapped to Квестарня.
- `docs/player-abilities-architecture.md` — recommended `0.2.7` ability-registry architecture.
- `docs/codex-rollout-plan.md` — how to sequence Codex tasks without long prompts.
- `tasks/` — short implementation task docs.
- `prompts/` — ready-to-paste Codex prompts pointing at those task docs.
- `codex-task-board.json` — machine-readable task queue.

## Main recommendation

Do **not** start with a repository-wide rewrite. The previous architecture stabilization already made `createBot()` a small ordered shell and split bot ownership into vertical modules. The new first priority should be a narrow, behavior-preserving foundation for `0.2.7 — Player Abilities MVP`:

1. Extract a player ability registry from `src/domain/combat/combatActions.ts` while keeping existing APIs and cooldown compatibility.
2. Add tiny bot callback-route helpers to remove repeated parse/invalid/answer/edit boilerplate, without inventing a new central router.
3. Prepare `FightService` for later decomposition with named dependencies and one small facade-preserving extraction.
4. Decompose the rest of `FightService` only after the ability MVP lands or behind characterization tests.

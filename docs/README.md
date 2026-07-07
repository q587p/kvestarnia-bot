# Docs Index

This is the front door for Kvestarnia documentation. The repository root [`README.md`](../README.md) stays public-facing: what the game is, why it is interesting, and where to start. Detailed product decisions, system references, runbooks, Codex workflow, task docs, history and backlog live here.

The docs are organized by reader need and document role. Avoid adding one-off Markdown files directly under `docs/`; use the category folders below and update the matching `README.md` index.

## Start here by need

| Need | Open |
| --- | --- |
| Understand the public product promise | [`product/README.md`](product/README.md) |
| Check voice, naming, player-facing copy or Ukrainian style | [`product/README.md`](product/README.md), [`design/README.md`](design/README.md) |
| Change mechanics, content, monsters, quests, loot or achievements | [`design/README.md`](design/README.md) |
| Change formulas, economy, RNG or combat balance | [`balance/README.md`](balance/README.md) |
| Change architecture, persistence, sessions, callbacks or fair-play guardrails | [`architecture/README.md`](architecture/README.md) |
| Run, smoke, QA or debug the bot | [`operations/README.md`](operations/README.md), [`qa/README.md`](qa/README.md) |
| Prepare a Codex task, review prompt or integration prompt | [`ai/README.md`](ai/README.md), [`tasks/README.md`](tasks/README.md) |
| Find the active versioned slice | [`tasks/README.md`](tasks/README.md) |
| Find deferred ideas and future slices | [`backlog/README.md`](backlog/README.md) |
| Read completed phase closeouts or old planning | [`history/README.md`](history/README.md) |
| Understand where a new document belongs | [`DOCUMENTATION_STRUCTURE.md`](DOCUMENTATION_STRUCTURE.md) |

## Category doors

- [`product/`](product/) — positioning, brand, public surface, roadmap and market/support notes.
- [`design/`](design/) — gameplay systems, content style, terminology, characters, monsters, quests, loot, achievements, social loops and lore-facing mechanics.
- [`balance/`](balance/) — formulas, economy, risk/reward, simulation notes and balance-specific feature docs.
- [`architecture/`](architecture/) — technical plan, security/fair-play, persistence, callbacks, sessions and architectural guardrails.
- [`operations/`](operations/) — setup, local runtime, playtesting, smoke checks and production-facing support runbooks.
- [`content/`](content/) — canon snapshots, lore/content seed docs, inspiration banks and player-facing copy packages.
- [`qa/`](qa/) — manual QA plans, focused smoke packages and feature-specific proof checklists.
- [`ai/`](ai/) — compact Codex context, prompt policy, prompt library, token-economy notes and AI workflow.
- [`tasks/`](tasks/) — versioned task docs, active slice, shipped records and future task drafts.
- [`backlog/`](backlog/) — deferred mechanics and idea banks that are not active implementation permission.
- [`history/`](history/) — completed phase records, old planning packages and imported audits.
- [`phase2/`](phase2/) — cohesive Phase 2 social-combat planning docs that are still useful as a package.
- [`phase2-roadmap-audit/`](phase2-roadmap-audit/) and [`refactoring-audit/`](refactoring-audit/) — imported audit packages; keep package-local structure intact.

## Canonical source map

These docs should be updated when their topic changes. Paths below assume the root-doc reorganization has been applied.

| Topic | Source of truth |
| --- | --- |
| Product promise and positioning | [`product/product-brief.md`](product/product-brief.md) |
| Brand, name and public wording | [`product/brand.md`](product/brand.md) |
| Roadmap and phase state | [`product/roadmap.md`](product/roadmap.md), [`tasks/README.md`](tasks/README.md) |
| Game loop and mechanics overview | [`design/game-design.md`](design/game-design.md) |
| Ukrainian voice and Telegram text style | [`design/content-style-guide.md`](design/content-style-guide.md), [`design/terminology.md`](design/terminology.md) |
| Balance, formulas and economy | [`balance/notes.md`](balance/notes.md) |
| Technical architecture | [`architecture/technical-plan.md`](architecture/technical-plan.md) |
| Security, privacy and fair play | [`architecture/security-and-fair-play.md`](architecture/security-and-fair-play.md) |
| Local setup and runtime troubleshooting | [`operations/developer-setup.md`](operations/developer-setup.md), [`operations/local-bot-runtime.md`](operations/local-bot-runtime.md) |
| Manual smoke testing | [`operations/playtesting.md`](operations/playtesting.md), [`qa/README.md`](qa/README.md) |
| Codex workflow and prompt policy | [`ai/codex-workflow.md`](ai/codex-workflow.md), [`ai/CODEX_PROMPT_POLICY.md`](ai/CODEX_PROMPT_POLICY.md), [`ai/context.md`](ai/context.md) |
| Version task convention | [`tasks/README.md`](tasks/README.md) |
| Documentation placement rules | [`DOCUMENTATION_STRUCTURE.md`](DOCUMENTATION_STRUCTURE.md) |

## Migration note

During the root cleanup, old links such as `docs/design/game-design.md` or `../design/game-design.md` may exist in branches or historical prompts. Move files with `git mv`, then update every reference with `rg` before calling the docs PR complete. Historical/audit packages may keep old references when they intentionally describe old repository state, but active docs, `AGENTS.md`, root `README.md`, skills and prompts should point to the new paths.

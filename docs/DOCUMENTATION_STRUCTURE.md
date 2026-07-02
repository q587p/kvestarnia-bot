# Documentation Structure

This document defines the intended shape of Kvestarnia documentation. It is a maintenance rule, not a one-time cleanup note.

## Goals

- Keep the root `README.md` public-facing and readable.
- Keep `docs/README.md` as the front door to all docs.
- Split docs by reader need and document role, not by the order in which files were created.
- Preserve historical/audit packages without letting them look like current implementation scope.
- Make Codex prompts short by pointing to durable docs instead of copying long context.

## Information architecture

Kvestarnia docs use a lightweight Diátaxis-inspired shape:

- **Product / explanation** — what the game is, why it exists, who it is for, how it should sound.
- **How-to / operations** — how to run, test, smoke, deploy or review.
- **Reference** — stable mechanics, terminology, balancing, architecture and fair-play rules.
- **Tasks / workflow** — bounded Codex-ready work, active slices, reviews and handoffs.
- **History / backlog** — closed phases, imported audits, old plans and future ideas.

## Current folder roles

| Path | Role | Put new docs here when... |
| --- | --- | --- |
| `docs/product/` | product, brand and public surface indexes | the doc explains positioning, roadmap, public wording or player promise |
| `docs/design/` | game/content/system design indexes and package docs | the doc designs mechanics, content, tone, lore, monsters, quests, loot or achievements |
| `docs/architecture/` | technical design and persistence/session notes | the doc explains architecture, data flow, sessions, idempotency, security or technical guardrails |
| `docs/operations/` | runbooks and QA | the doc tells a human how to run, test, smoke or diagnose the bot |
| `docs/ai/` | Codex/agent workflow | the doc is context, prompt policy, prompt library or AI workflow material |
| `docs/tasks/` | versioned task docs | the doc is one bounded implementation/release/docs task for Codex |
| `docs/tasks/archive/` | historical task material | the task is no longer active but still useful as record |
| `docs/backlog/` | future ideas and deferred scope | the doc is not ready to implement as the next active slice |
| `docs/history/` | phase closeout and old planning | the doc describes a completed phase, old roadmap, or imported historical package |
| package folders such as `phase2/`, `phase2-roadmap-audit/`, `refactoring-audit/` | cohesive planning packages | moving files out would make the package harder to review |

## Root `docs/` rule

Top-level `docs/*.md` should be limited to canonical, frequently linked entry points. New files should not default to the root. A root-level doc is acceptable only if it is a source of truth that many other docs intentionally point to, such as `ROADMAP.md`, `GAME_DESIGN.md`, `TECHNICAL_PLAN.md`, `DEVELOPER_SETUP.md`, `PLAYTESTING.md`, `CODEX_WORKFLOW.md`, or this structure file.

## Naming rules

- New files should use lower-kebab-case where practical, e.g. `docs/design/lore-board.md`.
- Existing uppercase legacy files may stay uppercase until moved in a focused cleanup.
- Do not put PR numbers in reusable artifact, prompt or docs filenames.
- Versioned implementation tasks stay in `docs/tasks/<version>-<short-slug>.md`.
- Codex-facing prompts stay English and should point to `docs/ai/context.md`, `AGENTS.md`, task docs and skills instead of copying long rules.

## Safe movement rule

When reorganizing existing docs:

1. Check `git status --short` first.
2. Use `git mv` so local edits move with the file.
3. Do not copy over modified files from an archive.
4. If a target path already exists, stop and merge manually.
5. Update all relative links in `README.md`, `AGENTS.md`, `.agents/skills/**`, `docs/**`, and any prompt that references the moved path.
6. Run `git diff --check` and a Markdown link scan if available.
7. Keep the PR docs-only unless the task explicitly asks for runtime changes.

## Suggested cleanup order

Do this in small waves. A link-safe index cleanup is better than one huge move that breaks historical references.

1. Add/refresh the category `README.md` files.
2. Compact root `README.md` so it links to category doors instead of listing every doc.
3. Refresh `docs/README.md` as the canonical index.
4. Move low-risk archive/prompt/backlog files first.
5. Move high-traffic canonical docs only after `rg` shows every reference is updated.
6. Keep imported audit packages intact unless a dedicated task says otherwise.

## Current high-value move candidates

Use this as a guide, not as a blind script. Skip or adjust any move that conflicts with current branch changes.

| From | To | Why |
| --- | --- | --- |
| `docs/CODEX_BESTIARY_COLLECTION_PROMPTS.md` | `docs/ai/prompts/archive/bestiary-collection-prompts.md` | old Codex prompt pack, not canonical root doc |
| `docs/CODEX_COMBAT_ENGINE_IMPLEMENTATION_PROMPT.md` | `docs/ai/prompts/archive/combat-engine-implementation.md` | old Codex prompt pack |
| `docs/CODEX_MONSTER_RUNTIME_PROMPTS.md` | `docs/ai/prompts/archive/monster-runtime-prompts.md` | old Codex prompt pack |
| `docs/CODEX_QUEST_CONTRACT_PROMPTS.md` | `docs/ai/prompts/archive/quest-contract-prompts.md` | old Codex prompt pack |
| `docs/CODEX_TASK_PROMPTS_BACKLOG.md` | `docs/tasks/archive/legacy-codex-task-prompts-backlog.md` | task/prompt history belongs with task archive |
| `docs/MONSTER_CONTENT_TASK_BACKLOG.md` | `docs/backlog/monster-content-task-backlog.md` | future content backlog |
| `docs/BESTIARY_COLLECTION_BACKLOG.md` | `docs/backlog/bestiary-collection-backlog.md` | future collection backlog |
| `docs/MANTOK_CHEST_BACKLOG.md` | `docs/backlog/mantok-chest-backlog.md` | future item-volume sink backlog |
| `docs/SOCIAL_ACTIONS_BACKLOG.md` | `docs/backlog/social-actions-backlog.md` | deferred social actions |
| `docs/SUPPORT_JAR_BACKLOG.md` | `docs/backlog/support-jar-backlog.md` | future support jar backlog |
| `docs/NEXT_IMPLEMENTATION_BACKLOG.md` | `docs/backlog/next-implementation-backlog.md` | old next-order backlog |
| `docs/PHASE1_RELEASE_NOTES.md` | `docs/history/phase1/PHASE1_RELEASE_NOTES.md` | completed phase record |
| `docs/PHASE1_CLOSEOUT_0_1_TRANSITION.md` | `docs/history/phase1/PHASE1_CLOSEOUT_0_1_TRANSITION.md` | completed phase record |
| `docs/PHASE1_CLOSEOUT_SMOKE.md` | `docs/history/phase1/PHASE1_CLOSEOUT_SMOKE.md` | completed phase record |
| `docs/PHASE1_FINISH_PLAN.md` | `docs/history/phase1/PHASE1_FINISH_PLAN.md` | old planning record |
| `docs/PHASE2_MVP_RELEASE_NOTES.md` | `docs/history/phase2/PHASE2_MVP_RELEASE_NOTES.md` | completed closeout record |
| `docs/PHASE2_MVP_CLOSEOUT_PLAN.md` | `docs/history/phase2/PHASE2_MVP_CLOSEOUT_PLAN.md` | completed closeout record |
| `docs/PHASE2_CLOSEOUT_SMOKE.md` | `docs/history/phase2/PHASE2_CLOSEOUT_SMOKE.md` | completed closeout smoke |
| `docs/GROUP_HOOK_DESIGN.md` | `docs/history/early-raid/GROUP_HOOK_DESIGN.md` | earlier raid direction, not current Phase 2 entry point |
| `docs/GROUP_RAID_SESSION_NOTES.md` | `docs/history/early-raid/GROUP_RAID_SESSION_NOTES.md` | earlier session notes, superseded by package/runtime docs |

High-traffic docs such as `BRAND.md`, `PRODUCT_BRIEF.md`, `GAME_DESIGN.md`, `ROADMAP.md`, `TECHNICAL_PLAN.md`, `DEVELOPER_SETUP.md`, `PLAYTESTING.md`, `CODEX_WORKFLOW.md`, `BALANCE_NOTES.md`, `SECURITY_AND_FAIR_PLAY.md`, `CONTENT_STYLE_GUIDE.md`, and `TERMINOLOGY.md` can stay top-level until a dedicated link-update PR moves them safely.

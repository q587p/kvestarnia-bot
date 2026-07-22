# Documentation Structure

This document defines the intended shape of Kvestarnia documentation. It is a maintenance rule, not a one-time cleanup note.

## Goals

- Keep the repository root `README.md` public-facing and readable.
- Keep `docs/README.md` as the front door to all detailed docs.
- Keep top-level `docs/` almost empty: only durable entry points should live there.
- Split docs by reader need and document role, not by the order in which files were created.
- Preserve historical/audit packages without letting them look like current implementation scope.
- Make Codex prompts short by pointing to durable docs instead of copying long context.

## Information architecture

Kvestarnia docs use a lightweight Diátaxis-inspired shape:

- **Product / explanation** — what the game is, why it exists, who it is for, and how it should sound.
- **How-to / operations** — how to run, test, smoke, deploy or review.
- **Reference** — stable mechanics, terminology, balancing, architecture and fair-play rules.
- **Tasks / workflow** — bounded Codex-ready work, active slices, reviews and handoffs.
- **History / backlog** — closed phases, imported audits, old plans and future ideas.

## Folder roles

| Path | Role | Put new docs here when... |
| --- | --- | --- |
| `docs/product/` | product, brand and public surface | the doc explains positioning, roadmap, public wording, market context or player promise |
| `docs/design/` | game/content/system design | the doc designs mechanics, content, tone, lore, monsters, quests, loot, achievements or social gameplay |
| `docs/balance/` | combat/economy/progression balance | the doc is about formulas, simulations, tuning, RNG, risk/reward or economy guardrails |
| `docs/architecture/` | technical design and persistence/session notes | the doc explains architecture, data flow, sessions, idempotency, callbacks, security or technical guardrails |
| `docs/operations/` | setup/runbooks | the doc tells a human how to run, test, smoke, deploy or diagnose the bot |
| `docs/content/` | canon/copy/content packages | the doc is a content bank, lore seed, canon snapshot, public copy bank or inspiration reference |
| `docs/qa/` | QA plans and proof checklists | the doc is a manual QA script, smoke matrix or feature-specific verification package |
| `docs/ai/` | Codex/agent workflow | the doc is context, prompt policy, prompt library or AI workflow material |
| `docs/ai/prompts/` | active prompt library | the prompt is reusable for current implementation, QA, review or handoff work |
| `docs/ai/prompts/archive/` | old prompt packs | the prompt is useful history but not the default prompt for new work |
| `docs/tasks/` | versioned task docs | the doc is one bounded implementation/release/docs task for Codex |
| `docs/tasks/archive/` | historical task material | the task is no longer active but still useful as record |
| `docs/backlog/` | future ideas and deferred scope | the doc is not ready to implement as the next active slice |
| `docs/history/` | completed phases and old planning | the doc describes a completed phase, old roadmap, imported historical package or superseded direction |
| `docs/history/audits/` | dated audit analysis | the audit is closed and unique analysis/evidence should remain searchable without copied repository payloads |
| `docs/history/phases/` | completed phase planning | the planning package belongs to a closed phase |
| `docs/history/evidence/` | historical QA/release evidence | evidence should be preserved without expanding the current runbook |
| `docs/references/` | supporting references | the doc records stable sources or supporting notes without becoming active scope |

## Top-level `docs/` rule

Do not add new Markdown files directly under `docs/` by default. After the root-doc cleanup, top-level `docs/*.md` should normally be limited to:

- `docs/README.md` — the detailed docs front door.
- `docs/DOCUMENTATION_STRUCTURE.md` — this placement rule.

Temporary legacy root docs are acceptable only during migration. If a branch still has many root docs, prefer moving them with `git mv` into the folders above instead of adding more root files.

## Naming rules

- New files should use lower-kebab-case where practical, e.g. `docs/design/lore-board.md`.
- Existing uppercase legacy files should become lower-kebab when they are moved.
- `README.md` is the directory-index exception. Policy files
  `DOCUMENTATION_STRUCTURE.md`, `CODEX_PROMPT_POLICY.md` and
  `CODEX_TOKEN_ECONOMY_APPLIED.md` retain their established names.
- Do not put PR numbers in reusable artifact, prompt or docs filenames.
- Versioned implementation tasks stay in `docs/tasks/<version>-<short-slug>.md`.
- Codex-facing prompts stay English and should point to `docs/ai/context.md`, `AGENTS.md`, task docs and skills instead of copying long rules.

## Safe movement rule

When reorganizing existing docs:

1. Check `git status --short` first.
2. Use `git mv`; never replace a locally modified file from an archive.
3. If the source file has uncommitted changes, move that exact file with `git mv` so the changes follow the file.
4. If a target path already exists, stop and merge manually.
5. Update all relative links in `README.md`, `AGENTS.md`, `.agents/skills/**`, `docs/**`, `news.md`, `CHANGELOG.md`, test fixtures and prompts that reference the moved path.
6. Keep unique imported audit analysis/evidence. Remove generated patches,
   copied repository trees, copied canonical docs/tasks and consumed handoff
   prompts when a cleanup task explicitly reconciles them.
7. Run `git diff --check` and a Markdown link scan if available.
8. Keep the PR docs-only unless the task explicitly asks for runtime changes.

## Cleanup order

Do this in waves. A link-safe move with updated indexes is better than one huge move that breaks historical references.

1. Move low-risk legacy prompt packs, backlogs, old closeouts and old raid planning.
2. Add or refresh category `README.md` files.
3. Move high-traffic canonical docs with `git mv` and update every reference.
4. Compact root `README.md` so it links to category doors instead of individual internal docs.
5. Refresh `docs/README.md` as the canonical index.
6. Check that top-level `docs/*.md` contains only the intended entry points, or document temporary exceptions in the PR body.

## Current migration target

The intended current shape is:

```text
docs/
  README.md
  DOCUMENTATION_STRUCTURE.md
  ai/
  architecture/
  backlog/
  balance/
  content/
  design/
  history/
    audits/
    evidence/
    phases/
  operations/
  qa/
  references/
  tasks/
```

Only `docs/README.md` and `docs/DOCUMENTATION_STRUCTURE.md` belong directly
under `docs/`.

## Automated guard

`npm run check:docs` verifies exact-case relative Markdown targets, the
top-level allowlist, required category indexes, the compact-context line budget,
generated snapshot bans, active-doc duplicate content and document naming.
`npm run check:static` includes this guard.

# Codex Token Economy Workflow Pack — Applied to Repository

This repository-aware update preserves existing project decisions and adds a compact workflow for future Codex use.

## Main changes

- `AGENTS.md` translated/reworked into English while preserving Kvestarnia naming, Ukrainian player-copy, release, PR, safety, architecture, and style rules.
- `.agents/skills/*` updated for token-efficient work.
- Added `$kvestarnia-release-checklist` for closeout and handoff.
- Added `docs/ai/context.md` as a compact context pack under 250 lines.
- Added short prompt files under `docs/ai/prompts/`.
- Rewrote `docs/CODEX_WORKFLOW.md` in English with the new token-economy rules.
- Rewrote `docs/CODEX_TASK_PROMPTS_BACKLOG.md` to point to task docs and short skill prompts.
- Preserved the old long prompt backlog under `docs/tasks/archive/legacy-codex-task-prompts-backlog-0.0.17-0.0.19.md`.
- Added `docs/tasks/README.md`, templates, and compact shipped-version records generated from `CHANGELOG.md`.
- Updated `.github/PULL_REQUEST_TEMPLATE.md` in English and added a second-Codex changed-files review checkbox.

## Future rule

For every future versioned implementation PR, create one short English task doc in `docs/tasks/`, start a fresh Codex thread with `Use $kvestarnia-version-task`, and close out with a compact handoff before starting the next version.

## Tests

Not run — docs/workflow-only change.

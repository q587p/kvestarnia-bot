# Codex Workflow

This document explains how to give Codex scoped, token-efficient work in Kvestarnia.

## Default shape of a Codex task

Use the smallest useful prompt:

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/<version>-<short-slug>.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Use a minimal diff.
Run focused tests first.
Final output: changed files, behavior changed, tests run, risks, completion status. No tutorial.
```

The task doc should contain:

```text
Goal: what should change.
Scope: what files/areas are in scope.
Non-goals: what must not be implemented.
Acceptance criteria: how done is verified.
Relevant files/search terms: where to start.
Tests/manual QA: what to run or check.
```

Do not paste long repeated rules into prompts. Keep reusable rules in `AGENTS.md`, `.agents/skills/*`, and `docs/ai/context.md`.

## Versioned gameplay/runtime changes

Versioned changes affect bot behavior, data, migrations, balance, runtime player messages, or production deployment.

For these changes:

- Create or update a short task doc in `docs/tasks/`.
- Use one fresh Codex thread per versioned task.
- Use `$kvestarnia-version-task` for the main implementation.
- Update `package.json` version only when the task includes a version bump.
- If version moves, keep `package.json`, `package-lock.json`, `CHANGELOG.md`, and `news.md` in lockstep unless the user narrows scope.
- Update `CHANGELOG.md` and `news.md` only for release-oriented changes.
- Release headings must include version, Holocene date, and short description.
- Use Kyiv time (`Europe/Kyiv`) for release/news/changelog dates.
- PR title starts with version and short changelog description, e.g. `0.0.4 — First Mimic Shawarma Adventure`.

## Docs-only / presentation changes

Docs-only changes improve README, brand docs, product docs, setup docs, workflow docs, task docs, prompts, or skills without runtime behavior.

For these changes:

- Do not bump `package.json`.
- Do not create a git tag or GitHub Release.
- Do not update `CHANGELOG.md` or `news.md` unless explicitly requested.
- Do not change runtime code, Prisma schema, migrations, lockfiles, or generated files.
- PR title can be a normal docs title, e.g. `docs: tighten Codex workflow prompts`.
- PR body should say `Tests: Not run — docs-only change` if checks were not run.

## Second Codex workflow

Use a second Codex only when it can help without competing with the main implementation.

Default prompt:

```text
Use $kvestarnia-second-codex-readonly.

Review PR #<number> against main.
Mode: READ ONLY report only.
Scope: changed files only by default. Inspect direct dependencies only if needed.
Focus: correctness, regressions, Telegram callbacks, state/session consistency, idempotency, missing tests.
Output: blockers, important issues, minor issues, missing tests, manual Telegram checks, safe notes. No tutorial.
```

Second Codex must not:

- edit files;
- commit;
- push;
- run auto-fix/format/codemod;
- create an alternative implementation;
- modify lockfiles, migrations, generated files, snapshots, config, or schemas.

## Skills policy

Use one main skill by default:

- Main implementation: `$kvestarnia-version-task`.
- Second review: `$kvestarnia-second-codex-readonly`.
- QA-only or high-risk Telegram flow: `$kvestarnia-telegram-qa`.
- Closeout/handoff: `$kvestarnia-release-checklist`.
- Balance/economy review: `$balance-review`.
- Ukrainian content review: `$ukrainian-rpg-content`.

Avoid activating multiple skills when one is enough.

## New thread rule

After each versioned task:

1. Run or list relevant checks.
2. Produce a compact handoff summary.
3. Close the old thread.
4. Start the next versioned task in a new Codex thread using `docs/ai/prompts/main-new-version-thread.md`.

Do not carry a long Codex thread through several versioned tasks.

## How to accept Codex work

Check:

- No Telegram imports leaked into `src/domain/`.
- Player-facing text is Ukrainian and Telegram-friendly.
- Rewards and quest progress are idempotent under duplicate callbacks.
- Tests cover new runtime logic.
- No magic numbers replaced content/balance configuration without reason.
- Scope did not expand beyond the task doc.
- Docs-only changes did not create a numbered release.
- Markdown links still work after docs index/path changes.
- PR title/body match the real diff.

## Branches and PRs

Defaults:

- Target `main` unless the user explicitly asks for a stacked PR or another base.
- Ready/merge-ready PRs target `main` by default and must be mergeable against current `origin/main`.
- If a branch started from another feature branch, rebase or merge it onto current `origin/main` and resolve conflicts before calling it complete.
- Use a non-main base only when the user explicitly asks for a stacked PR or approves that base; state the stacked base clearly in the PR body.
- Implementation work is not actually done until the branch is committed, pushed to the remote, and represented by a GitHub PR.
- Prefer ready-for-review PRs; use draft PRs only when the user asks for draft state or the change is intentionally incomplete.
- If an active PR exists for the same work, add small follow-ups to the same branch/PR.
- If follow-up work expands the scope, update the PR title/body and release/docs surfaces.
- After opening/updating a PR, check base branch, mergeability, and conflicts; fix non-main bases unless the PR is intentionally stacked.

Suggested branch names:

- `docs/codex-workflow-token-economy`
- `feat/<version-slug>`
- `fix/<short-bug-slug>`

PR body should include:

- Summary
- Version task or `None — docs-only change`
- Gameplay impact
- Changed files
- Tests run
- Manual Telegram QA, if runtime/UI changed
- Balance notes, if formulas/economy changed
- Risks / follow-ups

## Current roadmap guard

`0.0.x` foundation is closed after `0.0.30`.
`0.1.x` is stabilization, playtest polish, and careful Phase 2 prep.

Phase 2 direction is Social Combat & Interactions, not group-raid-first.

Do not jump into shops, trading, group hunts/raids, Redis/jobs, guilds, broad PvP, or Mini App UI unless the user explicitly expands the scope.

Canonical current docs:

- `docs/PHASE1_RELEASE_NOTES.md`
- `docs/PHASE1_CLOSEOUT_0_1_TRANSITION.md`
- `docs/PHASE1_CLOSEOUT_SMOKE.md`
- `docs/NEXT_IMPLEMENTATION_BACKLOG.md`
- `docs/phase2/SOCIAL_COMBAT_PLAN.md`
- `docs/phase2/DUELS_AND_INVITES.md`

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

When writing Codex prompts, review prompts, or integration prompts, follow `docs/ai/CODEX_PROMPT_POLICY.md`: English prompt text, relevant `$skill` first, compact scope, target branch/base when known, compact final output, no tutorial.

## Versioned gameplay/runtime changes

Versioned changes affect bot behavior, data, migrations, balance, runtime player messages, or production deployment.

For these changes:

- Create or update a short task doc in `docs/tasks/`.
- Use one fresh Codex thread per versioned task.
- Use `$kvestarnia-version-task` for the main implementation.
- Before starting the next versioned task, fetch and verify `origin/main` against the expected package version and release/task content. Do not treat "branch commit is not an ancestor of `origin/main`" as a blocker by itself, because squash merges produce different commit hashes; compare the tree/content diff and continue from `origin/main` when the required content is present.
- Update `package.json` version only when the task includes a version bump.
- If version moves, keep `package.json`, `package-lock.json`, `CHANGELOG.md`, and `news.md` in lockstep unless the user narrows scope.
- Update `CHANGELOG.md` and `news.md` only for release-oriented changes.
- Release headings must include version, Holocene `1YYYY-MM-DD` date, and short description. If the current entry grows to cover several visible themes, update the heading so it matches the combined release scope rather than the first narrow topic.
- Use Kyiv time (`Europe/Kyiv`) for release/news/changelog dates, e.g. `12026-06-20`.
- Before calling a release PR ready, recheck the current Kyiv date against the latest release/news/changelog headings. If the implementation has crossed into a newer Kyiv day, update the release headings to the current release day instead of keeping the task-start date.
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

## Local runtime and Prisma/Windows issues

Use `$kvestarnia-local-runtime` for local launcher/runtime work:

- `run-local-bot.cmd`, `refresh-local-bot.cmd`, `status-local-bot.cmd`, `stop-local-bot.cmd`.
- `scripts/local-bot-runtime.cjs` and `docs/operations/local-bot-runtime.md`.
- Prisma Client `EPERM`, `query_engine-windows.dll.node`, isolated SQLite runtime DB, and Windows process-lock issues.

Keep these changes scoped to local scripts/docs unless the task says otherwise. Do not kill all `node.exe` processes. Do not stop or refresh the running isolated bot unless the user asks or the task is explicitly runtime-launcher work.

Prompt: `docs/ai/prompts/local-runtime-troubleshooting.md`.

## Second Codex workflow

Use a second Codex only when it can help without competing with the main implementation.
If a user asks to review a specific PR number, verify the live PR `base` and `head` before reading the diff. Do not trust the current checkout alone; if it does not match the PR head, inspect the fetched PR head snapshot or stop and report the mismatch.

Default prompt:

```text
Use $kvestarnia-second-codex-readonly.

PR: #<number>
Base: main
Review mode: short
Task doc: docs/tasks/<version>-<short-slug>.md

Extra focus:
<optional; delete if not needed>
```

Modes: `short` for everyday changed-files review, `default` for medium-risk/release-oriented PRs, and `deep` only for high-risk state, persistence, combat, raids, party sessions, routing, migrations, scheduler, economy, or balance.

For main Codex follow-up after review findings, use `docs/ai/prompts/main-codex-fix-review-findings.md` and paste only blockers, important issues, missing tests, and key edge cases.

Second Codex must not:

- edit files;
- commit;
- push;
- run auto-fix/format/codemod;
- create an alternative implementation;
- modify lockfiles, migrations, generated files, snapshots, config, or schemas.

## Skills policy

Use one main skill by default. Active repo skills live in `.agents/skills/`:

- Main implementation: `$kvestarnia-version-task`.
- Second review: `$kvestarnia-second-codex-readonly`.
- QA-only or high-risk Telegram flow: `$kvestarnia-telegram-qa`.
- Closeout/handoff: `$kvestarnia-release-checklist`.
- Balance/economy review: `$balance-review`.
- Local launcher/runtime/Prisma/Windows issues: `$kvestarnia-local-runtime`.
- Codex prompt/integration prompt writing: `$kvestarnia-codex-prompt-writer`.
- Ukrainian player-facing battle/tip/location/news/content copy: `$ukrainian-rpg-content`.

Avoid activating multiple skills when one is enough. For copy work, use `$ukrainian-rpg-content` instead of pasting `docs/design/content-style-guide.md` into the prompt. For prompt-writing work, use `$kvestarnia-codex-prompt-writer` instead of relying on chat memory. A focused copy prompt lives in `docs/ai/prompts/ukrainian-content-review.md`.

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
- New player-facing gameplay has matching rewardless achievements/hooks, or the task doc and PR body explicitly explain why no durable achievement fits.
- Tests cover new runtime logic.
- No magic numbers replaced content/balance configuration without reason.
- Scope did not expand beyond the task doc.
- Docs-only changes did not create a numbered release.
- Markdown links still work after docs index/path changes.
- PR title/body match the real diff.

## Branches and PRs

Defaults:

- When the user references a specific PR, confirm its live `base` and `head` first. Never assume the current branch is that PR.
- Target `main` unless the user explicitly asks for a stacked PR or another base.
- Ready/merge-ready PRs target `main` by default and must be mergeable against current `origin/main`.
- If a branch started from another feature branch, rebase or merge it onto current `origin/main` and resolve conflicts before calling it complete.
- Use a non-main base only when the user explicitly asks for a stacked PR or approves that base; state the stacked base clearly in the PR body.
- Implementation work is not actually done until the branch is committed, pushed to the remote, and represented by a GitHub PR.
- Prefer ready-for-review PRs; use draft PRs only when the user asks for draft state or the change is intentionally incomplete.
- If an active PR exists for the same work, add small follow-ups to the same branch/PR.
- If follow-up work expands the scope, update the PR title/body and release/docs surfaces.
- If a follow-up changes player-visible behavior inside a release task, update the task doc, `CHANGELOG.md`, `docs/ai/context.md`, and PR body before calling the PR ready. Update `news.md` only when the follow-up changes the planned release promise or headline visible outcome; release-candidate QA regressions and pre-release fixes belong in technical surfaces, not player news.
- When replacing an older gameplay flow, check starter/onboarding fallback paths explicitly so new level gates do not accidentally hide newbie content.
- After opening/updating a PR, check base branch, mergeability, and conflicts; fix non-main bases unless the PR is intentionally stacked.

### Retiring remote branches

Keep `main`, every open-PR head, and work explicitly marked active. Delete a
merged PR head after verifying live `mergedAt` and the PR head SHA against the
current remote tip. Squash merges are not reliably classified by
`git branch --merged`.

Treat closed-unmerged branches, branches advanced after merge, and branches
with no PR as manual review only. Any remote deletion must be SHA-guarded so a
branch changed after the audit cannot be deleted accidentally. Never add a
credentialed branch-deletion CI job; cleanup remains an explicit operator
action.

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

`origin/main` at `3aa80b54` is package `0.3.17`; the `0.3.x` repository
line is closed. Target deployment, flags and manual QA remain separate ledger
evidence.

`0.4.0` is active on open PR `#184`, branch
`codex/0.4.0-party-vs-many-proof`; it is pushed but not merged or deployed.
`0.4.x` deliberately starts with that separate bounded 2–3×2–3 group-combat
runtime, then a small guild membership shell, the first production party
expedition and one weekly goal. After that proof, versioned bounded Old Altar,
greeting, Shynok food, consumable, resale and recycling tasks may ship without
implying a broad shop/market rewrite. Use the current version task; do not launch
an archived `0.2.x-*` draft verbatim.

Do not jump into guild bank/shared custody, player-set market/auction, guild wars,
public matchmaking, >3×3 combat, Redis/jobs, broad PvP or Mini App UI unless a
new versioned task and user decision explicitly expand the scope.

Canonical current docs:

- `docs/ai/context.md`
- `docs/product/roadmap.md`
- `docs/architecture/party-combat-evolution-plan.md`
- `docs/design/guilds-and-party-progression.md`
- the active `docs/tasks/<version>-<slug>.md`

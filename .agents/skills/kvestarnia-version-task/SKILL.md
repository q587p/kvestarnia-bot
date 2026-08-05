---
name: kvestarnia-version-task
description: Use for implementing one scoped, versioned Kvestarnia Telegram RPG task. Trigger when the user mentions a version task, PR task, roadmap slice, MVP step, or asks to implement a scoped feature.
---

You are the main Codex agent for Kvestarnia.

Core rule: one versioned task per Codex thread.

Default inputs:
- `AGENTS.md`
- `docs/ai/context.md`
- one short task doc from `docs/tasks/`
- only the relevant source files and tests

Do:
1. Work on exactly one versioned task.
2. Read the task doc and compact context first.
3. Identify affected modules, likely changed files, focused tests, and risky areas.
4. Inspect changed/relevant files before broad scans.
5. Prefer minimal, reviewable diffs.
6. Keep player-facing text Ukrainian.
7. Keep domain code free of Telegram imports.
8. For substantial player-facing Ukrainian copy, use `$ukrainian-rpg-content` instead of pasting style rules.
9. Add or update tests for runtime behavior.
9a. When adding an environment variable, update `.env.example` and the existing untracked local `.env` together without overwriting secrets or staging `.env`. Keep the example deploy-safe; set the local value needed for the requested manual QA flow.
9b. When the user asks to prepare local/manual QA, write every required non-secret value into the existing untracked root `.env`, including existing feature flags. Preserve secrets and unrelated values, never stage `.env`, leave deploy-safe defaults unchanged, and explicitly say whether the isolated runtime still needs `refresh-local-bot.cmd`.
10. Run targeted tests while editing, then wait until relevant source, tests, schema, config, package and lockfile bytes are stable before the final broad gate.
11. Give named final phases at least a 600-second command budget, or run them in one yielded session and poll that same session until its real exit code is known. Never start a duplicate full gate because output was compacted while the original process is still alive.
12. Treat a confirmed exit code `0` as valid until a relevant source, test, schema, config, package or lockfile changes. An output-channel `EPIPE`, killed process, timeout, missing final status or malformed result is unproven, never a pass; do not globally raise test-level timeouts to work around command transport.
13. Before final handoff, re-check the current Kyiv day against the latest release/news/changelog Holocene headings; same-PR follow-ups and review fixes must refresh those headings if the branch now has a newer Kyiv-day commit.
13a. After an authorized implementation push, inspect the PR checks. Resolve scoped CI failures in the same branch and PR without requesting duplicate approval, rerun the affected gate, push the fix and wait for the replacement check to finish before reporting completion. Stop for user direction only if the required fix materially expands product scope, is destructive, needs new external authority or requires a new product decision.
14. Every numbered package release must add a matching current `news.md` entry. Hidden, rewardless, feature-flagged, dev-only, production-disabled or not-yet-rolled-out runtime is not an exception; keep the entry spoiler-light and express only a genuine unavailable gameplay boundary through `Ще не відчинено:`. Before publishing, reject complete sentences repeated verbatim within the current entry or from historical news and rewrite only the current duplicate. A change that should not receive player news must stay non-numbered and must not bump the package version.
15. End with a compact PR-ready summary.
16. In the PR body, give Manual Telegram QA as an executable checklist: exact `.env` keys/values, isolated-runtime refresh command, accounts/start state, steps/expected result and honest completion status.

Do not:
1. Start another feature unless the user explicitly changes the active version task.
2. Paste or request long repeated rules; use this skill and task docs.
3. Perform broad refactors unless required by the task.
4. Run global formatters on the whole repository unless explicitly requested.
5. Change lockfiles, migrations, schemas, config, generated files, or snapshots unless required.
6. Carry one long Codex thread across multiple versioned tasks.
7. Write a tutorial in the final response.

After finishing a versioned task:
1. Use the release checklist if this is release-oriented.
2. Produce a short handoff summary.
3. Start the next versioned task in a new Codex thread.

Output format:
- Version task
- Changed files
- Behavior changed
- Tests/checks
- Risks / follow-ups
- Completion status

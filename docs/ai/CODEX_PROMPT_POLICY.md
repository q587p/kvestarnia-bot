# Codex Prompt Policy

This file is the durable rule for humans and assistants preparing Kvestarnia Codex prompts, integration prompts, and prompt archives.

## Core rule

Codex-facing prompts should be:

- English;
- short;
- skill-based;
- scoped to one task;
- file/path based instead of copied context based;
- explicit about final output;
- non-tutorial.

Ukrainian stays for player-facing game copy, exact Telegram labels, lore/content examples, and user discussion. The prompt instructions around that copy should still be English when the target reader is Codex.

## Default prompt requirements

Every generated Codex prompt should include:

1. Relevant `$skill` activation.
2. Task doc path or exact focused scope.
3. Compact context path: `docs/ai/context.md`.
4. `Follow AGENTS.md.`
5. Scope boundaries.
6. Focused tests/checks.
7. Compact final output.
8. `No tutorial.`

Do not paste long repeated rules from `AGENTS.md`, skills, or style guides into a prompt.

## Skill selection

Use one main skill by default:

- `$kvestarnia-version-task` — main implementation of one versioned task.
- `$kvestarnia-second-codex-readonly` — independent PR/repo review.
- `$kvestarnia-telegram-qa` — QA-only or release-critical Telegram flow checks.
- `$kvestarnia-release-checklist` — closeout and handoff.
- `$ukrainian-rpg-content` — substantial player-facing Ukrainian copy.
- `$balance-review` — combat, economy, progression, raid/boss balance.
- `$kvestarnia-local-runtime` — isolated local bot, Prisma/SQLite, Windows EPERM, runtime scripts.
- `$kvestarnia-codex-prompt-writer` — writing or reviewing Codex prompts and integration prompts.

Add a second skill only when the task truly needs it. Avoid activating several skills “just in case.”

## Main Codex prompt template

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/<version>-<short-slug>.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Work on this versioned task only.
Use a minimal diff.
Inspect changed/relevant files before broad scans.
Run focused tests first.

Final output:
- changed files
- behavior changed
- tests run
- risks / follow-ups
- completion status

No tutorial.
```

## Second Codex PR review template

```text
Use $kvestarnia-second-codex-readonly.

Review PR #<number> against main.

Mode:
READ ONLY report only.

Scope:
Changed files only by default. Inspect direct dependencies only if needed for correctness.

Focus:
- does the PR match the version task?
- correctness regressions
- Telegram duplicate messages/callbacks
- stale callback behavior
- player/session/state consistency
- idempotency and DB transaction risks
- missing tests
- compact manual Telegram checks

Do not edit files.
Do not run auto-fix/format/codemod.
Do not commit or push.

Output:
- PR summary
- relevant changed files
- findings: blockers / important / minor / looks good
- missing tests
- manual Telegram checks
- questions for main Codex
- safe notes

No tutorial.
```

## Delta integration prompt template

```text
Use $kvestarnia-version-task.

Task:
Integrate this docs/workflow delta.

Context:
- Base/main: <sha-or-branch>
- Target branch: <branch>
- Delta archive: <archive-name>

Instructions:
1. Checkout the target branch and confirm the expected base/state.
2. Apply `PATCH.diff` first.
3. Copy files from `repo-files/` to the repository root.
4. Keep the change docs/workflow-only unless the manifest says otherwise.
5. Do not touch runtime code, Prisma, package files, lockfiles, tests, `.env*`, or runtime databases.
6. Verify `docs/ai/context.md` stays under 250 lines if changed.
7. Review `git diff --stat`.

Final output:
- changed files
- checks run
- risks / follow-ups
- completion status

No tutorial.
```

## Current-branch rule

When the user names a branch, commit, or PR, prompt/archive deltas must state that target explicitly and be built patch-first against that target.

Before handing off a delta, verify the intended branch head when possible. If verification is not possible, say so explicitly and keep the integration prompt defensive.

## Artifact naming

Use feature/problem slugs, not PR numbers:

Good:

```text
codex-prompt-policy-delta.zip
local-runtime-prisma-fallback.zip
big-barrel-brother-review-prompt.md
```

Avoid:

```text
pr62-fix.zip
pr62-codex-prompt.md
```

PR numbers may appear inside a prompt or PR body when needed, but not in reusable artifact names.

## Long prompt rule

If a prompt is longer than a short screen, write it as a `.md` file artifact.

The chat message should link the file and summarize only:

- what it is for;
- where to put it;
- what files it changes;
- what not to touch.

## Review checklist for generated prompts

Before handing off a prompt/archive, check:

- Is the prompt English?
- Does it use the right `$skill`?
- Does it avoid copying long rules?
- Does it point to `AGENTS.md`, `docs/ai/context.md`, and task docs?
- Does second-Codex review say read-only and changed-files default?
- Does the final output ask for a compact, non-tutorial summary?
- Are artifact names reusable and free of hardcoded PR numbers?
- Is the delta based on the current branch/base when known?

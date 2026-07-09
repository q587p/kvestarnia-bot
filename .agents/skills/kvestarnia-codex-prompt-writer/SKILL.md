---
name: kvestarnia-codex-prompt-writer

description: Use when writing, reviewing, or packaging Codex prompts for Kvestarnia. Trigger for main Codex prompts, second Codex review prompts, integration prompts, delta-archive instructions, task prompts, PR prompts, and prompt-policy reviews.
---

You write Codex-facing prompts and integration instructions for Kvestarnia.

Hard rules:
1. Write Codex-facing prompt text in English.
2. Ukrainian may appear only for player-facing game copy examples, exact in-game labels, or source text that must remain Ukrainian.
3. Start prompts with the relevant `$skill` activation when one exists.
4. Use one main skill by default. Add another skill only when it materially improves the task.
5. Do not paste long repeated project rules. Reference `AGENTS.md`, `docs/ai/context.md`, `docs/tasks/...`, and focused docs instead.
6. For long prompts, create a `.md` file artifact instead of a chat wall.
7. Name artifacts by feature/problem slug, not by PR number.
8. Keep integration prompts patch-first and scoped to the current branch/base when known.
9. For second Codex prompts, specify `READ ONLY report only` and `changed files only by default`.
10. Ask for compact final output: changed files, behavior changed, tests run, risks/follow-ups, completion status. No tutorial.

Default main implementation prompt shape:

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/<version>-<short-slug>.md

Context:
docs/ai/context.md

Follow AGENTS.md.
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

Default second Codex PR review prompt shape:

```text
Use $kvestarnia-second-codex-readonly.

PR: #<number>
Base: main
Review mode: short
Task doc: docs/tasks/<version>-<short-slug>.md

Extra focus:
<optional; delete if not needed>
```

Use `short` by default, `default` for medium-risk/release-oriented PRs, and `deep` only for high-risk state, persistence, combat, raids, party sessions, routing, migrations, scheduler, economy, or balance.

Default main Codex review-fix prompt shape:

```text
Use $kvestarnia-version-task.

Task:
Fix second-Codex review findings for PR #<number>.

Review payload:
<paste only blockers, important issues, missing tests, and key edge cases>

Context:
docs/ai/context.md

Final output: findings addressed, changed files, tests run, risks/follow-ups, completion status. No tutorial.
```

Default delta integration prompt shape:

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

When reviewing a generated prompt:
- Block prompts that are Ukrainian-only when intended for Codex.
- Block prompts that paste full AGENTS/skill contents.
- Block prompts that omit the relevant skill when one exists.
- Block second-Codex prompts that do not say read-only / changed-files default.
- Block artifact names that hardcode PR numbers unless the user explicitly asks.

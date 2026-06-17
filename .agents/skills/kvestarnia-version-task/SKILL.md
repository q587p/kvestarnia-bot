---
name: kvestarnia-version-task
description: Use for implementing one versioned Kvestarnia Telegram RPG task. Trigger when the user mentions a version task, PR task, roadmap item, MVP step, or asks to implement a scoped feature.
---

You are working on Kvestarnia, a Telegram RPG project.

Core rules:
1. Work on exactly one versioned task at a time.
2. Do not start another feature unless the user explicitly changes the active version task.
3. Before editing code, identify:
   - target version/task
   - affected modules
   - files likely to change
   - tests likely to run
   - risky areas
4. Prefer minimal, reviewable diffs.
5. Do not perform broad refactors unless required by the task.
6. Do not run global formatters on the whole repo unless explicitly requested.
7. Do not change lockfiles, migrations, schemas, or config unless the task requires it.
8. After changes, run the smallest relevant tests first, then broader checks if needed.
9. Final response must include:
   - changed files
   - behavior changed
   - tests run
   - risks / follow-ups
   - whether the version task is complete

Implementation workflow:
1. Read AGENTS.md and project docs if present.
2. Inspect the relevant code paths.
3. Make a short plan.
4. Implement.
5. Add or update tests.
6. Run relevant checks.
7. Review own diff.
8. Summarize in PR-ready format.

Output format:
- Version task
- Scope
- Changed files
- Tests/checks
- Risk notes
- Next safe step
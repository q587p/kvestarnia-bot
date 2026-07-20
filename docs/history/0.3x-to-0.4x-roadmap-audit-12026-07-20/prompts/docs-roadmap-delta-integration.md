# Roadmap delta integration

```text
Use $kvestarnia-version-task.

Task:
Integrate the 0.3.x closeout / 0.4.x party-and-guild docs delta.

Context:
- Audited main: d101867cd80f9c05505899ac7b42adf92e369527
- Initial raid-chat audit: af56de0d9256212d22af9a8d265721c9144fd54d
- Refreshed raid-chat candidate: e223073a65b96a293ca40ed8e6f14e4bef1b930d
- Target branch: create a fresh docs-only branch from the current intended base
- Delta archive: kvestarnia-0.3x-to-0.4x-roadmap-audit-12026-07-20.zip

Instructions:
1. Fetch and confirm the live main/PR state. Do not overwrite newer truthful docs.
2. Apply PATCH.diff first.
3. If hunks moved, copy/reconcile files from repo-files/ against the live tree;
   preserve the decisions and re-check links rather than forcing stale context.
4. Keep the change docs/workflow-only. Do not touch runtime code, Prisma,
   migrations, package files, lockfiles, tests, .env files or runtime databases.
5. Treat raid chat as a release candidate until its blockers and manual QA are
   actually closed. Never convert proposal/unknown rollout cells into PASS.
6. Verify docs/ai/context.md stays under 250 lines.
7. Check relative Markdown links, rg for stale current-line claims, run
   git diff --check and review git diff --stat.
8. Follow AGENTS.md. Do not bump the version/changelog/news for docs-only work.

Final output:
- changed files
- checks run
- conflicts or decisions preserved
- risks / follow-ups
- completion status

No tutorial.
```

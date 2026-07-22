# Codex prompt - Phase 2 MVP closeout

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/0.1.25-phase2-mvp-closeout.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Use the Phase 1 closeout docs as structural examples, not as text to copy blindly.
Work on the closeout task only.
Use a minimal diff.
Do not add gameplay runtime, migrations, formulas or new feature surfaces.
If a blocker bug is discovered, stop and report it as a separate fix task instead of hiding it in this PR.

Required result:
- Phase 1 stays closed
- Phase 2 Social Combat MVP is accurately marked shipped
- trading, multi-enemy, item tags and party/raids move explicitly to 0.2.x
- package/lock/changelog/news/version/date surfaces agree
- closeout release notes and smoke docs exist
- superseded/absorbed tasks are documented
- one next 0.2.0 task is linked
- docs/ai/context.md remains compact
- links and checks pass

Run focused docs/link/version checks first, then the normal release gate.

Final output:
- changed files
- status changes recorded
- tests/checks run
- risks/follow-ups
- completion status

No tutorial.
```

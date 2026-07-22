# Codex prompt — Read-only Architecture Review

```text
Use $kvestarnia-second-codex-readonly.

Review the Architecture Stabilization PR against:
docs/tasks/0.2.2-architecture-stabilization.md
docs/architecture/0.2.x-target-architecture.md
docs/architecture/adr-001-modular-bot-runtime.md
docs/architecture/adr-002-composition-root-and-lifecycle.md

Follow AGENTS.md.
Review changed files and their direct dependencies only.
Do not edit, commit, push, format or propose an alternative rewrite.

Prioritize findings that could change behavior:
- grammY middleware or registration order
- missing/duplicate command or callback namespace
- invalid-callback answer/edit behavior
- combat-lock allowlist or redirect drift
- pending-raid safe/block drift
- presence stamping drift
- optional feature disabled behavior
- startup side effects
- BOT_TOKEN-missing behavior
- scheduler start/stop and shutdown order
- Telegram command sync or deploy notification regression
- circular dependencies
- domain importing grammY/bot
- schema/dependency/callback/stored-state scope violation
- release surfaces out of sync

Then check architecture intent:
- createBot.ts is an explicit shell
- feature registrars have coherent ownership
- src/bot.ts delegates composition
- no service locator, plugin framework or generic repository
- tests cover the new boundaries without replacing behavior tests

Output only:
- Blockers
- Important findings
- Minor findings
- Missing tests or QA
- Merge verdict

Use file and line references.
If there are no actionable findings, say so and give the merge verdict.
```

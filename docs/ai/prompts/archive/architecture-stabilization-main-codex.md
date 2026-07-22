# Codex prompt — Architecture Stabilization

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/0.2.2-architecture-stabilization.md

Read only the relevant context:
docs/ai/context.md
docs/architecture/0.2.x-architecture-audit.md
docs/architecture/0.2.x-target-architecture.md
docs/architecture/adr-001-modular-bot-runtime.md
docs/architecture/adr-002-composition-root-and-lifecycle.md
docs/architecture/implementation-map.md

Follow AGENTS.md.

Start from updated main, preferably after 0.2.1 Multi-Enemy Foundation.
Before editing, verify that 0.2.2 is still the next intended architecture version.
If 0.2.2 has already shipped, use the next free 0.2.x version and rename only versioned task/release surfaces. Keep the feature slug architecture-stabilization.

Use high reasoning: middleware order, routing, lifecycle and behavior parity are release-critical.

Hard scope:
- behavior-preserving bot modularization
- extracted cross-cutting middleware
- explicit application composition root and lifecycle
- architecture boundary tests
- required version/docs surfaces

Do not:
- add gameplay, balance, content or player-flow changes
- change callback payloads or stored state
- change Prisma schema or add a migration
- add a production dependency or DI framework
- deep-split FightService
- redesign route policy while moving it
- run a global formatter
- fold unrelated cleanup into this branch

Work in reviewable checkpoints:
1. run baseline checks and record the current registration/middleware order
2. add characterization tests for critical route policy
3. extract BotServices/BotOptions and middleware
4. extract coarse feature registrars one vertical slice at a time
5. move repository/service construction and runtime lifecycle out of src/bot.ts
6. add architecture tests
7. run focused tests, db validation, full check and diff check
8. update release/docs surfaces and perform the manual Telegram smoke

Keep createBot.ts explicit. It should call registrars in visible order and must not become a dynamic plugin loader.
Keep one callback namespace owned by one registrar.
Keep domain free of grammY and bot imports.
Preserve optional-feature and BOT_TOKEN-missing behavior.
Preserve isolated local bot tooling.

Open a merge-ready PR against current main as required by AGENTS.md.

Final response:
- changed files grouped by area
- behavior parity
- tests and manual QA
- migrations/dependencies
- risks/deferred follow-ups
- PR link and completion status

No tutorial.
```

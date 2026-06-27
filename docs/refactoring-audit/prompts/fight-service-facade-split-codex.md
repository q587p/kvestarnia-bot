Use `$kvestarnia-version-task` and use high reasoning.

Repository: `q587p/kvestarnia-bot`.

Task: first facade-preserving `FightService` extraction.

Read first:

- `AGENTS.md`
- `docs/ai/context.md`
- `docs/tasks/0.2.x-combat-application-decomposition.md`
- `src/services/fightService.ts`
- `src/services/yegerQuestService.ts`
- relevant fight service tests

Use the task doc from this package: `tasks/fight-service-facade-split.md`.

Goal:

- Keep `FightService` public behavior stable.
- Extract exactly one coherent internal responsibility behind tests.
- Prefer problem quest definitions/helpers or reward helpers as the first extraction unless current code points to a safer seam.
- Preserve transactions, CAS/idempotency, stored combat JSON compatibility, and Telegram/domain boundaries.

Non-goals:

- no new combat mechanics;
- no player ability registry work;
- no reward rebalance;
- no schema/migration;
- no event bus or framework.

Expected checks:

- targeted fight/problem quest/reward tests for touched behavior;
- `npm run typecheck`;
- broader `npm test` or `npm run check` if stateful combat code moves.

Final response format:

- Changed files
- Behavior changed
- Tests run
- Risks / follow-ups
- Completion status

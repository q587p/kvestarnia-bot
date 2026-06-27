Use `$kvestarnia-version-task` and `$balance-review`.

Repository: `q587p/kvestarnia-bot`.

Task: implement the Player Abilities Registry foundation for `0.2.7 — Player Abilities MVP`.

Read first:

- `AGENTS.md`
- `docs/ai/context.md`
- `docs/tasks/README.md`
- `src/domain/combat/combatActions.ts`
- `src/domain/combat/combatEngine.ts`
- relevant combat action tests

Use the task doc from this package: `tasks/player-abilities-registry.md`. If activating it in-repo, copy it to `docs/tasks/` with the project’s normal versioned task naming.

Goal:

- Convert current class skill definitions into a data-driven player ability registry.
- Preserve all current behavior, skill IDs, numeric profiles, legacy cooldown IDs, and public helper APIs.
- Do not change stored combat JSON, callback payloads, combat formulas, monster runtime, or player-facing copy unless strictly required.

Expected checks:

- focused domain tests for ability mapping and legacy cooldown compatibility;
- `npm run typecheck`;
- broader tests/checks if the diff touches combat engine behavior.

Final response format:

- Changed files
- Behavior changed
- Tests run
- Risks / follow-ups
- Completion status

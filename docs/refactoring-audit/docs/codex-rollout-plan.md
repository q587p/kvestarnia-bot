# Codex Rollout Plan

## Thread model

Use one Codex thread per task. Do not paste long repeated rules. Point Codex to:

- `AGENTS.md`;
- `docs/ai/context.md`;
- the task doc from `tasks/`;
- the relevant prompt from `prompts/`.

## Suggested order

### Thread 1 — Player ability registry

Prompt: `prompts/player-abilities-registry-main-codex.md`

Expected branch slug: `player-abilities-registry`

Goal: behavior-preserving registry extraction that enables `0.2.7` work.

### Thread 2 — Read-only review

Prompt: `prompts/refactoring-readonly-review-codex.md`

Goal: review Thread 1 changed files only, focusing on behavior parity, stored cooldown compatibility, and combat tests.

### Thread 3 — Callback route helper

Prompt: `prompts/bot-callback-route-helper-codex.md`

Goal: remove repeated callback parse/invalid-answer boilerplate without changing routing ownership.

### Thread 4 — Constructor dependencies

Prompt: write from `tasks/service-constructor-dependencies.md` or adapt Thread 3 style.

Goal: named dependencies for high-arity services.

### Thread 5 — FightService split

Prompt: `prompts/fight-service-facade-split-codex.md`

Goal: one small behavior-preserving extraction, not a full rewrite.

## Completion gates

For runtime changes:

- focused tests first;
- then `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, or `npm run check` if scope justifies it;
- no schema/migration unless the task explicitly requires one;
- player-facing copy stays Ukrainian;
- package/changelog/news only if the task is release-oriented and actually changes runtime behavior.

## Recommended handoff format

- Changed files
- Behavior changed
- Tests run
- Risks / follow-ups
- Completion status

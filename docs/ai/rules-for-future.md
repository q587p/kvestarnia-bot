# Rules for Future Codex Work

Use this as the durable process note for token-efficient Kvestarnia work.

## Default workflow

1. One versioned task equals one Codex thread.
2. Start each implementation thread with `docs/ai/prompts/main-new-version-thread.md`.
3. Use a short task doc from `docs/tasks/`.
4. Use `docs/ai/context.md` as compact context.
5. Use `$kvestarnia-version-task` for main implementation.
6. Use `$kvestarnia-second-codex-readonly` for second Codex review.
7. Use `$kvestarnia-telegram-qa` only for full QA plans or high-risk Telegram flow changes.
8. Use `$ukrainian-rpg-content` for substantial player-facing battle, tip, location, item/monster, or news copy.
9. Use `$kvestarnia-local-runtime` for local launcher/runtime, Prisma/SQLite, Windows EPERM, or isolated manual-test bot issues.
10. Use `$kvestarnia-release-checklist` at closeout.

## Prompt rules

- Do not paste long repeated rules into prompts.
- Prefer `Use $skill` plus task doc path.
- Keep task docs English and short.
- Keep player-facing game copy Ukrainian.
- Do not paste long Ukrainian style rules into prompts; use `$ukrainian-rpg-content`.
- Ask reviews to inspect changed files only by default.
- Ask final output to be compact and non-tutorial.

## Task doc rule

For every future versioned implementation PR, create or update one short task doc:

```text
docs/tasks/<version>-<short-slug>.md
```

The task doc should include:

- Goal
- Scope
- Non-goals
- Acceptance criteria
- Relevant files / search terms
- Focused tests
- Manual Telegram checks
- Release surfaces, if any

Keep it short. Link to canonical docs instead of copying large sections.

## Closeout rule

At the end of a versioned task:

1. Run or list relevant checks.
2. Summarize changed files and behavior.
3. List risks/follow-ups.
4. Prepare a handoff summary.
5. Start the next versioned task in a new Codex thread.

Do not carry one long thread through multiple versions.

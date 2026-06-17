# Version Task Docs

Every future versioned implementation PR should have one short English task doc in this directory.

File name:

```text
docs/tasks/<version>-<short-slug>.md
```

Examples:

```text
docs/tasks/0.1.10-shynok-beer-exchange.md
docs/tasks/0.2.0-duel-invite-mvp.md
```

## Why

Task docs keep Codex prompts short and preserve decisions between threads.
The prompt should point to a task doc instead of repeating a long rule block.

## Main Codex prompt

Use `docs/ai/prompts/main-new-version-thread.md`.

## Second Codex prompt

Use `docs/ai/prompts/second-codex-pr-review.md`.
Second Codex reviews changed files only by default.

## Required sections for new task docs

- Goal
- Scope
- Non-goals
- Acceptance criteria
- Relevant files / search terms
- Focused tests
- Manual Telegram QA
- Release surfaces

Keep each task doc short. Link to canonical docs instead of copying long sections.

## Existing records

The shipped `0.0.x` and `0.1.x` versions have compact historical records generated from `CHANGELOG.md`.
They are not active tasks unless a human explicitly reopens a follow-up.

## Closeout

After a versioned task is done:

1. Use `$kvestarnia-release-checklist` if release-oriented.
2. Produce a compact handoff.
3. Start the next versioned task in a new Codex thread.

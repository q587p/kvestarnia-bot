# AI / Codex Docs

Use these docs when preparing Codex prompts, review prompts, integration prompts, AI context packs or agent workflow changes.

## Canonical workflow docs

- [`context.md`](context.md) — compact context pack for Codex; keep it under 250 lines.
- [`CODEX_PROMPT_POLICY.md`](CODEX_PROMPT_POLICY.md) — durable prompt policy: English, short, skill-based and scoped.
- [`codex-workflow.md`](codex-workflow.md) — human-facing guide for Codex tasks, PRs, review and docs-only workflow.
- [`rules-for-future.md`](rules-for-future.md) — durable token-economy workflow rules.
- [`CODEX_TOKEN_ECONOMY_APPLIED.md`](CODEX_TOKEN_ECONOMY_APPLIED.md) — practical token-economy note.

## Prompt library

- [`prompts/main-new-version-thread.md`](prompts/main-new-version-thread.md) — short startup prompt for a fresh main Codex thread.
- [`prompts/second-codex-pr-review.md`](prompts/second-codex-pr-review.md) — read-only second Codex PR review prompt.
- [`prompts/qa-only.md`](prompts/qa-only.md) — QA-only prompt.
- [`prompts/local-runtime-troubleshooting.md`](prompts/local-runtime-troubleshooting.md) — local runtime troubleshooting prompt.
- [`prompts/`](prompts/) — feature-specific implementation/review/release prompts.
- [`prompts/archive/`](prompts/archive/) — old prompt packs kept for history, not default current-work prompts.

## Guardrails

- Codex-facing prompt text is English.
- Use one relevant `$skill` by default.
- Point to `AGENTS.md`, `docs/ai/context.md`, task docs and skills instead of copying long rules.
- Long prompts should be committed or shared as `.md` files, not pasted into chat.
- Reusable artifacts must use feature/problem slugs, not PR numbers.

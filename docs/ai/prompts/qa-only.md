# QA-only Prompt

Use this when the implementation exists and only QA planning is needed.

```text
Use $kvestarnia-telegram-qa.

Create a compact QA plan for:
docs/tasks/<version>-<short-slug>.md

Focus:
- Telegram commands/buttons
- duplicate callbacks
- stale state
- player/session consistency
- restart/redeploy behavior if relevant
- missing automated tests

Output:
- manual Telegram checks
- missing automated tests
- high-risk regressions
- smoke test after deploy

No implementation.
No tutorial.
```

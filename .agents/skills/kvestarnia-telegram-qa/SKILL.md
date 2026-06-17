---
name: kvestarnia-telegram-qa
description: Use for compact or full QA plans for Kvestarnia Telegram RPG features. Trigger when the user asks for tests, manual QA, Telegram bot verification, player-flow checks, regression scenarios, or release-critical QA.
---

Create a QA plan for a Kvestarnia Telegram RPG change.

Default mode: compact unless the user asks for a full matrix.

Cover the highest-risk applicable scenarios:
1. Happy path.
2. Negative path.
3. Repeated commands.
4. Duplicate Telegram callback presses.
5. Player without required state.
6. Player with stale state.
7. Two players acting at the same time.
8. Interrupted flow and resume behavior.
9. Restart/redeploy behavior if relevant.
10. DB/cache consistency if relevant.

For each manual scenario include:
- Preconditions
- User action
- Expected bot response
- Expected state change
- What to verify in logs/database if applicable

Prefer actionable Telegram-level checks:
- command text
- callback button
- expected message
- expected state
- expected absence of duplicate effects

When used during PR review:
1. Compare changed behavior against QA scenarios.
2. Mark what appears covered by automated tests.
3. Mark what requires manual Telegram verification.
4. Flag missing regression scenarios.
5. Do not add or modify tests unless another active instruction explicitly allows edits.

Compact output:
- Manual Telegram checks
- Missing automated tests
- High-risk regressions
- Smoke test after deploy

Full output, only when requested:
- Manual QA matrix
- Unit test ideas
- Integration test ideas
- Regression risks
- Smoke test after deploy

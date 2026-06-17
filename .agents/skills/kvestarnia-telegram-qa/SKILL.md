---
name: kvestarnia-telegram-qa
description: Use for creating QA plans for Kvestarnia Telegram RPG features. Trigger when the user asks for tests, manual QA, Telegram bot verification, player-flow checks, or regression scenarios.
---

Create a QA plan for a Kvestarnia Telegram RPG change.

Cover:
1. Happy path.
2. Negative path.
3. Repeated commands.
4. Duplicate Telegram callback presses.
5. Player without required state.
6. Player with stale state.
7. Two players acting at the same time.
8. Interrupted flow and resume behavior.
9. Restart/redeploy behavior if relevant.
10. DB or cache consistency if relevant.

For each scenario include:
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

Output format:
- Manual QA checklist
- Unit test ideas
- Integration test ideas
- Regression risks
- Smoke test after deploy

When used during PR review:
1. Compare the changed behavior against the QA scenarios.
2. Mark which scenarios appear covered by automated tests.
3. Mark which scenarios require manual Telegram verification.
4. Flag any missing regression scenario.
5. Do not add or modify tests unless another active instruction explicitly allows edits.

PR QA output add-on:
- Covered by automated tests
- Missing automated tests
- Manual Telegram checks required
- High-risk regression scenarios
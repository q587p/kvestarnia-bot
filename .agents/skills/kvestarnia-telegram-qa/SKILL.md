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
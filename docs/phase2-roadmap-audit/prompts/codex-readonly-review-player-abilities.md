Use $kvestarnia-second-codex-readonly.

Review the current `0.2.7 — Player Abilities MVP` PR against `main`.

Mode: READ ONLY report only.
Scope: changed files only by default. Inspect direct dependencies only if needed.
Focus:
- ability catalog coverage for all active classes and active onboarding races;
- deprecated `race.kharakternyk` no race button behavior;
- class/race cooldown independence and legacy `cooldowns.skill` compatibility;
- no-op behavior for unavailable, cooldowned or insufficient-mana ability attempts;
- AoE hitting each living enemy once;
- ally/support fallback claiming only hero behavior until party runtime exists;
- persistent fight/training keyboard callback byte limits;
- battle journal/replay safety;
- no PvP/duel/party/reward/economy/remort/Yeger side effects;
- tests and manual QA coverage.

Output: blockers, important issues, minor issues, missing tests, manual Telegram checks, safe notes. No tutorial.
Do not edit files, commit, push, format, codemod or propose a parallel implementation.

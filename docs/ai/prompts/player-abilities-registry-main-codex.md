# Codex prompt — Player Abilities Registry

```text
Use $kvestarnia-version-task.
Use $balance-review.

Implement:
docs/tasks/0.2.7-player-abilities-mvp.md

Context:
docs/ai/context.md
docs/design/player-identity-abilities.md

Follow AGENTS.md.
Work on this versioned task only.
Start from updated main after 0.2.6 Passage Search is merged; do not create a stacked PR unless explicitly approved.
Use a minimal diff and inspect relevant combat/action files before broad scans.

Goal:
- ship the Player Abilities MVP for 0.2.7;
- keep class abilities data-driven through the player ability catalog;
- add one race ability for every active onboarding race;
- preserve existing skill compatibility, cooldown behavior and stored combat JSON readability;
- document current and planned race/class/title ability directions.

Hard scope:
- persistent PvE, training and turn-based duel player class/race actions only;
- no quick-duel formula rewrite, wagers, ratings, tournaments or PvP reward-power expansion;
- no party/raid runtime;
- no schema migration;
- no loot, economy, Yeger, item, remort or monster-system expansion;
- no broad combat rebalance beyond bounded ability numbers reviewed for obvious outliers.

Critical properties:
- server-authoritative ability availability;
- unavailable class/race actions are no-ops;
- class and race cooldowns do not collide;
- all-enemies abilities hit each living enemy once;
- ally/group scopes degrade to the acting hero until party runtime exists;
- deprecated `race.kharakternyk` remains compatibility-only with no race button;
- Telegram copy is compact Ukrainian and does not expose raw recipe keys.

Read first:
- `docs/tasks/0.2.7-player-abilities-mvp.md`
- `docs/ai/context.md`
- `docs/balance/notes.md`
- `docs/design/player-identity-abilities.md` if it already exists
- `src/content/playerAbilities.ts` if present
- `src/domain/combat/combatActions.ts`
- `src/domain/combat/combatEngine.ts`
- fight/training callback, keyboard and presenter paths
- relevant combat, content, presenter and callback tests

Expected checks:
- focused catalog/domain tests for ability mapping, race coverage and legacy cooldown compatibility;
- focused persistent fight, training and turn-based duel callback/presenter tests;
- simulator or targeted combat checks for class/race use, AoE and ally/self fallback;
- `npm run db:generate`;
- `npm run db:validate`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- `npm run check` when practical;
- `git diff --check`.

Final output:
- changed files
- behavior changed
- tests/checks run
- risks / follow-ups
- completion status
- PR link or concrete publishing blocker

No tutorial.
```

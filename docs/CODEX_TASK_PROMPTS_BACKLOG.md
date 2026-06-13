# Codex Task Prompts Backlog

Нижче - copy-paste готові промпти для наступних 3 implementation PR-ів після `0.0.16`. Вони навмисно вузькі, щоб не роздувати scope.

---

## Prompt — `0.0.17 — Combat Action Variants Shell`

```text
Goal:
Implement the first typed combat action variants shell for Квестарня after `0.0.16`.

Context:
Read:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BALANCE_NOTES.md
- docs/TECHNICAL_PLAN.md
- docs/ROADMAP.md
- docs/CONTENT_STYLE_GUIDE.md
- docs/CODEX_WORKFLOW.md
- src/domain/combat/combatProbe.ts
- src/services/fightService.ts
- src/bot/presenters/fightPresenter.ts
- src/bot/createBot.ts
- relevant callback helpers and tests

Current state assumptions:
- `/fight` is still a safe combat probe.
- `0.0.16` is handling barrel reliability; do not touch barrel code paths or release surfaces.
- Equipment effects are not active yet.

Implement:
1. Replace the single generic fight action shape with typed action variants:
   - `physical`
   - `spell`
   - `social` / `trick`
   - optional `class-special`
2. Show resource cost in UI when a chosen action spends mana or another small resource.
3. Keep combat deterministic and small-slice only.
4. Preserve idempotency: repeated/stale callbacks must not spend mana twice or duplicate rewards.
5. Add or update tests for parser, presenter, and idempotent completion behavior.
6. Keep all player-facing text Ukrainian.
7. Keep domain free of Telegram imports.

Do not implement:
- persistent combat state;
- healing/rest loop;
- equipment effects;
- group raids;
- guilds;
- PvP;
- item economy sinks.

Verification:
- Run `npm run check`.
- Run focused tests for fight presenter and fight service.

Done when:
- `/fight` presents multiple action variants;
- mana/resource cost is visible;
- stale callbacks are handled cleanly;
- tests pass or the exact blocker is explained.

Final response must include:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Next smallest useful step
```

---

## Prompt — `0.0.18 — Effective Stats Helper, No Gear Effects Yet`

```text
Goal:
Build the shared effective-stats helper for Квестарня, but do not add equipment stat effects yet.

Context:
Read:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BALANCE_NOTES.md
- docs/TECHNICAL_PLAN.md
- docs/CONTENT_STYLE_GUIDE.md
- docs/CODEX_WORKFLOW.md
- src/domain/characters/characterSummary.ts
- src/domain/progression/effectiveStats.ts if present
- src/services/heroService.ts
- src/bot/presenters/heroPresenter.ts
- src/bot/presenters/fightPresenter.ts
- inventory/equipment-related services and tests

Current state assumptions:
- Level-based effective HP/mana already exists as a shortcut.
- `0.0.17` should have left combat action variants in place, but not full combat.
- Equipment preview exists, but equipment effects are still off.

Implement:
1. Introduce or formalize one helper for effective character stats.
2. Keep all math out of presenters.
3. The helper must accept stored stats, level bonuses, and an optional equipment snapshot.
4. Output effective stats plus transparent contribution lines.
5. Ensure `/hero` and combat preview read the same source of truth.
6. Add tests for clamping, level bonuses, and “no hidden stat changes”.
7. Keep all player-facing text Ukrainian.

Do not implement:
- equipment stat effects;
- combat rebalancing;
- persistent current HP/mana loss;
- healing/rest;
- schema changes for item instances;
- any new gameplay surface.

Verification:
- Run `npm run check`.
- Run focused tests for the helper and the hero/fight presenters.

Done when:
- effective values are computed in one place;
- presenters only render results;
- tests cover the helper and regressions;
- any blocker is described precisely.

Final response must include:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Next smallest useful step
```

---

## Prompt — `0.0.19 — Equipment Effects V0, Tiny Numbers Only`

```text
Goal:
Add the first tiny equipment effects layer for Квестарня on top of the effective-stats helper.

Context:
Read:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BALANCE_NOTES.md
- docs/TECHNICAL_PLAN.md
- docs/CONTENT_STYLE_GUIDE.md
- docs/CODEX_WORKFLOW.md
- current equipment/inventory services and presenters
- current content/items tables and tests

Current state assumptions:
- `0.0.18` already created a shared effective-stats helper.
- Equipment preview already exists.
- The active barrel reliability work must stay untouched.

Implement:
1. Add tiny, metadata-driven equipment effects for a small reachable subset of items.
2. Keep bonuses small and explicit.
3. Let armor help survival, not free damage.
4. Keep accessory bonuses situational and mild.
5. Do not give any effect to junk/cosmetic/priceless trophies unless explicitly converted later.
6. Surface contributions in hero/equipment views if helpful.
7. Add tests for determinism, no hidden bonuses, and tiny-number guardrails.

Do not implement:
- shops;
- crafting;
- selling;
- trading;
- item sinks;
- group raids;
- PvP;
- large stat rebalance;
- legendary sets or synergy trees.

Verification:
- Run `npm run check`.
- Run focused tests for effective stats and equipment display.

Done when:
- only the intended items produce tiny, testable bonuses;
- hero and combat views stay consistent;
- no item class marked junk/cosmetic/priceless becomes a stealth power item.

Final response must include:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Next smallest useful step
```


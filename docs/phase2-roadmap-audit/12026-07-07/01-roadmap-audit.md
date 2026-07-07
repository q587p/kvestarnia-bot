# 01 — Roadmap Audit

## What the roadmap says

Phase 2 is not "group raid first". Its explicit theme is **Social Combat & Interactions**: short opt-in social combat, shareable results, safe player interaction, capped rewards, and data shapes that later support parties, raids, trading and gifting.

The project has delivered more than the original minimum social-combat line:
- pre-duel training;
- quick duels and turn-based duels;
- rematches/share cards;
- safe gifting and postal delivery;
- tavern social games;
- Bard performance;
- direct Priest help and Rogue pickpocket;
- Big Barrel Brother party-boss route;
- public chronicles / events feed.

## Where the project is aligned

### 1. Korchma-first product direction is stronger than before

The README/product docs promise a living Korchma: short sessions, buttons, social rituals, funny outcomes, loot worth screenshotting, and no heavy client. The shipped path now strongly supports that:
- Shynok drinks, table games, Bard performance;
- Korchma Board / lore / chronicles;
- Bочка, Yeger corner, quests, presence;
- social gifts, postal delivery, nearby actions.

### 2. "Character matters" is finally becoming mechanical

The Phase 2 plan says race/class/title/stats/equipment can shape odds/flavor without guaranteed wins. The current Mantok/equipment line now supports:
- explicit slots;
- class/race/title-restricted gear;
- set synergies;
- gear action grants;
- effective-stat integration.

This is good foundation for later duel tournaments and raids.

### 3. Replay safety and idempotency discipline is intact

Most shipped systems continue the same pattern:
- stable callback payloads;
- durable rows or daily-action ledgers;
- transaction-safe settlement;
- stale/replay card rendering;
- dev-only helpers that remain production-disabled.

This remains one of the project's strongest engineering habits.

## Where the project has drifted

### 1. Too many consecutive Mantok-heavy releases

`0.2.23` slot foundation, `0.2.24` balance, `0.2.26` coverage, `0.2.28` set synergies, and `0.2.30` ability grants are all useful, but together they shift attention from Phase 2 social loops toward RPG equipment depth.

This is not wrong, but it needs a deliberate pivot after the current foundation closes.

### 2. Version numbering collision risk

There are two open recent PRs with `0.2.30` in the title:
- Mantok Ability Grants Foundation;
- Item Upgrades / Charkokovalnia stacked on top.

That makes release notes, task registry, news, and future Codex prompts harder to reason about. Charkokovalnia should be renumbered after the current task, not share `0.2.30`.

### 3. Some public docs lag behind shipped reality

Mainline `package.json` is still `0.2.29`, while current work lives on the `0.2.30` branch. That is expected mid-branch, but several high-level docs need closeout updates after merge:
- `docs/tasks/README.md`;
- `docs/ai/context.md`;
- `README.md` playable list if a major public surface changed;
- `docs/ROADMAP.md` closeout line after `0.2.30`.

### 4. "No forced PvP / no gold steal" guardrails were intentionally softened

Older Phase 2 docs said no gold steal / no forced PvP for early slices. `0.2.25` intentionally added bounded Rogue gold theft and target-only retaliation. This is acceptable because the docs now record the exception, but the roadmap should say this was a controlled exception, not an accidental reversal.

## Verdict

The project has not lost its vision. The tone, public promise, Ukrainian-first identity, Telegram-first flow, and fair-play stance still match.

The recommended course correction is not "undo Mantok". It is:
1. finish current Mantok ability foundation safely;
2. avoid stacking another power/equipment feature under the same version;
3. take one short hardening slice if needed;
4. pivot back to social rewards and clarity.

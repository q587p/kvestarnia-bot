# Codex prompt — Authored Quest Resolutions

Use `$kvestarnia-version-task`.

Implement the current version task in:

```text
docs/tasks/0.1.20-authored-quest-resolutions.md
```

Read first, in this order:

```text
AGENTS.md
docs/ai/context.md
docs/tasks/0.1.20-authored-quest-resolutions.md
docs/design/quest-resolution-variety.md
docs/design/quest-skills-and-checks.md
docs/design/quest-resolution-content-seeds.md
```

Then inspect only the directly relevant current code and tests before planning edits. At minimum inspect the Adventure Choice service/callback/keyboard/presenter path, the starter mimic-shawarma path, the cellar mouse path, effective-stat helpers, combat skill profiles, daily-action/cooldown transaction patterns and existing persistent-fight handoff.

## Version and branch rule

The implementation target is `0.1.20`. This design package was prepared against repository version `0.1.17`, so verify current `main` first and account for all intervening changes before editing. Keep the task and release version at `0.1.20` unless the user explicitly changes it. Do not put a PR number in filenames, document names, archive names or prompt names.

Target current `main` and follow the repository's normal ready-PR workflow unless the environment or user explicitly limits publishing.

## Required behavior

Replace the active global Adventure Choice ladder:

```text
safe / flair / risky
Обережно розібратись / class-flavored middle / Зробити красиво й небезпечно
```

with authored methods belonging to the selected problem.

A selected level 3+ scene should normally render four distinct slots:

```text
scene fallback
race option
class option
exact race+class signature/title option
```

Render at least three genuinely different methods if four cannot be produced. Do not create three or four synonyms for the same tactic. Exact combo identity must use `raceId + classId`; title may customize copy but must not be the sole mechanical key.

Methods must carry stable ids, scene-specific Ukrainian labels/hints, intent/technique, governing stat(s), bounded difficulty, reward profile, optional small gold cost, grade-specific consequence and authored grade-specific outcomes.

Checks must:

- use the canonical effective-stat pipeline;
- use deterministic injected/pure RNG;
- be replay-stable for the same character/period/scene/method;
- stay within the caps documented in `design/quest-skills-and-checks.md`;
- return `strong-success`, `success`, `mixed-success` or `complication`;
- hide exact percentages from player-facing production copy.

Reuse existing combat skill ids and stat identity as class vocabulary where logical:

```text
skill.forceful-strike
skill.hot-spell
skill.form-thirteen-b
skill.dangerous-couplet
skill.trick-shot
skill.strict-blessing
skill.steppe-side-eye
```

Do not invoke combat damage resolution, import combat damage numbers into quest math or spend mana in this version.

Support varied consequences. A complication must not always become a fight. Include full/reduced/XP-only/paid/cosmetic-mess results and the existing persistent-fight handoff where authored. Preserve the current rollback rule: if combat cannot start, do not spend the adventure claim or a gold cost.

Add real small bribery/payment methods where fitting:

- visible cost `1..3` gold;
- affordability checked before commit;
- debit + claim/result atomic;
- duplicate callback charges exactly once;
- insufficient gold spends nothing;
- no item loss or hidden extra debit.

## Content coverage

Author scene-aware methods and grade-specific outcome content for every current general problem id:

```text
stew barrel helmet calendar receipt bench cloak spoon mirror boots chimney candle
chair broom door map teapot menu sign portrait key ledger rug bell
```

Also cover the generated race, class and title problem families. Builders are allowed, but the visible nouns, verbs and outcomes must fit the actual generated scene family instead of falling back to one universal paragraph.

Use `docs/design/quest-resolution-content-seeds.md` as the minimum content direction. Improve copy where needed, keeping it compact, Ukrainian and Kvestarnia-toned.

## Starter scenes

Apply the same contract, or thin adapters over it, to:

1. level 1–2 mimic-shawarma;
2. level 2–3 repeatable cellar mouse.

Preserve their level gates, availability, cooldown/idempotency, presence behavior and existing item grants. Remove or supersede the current one-off label switch trees. All active races/classes and every valid combo need deterministic personalized coverage/fallback.

Do not reveal the mimic too early. Map existing receipt/wrapper and mouse item grants to stable method intents/families rather than to arbitrary personalized labels.

Do not broaden the separate grown-up cellar bottle quest.

## Callback and compatibility rules

Use compact versioned authored-method callbacks and enforce Telegram's 64-byte limit. Allowlist scene/problem/method ids and reject malformed or stale payloads.

Never silently reinterpret an old `v1` `safe/flair/risky` callback as one of the new methods. Show a safe stale-paper refresh/current offer instead.

Keep old starter shawarma and cellar callbacks replay-safe and idempotent. Preserve current active-fight priority, three-offer period, reroll/dev reset, starter reachability and fight-handoff guards.

## Architecture and persistence

Prefer a small pure domain/content foundation, then service persistence/wiring, then Telegram presentation. Keep Telegram imports out of domain code. Avoid a broad quest-engine rewrite.

The inspected `0.1.17` `DailyAction` row has no method/grade/result/cost payload. Unless current `main` already added an equivalent audit field, implement the narrow backward-compatible ledger extension from `design/quest-resolution-variety.md`: optional versioned `resultJson` plus `spentGold` defaulting to zero, with one atomic claim/debit/reward/item transaction. Do not recompute a claimed grade from post-reward current stats. Add a transaction-safe paid cooldown claim for the mouse path if its bribery method ships. Do not add a production dependency.

## Required tests

Add focused tests for:

- deterministic check math, grade bands and caps;
- slot priority/dedup/fallback;
- every active race, class, valid combo/title and problem id;
- generated scene-family coverage;
- no active content using universal outcome fallback;
- callback parse/serialize/stale/64-byte behavior;
- success, mixed, non-combat complication and fight handoff;
- insufficient gold, one atomic debit and duplicate paid callback;
- blocked combat handoff rollback;
- starter shawarma labels/outcomes/items/legacy replay;
- cellar mouse labels/outcomes/cooldown/items/legacy replay;
- presenter escaping and qualitative copy;
- Quest Hub, level gate, presence and reset regressions.

Run focused tests first, then:

```text
npm run lint
npm run typecheck
npm run build
npm test
```

Use `npm run check` as the final combined gate if practical.

## Documentation and release

Apply the relevant updates directly to the current docs listed in the task doc. Update the task doc if implementation decisions change. Keep historical task claims intact; their only allowed edit in this feature is a short later-follow-up cross-reference.

Update package versions, `CHANGELOG.md`, spoiler-light Ukrainian `news.md`, current README feature text, docs index, canonical design/balance/checklist docs, playtesting and compact Codex context. Use Kyiv/Holocene release date conventions.

Do not claim the feature is shipped in docs until runtime and tests are complete.

## Manual QA

Perform the task doc's Telegram QA matrix. At minimum compare several starter race/class combos, multiple level 3+ problems, all four grades, a non-combat complication, a fight handoff, enough/insufficient-gold bribery, repeated callbacks and an old `safe/flair/risky` button.

## Final response

Keep the final response compact and follow `AGENTS.md`:

```text
Changed files
Behavior changed
Tests/checks run
Risks/follow-ups
Completion and PR status
```

No tutorial. Do not call the work complete if implementation, checks, release surfaces or PR publication required by the repo workflow are still missing; name the concrete blocker instead.

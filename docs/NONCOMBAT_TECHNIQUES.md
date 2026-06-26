# Non-Combat Techniques Planning

This started as a docs-only preservation of the `kvestarnia-noncombat-techniques-design-pack.zip` ideas. `0.2.5` now ships the first narrow runtime proof: Bard Performance solo in Shynok or in any other current location with another active same-location character, plus Shynok-only house payout. Keep the rest as planning input for future narrow `0.2.x+` tasks after the current branch is merged and `main` is refreshed.

## Product Goal

Non-combat techniques should give players reasons to:

- visit specific Kvestarnia places;
- express class, race and signature identity outside combat;
- interact with active nearby players safely;
- spend or earn small bounded resources;
- see post-remort identity matter without power snowball;
- do something meaningful when they are not fighting.

The first implementation should prove one small vertical slice. Do not build a universal profession engine before playtest evidence exists.

## Core Contract

Every non-combat technique needs:

- stable `techniqueId`;
- source: class, race or signature;
- minimum level;
- allowed locations;
- resource cost or explicit no-cost policy;
- cooldown scope;
- canonical effective stat snapshot;
- bounded outcome;
- idempotency and replay contract;
- remort/life boundary;
- short Ukrainian player-facing copy;
- privacy and economy classification.

A technique is not:

- a hidden required buff;
- a way to bypass active combat;
- a title-substring mechanic keyed from visible localized text;
- a reason to spam or pressure other players;
- permission to take resources without consent;
- a generic engine for singing, healing, theft, crafting and tracking all at once.

## Reward Rule

Non-combat techniques are real role-play actions: the player spends attention, the character spends time, and the world changes. They may grant a small role-action XP amount when a specific task asks for it, but XP is not automatic.

Guardrails:

- XP is small and capped, closer to training/participation XP than ordinary fight rewards.
- XP is stored and replay-safe; refreshes and duplicate callbacks never grant it twice.
- XP does not count as Korchmar problem progress, quest-chain progress, hunt progress or combat victory.
- Gold, item and buff rewards remain separate economy decisions.
- Failed, declined, stale, expired or no-op actions can grant zero XP unless the specific task defines a tiny participation result.
- Exact XP numbers belong in the implementation task and balance review, not in pre-commit player-facing copy.

`0.2.5` intentionally ships Bard Performance with `0` XP because the activated version task narrowed the MVP to gold/audience safety only. Future techniques can revisit small XP with a separate balance/security review.

## Technique Types

### Personal Action

Example: a Mage inspects their own manatka.

- no other player required;
- possible mana/material cost;
- no social notification;
- value can be information instead of gold.

### Location Work

Example: a Warrior helps the Korchmar move something heavy.

- location-bound;
- small house payout;
- small role-action XP;
- cooldown and daily cap.

### Voluntary Help

Example: a Priest offers a blessing or heal to a nearby player.

- target sees an offer;
- accept/decline is explicit;
- resource mutation happens only after accept;
- mana spend, heal and XP/result ledger are one replay-safe transition.

### Performance / Local Event

Example: a Bard performs for active nearby characters in the current location.

- actor starts the event;
- active same-location audience gets best-effort prompts;
- applause is free;
- tips are voluntary transfers;
- one response per audience character.

### Risky Social Game

Example: a Rogue pocket-theatre challenge.

- opt-in only;
- per-pair cooldown;
- capped stakes;
- non-lethal failure;
- audit and replay;
- not a first release.

### Information Action

Example: a Yeger scouts a passage.

- reveals a qualitative clue;
- no exact hidden formulas;
- no private tracking of other players.

## Stats, Race And Signature

Do not use one universal formula. Each technique should define one primary stat and at most one or two secondary stats.

| Technique | Primary | Secondary |
|---|---|---|
| Bard performance | charisma | luck, level |
| Priest blessing | charisma | intelligence, level |
| Rogue practice | dexterity | luck, level |
| Yeger scouting | dexterity | intelligence, level |
| Mage inspection | intelligence | mana, level |
| Warrior odd job | strength | HP, level |
| Varenyk-mant kitchen technique | intelligence | charisma, ingredient quality |
| Bureaucramancer appeal | intelligence | charisma, level |
| Kharakternyk omen | luck | charisma, level |

Race should first change flavor, add a small related modifier, sometimes open an alternate method, and only rarely add a separate button.

The current race/class title should become a stable signature identity, not raw visible text parsing. A future helper can return ids such as:

```text
signature.human-ish-bard
signature.bisyny-bard
signature.molfar-soul-bard
```

Signature may change text, open one alternate authored method, add a small qualitative modifier or affect NPC/audience reactions. It must not directly multiply gold or create a best-in-slot combo.

## Economy

### Game Faucet

The game creates resources:

- house payout for a Bard performance;
- NPC practice result;
- odd-job payment.

Faucets require cooldown, cap, stored result and audit/telemetry.

### Player Transfer

Resources move between players:

- Bard tips;
- later opt-in Rogue trick;
- later crafter payment.

Transfers require explicit consent, wallet recheck, atomic debit/credit, replay safety and anti-harassment limits.

### XP

XP is neither faucet gold nor player transfer. It marks role activity. Keep it tiny, capped, deterministic after resolution and isolated from quest/combat progress.

## Recommended First Slice: Bard Performance

Goal:

> A level 3+ Bard can perform in Shynok even without a live audience, or in any other current location with another active same-location character once per location cooldown. Shynok can pay a small daily-capped tavern amount, and active same-location players may applaud for free or explicitly tip small gold during a short window.

Why first:

- class fantasy is obvious;
- presence already makes current-location audiences visible;
- presence exists;
- social offer and transfer patterns are proven nearby;
- tips are voluntary, not forced PvP;
- two-account QA is straightforward;
- later instruments can layer in without blocking v1.

Suggested constants for the future task:

```text
BARD_PERFORMANCE_COOLDOWN = 93 minutes per location
BARD_PERFORMANCE_WINDOW = 13 minutes
BARD_PERFORMANCE_MIN_LEVEL = 3
BARD_PERFORMANCE_DAILY_HOUSE_CAP = 23 gold
BARD_TIP_OPTIONS = [1, 3, 5, 13]
```

Recommended house payout by grade:

```text
rough: 1
pleasant: 3
memorable: 5
legendary: 13
```

Suggested check:

```text
power = 2 * effective CHA
      + effective LUCK
      + level
      + bounded random [-6; +6]
```

Shipped in `0.2.5`:

- injected RNG;
- frozen effective stat snapshot;
- stored grade, payout and `roleActionXp: 0`;
- no reroll on refresh/replay;
- Shynok start may have zero active audience characters;
- non-Shynok start requires at least one active same-location audience character;
- Shynok-only house payout with daily cap by Kyiv date;
- per-location cooldown;
- tips do not count toward house cap;
- tip debit/credit and reaction completion happen in one transaction;
- wrong location, remort-life drift, active combat, pending raid, expiry and insufficient balance are rechecked before mutation;
- no item, buff, achievement, reputation or quest progress in the first slice;
- no exact chance math in player-facing copy.

## Near Follow-Ups

### Priest Community Blessing

Status: near, after Bard proves same-location offers.

- level 3+ Priest;
- self plus one consenting nearby target;
- Shynok or Korchma hall;
- 93-minute cooldown;
- atomic mana cost and HP heal after accept;
- no over-heal;
- no target in active combat;
- small role-action XP for the actor on a completed useful blessing;
- no gold, item, group heal or forced mutation.

Suggested calculation:

```text
heal = min(
  missingHP,
  3 + floor((CHA + INT) / 3) + floor(level / 2)
)

manaCost = max(
  7,
  ceil(heal * 0.75) + 2
)
```

### Race And Signature Techniques

- add stable signature ids;
- use race/signature flavor variants in Bard first;
- allow at most one small modifier;
- add content validation for active combinations;
- do not key mechanics from localized title text.

### Rogue NPC Practice

Ship before any player theft.

- level 3+;
- Korchma/market-like scene;
- 93-minute cooldown;
- DEX + LUCK + level;
- active witnesses reduce grade;
- small role-action XP;
- small capped gold result `0/1/3/5/13`;
- Kyiv daily cap `23`;
- non-lethal failure;
- no real player target.

Player-targeted Rogue tricks are later and opt-in only.

### Informational Techniques

Yeger scouting and Mage appraisal are good low-inflation slices:

- qualitative clues;
- no encounter consumption;
- no exact RNG/damage disclosure;
- no private location tracking;
- small role-action XP if the action consumes a real cooldown/resource.

## Architecture Direction

First runtime slice should use a narrow vertical:

- pure domain calculation;
- feature-specific service;
- feature-specific repository;
- compact callback data;
- presenter/keyboards owned by the natural bot module;
- no `UniversalActionEngine`.

For Bard, likely surfaces:

```text
src/domain/noncombat/bardPerformance.ts
src/content/nonCombatTechniques.ts
src/content/bardPerformanceFlavor.ts
src/services/bardPerformanceService.ts
src/db/repositories/bardPerformanceRepository.ts
src/bot/callbacks/bardPerformanceCallbackData.ts
src/bot/keyboards/bardPerformanceKeyboard.ts
src/bot/presenters/bardPerformancePresenter.ts
```

Use `tavern` and `social` ownership carefully; callback prefix ownership must be singular and tested. Telegram send is best effort and never the authority for stored game mutation.

## Persistence Notes

For Bard, prefer narrow tables, not a generic social ledger:

- `BardPerformance`;
- `BardPerformanceReaction`.

Store opaque token, actor, remort count, location, status, grade, house payout, XP result, frozen check snapshot, result JSON, started/expires/cooldown/completed timestamps and audience reactions.

Guarded transitions:

- start only if no live performance and cooldown passed;
- one house payout and one XP result per performance;
- one reaction per audience character;
- tip debit/credit in one transaction;
- stale/expired/remorted/location mismatch does not mutate;
- terminal callback replays stored result.

## Social Safety

Any action that spends gold, changes HP/mana, adds a buff/debuff, creates an obligation or makes another player a target needs a server-authoritative contract.

Voluntary positive actions require:

1. active same-location candidate;
2. private offer;
3. accept/decline;
4. short TTL;
5. re-check before mutation;
6. atomic resource mutation;
7. terminal replay;
8. best-effort notification only after durable state.

Forced player theft is explicitly not an early feature.

Privacy rules:

- do not show exact hidden locations;
- do not list inactive players;
- do not expose Telegram usernames/ids;
- do not turn scouting into tracking.

## Recommended Order

1. Bard Performance MVP.
2. Priest Community Blessing.
3. Race/signature modifiers.
4. Yeger scouting and Mage appraisal.
5. Rogue NPC practice.
6. Opt-in risky social tricks after security/economy review.
7. Food, enchantment and crafting-related techniques after item tags and one-use manatky are stable.

## Shipped Bard Task Acceptance Notes

The `0.2.5` Bard implementation covers:

- class/level/location/audience gates;
- active combat and pending raid gates;
- cooldown;
- one live performance per location;
- frozen effective stats;
- Shynok house payout once;
- stored `roleActionXp: 0`;
- daily cap;
- audience filtering;
- applause;
- each tip amount;
- insufficient gold;
- self-response rejection;
- remort mismatch;
- location mismatch;
- expiry;
- duplicate/replay;
- notification failure isolation;
- callback parser limits;
- Ukrainian escaped presenter copy;
- architecture prefix ownership.

Future non-combat tasks may reuse these notes, but XP, instruments, buffs and broader profession/catalog mechanics need their own explicit task and balance review.

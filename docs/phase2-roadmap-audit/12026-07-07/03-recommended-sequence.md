# 03 — Recommended Sequence After `0.2.30`

## Principle

Finish the current Mantok foundation, then return to Phase 2 social retention. Do not let the next three releases become only equipment power.

## Proposed order

### `0.2.31 — Mantok Ability Grants QA Hardening`

Use only if `0.2.30` still needs manual Telegram evidence, routing fixes, stale callback polish, or docs/release cleanup.

Scope:
- no new abilities;
- no new items;
- no Charkokovalnia;
- QA checklist closure;
- stale callback and missing-grant hardening;
- Big Barrel / turn-based duel / two-enemy journal proof;
- release docs and context sync.

Reason: PR #133 itself says a narrow `0.2.31` polish/QA hardening follow-up is reserved.

### `0.2.32 — Charkokovalnia / Item Upgrades MVP`

Promote the stacked Item Upgrades branch only after `0.2.30` is merged and stable. Renumber it away from `0.2.30`.

Scope:
- concrete `base.plus-N` item ids;
- single-copy upgrade movement;
- deterministic cost/chance/pity/donor gates;
- Iskrokamin material rewards;
- replay-safe upgrade attempts;
- no Prisma migration unless absolutely required;
- no market, auction, item instances, or broad economy rewrite.

Reason: it is a natural follow-up to equipment depth, but it should not outrun ability-grant QA.

### `0.2.33 — Turn-Based Duel Tournaments Rewards MVP`

Return to Phase 2 social combat.

Scope:
- resolved turn-based duels only;
- Korchma-funded daily/weekly/monthly reward claims;
- gold + manatky, capped and replay-safe;
- pair-abuse caps;
- no wagers;
- no item loss;
- Rogue retaliation quick duels do not count;
- public copy avoids shame for losses.

Reason: players need rewards beyond rating; tournament rewards give non-monster players a reason to return.

### `0.2.34 — Rogue Reputation and Location Risk`

Scope:
- durable reputation/social consequence ledger;
- noticed/caught Rogue outcomes can lower reputation;
- location exposure tiers: public Korchma > side spaces > Nyz/passages/yard;
- replay-safe, no public shame feed by default;
- no item theft.

Reason: forced bounded theft is fun but needs social cost before it becomes a grief loop.

### `0.2.35 — Quest Overview Route`

Scope:
- make `🗺️ Квести` a true overview/journal rather than only an opener to current quest table;
- show active/tutorial/daily/Yeger/Barrel progress;
- keep direct route buttons;
- no new quest system;
- no rewards.

Reason: lots of navigation and quest-marker polish has accumulated; a clear overview will reduce support friction.

### `0.2.36 — Shynok Resale / Korchmar Recycling`

Scope:
- narrow buyback/recycling loop for surplus priced manatky;
- controlled sink;
- avoid market;
- keep equipped/protected/story/gift/postal safety.

Reason: item volume keeps growing; economy needs more controlled sinks.

### `0.2.37+ — Fuller Big Barrel / Party Raid Hardening`

Scope:
- only after social/economy fatigue decreases;
- contribution-aware rewards;
- richer boss/raid mechanics;
- no broad party-vs-many engine until one-boss route is proven.

### `0.2.38+ — Class / Race / Active Title Abilities Follow-ups`

Scope:
- ability-grant data should inform which class/race gaps remain;
- taunt/shield only after shield/offhand/defender identity is truly supported.

## Short answer

Best next full feature after `0.2.30`:
- if QA debt remains: `0.2.31 — Mantok Ability Grants QA Hardening`;
- if QA is clean: `0.2.31 — Charkokovalnia / Item Upgrades MVP`;
- but after that, pivot to `Turn-Based Duel Tournaments Rewards`.

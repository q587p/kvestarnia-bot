# Old Altar Blessings — balance notes

## Balance goal

Make the altar feel useful and flavorful without making “go buy a buff before every fight” mandatory.

The feature should be closer to:

> A short role-play preparation with a small visible stat bump.

Not:

> A permanent paid progression layer.

## Current balance constraints

The project balance notes target ordinary same-level fights around a short 2-5 turn range and a high but not guaranteed win rate. Any blessing that changes combat must be small, visible and temporary.

Current Priest direct blessing already provides a visible 13-minute `+1..+5 luck` status with a 93-minute same actor-target repeat wait. The altar should not stack another independent status on top of this.

## MVP constants

```text
OLD_ALTAR_MIN_PRIEST_LEVEL = existing CLASS_NONCOMBAT_MIN_LEVEL // currently 3
OLD_ALTAR_GOLD_OFFERING_COST = 13 gold
OLD_ALTAR_GOLD_OFFERING_FAVOR = 1
OLD_ALTAR_DAILY_GOLD_FAVOR_CAP = 3 per character/remort life/Kyiv day
OLD_ALTAR_BLESSING_DURATION_MINUTES = existing PRIEST_BLESSING_DURATION_MINUTES // 13
OLD_ALTAR_BLESSING_REPEAT_WAIT_MINUTES = existing PRIEST_DIRECT_AID_COOLDOWN_MINUTES // 93
OLD_ALTAR_BLESSING_MAX_BONUS = 3
OLD_ALTAR_BLESSING_FAVOR_COST_BY_BONUS = [1, 2, 3]
OLD_ALTAR_BLESSING_MANA_COST_BY_BONUS = [8, 12, 16]
```

Rationale:

- `13` gold and `13` minutes match project number language.
- `3` favor/day from gold stops cheap pre-fight spam.
- `+1..+3 chosen stat` is strong enough to notice but weaker than `+1..+5 luck` in raw maximum.
- Chosen stat is more controllable than luck, so it should have a lower cap.
- Existing 93-minute same actor-target wait keeps the Priest interaction cadence consistent.

## Blessing table

| Blessing | Stat | Max bonus | Why it is safe |
|---|---:|---:|---|
| `Тверда рука` | strength | +3 | Small direct combat bump; no reward multiplier. |
| `Легкий крок` | dexterity | +3 | Helps rogue/defense/crit-like formulas only through existing stat paths. |
| `Ясний розум` | intelligence | +3 | Helps magic/Priest formulas; costs Priest mana to create. |
| `Ласкаве слово` | charisma | +3 | Mostly social/Bard/Priest flavor; current noncombat gates still apply. |
| `Добра прикмета` | luck | +3 | Weaker cap than direct Priest +luck blessing; avoid separate loot buff. |

## Cost curve

Recommended altar blessing cost:

```text
+1 stat: 1 Благовоління + 8 mana
+2 stat: 2 Благовоління + 12 mana
+3 stat: 3 Благовоління + 16 mana
```

This makes a max altar blessing require either:

- the whole daily gold offering cap from one character, or
- pooled planning only if a later design allows transfers/shared favor.

MVP should **not** allow shared altar favor. Keep it per current character/remort life to avoid social pressure and accidental power pooling.

## Formula

Implementation can reuse the current Priest blessing amount and clamp it lower:

```text
base = existing Priest blessing plan bonusAmount // currently 1..5
altarBonus = clamp(base, 1, 3)
```

This avoids a new complicated formula and keeps Priest intelligence/level relation familiar.

## Expected power impact

A `+1` stat is mostly flavor and mild edge.

A `+2` stat should be useful for a character preparing for a fight, duel or social/noncombat action.

A `+3` selected stat is meaningful, but:

- it is short-lived;
- it costs mana and favor;
- it blocks other active Priest blessings;
- it does not change rewards directly;
- it cannot be repeatedly applied to the same target by the same Priest for 93 minutes.

## Avoid these in MVP

Do not add:

- reward multiplier;
- “better loot” status separate from `luck`;
- resurrection / death avoidance;
- no-loss guarantee;
- ambush/travel protection;
- permanent favor-to-stat conversion;
- daily free blessing with no Priest/mana/favor;
- favor purchase with unbounded gold.

## Offering balance

MVP gold offering:

```text
13 gold -> 1 Благовоління
max 3 Благовоління/day from gold offerings
```

Why not scale by level in MVP:

- Kvestarnia uses small numbers;
- low-level players should understand the altar immediately;
- high-level combat already has other power sources;
- hard level scaling can make the altar feel like a tax.

Possible future level-sensitive tweak after playtest:

```text
levels 1-4: 13 gold -> 1 favor
levels 5-8: 23 gold -> 1 favor
levels 9-13: 42 gold -> 1 favor
```

Do not implement this until actual gold economy pressure is observed.

## Manatka offerings follow-up

Item offerings should be balanced after inspecting current item metadata.

Safe initial approach:

```text
ordinary eligible one-use item or weak equipment: 1 favor
known useful/effect-bearing equipment: 2 favor
rare/restricted/effect-bearing item: 3 favor
cap one item offering at 3 favor in first item-sink slice
```

Avoid valuing by nominal sell price unless the existing sell/value system is already stable and protected.

## Abuse risks and mitigations

| Risk | Mitigation |
|---|---|
| Pre-fight mandatory tax | short duration, one active blessing, daily favor cap, no reward multiplier |
| Gold-rich players spam blessings | favor cap and same actor-target wait |
| Priest alt self-buffs too efficiently | mana cost, same active blessing block, daily favor cap |
| Accidental item loss | item offerings deferred; later use confirmation and eligibility filters |
| Hidden stacking in effective stats | use the existing one active Priest blessing helper; add tests for non-stacking |
| Favor persists across remort unfairly | scope account to current character/remort life |
| Public pressure to donate | keep offerings private in MVP |

## Telemetry / playtest signals

Track manually or via logs:

- how often altar is opened;
- gold spent per day;
- favor balances stuck unused;
- ratio of direct Priest blessing vs altar blessing;
- most chosen blessing stat;
- failed/blocked altar blessing reasons;
- combat win-rate drift if easy to simulate.

## Tuning levers

If too weak:

- raise daily favor cap from 3 to 5;
- lower gold cost from 13 to 8;
- allow +4 max only for self? Not recommended before simulation.

If too strong:

- max bonus 2;
- favor cost `[1, 3, 5]`;
- duration 8 minutes;
- require same-yard target to be active at result time;
- leave direct +luck blessing as the stronger but less targeted option.

## Recommended default after MVP

Keep the first release conservative:

```text
13 gold -> 1 favor
3 favor/day cap
+1..+3 selected stat
13 minutes
93-minute same actor-target wait
no item offerings until follow-up
```

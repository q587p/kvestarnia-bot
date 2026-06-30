# Big Barrel Brother Balance Proposal

Status: starting numbers for simulation, not production proof
Balance version seed: `big-barrel-brother-v1`

## Design targets

- Entry level: `8`.
- Party size: `1..8`.
- Recommended party: `4–5`; `3` is a geared/attentive challenge.
- Winning encounter length: usually `4–8` rounds for prepared groups.
- No runtime final round exists in `0.2.17`.
- Round `13` is a deterministic simulation and QA horizon only; unresolved fights at that horizon stay `unresolvedByHorizon` and are not runtime losses.
- Round deadline: `23` seconds.
- Gear, class identity, equipped manatky and eligible PvE buffs matter.
- No class/race should be mandatory.
- More players improve reliability, but capacity `8` must not trivialize mechanics.

## Scale inputs

Freeze at combat start:

```text
N = eligible participant count, clamp 1..8
leaderLevel = current party leader level
bossLevel = clamp(leaderLevel, 1, 13)
rewardLevel = clamp(bossLevel, 8, 13)
```

The boss follows the current party leader instead of the average roster, so a level-13 starter cannot lower the boss tier by inviting several lower-level characters. Equipment, remort memory, food, drinks and one-use items do not enter `bossLevel`.

## Starting boss HP formula

```text
baseHp = N == 1 ? 150 : 132
levelDelta = max(bossLevel - 8, 0)

bossHp =
  baseHp
  + 42 * min(max(N - 1, 0), 4)
  + 200 * max(N - 5, 0)
  + 7 * levelDelta
  + 11 * levelDelta * N
```

Interpretation:

- the higher solo base keeps solo entry possible as an opt-in challenge without making solo look reliable by default;
- players `2–5` add the entry action-economy tax used by the 3-player probe;
- players `6–8` add a large-party coordination tax so a full group is favored but not automatic;
- higher leader levels add both a flat tier bump and a per-participant tier tax, making low-level joiners under a high-level leader substantially riskier.

### HP table

| Boss/leader level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 8 | 150 | 174 | 216 | 258 | 300 | 500 | 700 | 900 |
| 10 | 186 | 232 | 296 | 360 | 424 | 646 | 868 | 1090 |
| 13 | 240 | 319 | 416 | 513 | 610 | 865 | 1120 | 1375 |

The higher solo base is intentional for this feature-flagged MVP: solo entry is allowed, but it is not the baseline and should not look reliable without future explicit solo-preparation rules.

Freeze the value. Do not heal or rescale the boss when someone disconnects, withdraws, or is knocked out.

## Base boss stats

Create an authored monster profile with tags conceptually equivalent to:

```text
boss, construct, mind, barrel, surveillance
```

Use canonical monster derivation at `bossLevel` for attack, armor, resist and dexterity. Override only HP through the raid formula. If the content tag set already adds the desired construct/mind defenses, do not duplicate flat bonuses in raid code.

Starting guardrails:

- no hidden boss crit on unavoidable party-wide damage;
- no raw damage multiplier based directly on `N`;
- boss target count scales with `N`;
- phase-three outgoing damage multiplier is `1.13`;
- phase-three armor and resist each drop by `2` so the enrage is also a finish window.

## Target count

```text
markedTargetCount = 1 + (N >= 4 ? 1 : 0) + (N >= 7 ? 1 : 0)
```

This gives one marked target for `1–3`, two for `4–6`, and three for `7–8`.

Target selection must be deterministic from the session/round seed and fair:

- prefer living participants not hit by the previous heavy action;
- do not hit one participant with more than two consecutive targeted boss actions when alternatives exist;
- use previous-round top damage only as the temporary ordinary focus rule in `0.2.17`, not as permanent aggro;
- keep a broad all-living-participant hit on a deterministic fourth-turn cadence until fuller threat/taunt mechanics replace it;
- show every heavy mark before the damaging round.

## Ability kit

### 1. `Погляд з-під обруча`

Baseline single-target attack using canonical boss physical damage. It is the filler action and may occur in every phase.

### 2. `Перепис присутніх`

Telegraph round. Mark `markedTargetCount` living participants. On the following resolution, each marked participant receives `1.42x` baseline positive damage before personal guard/class mitigation.

- `Захищатися` is the clear counter and should reduce this hit by about half through the shared guard primitive plus any class mitigation.
- Marks are private on each participant card and summarized safely on the shared card.
- If a marked participant is knocked out before resolution, do not retarget invisibly.

### 3. `Форма 19-84`

At first crossing below `70%` HP, open a one-round shared `Нагляд` objective.

```text
oversightMax = 3 + 2 * N
```

Starting break contribution:

| Committed action | Break contribution |
|---|---:|
| `🧯 Зірвати нагляд` | 5, no boss damage |
| social/trick class skill | 3 plus normal skill result |
| physical/spell class skill | 2 plus normal skill result |
| basic attack | 1 plus normal attack result |
| defend | 1; 2 if the actor is currently marked |
| timeout auto-defend | 0 |

If the bar reaches zero/maximum contribution:

- cancel the boss action for that round;
- apply `-2 armor/-2 resist` until the end of the next player phase;
- credit support contribution to everyone who helped.

If it fails:

- resolve `Погляд у кожен кухоль` against every living participant;
- per-target damage starts at `42%` of a normal positive boss hit, rounded down with minimum `1`;
- add current watcher-stack flat pressure;
- do not also apply a full baseline single-target hit in the same failed-break resolution.

The formula deliberately makes a solo dedicated disrupt capable of succeeding, while larger groups need roughly one dedicated disruptor per three participants or several control-flavored skills.

### 4. `Дрібні наглядачі`

These are **hazard stacks**, not targetable enemies in v1.

Spawn on first crossing below `70%` and `35%` HP:

```text
spawnStacks = ceil(N / 3)
watcherStackCap = 4
```

Each stack adds `+1` flat damage to party-wide boss actions. While stacks exist, show `🧹 Розігнати дрібноту`:

- removes up to `2` stacks;
- deals no boss damage;
- grants support contribution;
- timeout never selects it automatically.

This gives the requested small-monster flavor without jumping directly from party-vs-one-boss to a second multi-target combat architecture.

### 5. `Беру справу у власні клепки`

At first crossing below `35%` HP:

- boss outgoing positive damage becomes `1.13x`;
- boss armor and resist drop by `2` for the rest of the fight;
- spawn the second watcher wave up to cap;
- mark telegraphs may target the size-scaled count.

The phase is dangerous but intentionally speeds up the kill.

### 6. Runtime terminal contract

There is no hidden runtime round cap, final player action window, enrage timer or automatic loss by turn number in `0.2.17`.

The runtime ends only when:

- the boss reaches `0 HP`;
- all active/eligible participants are knocked out, withdrawn, invalidated or otherwise unable to continue;
- explicit lifecycle cleanup cancels or invalidates the raid.

Round `13` remains a simulation/reporting horizon only. If a deterministic probe is still active after round `13`, report it as `unresolvedByHorizon`.

## Suggested cadence

Thresholds are authoritative; round numbers are safe fallbacks so the boss cannot skip its identity when damage is unusual.

1. round 1 — baseline action and opening bark;
2. round 2 — `Перепис присутніх` telegraph;
3. round 3 — marked heavy resolution;
4. first round after `<=70%` — `Форма 19-84` and watcher wave;
5. next round — break success/failure result;
6. first round after `<=35%` — enrage transition;
7. later rounds — continue normally until a canonical terminal condition occurs.

If thresholds are crossed early, do not stack two major phase actions in one boss resolution. Queue one transition and preserve readable telegraphs.

## Participant resources

- Use frozen current HP/mana after canonical lazy recovery.
- Use canonical effective stats, item effects, armor, resist, weapon/spell power and cooldown rules.
- A participant at zero raid HP is knocked out and stops acting.
- No resurrection in v1.
- Persistent HP/mana and consumed buffs settle exactly once at terminal state.
- A participant who withdraws receives no full contribution tier.

## Reward starting values

Rewards are individual, stored, replay-safe and never previewed exactly before commitment.

### XP

```text
participationXp = 23 + 3 * (rewardLevel - 8)
contributionXp = 0 | 5 | 13
xp = participationXp + contributionXp
```

Contribution tiers are threshold-based, not a top-player ranking:

- `0`: inactive/insufficient meaningful participation;
- `5`: partial participation, including an early legitimate knockout;
- `13`: manual action in at least half of available personal rounds plus either reasonable damage or useful defend/disrupt/hazard work.

Several or all players may receive `13`.

Typical successful range: `23–51 XP`.

### Gold

```text
participationGold = 13 + 2 * (rewardLevel - 8)
contributionGold = 0 | 3 | 8
gold = participationGold + contributionGold
```

Typical successful range: `13–31 gold`.

### Failure

A meaningful contributor receives stored `1 XP`, no gold, no item, and no success gate. Inactive invite passengers receive nothing.

### Personal loot

Every full contributor receives one personal roll:

- base chance `42%`;
- level profile based on `rewardLevel` with `lootPowerOffset +1` relative to ordinary center-route loot;
- maximum one ordinary personal item;
- reuse canonical candidate filtering, item grants, level requirements and replay storage;
- no hidden duplicate grant on callback replay.

### Guaranteed affinity spotlight

Every won raid grants exactly one additional spotlight item to one full contributor:

- candidate must have at least one soft affinity match to the selected character's race, class, or current title when content permits;
- fallback is a level-appropriate broadly usable item, never a null reward;
- starting rarity roll: `76% uncommon`, `23% rare`, `1% epic`;
- selection is weighted by recent spotlight drought so the same player does not repeatedly monopolize it;
- the item remains giftable under normal item rules unless its own content metadata says otherwise;
- the spotlight is a bonus; all meaningful contributors still receive XP/gold and their own personal roll.

### First-win trophy

Once per remort life, grant a low-power/priceless cosmetic evidence item such as `Відколота клепка нагляду`. It must not become mandatory combat power.

## Required simulator

Add a deterministic group-raid simulator based on the real domain resolver, not a separate approximate formula script.

Minimum matrix:

- levels `8`, `10`, `13`;
- party sizes `1`, `2`, `3`, `4`, `5`, `8`;
- all current classes;
- representative compatible races/paths;
- equipment profiles: baseline, level-appropriate solid, strong;
- no buff and eligible prepared PvE buff profiles;
- aggressive, telegraph-aware, and AFK/mixed policies;
- at least `10,000` runs for final balance evidence per aggregate cell where practical.

## Acceptance bands

These are tuning targets, not public odds:

| Scenario | Target win rate |
|---|---:|
| level 8 solo baseline, no manatky/remort/external buffs/items | `0–13%` |
| level 8 prepared 3-player entry party | `35–49%` |
| level 8 prepared solo | `0–10%` |
| level 10–13 exceptional prepared solo | `5–20%` |
| 2 prepared players | `25–50%` |
| 3 prepared players | `55–75%` |
| 4 solid players | `60–82%` |
| 5 solid players | `72–90%` |
| 6–8 baseline/solid players | `78–93%` |
| full 8-player party at the same level as the leader/boss | `75–93%` |
| level-13 leader with mostly lower-level joiners | substantially below the same-level full-party band |

Additional gates:

- successful mean duration `4–6` rounds for recommended groups;
- fewer than `10%` of recommended-group wins before round 3;
- no class/race aggregate more than `15` percentage points from the comparable mean without an explained content reason;
- support-aware play must not earn less full-tier eligibility than pure damage when it resolves real mechanics;
- unavoidable party-wide damage must not be the majority cause of recommended-group wipes;
- level-appropriate strong equipment and eligible buffs should visibly improve odds, but five baseline players must not require one exact item/class.

## 0.2.17 deterministic probe result

The feature-flagged MVP checks a narrow CI-stable reducer probe by the 13-round horizon:

| Scenario | Runs | Wins | Losses | Unresolved by horizon | Win rate |
|---|---:|---:|---:|---:|---:|
| Solo baseline, no manatky/remort/external buffs/items | 400 | 0 | 400 | 0 | `0%` |
| Prepared 3-player entry party | 400 | 181 | 219 | 0 | `45.25%` |
| Full same-level level-8 party | 400 | 350 | 48 | 2 | `87.5%` |
| Full same-level level-13 party | 400 | 345 | 4 | 51 | `86.25%` |
| Level-13 leader with seven lower-level joiners | 400 | 0 | 400 | 0 | `0%` |

These are internal balance checks, not player-facing odds.

## Tuning order

When simulations miss targets, tune in this order:

1. HP per participant bands;
2. marked target count and heavy multiplier;
3. oversight threshold/contribution values;
4. watcher stack pressure;
5. phase-three vulnerability and outgoing multiplier;
6. reward values only after combat is stable.

Do not compensate for an overtuned boss by inflating rewards, and do not scale boss HP from live item power.

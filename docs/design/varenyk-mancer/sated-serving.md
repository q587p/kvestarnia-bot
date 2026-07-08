# Varenyk-mancer Sated Serving

Status: design draft.

## Goal

Give `class.varenyk-mancer` a support identity outside direct combat by letting a level 3+ Varenyk-mancer feed themself or treat an active nearby adventurer with a short `Ситий` status.

The action should feel like warm tavern food: small immediate comfort, then tiny HP/mana recovery over time. It should not become a broad cooking/crafting system.

## Player fantasy

> Вареник-мант дістає миску, переконує начинку поводитися пристойно й на 13 хвилин робить пригодника ситішим, спокійнішим і трохи живішим.

## MVP surfaces

- Self action from the hero/class action surface.
- Nearby target action from `👀 Хто поруч` / same-location presence.
- Any current location is allowed when the actor and target are not in blocking active flows.
- No new location in the MVP.
- Optional future location after playtest: `Кухонька за шинком` or a small Shynok kitchen corner.

## Technique contract

```text
techniqueId: technique.class.varenyk-mancer.sated-serving
source: class
actorClassId: class.varenyk-mancer
minLevel: 3
statusId: status.class.varenyk-mancer.sated
duration: 13 minutes
recipientCooldown: 93 minutes
```

### Eligibility

Actor:
- current character is `class.varenyk-mancer`;
- level 3+;
- has enough mana for the resolved serving strength;
- not in active combat, pending raid, active party boss turn, remort drift or another blocking active flow.

Target:
- self is allowed;
- another target must be an active exact-normalized same-location character;
- target is not in active combat / pending raid / blocking active flow;
- target does not have active `Ситий`;
- target has no unexpired food cooldown from this technique;
- target is from the same current character life.

### Mana and strength

Resolve serving strength deterministically from the actor's canonical effective summary.

Recommended rank:
- `rank` in `1..5`;
- primary: effective intelligence;
- secondary: charisma and level;
- deterministic bounded roll seeded by actor id, target id, current recipient cooldown window and action token;
- store `rank`, effective stat snapshot and mana cost in the durable result.

Mana cost mirrors Priest-style support tiers:

| Rank | Mana cost |
| ---: | ---: |
| 1 | 8 |
| 2 | 12 |
| 3 | 16 |
| 4 | 20 |
| 5 | 23 |

Do not expose exact hidden math in pre-commit copy.

### Status effect

On successful application:

- spend actor mana atomically;
- set/reset actor `manaRegenAt` to the action time if this is the repository's current convention for mana spend;
- create a visible timed `Ситий` status on the target for 13 minutes;
- start a 93-minute recipient food cooldown;
- notify another target privately only after durable mutation.

Immediate application:
- restore `2 + rank` HP, capped by target max HP;
- restore `1` mana, capped by target max mana.

Minute tick:
- while outside combat, once per minute bucket:
  - restore `1` HP;
  - restore `1` mana;
- never over max HP/mana;
- missed wall-clock minutes may be applied lazily when the target is next read, if the existing status framework supports it; otherwise it is acceptable for MVP to tick only on status refresh/hero card reads as long as tests document the contract.

Combat tick:
- while the target is in a supported combat surface, tick on the target's own player turn instead of wall-clock minute:
  - restore `1` HP;
  - restore `1` mana;
- at most one food tick per target combat turn id;
- do not tick on enemy turns;
- do not tick after the status expires;
- do not create extra actions or consume combat item slots.

Balance follow-up:
- rank 4-5 may increase HP tick to `2` after balance review, but MVP can keep all ranks at `1 HP / 1 mana` per tick and use rank for immediate comfort + mana cost.

## Presentation

Player-facing language is Ukrainian.

Suggested labels:
- `🥟 Пригостити вареником`
- `🥟 Пригостити <імʼя>`
- `🥟 Зʼїсти вареник`
- Status: `Ситий`

Open card should show:
- who can be fed;
- who is already `Ситий`;
- who has food cooldown;
- actor current mana;
- no exact formula.

Successful self result:

```text
🥟 Ви зʼїли вареник

Начинка повелася відповідально.
Стан: Ситий на 13 хв.
```

Successful target result:

```text
🥟 Ви пригостили <target>

Вареник-мантська пара зробила свою тиху справу.
<target> ситий на 13 хв.
```

Target private notification:

```text
🥟 <actor> пригостив вас вареником.

Стан: Ситий на 13 хв.
```

Tick copy should be compact in combat journals:

```text
🥟 Ситий: +1 HP, +1 мана.
```

## Non-goals

- No broad cooking/crafting engine.
- No food inventory items, shops, markets or transfers.
- No gold faucet, tips, XP or quest/hunt/adventure progress.
- No public feed row.
- No party-wide feast.
- No forced negative effect.
- No feeding active combat targets as an action; the status may tick in combat only if applied before combat.
- No exact chance/math disclosure in player-facing copy.
- No new location in the MVP.

## Future follow-ups

- `Кухонька за шинком` micro-location if the social loop needs a home after playtest.
- Itemized one-use food after item economy review.
- Party feast for raids only after party support balance is stable.
- Race/signature flavor variants for valid Varenyk-mancer combinations.

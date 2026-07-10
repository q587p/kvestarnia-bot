# Bureaucramancer Personal Protocol 13-B

Status: shipped in `0.3.6`.

## Goal

Give `class.bureaucramancer` a narrow social raid-prep identity action that differs from Kharakternyk ward signs.

A Bureaucramancer can open `Протокол 13-Б: персональні претензії` during Big Barrel Brother recruiting. Joined participants may sign the protocol once. Each signature protects that signer from the first personal/single-target boss attack against them in the resulting fight.

## Role split

This feature intentionally avoids the Kharakternyk shared-ward role.

```text
Kharakternyk ward sign:
  protects the group/location from a broad/special boss attack.

Bureaucramancer protocol:
  protects each signer from their own first personal boss attack.
```

The Bureaucramancer does not ward the Barrel. They file personal claims against the Barrel's future complaints.

## Class fantasy

Bureaucramancer identity is paperwork, authority and control:

- existing class copy: forms, stamps and a very serious look;
- existing combat skill: `📄 Форма 13-Б`, social/control AoE with response mitigation;
- existing design vocabulary: forms, permits and queue manipulation; `authority/investigation`.

The non-combat fantasy should be:

> The Bureaucramancer makes the boss take a number before it can hit a signer personally.

## Player-facing concept

Recruiting card excerpt:

```text
📄 Протокол 13-Б відкрито

Бюрокромант розклав на Бочці форму для майбутніх персональних претензій.
Підписів: 4/8

Перший особистий випад Бочки по кожному підписанту має пройти канцелярію.
```

Participant button:

```text
✍️ Підписати протокол
```

Trigger line:

```text
📄 Протокол 13-Б став поперек персональної претензії.
Бочка спробувала оформити удар по підписанту, але документ уже лежав у черзі.
Перша персональна атака не пройшла.
```

Do not show signer names on recruiting cards. Show only the count.

## Mechanics

```text
Technique id: technique.class.bureaucramancer.personal-protocol-13b
Actor class: class.bureaucramancer
Minimum actor level: 3
Actor surface: joined participant in live Big Barrel Brother recruiting at the Barrel
Actor cost: 5 mana
Actor cooldown: 93 minutes after successful filing
Session limit: at most one live personal protocol per Big Barrel recruiting session
Participant action: sign protocol once per joined participant before raid start
Signature cost: 0 mana, 0 gold, 0 items
Signature display: count only; no public signer list
Filer signature: successful filing auto-signs the Bureaucramancer if they are a joined participant
```

### Effect

When the resulting Big Barrel Brother fight starts, carry the protocol and signer set into party-boss runtime.

For each signed participant:

```text
The first eligible personal/single-target boss attack against that participant is blocked for that participant.
After blocking, only that participant's signature is marked spent.
Other signed participants keep their own unspent personal protocol until targeted.
```

Blocked means the attack's immediate damage to that participant becomes `0` for that boss action. If the current runtime represents a personal boss action as multiple immediate damage lines against the same target, block all immediate damage from that one boss action to that signer.

Do not block:

- broad / area / all-party boss attacks;
- the named broad `Бочковий гуркіт` family unless the implementation proves it is actually a single-target personal action;
- delayed environmental damage;
- damage from the player's own action, item, fumble or sacrifice;
- future turns after the first personal block for that signer.

### Attack classification

Preferred: use typed party-boss action metadata.

```text
personal/single-target attack:
  targetScope === "single-participant" or equivalent runtime metadata

broad/special/area attack:
  targetScope === "all-living-participants" or equivalent runtime metadata
```

Fallback if typed metadata is missing: identify the existing ordinary focused boss attack path separately from the named broad `Бочковий гуркіт` path. Do not key only from localized text when a stable action id/family exists.

### Interaction with Kharakternyk ward signs

The two effects should normally not stack because they cover different attack scopes.

Safe rule:

```text
Kharakternyk ward signs cover broad/special/all-party damage.
Bureaucramancer personal protocols cover personal/single-target boss damage.
If a future boss action has both area and personal components, apply each effect only to its matching damage component and never reduce the same damage event twice.
```

Document this in balance notes if both features exist on the target branch.

## Persistence and replay

The shipped implementation uses existing party-session and party-boss state instead of a schema migration.

Store at least:

```text
protocol id / token
party session id
actor character id
actor remort/life boundary
openedAt
cooldown key / filed action row
signatures by character id
per-signature state: unspent | spent
fight/session linkage after start
trigger rows: signer id, boss action id/turn id, prevented damage, triggeredAt
```

All mutations must be replay-safe:

- duplicate filing callbacks replay the existing protocol or return a session already-has-protocol card;
- duplicate signing callbacks replay the signed state;
- stale signatures after raid start do not mutate;
- stale signatures from non-joined characters do not mutate;
- a spent signer signature never blocks a second personal attack;
- terminal/journal replay shows stored trigger rows, not recalculated blocking.

Implementation notes:

- recruiting protocol/signature state lives in `PartyParticipant.snapshotJson`;
- filer cooldown uses `characterCooldown` key `class.bureaucramancer.personal-protocol-13b.cooldown`;
- started Big Barrel boss state freezes joined, remort-matching signer ids into `PartyBossState.personalProtocol`;
- `/dev_reset_bureaucramancer_protocol` clears only the filer cooldown for local QA and stays disabled in production.

## UI surfaces

- Big Barrel Brother recruiting card: show protocol status and signature count only.
- Joined participant card: show sign button only when the participant can sign.
- Filing result: short Ukrainian card with mana spend.
- Signing result: short Ukrainian confirmation; no public signer list.
- Active fight/journal: show when a participant's personal protocol blocks an attack. Group-visible copy may stay generic; viewer-private cards may name the viewer where the existing combat presenter normally names the target.
- Lore Board: update Bureaucramancer class entry after runtime ships.

## Non-goals

- No new class/race.
- No universal bureaucracy engine.
- No new location in MVP.
- No shared broad/special attack mitigation; that is Kharakternyk territory.
- No item crafting or paper consumables.
- No gold fees, bribes, markets or paid advantage.
- No quest/adventure rerolls.
- No exact hidden formula in pre-commit player copy.
- No public signer names.
- No XP, gold, items, quest progress or hunt progress from filing/signing.

## Balance notes

This is allowed to be a full personal block because it is narrow:

- only signed participants benefit;
- each signer gets at most one personal block;
- it does not affect broad/special/all-party attacks;
- it does not reduce every round;
- filing costs mana and has an actor cooldown;
- signing is free social participation, not an economy faucet or pressure spend.

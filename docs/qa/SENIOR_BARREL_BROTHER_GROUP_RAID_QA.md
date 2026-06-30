# Senior Barrel Brother Group Raid QA

## Test accounts

Prepare at least eight local/staging characters with controlled levels/classes/resources:

- level 7 legacy control;
- level 8 baseline gear;
- level 8 strong gear;
- level 10 physical class;
- level 10 spell class;
- level 10 social/trick class;
- level 13 low current resources;
- level 13 prepared buffs/equipment.

Keep dev commands/config restricted to non-production environments.

## Automated gates

### Domain

- raid level and every HP table cell;
- target-count boundaries `3/4` and `6/7`;
- phase thresholds at exact HP boundaries;
- two thresholds crossed in one round queue readable single transitions;
- oversight contribution for every action kind;
- timeout auto-defend contributes zero break;
- watcher spawn/cap/clear;
- marked heavy guard and class mitigation;
- enrage outgoing/defense modifiers;
- boss death cancels its action;
- no hidden runtime round cap; round 13 is simulation/QA horizon only;
- contribution tiers for damage, defend, disrupt, knockout, withdrawal and AFK;
- reward formulas and affinity fallback;
- deterministic seed replay.

### Persistence/service

- duplicate create and live membership conflicts;
- two joins racing for slot eight;
- join exactly before/at/after expiry;
- early start versus deadline start race;
- leader invalidation/transfer;
- participant level/resource/combat/success changes before start;
- partial lease conflict cannot produce half-active state;
- action insert duplicate and stale turn/version;
- last required action races timeout scheduler;
- two timeout workers race;
- process restart with missing Telegram references;
- terminal state written, zero rewards applied, then retry;
- terminal state written, some participants applied, then retry;
- duplicate spotlight/reward worker;
- success gate versus legacy claim;
- remort/delete/life mismatch and orphan repair;
- feature flag disabled while active session exists.

### Bot/presenter

- callback payload sizes/parsers;
- `/start` deep-link parser and opaque token failures;
- private versus shared card fields;
- HTML escaping for character/title/item names;
- action availability per participant;
- old card replay/current state refresh;
- send/edit failure replacement behavior;
- combat-lock redirect to raid card;
- allowed safe side surfaces remain consistent with central policy;
- nearby invite privacy/filtering;
- notification dedupe.

### Balance/economy

- simulator acceptance matrix;
- item candidate availability at levels 8/10/13;
- personal roll max one;
- one and only one spotlight per win;
- first-life trophy dedupe;
- expected XP/gold versus legacy Barrel and ordinary PvE;
- no reward for inactive invite passenger;
- no old+new reward in one period.

## Manual Telegram flow

### A. Legacy control

1. Level 7 starts Barrel.
2. Confirm old waiting card, completion, reward and beer gate remain unchanged.
3. Restart during pending and complete normally.

### B. Level-8 reveal and recruiting

1. Level 8 starts with flag enabled.
2. Confirm Senior Brother reveal and no exact future reward values.
3. Open participants, nearby invite and share link.
4. Forward link to another private chat/group; open as account B.
5. Confirm private preview before join and no exact location/private ids.
6. Join/replay/leave/rejoin.

### C. Capacity and leadership

1. Fill accounts A–H.
2. Race two extra joins for the last slot.
3. Confirm exactly eight.
4. Leader leaves; verify new leader on all refreshed cards.
5. Last participant leave cancels cleanly in a separate session.

### D. Early and solo start

1. Try early start before 23 seconds: blocked with current card.
2. Start with two after 23 seconds.
3. In another session, verify solo button only after 93 seconds.
4. Confirm second solo warning and cancel path.

### E. Start revalidation

Before start, make one joiner:

- enter another combat;
- complete Barrel in another canonical way if dev setup permits;
- reach zero HP;
- remort/delete in separate tests.

Confirm the invalid participant is removed safely without leaking the private reason to others and that the group either starts with valid players or cancels.

### F. Three-player battle

1. Use level-appropriate strong gear.
2. Confirm private actions stay hidden.
3. Let marks appear; marked account defends.
4. Trigger and break `Форма 19-84` with mixed attack/skill/disrupt.
5. Clear watcher stacks.
6. Restart process during active round and continue.
7. Win/lose naturally and replay all old buttons.

### G. Five-player recommended battle

1. Mix physical/spell/social/trick classes.
2. Use one eligible queued PvE buff and one unbuffed account.
3. Confirm each snapshot/consumption happens once.
4. Miss one round on one account: auto-defend.
5. Miss repeated rounds: warning then withdrawal/reduced reward.
6. Knock out another active contributor early and verify legitimate partial/full threshold behavior.
7. Confirm shared card never shows private HP/mana/action.

### H. Eight-player battle

1. Confirm boss HP frozen from eight participants.
2. Confirm three marked targets where designed.
3. Verify larger oversight/watcher coordination.
4. Disconnect/withdraw one participant; boss HP does not rescale/heal.
5. Confirm no Telegram flood or callback misrouting across private cards.

### I. Rewards and settlement recovery

1. Win and record every participant's pre/post XP, gold, inventory, HP/mana and success gate.
2. Confirm one spotlight recipient and no top-DPS requirement.
3. Replay result/action/invite buttons repeatedly.
4. Force a process stop after terminalization but before all participant settlement through a dev fault hook.
5. Restart and confirm remaining settlements finish exactly once.
6. Attempt another raid in the same period: success-gated.
7. Verify beer/round access.
8. Lose in another period: only eligible consolation, no success/item/gold.

### J. Feature flag and deployment

1. Create an active session.
2. Disable new creation flag and restart.
3. Existing session remains recoverable; new level-8 starts use documented safe fallback.
4. Re-enable and verify no duplicate live session.

## Release evidence to attach

- focused test commands/results;
- migration validation;
- full `npm run check`;
- simulator command and aggregate report;
- manual scenarios actually completed versus remaining;
- screenshots or copied cards with private identifiers removed;
- feature flag and rollback notes;
- known balance deviations and follow-up owner.

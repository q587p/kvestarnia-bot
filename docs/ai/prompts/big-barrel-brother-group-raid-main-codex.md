# Codex prompt - Big Barrel Brother Group Raid

```text
Use $kvestarnia-version-task.
Use $balance-review for the simulator/balance gate.
Use $ukrainian-rpg-content for substantial player-facing Ukrainian copy instead of pasting the style guide.

Implement exactly one versioned task:
docs/tasks/0.2.x-big-barrel-brother-group-raid.md

Context:
docs/ai/context.md
docs/design/BIG_BARREL_BROTHER_GROUP_RAID.md
docs/design/BIG_BARREL_BROTHER_BALANCE.md
docs/content/BIG_BARREL_BROTHER_UA_COPY.md
docs/architecture/GROUP_RAID_SESSION_MODEL.md
docs/implementation/REPOSITORY_CHANGE_MAP.md
docs/qa/BIG_BARREL_BROTHER_GROUP_RAID_QA.md

Follow AGENTS.md.
Start from updated main after the Raid Party Session Foundation and intended combat/architecture prerequisites.
Choose the next free version, rename the active task/release surfaces accordingly, and keep artifact names independent of PR numbers.
Use high reasoning for multi-character transactions, CAS, timers, restart recovery, reward idempotency and balance.
Use a minimal reviewable diff and current module boundaries.

Hard product decisions:
- level 1-7 legacy Barrel unchanged
- level 8+ Big Brother route behind a flag
- 1..8 participants, recommended 4-5, no hard group minimum
- current Barrel period/wait reused; early start after 23s, solo after 93s + confirmation
- 23-second simultaneous rounds; timeout auto-defend
- one single boss; watcher stacks are hazards, not targetable adds
- boss HP/phase/reward starting constants come from the balance doc and must be verified by the real simulator
- equipment and eligible PvE buffs matter; boss does not scale from item power
- one success per period; no old+new double reward
- per-participant replay-safe settlement and exactly one affinity spotlight on win

Do not implement:
- targetable adds, healing/resurrection/aggro redesign
- guilds, matchmaking, raid finder, leaderboard, public damage meter
- leader kick or winner-takes-all loot
- raid-only consumable engine when canonical item-use is absent
- Redis/BullMQ, Mini App or broad combat rewrite

Critical properties:
- active start freezes all scale/snapshots and cannot partially lease the group
- one queued action per actor/turn
- all-actions and timeout resolvers converge through one CAS
- stale callbacks spend no mana/cooldown/RNG and change no contribution
- terminal result stores before grants
- crash/restart can resume every participant resource/reward settlement
- legacy pending rows remain legacy
- Telegram/private/shared cards respect privacy and escape dynamic HTML

Run focused pure/domain tests, Prisma concurrency/settlement tests, bot/presence tests and the deterministic group-raid simulator before broad checks.
Update the balance doc/task in the same PR if accepted constants change.
Run migration validation and full npm run check.
Open/update a ready main-targeting PR only when mergeable and honest about remaining manual QA.

Final output:
- changed files
- player behavior changed
- balance formula and simulator summary
- migration/deploy/feature-flag notes
- tests run
- manual Telegram QA status
- risks/follow-ups
- PR link and completion status

No tutorial.
```

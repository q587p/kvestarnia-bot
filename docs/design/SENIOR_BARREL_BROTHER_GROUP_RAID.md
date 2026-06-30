# Senior Barrel Brother Group Raid

Status: proposed `0.2.x` design
Player-facing name: `Старший брат Бочки`
Technical slug: `senior-barrel-brother-group-raid`

## Goal

Turn the existing high-level Barrel wait into a concrete opt-in group raid without replacing the current combat engine, presence system, hourly Barrel period, reward safety, or Telegram-first interaction model.

The first production encounter must feel materially harder than ordinary PvE, reward preparation and cooperation, remain recoverable after restart, and avoid making one rare class or item mandatory.

## Product decision

- Characters below level `8` keep the current solo Barrel flow.
- Characters at level `8+` enter the Senior Barrel Brother recruiting flow instead of receiving both old and new rewards.
- A successful group raid satisfies the canonical Barrel success gate for the current hourly period.
- A failed attempt does not count as success, but anti-spam limits apply.
- Capacity is `8`; explicit minimum is `1`; recommended size is `4–5`.
- Targetable adds are not part of the first production boss slice.

## Player flow

### 1. Reveal

When an eligible level `8+` character starts the Barrel activity, the ordinary Barrel introduction changes into the Senior Brother reveal. The player receives a private recruiting card for one server-owned raid session.

The card shows qualitative difficulty, current participant count, join deadline, and actions:

- `➕ Приєднатися` for invite viewers;
- `👥 Учасники`;
- `📨 Покликати поруч`;
- `🔗 Поділитися`;
- `⚔️ Почати раніше` for the leader when allowed;
- `🚪 Вийти` or `Скасувати збір` while recruiting.

Do not reveal exact future XP, gold, item names, rarity chances, hidden formulas, or other players' private location data.

### 2. Recruiting

The session reuses the Barrel `periodId` and the frozen wait completion time calculated at creation. Joining stays open until `joinUntilAt`. Every success/attempt eligibility check uses the session's frozen `periodId`, even if the wall clock crosses into the next hourly bucket while recruiting; never silently move a live session to a new period.

- The leader may start early after `23` seconds if at least two eligible participants remain.
- A solo early start becomes available after `93` seconds and requires a second warning/confirmation.
- At the deadline, the session starts with every still-eligible joined participant, including a solo leader.
- The canonical audit break blocks new creation exactly as the legacy flow does; already-created recruiting/active sessions remain recoverable and settle normally.
- If no eligible participant remains, it expires without consuming the success gate.
- Joining means ready for MVP; no separate ready-check state.

### 3. Discovery and invitations

The same raid session can be reached through:

1. `👀 Хто поруч` — eligible same-location targets receive a best-effort private invite.
2. A forwardable/deep-link invite for that exact opaque session token.
3. The leader's current recruiting card.

The deep link opens a private preview before joining. It never embeds character ids, Telegram ids, exact locations, party composition, reward state, or trusted eligibility data.

A player may follow the link from elsewhere. Joining routes presence to the known Barrel surface only after incompatible activities and privacy gates pass.

### 4. Start revalidation

Starting is a transaction/CAS boundary. Re-read all participants and remove or reject entries that now fail:

- level below `8`;
- already succeeded in the current period;
- wrong remort life where relevant;
- zero HP after canonical recovery sync;
- incompatible active combat, duel, remort, progression spend, or transfer lock;
- another live raid membership/lease;
- stale or deleted character.

If the leader becomes invalid but eligible participants remain, leadership transfers to the earliest valid joiner. If no one remains, cancel safely.

Freeze participant combat snapshots, current HP/mana, equipment, class/race/title/path, remort data, eligible queued PvE buffs, rules version, boss scale inputs, and participant count. Boss HP never changes after start.

### 5. Active rounds

Each living participant receives a private card with:

- boss phase and HP;
- their own HP/mana/cooldowns;
- visible marks/telegraphs affecting them;
- group `Нагляд` or watcher-hazard state when present;
- their available actions;
- remaining round time.

Core actions:

- `⚔️ Атакувати`;
- current class skill when available;
- `🛡 Захищатися`;
- context action such as `🧯 Зірвати нагляд` or `🧹 Розігнати дрібноту` when relevant;
- `🏳️ Відступити` as an explicit personal forfeit, not a party flee.

Choices stay private until all living participants submit or the `23`-second deadline passes. The resolver then applies one deterministic round and updates every participant card best-effort.

Timeout behavior:

- first missed round: auto-defend;
- second consecutive miss: auto-defend plus AFK warning and reduced contribution eligibility;
- third consecutive miss: participant becomes inactive/withdrawn for combat resolution and cannot receive a full reward tier;
- a manual action resets the consecutive-miss counter before withdrawal.

No timeout creates free attack damage.

### 6. Simultaneous resolution

A raid round is logically simultaneous:

- validate all queued actions against the same round-start state;
- resolve deterministic participant order only for RNG and logs, not kill stealing;
- aggregate valid player outcomes;
- apply phase/hazard transitions once;
- if the boss reaches zero, cancel its pending action;
- otherwise resolve the boss action against the frozen telegraph;
- settle knockouts and advance the round once.

All valid submitted actions count for contribution even if an earlier deterministic entry would have reduced the boss to zero.

### 7. Terminal result

Terminal states are `won`, `lost`, `expired`, `cancelled`, and `invalidated`.

On win:

- persist the canonical result before granting anything;
- settle each participant's persistent HP/mana and consumed buffs exactly once;
- grant stored XP/gold/items exactly once per participant;
- write the current-period Barrel success gate;
- release every active raid membership and combat lease;
- send private result cards and a spectator-safe shared summary if one exists.

On loss:

- settle resources and consumed buffs;
- grant only the small stored consolation reward to meaningful contributors;
- do not write the success gate;
- release all leases;
- allow another attempt only while period and attempt limits permit.

Old buttons replay the canonical current or terminal state and never reroll rewards.

## Eligibility and attempt policy

### Creation and join

- level `8+`;
- at least `1 HP` after canonical lazy sync;
- no incompatible active state;
- no successful Barrel/Senior Brother claim for the session's frozen `periodId`;
- at most one live recruiting or active group raid membership.

### Failed-attempt anti-spam

Use a conservative first rule:

- at most `3` started Senior Brother attempts per character per hourly period;
- cancelled recruiting sessions do not count;
- invalidated starts do not count when the player never entered active combat;
- success remains limited to exactly one claim;
- no reward is granted for repeated join/leave churn.

The limit is server-owned and audited. It should be a tuning constant, not player-facing hidden punishment; when reached, say the Barrel needs the next period to reconstruct its paperwork.

## Group size language

- `1`: `самовпевнено до історичної помилки`;
- `2`: `дуже ризиковано`;
- `3`: `можливо з добрими манатками й уважністю`;
- `4–5`: `рекомендований склад`;
- `6–8`: `надійний натовп; бос теж підготував більше нагляду`.

This is qualitative guidance, not a public win percentage.

## Boss encounter contract

The boss is a single canonical enemy with raid-specific phase state. Use the shared combat action primitive for personal attack/skill/defend math where possible. Do not fork basic class damage, equipment effects, mana costs, cooldowns, armor, resist, or crit formulas into a second combat system.

Raid-specific logic owns:

- shared boss HP and phase thresholds;
- hidden simultaneous action queue;
- marked target sets;
- the `Нагляд` shared objective;
- watcher hazard stacks;
- multi-target boss action fan-out;
- no hidden runtime round cap; simulation horizons are reporting tools, not terminal rules;
- group contribution and settlement.

## Buff and equipment rules

- Snapshot current equipped manatky through the canonical effective-stats helper.
- Eligible queued next-PvE buffs apply once to this raid and are consumed exactly once at active start.
- Existing pepper-vodka style outgoing/incoming damage modifiers may apply because this is PvE; freeze them per participant and ensure the boss-side effect is applied once, not once per drinker unless explicitly designed.
- Recovery-only drinks remain recovery-only.
- Food/one-use item actions are included only if their canonical item-tag runtime already exists before this task. Do not invent a raid-only consumable engine.
- Boss scaling does not inspect item power, rarity, remort power, food, or drink state.

## Legacy Barrel compatibility

- Existing pending legacy rows finish through the old flow; never reinterpret an in-flight solo pending row as a group session.
- Level `1–7` behavior remains unchanged.
- Level `8+` receives one canonical path, not old reward plus boss reward.
- A successful Senior Brother raid satisfies beer/round access and every existing `Barrel completed this period` predicate.
- Preserve the reachable starter apron/equipment fallback if an older character still lacks it.
- Old completion callbacks and notifications replay their stored legacy result.

## Privacy and fair play

- No exact location disclosure in forwardable cards.
- No public Telegram ids, character ids, inventory, HP, mana, buffs, or hidden contribution numbers.
- Do not let the leader kick participants in MVP; abuse prevention is leave/block/report, not arbitrary reward denial.
- No damage meter leaderboard in MVP.
- No winner-takes-all reward.
- No extra reward for inviting alts or filling capacity.
- Same human/alt abuse cannot create more than one success claim per character/period, and session rewards are idempotent.

## Rollout

Ship behind a server/config feature flag even after production routes exist:

1. dev-only party-session smoke;
2. internal enabled users at levels 8, 10, and 13;
3. small production cohort;
4. enable for all level `8+` only after simulation and restart/concurrency QA;
5. retain a kill switch that sends level `8+` back to the legacy Barrel flow without corrupting active group sessions.

## Non-goals

- guilds or permanent parties;
- matchmaking queue or raid finder;
- cross-server shards;
- public spectator mode;
- group voice/chat;
- healing-role redesign or resurrection;
- targetable adds in the first boss release;
- three-or-more general PvE enemies;
- raid leaderboard, seasonal ladder, achievements, or guild loot;
- item trading inside the raid;
- Mini App UI;
- Redis/BullMQ requirement;
- multiple bosses or difficulty tiers in the first release.

# Bard Inspiration and Big Barrel Lament

Status: proposed design for version 0.3.14.

## Goal

Turn the existing Bard performance into real party support without making tips pay-to-win, and add one Bard-specific tactical choice to the Big Barrel raid.

The slice ships two linked mechanics:

1. `✨ Натхнення` from the existing location performance.
2. `🎻 Заграти журливу баладу` as an alternative Big Barrel contribution.

## Non-goals

- No general MMO buff/debuff framework.
- No defense, evasion, crit, or flat player-damage Bard bonuses in this version.
- No performance inside an active combat/raid lease.
- No quick-duel synthetic turn support if the current `Ситий` contract does not support it.
- No new active-fight late-join behavior; the Big Barrel participant snapshot is fixed for this slice.
- No new achievement, schema migration, currency, item, mana cost, or monetization hook.
- No requirement for a full-capacity party.

## Existing contracts to preserve

- Bard performance remains available from level 3.
- Its per-Bard/per-location cooldown remains 93 minutes.
- Its audience response window remains 13 minutes.
- Existing applause, tip, decline, house payout, reaction idempotency, and achievements remain intact.
- Reaction keyboards show only tip amounts covered by the listener's notification-time gold snapshot; commit-time balance validation still rejects stale or forged callbacks.
- The canonical starting audience remains the repository snapshot: same normalized location, recently active, excluding the performer, active combatants, and current raid participants.
- A performance never changes anyone’s location.
- PR #174’s actual-location and current-location cooldown behavior is a hard prerequisite.

## 1. Inspiration from a normal performance

### Grant moment and recipients

Grant Inspiration in the same transaction that creates the performance and its initial audience reactions.

- Grant immediately when the performance starts; do not wait for applause or payment.
- Grant only to the frozen starting audience.
- Do not grant to the performer.
- A Bard may receive Inspiration from another Bard.
- Do not grant to later arrivals, players elsewhere, active combatants, or raid participants.
- A failed/rejected performance grants nothing.

Each audience notification should state whether a new state was applied, a stronger state replaced an old one, or an existing equal/stronger state remained.

### Strength

Reuse the existing deterministic performance grade calculation, including its current Charisma, Luck, level, and RNG inputs. Do not create a second Bard scaling formula.

| Existing grade | Accuracy bonus |
| --- | ---: |
| `rough` | +1 percentage point |
| `pleasant` | +2 percentage points |
| `memorable` | +3 percentage points |
| `legendary` | +5 percentage points |

The player-facing short form is `+N до влучання`. Internally and in technical docs, treat the value as `accuracyBonusPp`; `+5` means adding `0.05` before the canonical hit-chance clamp, not multiplying the chance and not adding five points to damage.

The bonus applies to canonical offensive player hit rolls, including basic attacks and roll-based skills. It does not modify damage, crit chance, healing, guard, flee, passive damage, damage-over-time ticks, item use, taunt, or scripted effects without a hit roll. An action with multiple canonical hit rolls receives the same accuracy delta on those rolls, but consumes only one minute for the completed player turn.

### Duration and combat lease

Outside combat, Inspiration expires after 13 real minutes.

For durable combat modes, mirror the shipped `Ситий` hybrid-clock semantics:

- freeze the remaining real duration when the combat lease starts;
- pause wall-clock expiry while the lease owns the status;
- after each committed player turn, consume exactly one minute with a replay-safe pulse id;
- the bonus applies to the action before that action’s minute is consumed;
- stale, duplicate, rejected, or non-committed callbacks consume nothing;
- release the remaining duration, including the fractional outside-combat remainder, when the lease ends;
- restart/redeploy must neither extend nor lose the state.

A successful non-offensive turn still consumes a minute. Enemy-only actions do not. For Big Barrel, consume once for that participant’s successfully resolved action in a completed raid round, never once per target or hit.

Do not bolt a second independent lease cleanup onto `releaseVarenykSatedCombatLease()`: that path currently owns deletion of the single `ActiveCombatLease`. Extract or generalize the synchronization so all lease-owned timed statuses are frozen, pulsed, and released atomically.

Support exactly the durable combat surfaces already covered by `Ситий`: persistent single- and multi-enemy PvE, Training Doppelganger, turn-based duels, and Big Barrel. Do not invent simulated pulses for quick duel.

### Stacking and remort

There is one Inspiration slot per character life.

- No current state: apply the new state for 13 minutes.
- Strictly stronger new state: replace it and start a fresh 13 minutes.
- Equal or weaker new state: keep the current strength and remaining time; do not refresh.
- Never add strength or durations together.
- Recipient remort/reset invalidates the state through life identity and cleanup.
- Source Bard remort, class change, death, logout, or movement does not revoke an already granted state.

Persist a versioned payload in the established `CharacterCooldown` pattern. It should contain enough identity and frozen data for deterministic cleanup and raid arbitration: rules version, activation/performance id, source Bard id, source normalized location id, recipient life identity, grade, `accuracyBonusPp`, activation time, expiry/cursor values, and the combat-owned state required by the generalized hybrid clock.

No Prisma schema change is expected.

## 2. Big Barrel Lament

### Eligibility and action cost

Show `🎻 Заграти журливу баладу` only when all are true:

- the character is a living Bard participant in an active Big Barrel fight;
- the boss and the character’s current raid action are still eligible;
- the raid music slot is free;
- the Bard’s shared 93-minute music availability for the Barrel location is ready.

Do not require the party to be at maximum capacity.

The successful callback atomically claims the raid music slot, records/locks the Bard’s action for the round, and starts the shared per-Bard/per-Barrel cooldown. The Bard does not attack, deal damage, pay mana/gold/items, receive a house payout, request tips, or grant Inspiration on that action.

If two Bards race, exactly one callback succeeds. The loser spends no turn, cooldown, or resource and receives a refreshed raid card so another action remains possible. Duplicate/stale callbacks are idempotent. After a successful claim the Bard cannot replace the Lament with a second action in that round.

### Raid music arbitration

Use a versioned, encounter-local raid state such as:

```ts
type BardRaidMusic =
  | { kind: "none" }
  | { kind: "inspiration"; sourcePerformanceIds: string[] }
  | {
      kind: "lament";
      sourceCharacterId: string;
      grade: BardPerformanceGrade;
      damageReduction: number;
      remainingBossResponses: number;
      activationId: string;
    };
```

At the atomic transition from recruiting party to active boss, inspect valid starting-participant Inspiration snapshots. If at least one came from the normalized Big Barrel presence location, initialize the session music choice as `inspiration`; otherwise initialize it as `none`.

Use the normalized presence id represented by `PRESENCE_LOCATION_KORCHMA_BARREL` (`location.korchma.barrel`) for this comparison. Do not confuse it with the party/session origin marker represented by `BIG_BARREL_PARTY_ORIGIN_LOCATION_ID` (`barrel.big-brother`); they are deliberately different contracts.

This rule is deliberately participant- and session-local:

- an unrelated location performance does not block the raid;
- an expired state does not block it;
- a performance elsewhere does not occupy the Barrel music slot;
- Barrel-origin Inspiration can still benefit only the recipients who actually received it;
- a session marked `inspiration` does not later unlock Lament when those individual states expire;

The participant set used for this arbitration is the fixed active-boss snapshot. If current post-0.3.13 code unexpectedly permits joining an already active boss, stop and report that product conflict rather than inventing suppression/timer semantics in this slice.

Inspiration from another location does not claim the encounter’s Barrel music slot and may coexist with Lament. This is intentional: the strict alternative is between music contributed for this Barrel session, not every temporary status brought from the wider world.

### Shared performance availability

Lament is an alternative use of the same local Bard technique, not a free extra button.

- Introduce one canonical per-character/per-location music availability key using the existing persistence primitives.
- A successfully started normal performance writes it.
- A successfully committed Lament writes it for the normalized Barrel location.
- Normal performance availability must honor both historical `BardPerformance` cooldown data and the new shared key so existing records remain correct.
- Lament must honor current performance cooldown data and the same shared key.
- A rejected, stale, lost-race, inactive-raid, or otherwise uncommitted attempt writes nothing.
- Every visible blocker must show the canonical remaining wait.

Keep these writes atomic with their respective performance/raid state changes. If that cannot be done without a broad schema/architecture change, stop and report the blocker instead of shipping a split-brain cooldown.

### Strength and duration

Reuse the current Bard performance roll/grade function with a deterministic, replay-safe activation seed and the Bard’s frozen stats at commit time.

| Grade | Direct boss damage reduction |
| --- | ---: |
| `rough` | -1 |
| `pleasant` | -2 |
| `memorable` | -3 |
| `legendary` | -5 |

Duration in boss responses:

`clamp(frozenBardLevel, 8, 13)`

The activation round’s boss response is the first affected response. Decrement once after the entire actual Big Brother retaliation, not per target. If the boss dies or no retaliation occurs, do not spend a remaining response.

### Damage order and scope

Big Barrel retaliation has its own deterministic path and does not use generic monster accuracy/damage rolls. Apply Lament directly in that path.

For every actual target damage instance:

1. Resolve the existing boss base, focus/broad pressure, target armor, guard, and action-specific reduction.
2. Resolve `damageAfterLament = max(0, damageBeforeLament - N)`. This is an explicit exception to the ordinary landed-hit minimum; do not re-inflate zero to one, and never turn damage into healing.
3. Apply Kharakternyk Ward and Bureaucramancer Protocol in their established order.
4. Apply HP loss and journal the result.

For a broad response, reduce each actual target’s damage but consume only one remaining boss response. A Taunt-redirected broad response is one actual redirected damage instance. Do not affect environmental, percentage, self, settlement, or future scripted damage that is not direct Big Brother retaliation.

The Lament survives app restart and the source Bard’s later death, exit, class change, or remort. It ends when its counter reaches zero or the raid ends/cancels; it never carries to a new raid.

## Player-facing copy

State label:

> ✨ Натхнення: +3 до влучання · 11 хв

Audience notification:

> ✨ Виступ надихає вас: +3 до влучання на 13 хв. У бою кожен завершений хід забирає ще одну хвилину.

Current performer notice:

> 🎶 Ваш виступ у цій місцині вже триває. Реакції: ще **11 хв**.

This personalized line replaces the free-performance hint on `/online`, Shynok, and the bar while the current Bard has a live performance in the same normalized location and life. Those surfaces omit `🎶 Виступити` until that live window ends; they never probe the mutating start path to decide visibility.

Raid action:

> Бард затягує 🎻 журливу баладу й цього ходу не атакує: пряма шкода Старшого Брата слабшає на 3.

Raid status:

> 🎻 Журлива балада: −3 шкоди Старшого Брата · ще 7 відповідей

Do not repeat the activation as a second Lament line or append a separate “song continues” tick to the battle action history. The live battle card owns the current Lament line above its history. A stored journal page owns the selected round snapshot: every active persisted buff, debuff, encounter effect, ability/item cooldown, including Inspiration, `Ситий`, and Lament, belongs under `Кулдауни та ефекти:`; the final Lament expiry remains a chronological action event.

Concurrent loser:

> 🎶 У цьому рейді вже прозвучав бардівський номер. Друга драматична кульмінація не передбачена кошторисом.

Tavern raid-prep daily tip:

> Барди у повному рейді дають бафи, дебафи й відповідають за моральний стан табуретів.

Big Barrel-specific support tip:

> Перед рейдом Бард може надихнути товариство виступом, а в самому рейді — послабити Старшого Брата журливою баладою. За моральний стан табуретів він усе одно відповідає.

A recruiting Big Barrel card that includes a Bard also states that Lament is chosen after combat starts when the music slot is free. This must remain true for a one-member Bard raid; the action does not require a full party.

A same-period legacy solo Barrel raid and Big Barrel recruiting are mutually exclusive. Creation, joining, and the final recruiting-to-boss transaction must reject an unclaimed legacy pending row, including after its wait has elapsed but before its reward is claimed. A stale completed pending row does not replace the canonical already-completed decision. The leader start callback may recover a due Big Barrel recruiting session with the same expired-recruiting allowance as the automatic scheduler.

Keep exact remaining duration/cooldown derived from canonical `availableAt`/state data. Use distinct icons for performance, Inspiration, and Lament on adjacent surfaces.

## Persistence, idempotency, and availability

- All random outcomes are seeded/frozen once and persisted.
- Audience grants, replacement decisions, and reactions are restart-safe.
- Raid slot claim, queued action, effect snapshot, and shared cooldown are one atomic commit.
- Replaying Telegram callbacks never grants, pulses, or spends twice.
- Invalid/malformed legacy payloads degrade to no effect and are cleaned safely.
- Inspiration is part of every eligible normal Bard performance. Do not add a Bard-specific rollout flag.
- Lament is available only inside the existing Big Barrel surface and therefore follows `BIG_BARREL_BROTHER_RAID_ENABLED` in production.
- Add or extend a narrow non-production `/dev_*` helper for clearing/granting the caller’s Bard support state and accelerating the local raid check. It must be impossible to register, display, or mutate in production, including when a feature-specific dev flag is set.

## Documentation and release surfaces

Update in the implementation PR:

- version task and task index;
- this design and its docs indexes;
- `docs/ai/context.md` (under 250 logical lines);
- `docs/design/raid-role-flavor-notes.md` so Bard mechanics are no longer called future-only;
- relevant Lore Board copy/reference if it now contradicts shipped behavior, or record why no lore update is needed;
- playtesting/developer setup for the dev helper and Telegram smoke;
- package version and lockfile;
- `CHANGELOG.md` with exact mechanics;
- spoiler-light `news.md` in its established structure;
- the Tavern daily tip and Big Barrel-specific support tip in `src/content/characterFlavor.ts` without leaking raid instructions into Fight/Duel presenters;
- PR body with explicit achievement, remort, availability, migration, and manual-QA decisions.

Use the actual Kyiv day in Holocene format and recheck it after any later-day implementation commit.

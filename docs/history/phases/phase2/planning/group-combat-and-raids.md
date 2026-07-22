# Phase 2 — Group Combat and Real Raids

Group combat is not the first Phase 2 step. It should grow from working social sessions: дуелі, invites, result cards, party membership and multi-enemy combat.

## Why later

The old first idea was a small korchma raid. It still fits the world, but starting with raids risks building a large state machine before Квестарня has proven the smaller social primitives:

- invite/accept/expire;
- participant rows;
- replay-safe summaries;
- capped rewards;
- chat-safe result cards;
- multi-actor privacy rules.

## Build order

1. **Duel sessions.** Two actors, one accepted challenge, replay-safe result.
2. **Party skeleton.** Invite several participants into a temporary party without combat complexity.
3. **Multi-enemy solo combat.** One hero versus main enemy plus controlled helper/summon.
4. **Party versus one boss.** Several participants, one shared target, 1-3 compact actions.
5. **Party versus multiple enemies.** Only after UI and reward safety survive the previous steps.

## Raid MVP shape

- A group or party starts a short raid window.
- Participants opt in.
- Minimum participants is explicit before reward-bearing finish.
- Each participant gets one compact action.
- Result summarizes participation without winner-takes-all rewards.
- Rewards are idempotent per session and per participant.
- Real raids may award more serious or rare manatky than ordinary solo fights, but only through capped, contribution-aware rewards.
- Multi-player participation must not become a free loot multiplier.

## Reward shape

Raid rewards should feel meaningfully different from ordinary solo fights without turning every extra participant into another uncontrolled faucet:

- reward rows are unique per `raid_id + character_id`;
- contribution can affect eligibility, flavor tier or capped bonus odds;
- low or missed participation can get a smaller summary/reward instead of full loot;
- no winner-takes-all table that leaves support/control roles with nothing;
- no duplicate claims from repeated finish, action or reward callbacks.

## Data sketch

```text
combat_parties
- id
- leader_character_id
- context_chat_id nullable
- status
- invite_token
- created_at
- expires_at
```

```text
combat_party_participants
- party_id
- character_id
- status
- joined_at
- unique (party_id, character_id)
```

```text
group_combat_sessions
- id
- party_id
- encounter_id
- state_json
- status
- reward_payload_json nullable
- created_at
- updated_at
```

## Guardrails

- No exact player location leaks in public web surfaces.
- Group chat output should not expose private IDs or hidden state.
- Reward rows must be unique per participant/session.
- Stale callbacks never duplicate damage, actions, joins or rewards.
- If not enough players join, fail softly or run a non-reward flavor summary.

## Acceptance criteria

- 3-5 players can join, act and see a summary.
- Repeated join/action/reward callbacks do not mutate twice.
- Result card fits one mobile screen.
- Tests cover participant uniqueness, action uniqueness, finish idempotency, expired sessions and privacy-safe summary.

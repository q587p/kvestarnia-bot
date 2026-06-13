# Group Raid Session Notes

Цей файл описує тільки концепт, без Prisma migration code і без runtime-реалізації.

## Assumptions

- Перший group hook може жити в SQLite так само, як решта current MVP state.
- Redis не є обов’язковим для першої версії, якщо вся сесійна логіка вкладається в транзакційні rows.
- Сесія має бути короткоживучою, а cleanup — простим.

## Conceptual tables

### `raid_sessions`

Purpose:
- одна групова подія від моменту старту до завершення або expiry;
- джерело правди для join window, status і результату.

Key fields:
- `id`
- `group_id`
- `created_by_character_id`
- `state`
- `status` (`joining`, `active`, `completed`, `expired`, `cancelled`)
- `started_at`
- `join_until_at`
- `resolved_at`
- `created_at`
- `updated_at`
- `result_json`

Indexes / uniqueness:
- index on `(group_id, status)`;
- index on `(join_until_at)` for cleanup;
- optional index on `(created_by_character_id, created_at)`.

Idempotency keys:
- `raid_session:create:{groupId}:{createdByCharacterId}:{day}`;
- `raid_session:start:{sessionId}`;
- `raid_session:finish:{sessionId}`.

Retention / cleanup notes:
- completed/expired sessions can be trimmed after a short retention window;
- the first version can keep only summary rows and delete participant/action rows later.

Privacy notes:
- store only data needed for game state;
- do not store raw message text beyond what is required for session recovery;
- avoid copying private Telegram profile data into result blobs.

Migration risks:
- if `status` logic is underspecified, stale callbacks can resurrect a dead session;
- if `result_json` grows too much, session rows become heavy and hard to reason about.

### `raid_participants`

Purpose:
- durable membership list for one session;
- idempotent join/leave bookkeeping.

Key fields:
- `id`
- `raid_session_id`
- `character_id`
- `joined_at`
- `left_at`
- `is_ready`
- `action_count`
- `damage_done` or similar future summary fields

Indexes / uniqueness:
- unique on `(raid_session_id, character_id)`;
- index on `(character_id)`;
- index on `(raid_session_id)`.

Idempotency keys:
- `raid_participant:join:{sessionId}:{characterId}`;
- `raid_participant:leave:{sessionId}:{characterId}`.

Retention / cleanup notes:
- rows can be deleted with the parent session once the session is over and summaries are persisted.

Privacy notes:
- participant list should be in-game only;
- public web presence should remain counts-only unless a specific UI explicitly allows names.

Migration risks:
- duplicate joins if uniqueness is not enforced;
- accidental cross-session carryover if leave/expiry is not explicit.

### `raid_actions`

Purpose:
- one row per submitted action;
- audit trail for action choice, ordering, and anti-duplication.

Key fields:
- `id`
- `raid_session_id`
- `character_id`
- `action_key`
- `submitted_at`
- `state` (`accepted`, `rejected`, `duplicate`, `expired`)
- `reward_json` optional

Indexes / uniqueness:
- unique on `(raid_session_id, character_id, action_key)`;
- index on `(raid_session_id, submitted_at)`;
- optional index on `(character_id, submitted_at)`.

Idempotency keys:
- `raid_action:{sessionId}:{characterId}:{actionKey}`.

Retention / cleanup notes:
- could be trimmed earlier than session rows if summary data is already captured;
- if kept longer, avoid storing unnecessary client-side state.

Privacy notes:
- no raw user payloads;
- no hidden profile data in action metadata.

Migration risks:
- if actions are stored without unique guards, reward duplication becomes easy;
- if reward state is derived only from presenter-side state, stale callbacks will be dangerous.

## Session lifecycle sketch

1. `joining`
2. `active`
3. `completed` or `expired`
4. optional `cancelled`

Suggested rules:

- a session starts in `joining`;
- when minimum participants are reached and host confirms, it becomes `active`;
- once `active`, actions may be submitted;
- after finish or expiry, callbacks should only show a summary;
- any reward is claimed once and only once.

## Why this model is lightweight enough

- It uses familiar relational guarantees instead of an external job system.
- It keeps participant membership separate from result summary.
- It allows replay-safe callbacks and future analytics.
- It lets the solo fallback survive as a compatibility path.

## Integration with presence and korchma

- `group_id` can point to a Telegram group chat or a korchma scene umbrella.
- `raid_sessions` should not replace presence; it should sit beside it.
- presence can still show who is in `location.korchma.barrel` or `location.korchma.hall`.
- session rows are only for the active group event.

## Existing systems to reuse

- `presence` for coarse location and who-is-around context.
- `tavernRaidService` as the conceptual ancestor of the session flow.
- `daily_actions` idempotency patterns for one-shot rewards.
- `safeEditMessageText` / `safeAnswerCallbackQuery` patterns for stale callback UX.

## Where 0.0.14 equipment must stay out of this

- Equipment preview should not affect minimum participant counts.
- Equipment preview should not modify action success chance.
- Equipment preview should not alter reward calculation.
- Equipment preview should not grant special raid-only slots yet.

## Minimal implementation warning signs

- If a session row starts trying to track every single UI transition, it is too large.
- If the action schema starts copying full Telegram update payloads, it is too large.
- If join/leave requires more than one transaction to be safe, the model needs another pass.

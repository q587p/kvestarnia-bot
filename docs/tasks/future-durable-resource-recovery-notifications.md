# Future — Durable Resource Recovery Notifications

Status: queued follow-up, not shipped.

## Goal

Send occasional full-health recovery nudges only after the notification system is durable, stat-aware and safe around combat. The notice must be server-initiated when life is actually restored, not a delayed side effect of pressing `/hero`, `/fight`, a menu button or any other player action.

Current runtime fallback: lazy `/hero` and `/fight` resource synchronization still updates stored HP/mana, but the old delayed full-HP Telegram notice is suppressed because it appeared during unrelated player checks instead of at recovery time.

## Scope

- Add a durable server-side scheduler/outbox path that discovers characters whose passive HP regeneration has reached full life.
- Send a private Telegram notification such as `Життя відновилося` only after the character is actually at effective full HP.
- Keep the notification independent from command/callback rendering; player button presses may still synchronize resources, but must not be the primary trigger for this notice.
- Deduplicate notices so one recovery-to-full window produces at most one delivered player message.
- Include enough stored state to retry delivery after Telegram/server failure without sending duplicates after success.
- If mana recovery is included later, keep it separate from the required full-life notice and avoid notification spam.

## Required design constraints

- Discover due characters using effective HP from level, remort and equipment, not only stored `hpCurrent/hpMax`.
- Exclude every character with an active combat lease: solo fights, training fights, starter fights and duels.
- Use one-shot notification state with retry semantics so Telegram delivery failure does not consume the only notice.
- Keep delivery multi-process safe with a claim/lease or outbox-style contract.
- Suppress the notification if a fight, duel or other runtime action independently changed HP after the candidate was discovered.
- Suppress the notification if the player is already interacting with a card that will immediately show the recovery, unless the server-side notice has already been claimed for delivery.
- Keep lazy `/hero` and `/fight` resource synchronization as the fallback path without reintroducing delayed "just recovered" player-facing copy.
- Make the copy short and explicit that life/HP has recovered, not that a button action healed the character.

## Focused tests when activated

- Scheduler/service tests discover a wounded character whose passive regeneration reaches effective full HP.
- Effective max tests cover remort and equipment HP bonuses.
- Active-combat lease tests prove no notification is sent during solo fights, training fights, starter fights, raids or duels.
- Outbox/claim tests prove retry after delivery failure and no duplicate after successful delivery.
- Drift tests prove stale candidates are skipped if HP changes before send.
- Command tests prove `/hero`, `/fight` and ordinary menu callbacks do not create the notification as a side effect.
- Presenter tests cover the short Ukrainian private notification copy.

## Manual Telegram QA when activated

- Wound a character, wait or fast-forward until passive HP reaches full, and verify a private server-sent `Життя відновилося` style message arrives without pressing any button.
- Repeat with the player in active combat and verify no recovery notification is sent until the active flow is safely over.
- Restart the bot with a pending delivery and verify it resumes once, not twice.
- Press `/hero` before and after the notification window and verify the card still synchronizes resources without producing duplicate recovery messages.

## Non-goals

- No schema or outbox changes until the durable notification slice.
- No notification after active combat starts.
- No player-facing promise until delivery semantics are implemented and tested.
- No broad stamina/rest system, paid healing, shop, item-use or balance change.

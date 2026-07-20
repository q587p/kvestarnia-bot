# Big Barrel Raid Chat

Status: canonical design for `0.3.15`; implementation must start only after the `0.3.14` Bard raid changes are present on `origin/main`.

Task: `docs/tasks/0.3.15-raid-chat-mvp.md`
QA: `docs/qa/0.3.15-raid-chat-qa.md`

## Product boundary

Ship a private, durable coordination feed for the existing Big Barrel Brother raid. One feed belongs to the `PartySession` lineage and survives its transition from recruiting to `PartyBossSession`.

- Recruiting participant cards embed the latest 13 unified player/system entries.
- Active boss participants use one separate compact raid-chat card each. The combat card links to it and the chat card links back.
- Every accepted player post best-effort pushes one separate escaped blockquote notification to every other current same-life participant. Existing cards remain canonical, are edited separately and keep coalesced durable delivery.
- Only canonically authorized participants can read the feed. Only authorized participants in a writable recruiting/active state can post.
- A knocked-out participant remains part of the frozen active boss roster and keeps raid-chat read/write access; only combat actions disappear.
- Terminal chat is participant-only and read-only for 13 days, then hidden and cleaned up.
- Chat never grants rewards, achievements, contribution, combat priority or public Chronicle events.

This is not a global, guild, matchmaking, marketplace or Telegram-group chat.

## Player copy

The recruiting card appends the section after the existing risk paragraph:

```text
💬 Рейд-чат (останні 13):
• 13:54:55 Щур: Хало)) Бачу, знайшов усе ж дорогу до дверей гі😁
• 13:55:00 Sui.Boom.: Хало
• 13:57:13 — Shannar de Kassal приєднується до збору.
```

Empty state:

```text
💬 Рейд-чат (останні 13):
• Поки тихо. Бочка ще думає, що це добрий знак.
```

Participant action:

```text
💬 Написати в рейд-чат
```

Use `💬`, not `✍️`; protocol signing already owns the latter icon.

ForceReply prompt:

```text
💬 Напишіть коротке повідомлення для рейд-чату.
До 93 символів. Його побачать учасники рейду.
Скасувати: /cancel_raid_chat
```

Set a short ForceReply input placeholder such as `До 93 символів…`; Telegram bounds the placeholder to 64 characters.

## Authorization

`User.currentRaidId` is presence metadata and must never authorize chat. Resolve the current character and use the canonical `PartyParticipant` row, status, remort snapshot and session/boss state.

- Recruiting read/write: currently joined participant in the same remort life.
- Active read/write: member of the canonical active roster in the same remort life. Being defeated does not by itself remove roster access.
- Left/removed/withdrawn, remorted or unrelated users: no read and no write.
- Invite-token viewers: may see the existing public gathering state, never chat entries or chat controls.
- Terminal: final authorized roster can read, nobody can write.
- After retention deadline: no read and no write.

Do not place chat entries on the general `PartySessionRecord` returned to invite viewers. Load the feed through a dedicated actor-authorized service method.

## Persistence

### Entry

Add an append-only `PartyRaidChatEntry` relation rooted at `PartySession`:

- monotonic primary key for deterministic order;
- `partySessionId`;
- `kind` (`player` or `system`);
- typed `eventType`;
- nullable actor character ID;
- frozen actor display name and remort count;
- nullable normalized plaintext body;
- nullable bounded/versioned JSON payload for system rendering;
- nullable deterministic source/dedupe key;
- occurrence/creation time.

Add unique `(partySessionId, sourceKey)` and indexes for `(partySessionId, id)` and bounded author/time lookup. Cascade with the root session. Do not persist pre-rendered HTML or localized system sentences.

### Compose intent

Add a versioned `PartyRaidChatComposeIntent` using the established pending-encounter shape:

- party session, character, remort life and Telegram user;
- exact private chat ID and bot prompt message ID;
- `activeKey`, status and CAS version;
- expiry, consumed and cancelled timestamps;
- accepted input source/event reference.

There is one active composer per character. A newer prompt replaces the previous one. TTL is 13 minutes. Leave, canonical removal, remort and terminal settlement cancel matching intents, while reply acceptance still performs full canonical revalidation.

### Revisions and rate state

Add a separate monotonic `PartySession.chatRevision`. A chat-only write must not bump gameplay `PartySession.version` or the active boss version.

Use durable versioned CAS state for:

- a 3-second per-character acceptance cooldown;
- a raid-wide cap of 42 accepted player messages per 93 seconds;
- same-author/same-normalized-body suppression for 13 seconds.

Use a fixed lineage window anchored by the first accepted post after reset: `windowStartedAt`, `acceptedCount`, and a 93-second expiry. If `now >= windowStartedAt + 93 seconds`, reset the window at `now`; when count is 42, remaining wait is the exact expiry minus `now`. Author state stores `nextAllowedAt` plus a hash/time of the last normalized body.

Validation order is deterministic: source replay → same-body suppression → author cooldown → lineage window → accepted write. Same-body suppression consumes the composer as a valid no-op but uses no quota/revision. Invalid or rate-limited content uses no quota and gets a newly bound correction prompt. Authorization/expiry/terminal failures cancel the composer. A transient DB failure rolls back everything and, if the actor remains eligible, offers a newly bound prompt rather than silently losing the input.

The CAS claims, entry insertion, compose consumption and `chatRevision` increment belong to one transaction. Do not implement concurrency control by reading the latest entry and hoping another writer does not race.

Keep at most 130 entries per lineage. Prune oldest rows in bounded batches after successful inserts while preserving monotonic IDs/revisions.

### Durable participant delivery/redaction state

Persist one `PartyRaidChatDeliveryState` per participant (or an equivalent explicit extension of `PartyParticipant`) with:

- surface mode (`recruiting_embed`, `active_card`, `terminal_read_only` or `redacted`);
- nullable canonical raid-chat card chat/message IDs, kept separate from generic `PartyParticipant` card references;
- desired and rendered chat revisions;
- redaction-required state;
- next attempt, attempt count and last delivery class.

Every committed entry advances the authorized targets' desired revision in the same transaction. Join/start/terminal/access-revocation transitions create or change the corresponding delivery states transactionally. This is a small durable dirty-state/outbox, not a per-entry notification ledger. An accepted player entry returns a bounded snapshot of the other current same-life recipients for an immediate best-effort notification; failed notification sends are not retried individually because the canonical coalesced card delivery still recovers the newest feed.

A bounded worker scans due dirty/redaction rows at startup and continuously. Therefore a crash after entry commit but before Telegram fanout does not require player refresh: the worker resumes the latest desired revision. Manual refresh/reopen remains an additional repair path.

## Input state machine

1. The compose callback reloads canonical state and verifies the existing `BIG_BARREL_BROTHER_RAID_ENABLED` surface, Big Barrel lineage, membership, remort life and writable lifecycle.
2. Atomically create a new intent generation in `awaiting_prompt`, cancelling the prior generation. Send a fresh ForceReply, then CAS-bind the returned exact bot prompt ID and move to `awaiting_reply`. A slower concurrent callback cannot reactivate its older generation. A crash before binding leaves only a harmless unbound/orphan prompt that cannot accept input and expires.
3. Register `/cancel_raid_chat` and the narrow input middleware early enough to work during active combat. The middleware calls `next()` unless the update is a text reply from the same Telegram user/private chat to the exact bot-authored prompt.
4. Commands (including an offset-zero `bot_command` entity), persistent main-menu button texts, non-replies, replies to other prompts, callbacks, media and captions remain owned by existing handlers and do not consume the composer.
5. Normalize accepted text with Unicode NFC and one-line whitespace collapse. Remove C0/C1 controls after handling tab/newline/return as whitespace; remove `U+061C`, `U+200B`, `U+200E`, `U+200F`, `U+202A–U+202E`, `U+2060`, `U+2066–U+2069` and `U+FEFF`. Preserve ZWJ `U+200D`, variation selectors, combining marks, regional flags and skin-tone modifiers. Count grapheme clusters and reject more than 93.
6. For an intercepted direct-text reply, reject empty input and Telegram entities `url`, `text_link`, `email`, `phone_number`, `mention` and `text_mention`. Forward/media/caption updates never enter raid-chat validation: existing handlers retain them and the durable composer remains available. Command updates are likewise passed to the command router rather than treated as submitted chat.
7. Store plaintext. Escape the author and body with the existing Telegram HTML helper only at render time.
8. In one transaction: claim the active intent by status/version/expiry; re-authorize membership/life/lifecycle; claim both rate states; dedupe the input Telegram chat/message source; insert one player entry; increment chat revision; consume the intent.
9. A duplicate update or concurrent loser returns a no-op/already-consumed result and never creates a second entry.
10. Invalid or rate-limited content does not consume the correction opportunity. Return one reason or exact wait, send a replacement ForceReply and CAS-update its exact prompt binding. A stale prompt can no longer write. Same-author/same-body suppression is a valid no-op: consume the composer, but create no quota use, entry or revision, and show `Таке повідомлення вже є в чаті.`

After acceptance, first send a fresh visible confirmation `✅ Повідомлення надіслано в рейд-чат.`, then best-effort edit the bot prompt to `Цей бланк уже використано.`, and schedule delivery. The fresh reply is required even when Telegram no longer permits editing the old prompt. `/cancel_raid_chat` cancels only the composer, never the raid.

## System events

Append a typed event in the same Prisma transaction as the winning canonical mutation, with a deterministic source key. The application wires this writer independently of the fresh chat UI gate so existing state can still terminalize and redact safely. Duplicate callbacks/retries must not create a second entry or second revision.

Availability decision: while the existing Big Barrel surface is enabled, this small bounded DB insert is part of the gameplay transaction, so a genuine chat-write failure rolls back that mutation. This deliberately preserves exact system-event truth. Event construction/validation must be pure and bounded, duplicate insertion must be a safe upsert/no-op, and no Telegram I/O occurs inside the transaction. The existing Big Barrel flag remains the operational rollback; this slice adds no parallel chat flag.

Allowlist:

- party created;
- participant joined or left;
- leader transferred;
- participant canonically removed, with no private reason;
- Kharakternyk ward placed or supported;
- Form 13-A filed / Protocol 13-Z opened and protocol signed;
- raid started, whether early or automatic;
- post-`0.3.14` starting raid-music state only when it is a visible canonical fact;
- actual activation/resolution of raid-wide stateful mechanics, including Warrior Taunt and Bard Lament/raid song;
- each participant's canonical active→knocked-out transition, once per transition;
- raid won, lost, cancelled or expired.

Resolve raid-wide mechanic and knockout entries from the winning round result/state transition. Do not append when a replaceable queued action is selected; the last choice wins and only the resolved state happened.

Exclude readiness toggles, refresh/share, denied/stale/no-op attempts, ordinary attack/defend/item actions, personal class/race/equipment skill actions such as Form 13-B and Dangerous Couplet, damage, HP/mana, rewards, hidden contribution, every ward/protocol trigger and unrelated Shynok/Priest/food/equipment state. The noncombat Shynok Bard performance is not a raid event merely because the actor is a Bard. Legacy retained personal-skill rows are filtered before the newest-13 query and never rendered.

System payloads contain only stable IDs/enums and display-safe snapshots needed by the presenter. Never include failure reasons, Telegram identifiers, invite tokens or hidden balance values.

## Rendering

- Exclude legacy personal class-skill event types, then query `ORDER BY id DESC LIMIT 13` and render oldest to newest.
- Store UTC; render in `Europe/Kyiv` as `HH:mm:ss`.
- If the visible 13 entries span more than one Kyiv calendar date, render every row as `DD.MM HH:mm:ss`.
- Player row: `• <time> <b><escaped name></b>: <escaped body>`; only the escaped player name is bold.
- System row: `• <time> — <i><localized typed event sentence></i>`; the complete technical event sentence is italic.
- Escape before measuring the final Telegram HTML payload. Drop the oldest visible chat rows until the full card fits the 4096-character budget; never clip inside an HTML entity or grapheme. If budget leaves fewer than the queried set, change the header to `💬 Рейд-чат (останні N із 13):`; do not claim 13 visible rows when fewer fit.
- Keep precise resources, reward forecasts and hidden combat calculations out of copy.

## Delivery and recovery

### Recruiting

Render the feed only in the authorized participant variant of the canonical gathering card. After commit, the durable desired revision makes every joined participant due. Extend permanent-edit recovery to replace a broken card for any participant, not only the leader.

For every Big Barrel recruiting response with raid chat enabled, the durable scheduler is the sole owner of the participant card and its Telegram reference. The creation route may send the separate approach notice, but `/raid` and Tavern create/live/live-membership routes never render a transcript into their current message and never record a competing reference; reopen only requests a canonical refresh and sends a compact transcript-free acknowledgement so an edit to an older card is visible from the current viewport.

Missing-reference publication is privacy-safe and two-phase: send a harmless placeholder without transcript or controls, CAS-adopt that reference into the raid-chat delivery row, recheck the adopted claim, then edit only that canonical message with the authorized view. A CAS loser can leave at most the harmless placeholder even if retirement gets `429`, a network error or process death. A crash after adoption leaves a tracked harmless placeholder. The bounded scanner reclaims the still-`in-flight` row when its 93-second lease expires; only a live lease suppresses reopen, while an expired or accidentally parked `in-flight` state becomes due again. A clean adopted placeholder whose render failed remains claimable under its persisted `telegram-429` or `telegram-retryable` class even when desired and rendered revisions are equal. Reopen never shortens an authoritative future Telegram `retry_after`; the scanner claims the row when that exact deadline becomes due. Dirty and redaction work remains ahead of clean refresh/reclaim/retry work. This keeps one durable card across creation, reopen, membership reuse and concurrent accepted posts.

`/online` describes these sessions as a gathering in progress, renders canonical `joined/participantCap` occupancy (for example `2/8`), and omits the inactive-raid notice while at least one recruiting Big Barrel session is visible.

### Active boss

At canonical start, make every frozen authorized participant's durable delivery state target one compact raid-chat card. The worker sends and persists missing references. The combat keyboard exposes `💬 Рейд-чат`; the chat card exposes compose and `↩️ До рейду`. Opening chat repairs or replaces a missing reference. Knockout removes combat-action buttons only: the frozen participant still sees the raid-chat button and may read or post until the boss session leaves its active lifecycle.

### Coordinator

- Durable DB desired/rendered/redaction state is canonical; Telegram failure never rolls back an entry.
- Reuse per-session in-process serialization only for delivery ordering, not correctness. Startup/due scanning recovers work after restart.
- Coalesce card fanout to at most one render/edit cycle per session about every 1.1 seconds. Player-post notifications are separate best-effort sends and still pass through the shared Telegram gate.
- Gate all raid-chat Telegram sends/edits/deletes (prompts, cards and redactions) across all sessions through one bounded fair queue capped at 13 operations per second, keep the same target chat at least about 1.1 seconds apart, and leave headroom below Telegram's documented bulk guidance. Prompt binding occurs after its queued send returns the message ID. Treat Telegram `429 retry_after` as authoritative by persisting the next due attempt and never letting a manual reopen move that deadline earlier; clean retryable rows remain eligible at the persisted due boundary. Use bounded backoff for other retryable failures.
- After a cycle, compare its rendered revision with current `chatRevision`; persist/reschedule if a newer entry arrived during delivery.
- `🔎 Оновити` and reopening the chat always recover from canonical DB state.
- Log delivery status/revision lag without message bodies, names, Telegram IDs or tokens.

Telegram documents practical limits of about one message per second in one chat and roughly 30 per second for bulk notifications, so uncoalesced eight-participant fanout is not acceptable.

## Lifecycle and cleanup

- The same feed continues from recruiting into active combat.
- Terminal transition makes the feed read-only and sets a 13-day retention deadline in the same transaction.
- Leave/removal/remort and retention expiry mark affected delivery states for redaction transactionally. On feature disable, the always-running worker uses a bounded scan to mark active refs. It edits the old recruiting card without transcript or replaces the active chat card with `Рейд-чат більше недоступний.` and removes controls; it may delete the bot message where safe.
- Disabling the existing Big Barrel surface hides controls/read surface and blocks new player chat writes, but does not erase existing rows. Re-enable resumes without backfilling chat events that could not occur while the parent raid surface was disabled.
- Bounded lazy/startup cleanup removes expired intents and post-retention entries only after scheduling redaction. Cleanup must not require loading unbounded sessions.
- Remort cleanup cancels the old-life composer; every request still validates life at use time.

Authorization guarantees no fresh server-approved read/write after access loss. Telegram content already delivered, copied or screenshotted cannot be cryptographically revoked. Redaction is durable and retried; if Telegram returns a permanent edit/delete failure, clear the unusable reference, record the privacy-safe terminal delivery class and never expose a fresh transcript to that actor.

## Rollout and project decisions

- Add no raid-chat environment/config key. Chat availability follows the existing `BIG_BARREL_BROTHER_RAID_ENABLED` production gate.
- Add a non-production `/dev_raid_chat fill|clear|expire` helper for last-13, cap, cooldown, compose expiry and retention QA. It must not register, appear in help or mutate in production under any dev-flag combination.
- Do not add an achievement: rewarding chat activity encourages spam. Existing ability achievements remain unchanged.
- Review Lore Board/flavor sources. Expected outcome is no lore change because this is a private Telegram coordination surface, not a new world/class mechanic; record the decision.
- No durable notification ledger, mute, reporting UI, edit/delete, replies, old-history pagination, group bridging or moderator dashboard in this release.

## Primary references

- [Telegram Bot API — ForceReply](https://core.telegram.org/bots/api#forcereply)
- [Telegram Bot API — sendMessage](https://core.telegram.org/bots/api#sendmessage)
- [Telegram Bots FAQ — practical message limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)

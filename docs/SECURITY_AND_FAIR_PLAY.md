# Security and Fair Play

## Принцип
Гра має бути чесною, безпечною і не збирати зайвих даних. Telegram callback-и та команди — недовірене введення.

## Дані користувача
Зберігати мінімум:
- Telegram user id.
- username/display name, якщо доступно.
- language code, якщо потрібно.
- ігровий стан.

Не зберігати:
- повні приватні повідомлення без явної потреби.
- телефон, email, контакти.
- токени або персональні дані в логах.

## Секрети
- Bot token тільки в env/secret manager.
- `.env` не комітити.
- `.env.example` без реальних значень.
- Logs не мають містити token або webhook secret.

## Rate limits
MVP limits:
- `/adventure`: cooldown game design + technical rate limit.
- callback combat action: 1 дія на активний turn.
- `/raid`: group-level cooldown.
- admin commands: allowlist + audit log.

## Idempotency
Усі нагороди видавати в транзакції з idempotency key.

Приклади:
- combat finish reward.
- raid reward.
- daily reward.
- level-up grant.
- remort/reset-like prestige flows.

Повторний запит має повертати попередній результат або «вже зараховано».

`/remort` з `0.1.2` є irreversible progression flow, не `/restart`: draft і completed remort records мають бути token-scoped, replay-safe і transaction-backed. Повторний confirm не може додати ще один remort count, legacy bonus або збережені манатки; зміни inventory/equipment між preview і confirm мають або безпечно відхилити confirm, або replay-нути вже завершений результат. Unknown/archived item ids не можна переносити приховано: якщо вони лишаються можливими для carry-over, вони мають бути видимими fallback-рядками й рахуватися в той самий selected limit.

`0.2.0` safe gifting is consent-first and audit-backed: one eligible priced manatka stack unit can move only after recipient acceptance, while equipped/protected/story/priceless/reserved items, active combat, stale content and remort-life changes block mutation. The create callback binds to a server-derived guard for the exact `itemId` + item fingerprint shown on the sender's card; if the live eligible list shifts, disappears or changes, it returns `stale-selection` instead of gifting a different stack. While an offer is `processing`, or `pending` with `expiresAt > now`, the sender's whole `itemId` stack is reserved so another sale, chest, barter or gift cannot spend a second unit from the same stack. Untouched expired pending rows no longer reserve a stack, and old callbacks canonicalize to `expired` without movement. Completed/declined/expired/cancelled callbacks replay the stored transfer state; duplicate accept cannot move a second unit. This does not add gold transfer, wagers, market pricing, item-for-item trade, referral rewards or quest progress.

`0.2.13` postal delivery extends Safe Gifting without becoming a market or mailbox. Known recipients come only from explicit durable social history in either direction: completed item transfers, accepted/active/resolved duels, or Bard performance reactions with `applauded`/`tipped`; passive Bard audience snapshots, offered/declined reactions, public search and exact-location discovery do not count. Selector and cards must not reveal current location or online status. Postal drafts use opaque `v1:post:` tokens and store package lines server-side. Confirm accepts only 1-5 distinct eligible `itemId` stack types, 1-93 units each, charges the visible sender delivery fee immediately, and moves selected quantities out of the sender inventory into postal custody while keeping one live one-week `postal:<sender>` reservation for sale/chest/barter/use/gift/remort paths; if the sender lacks fee gold, the package is not sent and no item moves. Manual postal eligibility is based on current ownership, equipment, reservations and content drift rather than the stricter gift/chest tag policy, so explicitly selected one-use or `trade-blocked` stacks such as bandages can travel by courier. Recipient accept rechecks sender/receiver life, active combat and stored transfer content before delivering postal-custody items once; if any line fails, no item enters the recipient inventory. Decline, sender cancellation and expiry return postal-custody items to the sender once, while duplicate callbacks replay stored terminal state. The delivery fee is a gold sink charged from the sender at send time, not a player-to-player gold transfer, and recipient acceptance never charges the recipient. Best-effort notices are not the source of truth.

`0.2.15` party sessions are a feature-flagged recruitment ledger, not raid combat. Invite links and callbacks use short opaque tokens; they do not carry character ids, location ids, boss ids, reward data or exact party membership authority. `party_sessions` and `party_participants` are the only source of truth, with nullable unique active-leader and active-membership keys enforcing one live recruiting party per leader and one live joined membership per character. Join, leave, cancel, passive expiry, dev-helper force expiry and remort cleanup are transactional and replay terminal state instead of reopening recruitment. The manual force-expiry control is a dev/local QA helper, gated separately from the production smoke feature flag, and must not become a normal player control. Nearby party invites reuse current same-location presence only to deliver a best-effort private notification; selector cards must not reveal exact location, hidden rejection reasons, future rewards or private status. Party sessions in this slice grant no XP, gold, manatky, items, quest counters, wagers, achievements, combat locks or boss progress.

`0.2.16` party-vs-one-boss is still a dev/flag-gated proof, not Senior Barrel Brother or the production raid route. It reuses `party_sessions` / `party_participants`; no second party abstraction is authoritative. Starting a proof freezes the joined roster into `party_boss_sessions.state_json`, inserts one `party-boss` `ActiveCombatLease` per participant and stores one shared boss target. Participant action callbacks carry only opaque party token, turn hint and compact action key; server state owns actor, turn, eligibility, HP/mana, cooldowns and result. `party_boss_actions` is unique by `(sessionId, turn, actorCharacterId)`, so duplicate/stale action buttons cannot double-spend mana, cooldown, RNG, contribution or boss HP; knocked-out participants replay canonical state instead of creating useful action rows. Missing actions resolve only through deterministic timeout defend fallback. Shared/spectator cards must not expose private HP, mana, selected actions, Telegram ids or hidden rewards. Runtime proof completion has no hidden round cap: it stores result JSON once, releases all `party-boss` leases and clears live party keys only when the boss reaches 0 HP or all active participants are knocked out. Remort during an active proof cancels that proof and clears the same live keys/leases without rewards. This proof grants no XP, gold, items, manatky, achievements, Barrel success, serious raid reward or economy faucet.

`0.2.4` item use is token-scoped, reservation-backed and replay-safe. Preview does not heal or consume; it creates a short-lived `item_use_orders` reservation for the exact character life, item id and content fingerprint. Confirm blocks active combat, full HP, remort-life drift, equipped/unknown/drifted stacks and competing reservations, then settles passive recovery through canonical Shynok-aware HP/mana recovery windows, consumes one unit and applies capped HP healing in the same transaction. Duplicate confirm/cancel/expired callbacks replay the terminal result instead of spending another bandage. Pending/processing item-use orders reserve the stack for gift/sale/chest/barter/remort paths until terminal cleanup.

`0.2.5` Bard Performance is consent-first for every player-to-player mutation. Shynok performance start may create a zero-audience snapshot for the tavern house payout; non-Shynok performance start requires at least one active same-location audience character. Start freezes performer life, location, effective CHA/LUCK/level, RNG result, house payout, cooldown, expiry and same-location audience rows in the database; a unique live guard keeps concurrent start callbacks for the same Bard/location to one live performance and one house payout. Telegram delivery is best effort only. Audience callbacks are server-authoritative by reaction id and current responder character, rechecking same location, performer location/life, remort life, active combat, pending raid, expiry and balance before mutation. Applause is free; voluntary tips debit the audience wallet, credit the performer wallet and complete the reaction in one transaction, so duplicate or concurrent callbacks cannot move gold twice. Shynok house payout is capped per Bard per Kyiv day and stored for replay; tips do not bypass that cap because they are explicit transfers from another player.

`0.2.6` Passage Search is server-authoritative through `passage_search_actions`: start freezes character life, node key, origin location, duration, cooldown, LUCK snapshot and any passage encounter token/monster snapshot. Start callbacks re-read current presence before mutation: descent search requires current `Низ`, the `Ярус I` safe search requires current `Сутерени Корчми`, passage search requires the matching passage, and stale remote buttons cannot spend cooldown, create search rows, create/refresh/consume pending encounters or start combat. A nullable active guard allows one running search per character, and terminal callbacks replay the stored result instead of rerolling loot or danger. Cooldown is consumed at start, cancellation does not refund it, fresh search keyboards hide the action until the cooldown expires, and fight/place/current-location, quest/adventure/hunt/Yeger, inventory/item/equipment/economy, tavern/Shynok/cellar/social callbacks plus matching mutating commands surface the active search until it resolves or is cancelled; check/cancel remain allowed, while low-risk read-only slash commands may remain available. The completion scheduler resolves due rows through the same stored-token service path and only sends a best-effort Telegram result message after durable resolution, so delivery failure cannot duplicate rewards or danger. Danger resolution stores the original encounter token before starting the attack handoff, so forged check/cancel callbacks cannot select a different monster or duplicate rewards. Passage-rest safe searches intentionally store no encounter token or monster snapshot and therefore cannot become danger even if later preview state changes.

`trade-blocked` and `soulbound` items are transfer-blocked for Safe Gifting by default. Legacy untagged priced items remain giftable, and gift fingerprints include transfer-relevant tags so a content/tag edit between rendered selection and create/accept returns `stale-selection` without moving the item.

Єгер paid bandage purchase uses a short opaque purchase token. The preview shows the current price, current gold and one bandage before spend; confirm revalidates the current character life, class-derived price and item identity through the existing daily-action audit boundary, and duplicate confirm replays the stored receipt.

`0.1.11` keeps remort replay-safe while clearing per-life starter/problem-chain `daily_actions` keys during the completed transaction. This reset is narrow: starter shawarma/fight and Korchmar problem-chain issue/reward rows may reset for the new life, while broad reward ledgers, gifts, remort records and unrelated audit rows must not be wiped. Existing production rows are cleaned through a dry-run-first maintenance script that deletes only matching `daily_actions` created before the character's latest remort, so post-remort rows created after the fix are preserved.

`0.1.3` додає reliability rows без нових нагород: `barrel_raid_notifications` тільки відновлює/надсилає завершальні повідомлення навколо наявного idempotent Barrel reward claim, а старі pending `mantok_chest_runs` переходять у `expired` без списання манаток або створення output.

`0.1.5` додає `/spar` проти `Сумлінного Допельґанґера` як level 3+ XP-only тренувальний бій без PvP state, target-player state, duel ledger, ставки або donor/pay state. Герої 1-2 рівня бачать friendly gate і не створюють training session, cooldown або reward state. Завершення тренування може видати тільки малий idempotent XP через session-scoped reward key і може оновити HP/ману персонажа та cooldown відновлення; воно не видає золото, items, манатки, титули, ранги, quest progress або доступ до фіч. Повторний callback має replay-нути вже записаний результат без додаткового XP, resource drain або нагород. Перший player-vs-player duel slice має бути level 3+ і перейти на server-side ledger/replay boundary, ownership checks і consent flow до будь-якої мутації.

`0.1.6` problem-chain issue/turn-in uses existing `daily_actions` idempotency rows instead of a new quest table. Each stage, including the first one, has a separate issue/reward key with `local_date = once`; `0.1.7` keeps stage `13` legacy-compatible by counting old ordinary won solo fights until `quest.thirteen-small-problems` is claimed, while stages `23`, `42` and `93` count only ordinary won solo fights after the stage issue timestamp. Repeated `v1:quest:problem` callbacks must either replay the already-issued next stage or report that the current stage is not ready, without duplicating XP, gold or item grants. Training doppelganger sessions, future duel sessions and group/raid sessions must stay excluded unless a later economy/security review explicitly changes that.

`0.1.9` combat flavor intents are presentation-only for `/spar`: they may add escaped text lines and semantic tags, but they must not create reward state, change quest counters, mutate cooldowns, bypass callback ownership/turn checks or expose hidden formulas. Any later numeric tactics modifier needs a separate tested balance/security review.

`0.1.10` duel invites are opt-in, level 3+, rewardless and ledger-backed. Challenge creation, accept, decline, cancel, expiry and result replay must stay transactional/idempotent through `duel_challenges`; old buttons may replay state but must not reroll a result. Invite recipients without a character receive onboarding copy instead of a hard failure. Partial HP or mana shows an explicit warning before accept, but the player can still proceed deliberately. The first slice must not add wagers, rating, item loss, quest progress, reward grants, rematch automation or tournament state.

`0.1.11` duel rematches and shareable result cards stay on the same rewardless ledger boundary. A rematch can be created only from a resolved stored result by one of the original participants, and it must set `target_character_id` to the other participant; accept must check that target server-side so bystanders cannot hijack an адресний реванш. Share callbacks must only send presentation text from stored `result_json`; they must not reroll, mutate status, notify the other side automatically, grant rewards or create соціяльний pressure loops.

`0.1.17` keeps instant duels rewardless while hardening invite and replay behavior. `🎲 Інший текст` may edit only the separate forwardable invite message, only for the challenge owner, and must not create a new challenge, extend expiry, change odds or write challenge state. Create/rematch/accept resource checks must use the canonical lazy HP/mana sync path with optimistic conflict fallback; stale resource warnings must not be derived from the wrong participant. New resolved duel `result_json` stores acceptance-time participant snapshots and balance/audit metadata so old cards do not silently change after rename, remort, level-up or equipment changes. Old result JSON remains readable.

`0.1.18` turn-based duels are consent-first and add persistent two-player active state. Quick duels remain rewardless; turn-based terminal paths grant only small XP stored in the result payload. `DuelChallenge.mode` is server-authoritative: `duel_<token>` may only open quick challenges and `duel_turnbased_<token>` may only open turn-based challenges. Accept must atomically move `pending -> active`, create one session, freeze snapshots and claim active-combat leases for both participants. Turn callbacks carry expected turn/version only; actor, action legality, skill cost, damage and result are recomputed server-side. Participant choices are stored privately in session state and private cards/action keyboards are sent only to the participant's private chat; group/shared cards are spectator-safe. Duplicate callbacks, stale buttons, timeout workers and user actions must converge through conditional session updates so one round is consumed once. Same-round older-version callbacks may merge only before deadline when the round has not advanced and the actor has not already chosen. Terminal paths release leases, write one stored result idempotently and grant XP only after the terminal challenge update succeeds; replay/result/share/rematch paths must not grant XP again. Telegram edit/send failures are delivery failures only and must not roll back committed duel state; proactive notifications require explicit `transitioned` signals rather than inferred terminal status. Malformed active sessions and orphan turn-based leases repair to a non-rewarding expired state instead of leaving permanent combat locks. Nearby targeted invites (`v1:nd:*`) must re-read same-location active presence before creating a targeted challenge and must treat target notification as best-effort; forged target ids cannot bypass the normal accept ownership, level, resource, pair-limit and active-combat guards.

`0.1.20` authored quest resolutions use the deterministic visible-method resolver as the callback allowlist. Hidden current-version method ids, forged problem/method pairs and stale period keys must stop before claim, cost, cooldown, reward, item grant or HP mutation. Paid methods and direct HP injury are transaction-owned: insufficient gold leaves no claim and no HP change; duplicate/concurrent callbacks apply at most one debit/reward/injury; blocked persistent-fight handoff rolls back claim, gold, rewards, item grants and HP together. The persisted result payload stores method id, grade, consequence, effective check snapshot, reward, spent gold, HP before/lost/after/max and fight handoff target where relevant.

The final `0.1.20` hardening extends exact audit persistence to cooldown-backed cellar results through `character_cooldowns.result_json`. The stored payload records the committed result/audit for duplicate safety; the ordinary on-cooldown card may remain the player-facing repeat surface and must not reroll or mutate again. HP rollback compensates only the committed loss, receives the current canonical max from the service layer where available and must never reduce later HP. Rollback resource writes are optimistic/retry guarded for XP, gold, HP and same-item quantities, using exact applied item grants after caps so unrelated later changes are not overwritten. Adventure fight handoff succeeds only when a new intended persistent fight starts; any other fight/rest/terminal state rolls the quest claim back and shows the relevant active state without stamping false quest-table presence, while a newly started handoff stamps canonical solo-fight presence.

`0.1.24` Shynok economy mutations are token-scoped and replay-safe. Self-drink and round confirms spend gold only after guarded status claims inside transactions and replay completed tokens. Round confirms use the stored recipient snapshot, not a fresh presence list, and recipient offers accept/decline at most once. If a recipient already has a live timed or queued drink, the first social-round `Випити` only returns a replacement preview; final replacement confirm must match the same offer, owner and live drink-state guard before replacing. Manatka sale confirm rereads live inventory, equipment and reservations inside the transaction, recomputes the sale fingerprint/value/payout from current content and returns `stale-selection` without mutation on drift; completed sale replay cannot grant gold or consume items again, and guarded decrement failure rolls the whole confirmation back. Telegram delivery of round/private cards is best-effort and never the source of truth.

## Callback validation
Callback data має:
- мати версію.
- відповідати regex/parser.
- перевіряти ownership: цей combat належить цьому character.
- перевіряти статус: combat active, raid open.
- перевіряти turn/cooldown.

## Group privacy
У групах:
- Не показувати зайві приватні дані.
- Дати admins спосіб вимкнути шумні повідомлення.
- Не тегати всіх без причини.
- Не писати надто часто автоматично.

## Anti-cheat MVP
- Detect duplicate callbacks.
- Detect impossible action frequency.
- Detect combat reward duplication.
- Detect multi-account abuse heuristics, але не банити автоматично без review.
- Log suspicious events.

## Admin safety
Admin commands:
- працюють тільки для allowlisted Telegram IDs.
- логуються.
- потребують confirm для destructive actions.
- не дають виконувати raw SQL з Telegram.

## Payments / monetization
До стабільної альфи краще без платежів.

Коли платежі з’являться:
- Тільки косметика/підтримка.
- Чітко показувати, що купує гравець.
- Не продавати loot boxes за реальні гроші без юридичної перевірки.
- Player-facing правило можна формулювати так: «Ніяких лутбоксів тут! Ну, хіба що смішні будуть.» Це означає: жодної оплати за силу або азартної монетизації; максимум прозорі косметичні/жартівні коробки без P2W.
- Не робити P2W.

### Банка підтримки

`Банка підтримки Квестарні` є добровільною підтримкою, а не payment-to-gameplay integration. У `0.1.1` є тільки link plumbing: optional `SUPPORT_JAR_URL`, `/support`, secondary homepage block and `/start support_thanks`. Канонічний backlog: [SUPPORT_JAR_BACKLOG.md](SUPPORT_JAR_BACKLOG.md). Майбутній read-only live status через Monobank API описаний окремо: [SUPPORT_JAR_LIVE_STATUS.md](SUPPORT_JAR_LIVE_STATUS.md).

Guardrails:

- deep link `support_thanks` не підтверджує оплату;
- не зберігати donor state без окремого privacy/legal рішення;
- не видавати XP, золото, items, манатки, екіпірування, рейтингові записи або доступ до фіч;
- не показувати битий support URL, якщо `SUPPORT_JAR_URL` не налаштований або не проходить validation;
- `SUPPORT_JAR_URL` у першому runtime-slice приймає тільки `https://send.monobank.ua/jar/...` без URL credentials;
- не лоґувати персональні платіжні дані;
- не називати це благодійністю, якщо юридично це не благодійний збір.

Future live status guardrails:

- `MONOBANK_API_TOKEN` має бути тільки server-side secret;
- не читати statement/webhook endpoints для live aggregate status;
- не лоґувати token, full Monobank response, account data або individual payment details;
- кешувати status і не викликати `client-info` частіше за API limit;
- live status показує тільки агреговані current/goal values і не підтверджує оплату.

## Moderation
Потрібно передбачити:
- blocklist для назв ґільдій/персонажів.
- report command.
- soft delete/rename offensive names.
- admin review queue для user-generated content.

## Backups
- Щоденний backup PostgreSQL.
- Перевіряти restore.
- Не зберігати backup у публічному bucket.

## Incident checklist
1. Зупинити нагороди/рейди, якщо exploit економіки.
2. Зробити snapshot БД.
3. Визначити affected users/items.
4. Патч + тест на exploit.
5. Компенсація або rollback.
6. Коротке чесне повідомлення спільноті.

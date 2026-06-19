# Phase 2 — Duels and Invites

Дуель — перший Phase 2 runtime slice після стабілізації `0.1.x`. Вона має бути маленькою, opt-in і смішною: корчемна бійка, а не велика арена.

## Pre-duel training slice — Сумлінний Допельґанґер

Перед повноцінними дуелями з іншими гравцями варто зробити безпечний тренувальний крок у корчемному бійцівському кутку: `Сумлінний Допельґанґер`, який копіює поточного героя й дає відчути майбутній PvP-подібний бій без соціяльного тиску, ставок або ризику зачепити іншого гравця.

Перший slice:
- `0.1.5` додає `/spar` і перший `🥊 Бійцівський куток` для героїв з 3 рівня; `0.1.10` виносить його в окрему локацію Корчми поруч зі Столом зі справами;
- допельґанґер копіює расу, клас, титул, рівень і effective stats/equipment summary героя;
- тренування йде як покрокова combat session через `solo_combat_sessions`, але без duel ledger, target ownership або invite flow;
- результат може дати малий XP: `1 XP` за програш і level-scaled XP за перемогу, приблизно від половини винагороди монстра подібного рівня з luck/random розкидом;
- золото, лут, манатки, PvP-рейтинг і quest progress не видаються;
- після завершення допельґанґер отримує recovery cooldown від HP, яке лишилося копії після бою; це не once-per-day gate;
- pending Barrel raid і korchma interior guard-и проходять до старту сесії, а presence пишеться тільки після успішних guard-ів;
- рівні 1-2 бачать gate copy і не створюють training session; майбутній duel invite MVP також має стартувати з 3 рівня, якщо окремий балансний PR не змінить це явно;
- не створювати player-vs-player state, target ownership або invite flow у цьому slice.

Пізніші розширення:
- вибір «рівня віддзеркалення» перед боєм на кшталт `-3 / 0 / +2` до рівня допельґанґера;
- попросити копію конкретної раси або класу для спарингу;
- додати кілька варіянтів характеру: надто чемний, підозріло веселий, драматично сумний або службово-байдужий;
- використовувати цей режим як балансний стенд для duel action catalog, але не як нескінченне джерело XP/луту.

## MVP fantasy

Гравець бачить іншого пригодника або має invite link/card, кидає виклик, а інший пригодник явно приймає. Квестарня швидко рахує результат і показує коротку картку: хто кого переміг, як саме це звучало й чому корчмар заніс це в журнал.

## Shipped first slice — 0.1.10

`0.1.10` ships the first rewardless invite ledger:
- `/duel` and Fighting Corner `🤝 Кинути виклик` create open level 3+ challenges;
- optional `BOT_USERNAME` generates copyable `https://t.me/<bot>?start=duel_<token>` links for dev/prod bot separation and sends them as a separate forwardable invite message;
- `/start duel_<token>` opens the invite flow;
- accept, decline, cancel and expiry are idempotent;
- repeated buttons replay the stored state/result instead of rerolling;
- result cards show both participant levels, remorts when present, the first-and-last quick-resolve beat and the stored winner without granting farmable combat rewards;
- invite recipients without a character get polite onboarding copy;
- partial HP or mana shows a warning before the player explicitly accepts;
- `Переможці` in the Fighting Corner reads resolved duel results as a rewardless day/week/month board, with no economy rewards or tournament state.

`0.1.11` adds the first manual result follow-up layer:
- resolved result cards offer `🔁 Реванш` and `📣 Картка`;
- rematches create a fresh targeted rewardless invite between the original participants only;
- bystanders cannot accept targeted rematches server-side;
- partial HP or mana still warns before the rematch invite is created;
- shareable result cards send a separate forwardable message from the stored result and do not reroll or mutate the duel ledger.

`0.1.17` polishes the shipped quick mode as `⚡ Миттєва дуель`:
- forwardable invites use 13 stable text variants with the same deep link, the instant mode line and a qualitative fairness line;
- `🎲 Інший текст` is owner-only, edits only the invite message, preserves token/URL/expiry/mode/ownership and does not mutate the challenge row;
- create, rematch and accept paths sync current HP/mana through the canonical lazy resource path before warnings or resolution;
- instant scoring temporarily normalizes progression-derived level/remort budget only, while race, class, title, equipped manatky and equipment effects remain personal;
- fresh HP/mana ratios add only a small capped readiness effect, so warnings match mechanics without making tired acceptance an automatic loss;
- new `result_json` payloads store participant snapshots, balance version and audit data so replay-facing cards do not silently change after rename, remort, level-up or equipment swaps;
- old result payloads remain readable; no migration or turn-based PvP runtime ships in this slice.

`0.1.18` adds the first persistent player-vs-player runtime as `♟️ Покрокова дуель`:
- the Fighting Corner offers `⚡ Миттєва дуель` and `♟️ Покрокова дуель`;
- turn-based invites use `duel_turnbased_<token>`, the same 13-copy pool and the same qualitative fairness line;
- `DuelChallenge.mode` is server-authoritative, defaults old rows to `quick`, and deep-link prefixes cannot switch a stored challenge mode;
- accept syncs both participants' canonical resources, freezes acceptance-time snapshots, stores initiative and creates one active `duel_combat_sessions` row;
- active leases prevent overlapping persistent solo/training/starter fights and turn-based duels;
- participant choices are queued privately in `state_json`; damage, mana spending and visible summaries are resolved only when both participants have chosen or the timeout fills missing choices;
- resolved rounds use shared combat-domain actor-vs-defender logic for attack, class skill, mana, cooldown, armor/resist and HP clamping;
- each round stores `turnExpiresAt`; due rounds can be advanced by an idempotent timeout auto-attack after roughly `23` seconds;
- terminal rows release leases, write one result, grant small stored XP exactly once and keep rematches mode-preserving;
- `👀 Хто поруч` offers `Кинути виклик присутнім`: it pages active players in the same current location, lets the challenger pick quick or turn-based mode and sends the chosen player an in-game targeted invite best-effort.

Turn-based duel XP is intentionally small and stored in `result_json`: `1 XP` for a loss, `2-5 XP` for a draw and `4-8 XP` for a win with a bounded luck influence. Quick duels remain XP-free.

Still future: tournaments, gold/item/manatka rewards, wagers, item loss, cross-location discovery, broad social discovery and manatka/gold exchange.

## Flow

1. Challenger натискає duel action у Бійцівському кутку, запускає `/duel` або обирає активного гравця через `👀 Хто поруч` → `Кинути виклик присутнім`.
2. Bot створює `duel_challenge` з expiry, challenger, optional target and context.
3. Target бачить короткий виклик із кнопками `Прийняти`, `Відмовитись`, `Не зараз`.
4. Якщо target приймає quick mode, сервіс атомарно переводить challenge у `resolved`.
5. Якщо target приймає turn-based mode, сервіс атомарно переводить challenge у `active`, creates leases/session and renders the battle card.
6. Resolve uses synced current resources, progression-normalized effective stats, class/race/title flavor hooks, equipment/item-tag summary and bounded randomness.
7. Result зберігається як replay/audit payload.
8. Повторні callback-и показують той самий результат.
9. Card пропонує `Реванш` або `Покликати ще когось`, але не створює автоматичний grind.

## Resolve shape

Quick mode remains instant resolve and rewardless. Turn-based mode uses a persistent two-player session and a tiny XP-only terminal reward, but both modes still share the invite/rematch ledger, normalization helper, no-gold/no-item guardrails and replay-safe result payloads.

Inputs:
- level bracket;
- effective stats;
- class/race/title flavor hooks;
- current title, earned identity or future achievement title;
- selected duel style, якщо він є;
- equipment and item tags only through shared summary/catalog;
- bounded random seed.
- current HP/mana readiness ratios after canonical sync.

Outputs:
- winner/loser or funny draw;
- short flavor result;
- capped XP/social score, якщо баланс дозволяє;
- replay-safe card payload with acceptance-time participant snapshots.

## Data sketch

```text
duel_challenges
- id
- challenger_character_id
- target_character_id nullable
- context_chat_id nullable
- mode: quick | turn-based
- status: pending | active | declined | expired | forfeited | resolved | cancelled
- invite_token
- expires_at
- resolved_at nullable
- result_json nullable
- created_at
- updated_at
```

Turn-based session rows shipped in `0.1.18`:

```text
duel_combat_sessions
- duel_challenge_id unique
- challenger_character_id
- target_character_id
- status: active | resolved | expired | forfeited
- acting_character_id
- state_json, including frozen participants, pending private choices, last resolved round and outcome
- turn
- version
- turn_expires_at
- completed_at nullable
- challenger_chat_id/message_id nullable
- target_chat_id/message_id nullable
```

```text
duel_combat_actions
- duel_combat_session_id
- actor_character_id
- turn
- action_key
- result_json
- created_at
- unique (duel_combat_session_id, turn)
```

```text
active_combat_leases
- character_id unique
- kind
- ref_id
- created_at
- expires_at nullable
```

Turn-based duels reuse the same combat turn timeout model planned for ordinary monster fights and `/spar`: each active round gets roughly `23` seconds, then a durable poller or lazy lookup applies idempotent basic attacks for missing choices, edits/sends cards best-effort and advances or closes the fight. Notification failure must not roll back already committed gameplay.

Nearby-targeted invites shipped in `0.1.18`: the location presence list offers `Кинути виклик присутнім`, lets the challenger pick a visible active nearby player, sends that player an opt-in notification and relies on the normal accept/start guards before combat state is created. Open invite links remain useful for приватні й групові чати. A later nearby social-economy slice may reuse this presence picker for manatka/gold exchange, with separate audit and confirmation rules.

Duel result notifications should eventually update or notify the other side without requiring `Оновити`. That path needs replay protection, for example a stored message id or notification idempotency key, so repeated callbacks do not spam duplicate result cards.

## Guardrails

- Consent first: target must opt in.
- Minimum level: first duel MVP should be level 3+ to stay out of starter-only `/fight` routing.
- No item loss, no gold steal, no injury spiral.
- No wagers in the MVP.
- Newbie protection and level brackets before reward-bearing дуелі.
- Pair caps: repeated same-pair duels stop giving progression quickly.
- Per-character daily cap on reward-bearing дуелі.
- Abuse logging for suspicious repeated pairs.
- Player-facing text never exposes exact formulas.
- Class, race, title and manatky differences may create funny upsets, but caps must keep them from becoming solved builds.

## Acceptance criteria

- Pending challenge expires safely.
- Accept is idempotent and cannot resolve twice.
- Old buttons replay state instead of mutating it again.
- Target ownership or open-invite eligibility is checked server-side.
- Turn-based callbacks include expected turn/version and never trust client-supplied mode, actor, damage or result.
- Turn-based XP rewards are stored with the terminal result and granted only by the successful terminal transaction.
- Result card is short enough for a mobile screen.
- Tests cover create, accept, decline, cancel, expire, stale callback, repeated accept and no reward duplication.

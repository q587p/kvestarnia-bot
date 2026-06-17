# Phase 2 — Duels and Invites

Дуель — перший Phase 2 runtime slice після стабілізації `0.1.x`. Вона має бути маленькою, opt-in і смішною: корчемна бійка, а не велика арена.

## Pre-duel training slice — Сумлінний Допельґанґер

Перед повноцінними дуелями з іншими гравцями варто зробити безпечний тренувальний крок у корчемному бійцівському кутку: `Сумлінний Допельґанґер`, який копіює поточного героя й дає відчути майбутній PvP-подібний бій без соціяльного тиску, ставок або ризику зачепити іншого гравця.

Перший slice:
- `0.1.5` додає `/spar` і кнопку `🥊 Бійцівський куток` у Столі зі справами для героїв з 3 рівня;
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

## First runtime slice — `0.1.10`

`0.1.10` реалізує перший вузький Duel Invite MVP:
- `/duel` і `🤝 Корчемний виклик` у Столі зі справами створюють відкритий invite token;
- якщо заданий `BOT_USERNAME`, картка показує deep link `/start duel_<token>` для правильного dev/prod бота;
- `/start duel_<token>` веде новачка до onboarding copy, а наявного пригодника — до accept/result flow;
- рівень 3 лишається мінімумом для створення й прийняття;
- якщо HP або мана не повні, accept спершу показує попередження й окрему кнопку `Прийняти все одно`;
- quick resolve записує result payload у `duel_challenges`, тож повторні callback-и replay-ять той самий результат.

Не включено в `0.1.10`: XP, золото, манатки, рейтинги, pair caps, targeted invite UI, rematch cards, tournament cards, turn-based PvP, ставки, item loss або групові бійки.

## Flow

1. Challenger натискає `🥊 Викликати`.
2. Bot створює `duel_challenge` з expiry, challenger, optional target and context.
3. Target бачить короткий виклик із кнопками `Прийняти`, `Відмовитись`, `Не зараз`.
4. Якщо target приймає, сервіс атомарно переводить challenge у `accepted/resolved`.
5. Resolve використовує рівень, стати, клас/расу, титул або earned identity, equipment/item-tag summary і bounded randomness.
6. Result зберігається як replay/audit payload.
7. Повторні callback-и показують той самий результат.
8. Card пропонує `Реванш` або `Покликати ще когось`, але не створює автоматичний grind.

## Resolve shape

Перший slice краще робити як quick resolve, а не повний turn-based PvP. Data shape має не закрити дорогу до future mini-turn дуелей.

Inputs:
- level bracket;
- effective stats;
- class/race/title flavor hooks;
- current title, earned identity or future achievement title;
- selected duel style, якщо він є;
- equipment and item tags only through shared summary/catalog;
- bounded random seed.

Outputs:
- winner/loser or funny draw;
- short flavor result;
- capped XP/social score, якщо баланс дозволяє;
- replay-safe card payload.

## Data sketch

```text
duel_challenges
- id
- challenger_character_id
- target_character_id nullable
- context_chat_id nullable
- status: pending | declined | expired | accepted | resolved | cancelled
- invite_token
- expires_at
- resolved_at nullable
- result_json nullable
- created_at
- updated_at
```

Future:

```text
duel_actions
- duel_id
- character_id
- action_key
- turn
- payload_json
- created_at
- unique (duel_id, character_id, turn)
```

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
- Target ownership is checked server-side.
- Result card is short enough for a mobile screen.
- Tests cover create, accept, decline, expire, stale callback, repeated accept, pair caps and no reward duplication.

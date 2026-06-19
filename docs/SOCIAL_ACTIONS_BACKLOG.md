# Social Actions Backlog

Цей backlog описує group/social features, які добре йдуть після Phase 1 closeout and Phase 2 roadmap reset.

Status after `0.1.0`: перший Phase 2 spine — не груповий рейд, а **Social Combat & Interactions**. Канонічний план живе в [phase2/SOCIAL_COMBAT_PLAN.md](phase2/SOCIAL_COMBAT_PLAN.md). Старі group-raid ideas лишаються later input, але найближчий соціяльний runtime напрям — duel invites, result/rematch cards, trading/gifting, combat variety and later party combat.

## 0. Duel invites and result cards

Player value:
- дає простий привід покликати іншого пригодника;
- створює коротку історію, яку хочеться показати в чаті;
- перевіряє social session primitives до рейдів і ґільдій.

Minimum implementation:
- pending challenge with explicit accept/decline/expiry;
- shipped quick resolve plus first persistent turn-based PvP, both rewardless;
- replay-safe result card;
- mode-preserving rematch button with caps and cooldowns.

Abuse risk:
- спам викликами;
- домовні повтори однієї пари;
- соціяльний тиск на гравців, які не хочуть битися.

Required data:
- challenge/session row;
- pair/day caps;
- result replay/audit payload.

Solo-compatible:
- частково: NPC/training duel can exist later, але головна цінність — інший гравець.

## 1. Buy a round for people currently in the korchma

Player value:
- дає просту соціяльну дію без бойової складності;
- створює корчемний жарт і маленький gold sink.

Minimum implementation:
- один командний або callback flow;
- список присутніх у корчмі;
- підтвердження перед витратою золота;
- простий thank-you summary.

Abuse risk:
- спам;
- gold drain на інші акаунти;
- надмірні повідомлення в групі.

Required data:
- presence snapshot;
- character gold;
- action log/idempotency key.

Solo-compatible:
- так, якщо дія дозволяє пригостити NPC/корчму або просто себе.

## 2. Invite nearby players to a raid

Player value:
- робить груповий hook видимим і запрошуваним;
- зменшує friction перед рейдом.

Minimum implementation:
- коротке запрошення з кнопкою;
- mention-free або privacy-safe invite mechanic;
- cooldown на повторне запрошення.

Abuse risk:
- спам згадок;
- надто часті push-повідомлення;
- pressure на гравців.

Required data:
- group chat id;
- presence / nearby players list;
- invite cooldown state.

Solo-compatible:
- частково, якщо invite можна адресувати одному гравцю або відкласти в чергу.

## 3. Front-of-korchma public board

Player value:
- додає вітрину досягнень і живий social surface;
- добре працює як асинхронний вхід у гру.

Minimum implementation:
- paginated board біля входу;
- recent arrivals або recent level-ups;
- один короткий highlight рядок.

Abuse risk:
- спам оновлень;
- приватність імен;
- перевантаження текстом.

Required data:
- level-up events;
- arrival events;
- visibility/privacy rules.

Solo-compatible:
- так.

## 4. Recent level-up celebration

Player value:
- святкує прогрес без складної економіки;
- створює соціяльний шум навколо росту героя.

Minimum implementation:
- окремий announcement message;
- кнопка/посилання на героя;
- ідемпотентний event log.

Abuse risk:
- дублювання повідомлень;
- спам при повторних callback-ах;
- зайва публічність у групі.

Required data:
- level-up event row;
- last announced level;
- group target rules.

Solo-compatible:
- так, але краще відразу думати про груповий surface.

## 5. Generosity / rank shoutouts

Player value:
- підсилює соціяльний винахідливий стиль гри;
- можна смішно винагороджувати щедрість без P2W.

Minimum implementation:
- daily/weekly summary;
- короткий title або shoutout;
- чіткий tie-breaker.

Abuse risk:
- farming shoutouts;
- self-promotion;
- leaderboard manipulation.

Required data:
- purchase/round events;
- leader summary row;
- deterministic ranking fields.

Solo-compatible:
- так.

## 6. Party gathering flavor

Player value:
- робить груповий збір не тільки механікою, а сценою;
- допомагає перед рейдом.

Minimum implementation:
- one-liner group flavor;
- join/leave state;
- short status card.

Abuse risk:
- noisy notifications;
- хибний соціяльний тиск;
- repeated empty gatherings.

Required data:
- current group state;
- participant count;
- optional presence.

Solo-compatible:
- так, якщо flavour може працювати і без повного складу.

## 7. Соціяльні action cooldowns

Player value:
- зберігає чат від спаму;
- дозволяє соціяльним діям бути частими, але не безкінечними.

Minimum implementation:
- one cooldown per social action key;
- clear remaining time text;
- soft deny messages.

Abuse risk:
- accidental over-blocking;
- confusing UX if cooldowns are too opaque.

Required data:
- cooldown rows;
- action key;
- available_at timestamp.

Solo-compatible:
- так.

## 8. Корчемні ігри: карти й шашки

Player value:
- дає просту соціяльну розвагу без бойової ставки;
- робить корчму місцем, куди приходять не тільки бити монстрів, а й показати вправність, сміливість і підозрілу любов до правил;
- добре працює з presence: запросити когось із тих, хто зараз у шинку, залі або біля столів.

Minimum implementation:
- окрема дія в корчмі або шинку: `🎴 Зіграти` / `♟️ Шашки`;
- вибір дуже простий: карти або шашки;
- виклик nearby пригодника з opt-in кнопкою `Прийняти`;
- 2–4 кроки максимум: виклик → прийняття → один вибір стилю гри або хід → результат;
- результат визначається легким випадковим розвʼязанням з малими модифікаторами від спритности, розуму, вдачі, харизми, класу й, іноді, расового flavor;
- переможець отримує короткий запис/репліку, але не бойову перевагу.

Suggested player-facing shape:
- карти: ризикнути, грати обережно, блефувати;
- шашки: давити центром, ставити пастку, грати «як корчмар учив, але він заперечує»;
- результат: перемога, поразка або смішна нічия, де стіл вимагає перерахунку.

Abuse risk:
- спам викликами;
- домовний фарм рейтингу;
- соціяльний тиск на гравців, які просто зайшли по квест;
- надто довгі flows у чаті.

Guardrails:
- opt-in only: без автоматичних викликів і без примусу;
- cooldown на виклик і на пару гравців;
- максимум кілька зарахованих партій із тим самим опонентом за добу;
- нагороди косметичні або соціяльні: запис у локальному рейтингу, титул, коротка згадка або дрібна flavor-відзнака;
- no XP/gold/power у першому slice, хіба що окремо буде balance-рішення;
- не показувати точні формули шансів у player-facing тексті.

Required data:
- presence snapshot або список nearby пригодників;
- challenge/session row або cooldown-based pending state;
- action log для idempotency;
- optional daily/weekly game ledger для «хто сьогодні переграв корчму».

Solo-compatible:
- частково: можна дати NPC-суперника або тренувальну партію з корчмарем/єгерем, але головна цінність — гра з іншим пригодником.

## 9. Корчемний виступ барда

Player value:
- робить корчму місцем живої культури, а не тільки квестів і витрат;
- дає барду класову соціяльну дію з гумором і малим шансом заробити;
- підвʼязує музичні манатки до не-бойового використання.

Minimum implementation:
- дія `🎶 Виступити` в `🍻 Шинку` для барда;
- один короткий текст виступу й результату;
- перевірка від харизми та вдачі з bounded randomness;
- малий gold payout або `0` золота при невдалому виступі;
- cooldown раз на день за Києвом для першого slice, із можливим майбутнім переходом на раз на годину;
- bonus від музичних манаток, якщо вони є в інвентарі або екіпіровані.

Suggested outcomes:
- провал: ложки збилися з ритму, корчмар не платить, але записує жанр у «не повторювати»;
- скромно: кілька монет і ввічливий стіл;
- добре: кращий payout і коротка реакція NPC;
- блискуче: більше золота в межах cap-а, згадка на дошці або рядок для майбутнього локального рейтингу.

Abuse risk:
- hourly фарм золота, якщо payout завеликий;
- bard-only дія може виглядати як обовʼязкова перевага;
- музичні манатки можуть стати must-have для економіки;
- шум у чаті від повторних виступів.

Guardrails:
- перший slice без XP, loot, бойових бафів або progression gates;
- cooldown і idempotent reward claim;
- payout cap нижчий за нормальну бойову/рейдову винагороду за той самий час;
- точні формули шансів не показувати гравцю;
- музичні манатки дають суттєвий, але bounded бонус;
- bard-only інструменти мають бути приємною спеціялізацією, а universal інструменти можуть давати менший бонус барду або майбутній flavor іншим класам.

Required data:
- character class, charisma, luck;
- action log або cooldown row для `shynok.bard-performance`;
- inventory/equipment lookup для musical manatky;
- deterministic reward seed per character + cooldown period;
- optional performance ledger for future «хто сьогодні змусив ложки аплодувати».

Solo-compatible:
- так. Соціяльний шар може додатися пізніше через дошку, nearby reactions або групові виступи.

## General backlog rules

- Соціяльні дії мають бути короткими.
- Кожна дія повинна мати зрозумілу користь для чату.
- Якщо дія потребує окремого state machine, її слід відкласти до наступного phase slice.
- Нагороди не повинні бути настільки сильними, щоб соціяльні дії ставали обов’язковим гриндом.

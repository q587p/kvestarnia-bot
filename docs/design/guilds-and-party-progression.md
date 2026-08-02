# Ґільдії та гуртова прогресія

Статус: канонічна продуктова межа для `0.4.x`; foundation реалізовано в
repository release `0.4.4` за default-off `GUILD_FOUNDATION_ENABLED`.

## Продуктова гіпотеза

Гравець повертається не лише по власний кулдаун, а й тому, що двоє-троє знайомих
мають коротку спільну мету. Telegram має допомагати домовитися й сміятися з
результату, а не перетворювати гру на обовʼязковий вечірній рейд.

Перший доказ складається з двох незалежних шарів:

- гурт — тимчасова команда для однієї активности;
- ґільдія — тривала мала ідентичність, яка полегшує повторний збір гурту.

## Гуртова експедиція

Перша production-експедиція:

- 2–3 пригодники;
- 2–3 authored вороги;
- одна дія кожного живого учасника за раунд;
- явна ціль: себе, союзник або ворог відповідно до дії;
- server-owned безпечна дія після таймера;
- коротка canonical card кожного учасника;
- bounded recap і contribution summary;
- одна encounter reward budget з idempotent per-player settlement.

Contribution враховує не лише шкоду: лікування, guard, контроль, прийняту шкоду
й підтверджені дії. Support-персонаж не має виглядати «пасажиром».

У першій rewardless proof-версії немає XP, золота, манаток, quest progress або
achievement unlock. Вони додаються лише у production expedition після parity,
race, repair, load і Telegram QA.

## Telegram UX

- Invite пояснює encounter, eligibility, склад і час без прихованих шансів.
- Active card редагується, а не створює повідомлення після кожної дії.
- Чітко видно, хто вже обрав дію, але чужий прихований вибір не розкривається.
- Таймер показує canonical remaining time.
- Stale card веде до refresh/replay, не повторює дію.
- Збій Telegram не впливає на combat state; наступне відкриття відновлює картку.
- Raid chat, якщо використовується, лишається participant-only і без нагород.

## Guild foundation

Мінімальна ґільдія комфортна для 3–5 людей і не потребує масової спільноти.

Поля:

- normalized unique name і player-visible display name;
- emoji-герб;
- короткий безпечний опис;
- leader, officer, member;
- created timestamp і durable audit важливих transitions.

Дії:

- створити за previewed gold sink;
- запросити відомого/eligible гравця без витоку online/location;
- прийняти, відхилити, скасувати, вийти;
- передати leadership або підвищити/понизити officer;
- створити звичайний тимчасовий гурт і запросити eligible членів.

Membership ідентичність має явну remort policy. Базова рекомендація: ґільдія
належить користувачеві/персонажній історії й переживає remort, але активна бойова
участь завжди привʼязана до конкретного життя персонажа.

## Weekly goal

Після першої production expedition ґільдія отримує одну малу тижневу мету:

- зрозумілий Kyiv/Holocene period;
- прогрес лише від eligible завершених group encounters;
- exact-once contribution receipt;
- social/cosmetic-first спільний результат;
- короткий recap у Хроніках без приватних подробиць;
- відсутність FOMO-покарання за пропущений тиждень.

Гравці без ґільдії можуть проходити звичайну party expedition. Ґільдія не
монополізує базовий group-combat контент.

## Safety і moderation

- Немає публічного сорому за малий contribution або inactivity.
- Немає точного location/online tracking у guild roster.
- Назва й опис мають length/Unicode normalization, reserved-name і basic abuse
  guard; moderation action лишає audit.
- Invite spam має rate/cooldown і block-friendly поведінку.
- Leader deletion/restart не каскадить активний party/group encounter.
- Guild leave/kick не скасовує вже сформований окремий PartySession.

## Не входить у foundation

- guild bank або спільні предмети;
- золото між членами, auction/market чи trade custody;
- бойові стат-бонуси;
- guild wars, territory, forced PvP або wagers;
- raid finder, alliance/global guild chat;
- season pass або monetization;
- encounters понад 3×3.

Ці системи потребують окремого task, abuse/economy audit і даних реальної малої
ґільдії; вони не виростають автоматично з membership таблиці.

## Метрики доказу

- party create → join → start → finish;
- частка гуртів із повторним спільним encounter протягом 7 днів;
- timeout/forfeit/repair і permanent delivery failure rates;
- guild invite → accept;
- частка ґільдій із 2+ активними учасниками за тиждень;
- weekly goal participation без зберігання приватного message content.

Успіх — не максимальна кількість ґільдій, а повторний маленький соціяльний ритуал
без руйнування solo loop і без експлуатаційного тиску.

# Стислий висновок

## Чи туди рухається Квестарня

Так. Український голос, Telegram-first короткі сесії, replay-safe мутації,
соціяльність без примусу й fair free-to-play узгоджені між продуктом і кодом.
Вже є потрібні сходинки до бажаної гри:

- multi-enemy solo combat;
- temporary party recruitment;
- party-vs-one durable rounds;
- Big Barrel як перший group boss proof;
- дуелі, турніри, quest overview, титули, Chronicle/Lore та class support.

Тобто мультибої й ґільдії — природний наступний крок, не поворот в іншу гру.

## Що треба доробити в 0.3.x

Не ще одну тематичну фічу. Потрібно закрити фундамент:

1. Завершити `0.3.15` Raid Chat. Head `e223073a` уже виправив основні stale
   ack/privacy redaction, rejoin і permanent/transient failure paths; лишилися
   idle polling, graceful shutdown, callback throttle, 403 edit/real-network
   classification gaps і ручна Telegram QA.
2. Заборонити `/restart` та, у першій безпечній політиці, `/remort` під час
   multi-actor combat на транзакційній межі.
3. Додати strict parser/repair `PartyBossState`, orphan lease recovery й
   ізоляцію пошкодженого рядка від scheduler.
4. Закрити concurrent join/action/timeout/settlement test debt.
5. Вирішити PartyBoss support-ability parity: виправити й пересимулювати або
   тримати Big Barrel вимкненим із записаним blocker.
6. Заповнити release-state ledger реальними deployed flags/QA/rollback даними.
7. Зібрати вузький privacy-safe retention/social funnel і визначити feedback /
   admin allowlist policy.
8. Синхронізувати docs і провести risk-based Telegram QA/observation.

## Що не є blocker

Rogue reputation, ширший Hunt/Єгер, колекції, жертовник, greeting buff, їжа,
resale, trade/item instances і fuller Big Barrel rewards не забуто. Їх не варто
вставляти перед `0.4.0`, якщо немає нового production evidence.

## Як швидше дійти до ґільдій і мультибоїв

Не чекати великого універсального MMO-рефакторингу. Після closeout зробити
малий rewardless 3×3-bounded runtime, потім hardening. Guild membership shell
можна будувати окремо одразу після цього: він не потребує guild boss або банку.

Критична архітектурна межа:

- `PartySession` лишається temporary roster;
- `PartyBossSession` лишається Big-Barrel-specific;
- новий `GroupCombatSession/Participant/Action` володіє generic 2–3×2–3;
- guild лише створює/запрошує в ordinary PartySession;
- reward-bearing expedition зʼявляється після runtime parity/race/load proof.

Це дає першу відчутну ґільдію в `0.4.2`, а справжній гуртовий бій — уже в
`0.4.0` proof і `0.4.3` production MVP.

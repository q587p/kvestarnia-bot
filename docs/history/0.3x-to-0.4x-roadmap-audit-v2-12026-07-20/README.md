# Аудит переходу Квестарні з 0.3.x до 0.4.x

Дата аудиту: 20.07.2026 / `12026-07-20` у release-сурфейсах Квестарні.

База аудиту:

- `main`: `d101867cd80f9c05505899ac7b42adf92e369527` (`0.3.14`);
- відкритий draft PR `#179`: live head
  `e223073a65b96a293ca40ed8e6f14e4bef1b930d` (`0.3.15` Raid Chat candidate);
  первинні race знахідки зроблено на `af56de0d…`, потім повторно перевірено
  hardening delta до `e223073a…`.

## Що виправлено у v2

Перша версія пакета згорнула Старий жертовник, greeting buff, їжу, consumables і
resale/recycling в один deferred-булет. Це було не достатньо: фічі лишалися в
repo, але не мали релізних адрес, актуальних задач і prompt workflow. У v2 вони
розділені на `0.4.5`–`0.4.11`, а старі source drafts додано як references.

Food/consumable/recycling implementation prompts не дозволяють Кодексу вигадати
каталог чи алгоритм під час кодування: спершу read-only decision, людське
схвалення й docs-only activation, потім implementation/review/follow-up.

## Головний висновок

Напрям правильний: Квестарня вже пройшла від solo loop до дуелей, multi-enemy
PvE, тимчасових гуртів і першого групового boss proof. Забутої нумерованої
задачі `0.2.x` немає. Проблема не у відсутності фіч, а в трьох речах:

1. `0.3.15` вже виправив основні delivery/redaction CAS, rejoin і failure-class
   знахідки, але поки не можна зливати через idle polling, non-draining stop,
   throttled callback acknowledgement, неповну 403/real-network класифікацію й
   відсутню ручну Telegram QA.
2. `0.3.x` потребує одного чесного closeout: restart/remort/repair/race, rollout
   ledger, QA/observation і правдиві docs.
3. `0.4.x` слід почати з окремого generic 2–3×2–3 combat runtime, не розширювати
   Big-Barrel-specific `PartyBossSession` і не класти новий workflow у великий
   `FightService`.

Рекомендована черга:

- виправити й перевірити `0.3.15`;
- `0.3.16` — final closed-alpha closeout;
- `0.4.0` — rewardless/dev party-vs-many proof;
- `0.4.1` — ability/AI/item/repair/settlement hardening;
- `0.4.2` — мала ґільдія: identity/roles/invites, без банку й power;
- `0.4.3` — перша production party expedition;
- `0.4.4` — optional guild weekly goal;
- `0.4.5`–`0.4.11` — явне повернення Старого жертовника, greeting buff,
  Shynok food, carried consumables, resale listings і bounded recycling;
- `0.4.12` — cosmetic guild progression лише після даних.

## Що всередині

- `analysis/` — висновки, evidence, старі обіцянки, блокери й release cutline;
- `repo-files/` — готові запропоновані repo-документи й задачі до `0.4.12`;
- `reference-tasks/` — старі незмінені drafts, з яких активовано social/economy
  catch-up, щоб архів був самодостатнім;
- `PATCH.diff` — patch-first інтеграція цих документів;
- `prompts/` — англомовні skill-based промпти, один файл на один Codex thread;
- `MANIFEST.md` — склад, база й правила застосування;
- `CHECKS.md` — що саме перевірено й чого не заявлено.

Почати варто з `analysis/executive-summary-uk.md`, потім
`analysis/pr-179-release-blockers.md` і `analysis/recommended-sequence.md`.
Для виправлення старих promises окремо прочитайте
`analysis/social-economy-catchup.md`.

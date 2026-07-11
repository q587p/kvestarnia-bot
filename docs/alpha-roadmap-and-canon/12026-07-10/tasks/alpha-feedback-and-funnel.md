# Task: Alpha feedback and funnel foundation

## Outcome

Отримувати privacy-safe evidence про onboarding, повернення та social loops без зовнішнього analytics vendor і без reward incentives за feedback.

## Slice A: Feedback inbox MVP

- Добровільна команда/дія для короткого текстового feedback.
- Ясна privacy copy: що зберігається і хто читає.
- Server-owned record, timestamps, status і admin-only list/export.
- Rate limit та abuse-safe length/content handling.
- No XP, achievements, gold або public feed.
- Data deletion path, retention і operator runbook.

## Slice B: Aggregate funnel

Мінімальні milestones:

- onboarding complete;
- first quest, fight і item interaction;
- level 3/5/13;
- D1/D7 return;
- duel invite/accept/rematch;
- raid create/join/complete;
- daily round;
- Charkokovalnia unlock/attempt;
- tournament participation.

Звіти мають бути агрегованими; low-cardinality сегменти приховувати або об’єднувати. Не логувати message bodies чи raw Telegram IDs у performance/product logs.

## Acceptance

- [ ] Event names/schema/versioning документовані.
- [ ] Подвійний callback не дублює milestone.
- [ ] Feedback можна видалити за user request.
- [ ] Admin access і export не доступні звичайному гравцеві.
- [ ] Є weekly snapshot із denominators і sample sizes.
- [ ] Product decision містить metric/evidence, а не лише інтуїцію.

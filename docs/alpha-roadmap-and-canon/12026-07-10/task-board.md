# Пріоритетна дошка задач

Це планова дошка, а не твердження про production deploy. Статуси означають стан роботи в цьому пакеті.

## Статуси

- **У роботі** — робота вже відкрита/поточна.
- **Наступна** — готова до активації після залежностей.
- **Умовна** — створюється лише за evidence.
- **Заблокована gate-ом** — потрібні exit criteria або окреме рішення.
- **Пізніше** — горизонт наступних місяців, не поточний implementation scope.

## Ролі-власники

- **Maintainer / Product** — остаточні продукт, scope, production і rollout рішення.
- **Main Codex** — реалізація однієї versioned task.
- **Review Codex** — незалежний read-only deep/default review.
- **QA / Playtester** — локальний і live Telegram evidence.
- **Ops** — deploy config, performance sampling, backup/restore та incident runbooks.
- **Game & Balance** — формули, симуляції, economy і взаємодія ролей.
- **Content / UX** — український текст, сайт, onboarding і content packs.

## Поточна черга

| ID | Пріоритет | Статус | Горизонт | Задача | Запропонований власник | Залежності | Acceptance evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `A01` | P0 | У роботі | зараз | `0.3.6 Bureaucramancer Personal Protocol` | Main Codex + Maintainer | актуальний `main` | Focused/full checks; replay/concurrency tests; task criteria |
| `A02` | P0 | Наступна | зараз | Deep review `0.3.6` і fixes before merge | Review Codex + Main Codex | `A01` reviewable diff | Немає відкритих blocker/important findings; ризикові fixes у тій самій роботі |
| `A03` | P0 | Наступна | 1–3 дні | `0.3.x` critical Telegram smoke | QA / Playtester | reviewable або merged `A01`; test env | Заповнений короткий smoke record із pass/fail/evidence |
| `A04` | P0 | Наступна | 1–3 дні | Current-state/canon reconciliation | Maintainer + Content/UX | стабільний scope `A01` | README/product/roadmap/tasks/balance/context узгоджені; link check |
| `A05` | P0 | Наступна | 1–3 дні | Production feature maturity matrix | Maintainer + Ops | доступ до sanitized config | Для кожної flagged feature є implemented/default/prod/QA status без секретів |
| `A06` | P0 | Наступна | 1–3 дні | Backup and restore proof | Ops + Maintainer | фактичний storage target | Runbook, backup record, restore на окремій копії, owner/date |
| `A07` | P0 | Наступна | 1–3 дні | Post-`0.3.5` performance sample | Ops + Main Codex | perf config; representative use | Sample set і ranking DB/compute/Telegram/rows |
| `A08` | P1 | Умовна | 4–10 днів | Measured Alpha Reliability Fix | Main Codex + Review Codex | findings із `A02`, `A03` або `A07` | Один root cause, regression test, before/after evidence |
| `A09` | P1 | Наступна | 4–10 днів | Feedback Inbox MVP | Maintainer + Main Codex | privacy/scope decision | Durable feedback, admin-only bounded read, no gameplay reward |
| `A10` | P1 | Наступна | 4–10 днів | Public Front Door Refresh | Content/UX + Main Codex | `A04`, `A05` | Site truthfully описує current/default/flagged state; CTA/channel/mobile tests |
| `A11` | P1 | Наступна | 2–4 тижні | Alpha Funnel Snapshot | Product + Main Codex | event definitions; privacy review | Aggregate activation/D1/D7/social report, no personal rows |
| `A12` | P1 | Наступна | 2–4 тижні | Economy Health Snapshot | Game & Balance + Main Codex | stable source/sink taxonomy | Gold/Iskrokamin/medical/upgrade/tournament aggregate report |
| `A13` | P1 | Заблокована gate-ом | 2–6 тижнів | Controlled tester waves | Maintainer + QA + Ops | `A03`, `A06`, `A07`, `A09` | Wave note, monitored period, triaged blocker/friction list |
| `A14` | P1 | Заблокована gate-ом | 4–6 тижнів | `0.3.x` closeout | Maintainer + Review Codex | exit checklist | Signed exit checklist, known risks, next-line decision |

## `0.4.x` і далі

| ID | Пріоритет | Статус | Горизонт | Задача | Запропонований власник | Залежності | Acceptance evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `B01` | P1 | Заблокована gate-ом | 2-й місяць | Raid Role Interaction Contract | Game & Balance + Main Codex | `A14`; usage evidence | Interaction matrix, characterization tests, simulations |
| `B02` | P1 | Пізніше | 2-й місяць | Warrior Raid Taunt | Game & Balance + Main Codex | `B01` | Single/multi-Warrior sims; ward/protocol ordering; deep review |
| `B03` | P2 | Умовна | 2–3-й місяць | Big Barrel Targetable Adds **або** Second Group Objective | Product + Game & Balance | `B01`; raid usage | Один вибраний напрям, single-encounter reward proof |
| `B04` | P2 | Пізніше | 3-й місяць | Party History and Regrouping | Product + Main Codex | repeat-party evidence | Consent-safe bounded recent-party flow, no location leak |
| `B05` | P2 | Пізніше | 3-й місяць | Rogue Heat and Rumor design | Product + Game & Balance | feedback/usage | Повний risk/use/recovery/remort loop до schema task |
| `C01` | P2 | Пізніше | 3–4-й місяць | Bestiary Collection MVP | Product + Main Codex | combat/retention evidence | Proven records only, private default, no power reward |
| `C02` | P2 | Заблокована gate-ом | 3–4-й місяць | Old Altar Gold-only MVP | Game & Balance + Main Codex | `A12` | Bounded sink/favor/blessing, no item offering |
| `C03` | P2 | Пізніше | 3–4-й місяць | Consumable Use Audit | Content/UX + Game & Balance | inventory evidence | Catalog of usable/flavor/misleading rows; one follow-up slice selected |
| `C04` | P2 | Заблокована gate-ом | 4-й місяць | Season Zero | Product + Content/UX | alpha stability; content capacity | One theme, bounded dates/rewards, post-season report plan |
| `C05` | P3 | Заблокована gate-ом | після 4-го місяця | Guild discovery decision | Product | `B04`; repeat-party metrics | Written go/no-go; moderation and shared-reward risks addressed |

## Правило вибору наступної задачі

1. Спочатку найвищий незакритий P0.
2. Умовна задача активується лише з посиланням на evidence.
3. Якщо `0.3.6` знаходить ризикову проблему у своєму scope, виправлення відбувається до merge, а не після відкриття нового feature thread.
4. Нову versioned task створювати лише після перевірки актуальної версії `main`.
5. Одночасно може бути одна основна runtime version task; docs-only або read-only review можуть іти паралельно, якщо не створюють конкуруючих edits.

Machine-readable version: [`task-board.json`](task-board.json).

# Старі задачі й ідеї: traceability

## Нумеровані релізи

Забутої нумерованої задачі немає: `0.0.x`, `0.1.x`, `0.2.0`–`0.2.32` і
`0.3.0`–`0.3.14` мають changelog/task/history evidence.

## Shipped, але в старих docs іноді ще «future»

| Ідея | Реалізація |
| --- | --- |
| Multi-enemy solo | `0.2.1`, production escalation `0.2.3` |
| Temporary party | `0.2.15` |
| Party vs one boss | `0.2.16` |
| Big Barrel group boss | `0.2.17` |
| Achievements/titles | `0.2.8`, `0.2.10` |
| Daily Korchma rounds | `0.2.9` |
| Lore/Chronicles | `0.2.18`, `0.2.20` |
| Tavern games/dice poker | `0.2.21`, `0.2.27` |
| Equipment expansion | `0.2.23`–`0.2.30` |
| Duel tournaments/journal | `0.3.1` |
| Quest overview | `0.3.4` |
| HP recovery queue | PR `#159`; rollout unresolved |

## In flight

- `0.3.15` Raid Chat, draft PR `#179`: head `e223073a` закрив основні CAS/rejoin/
  failure-class знахідки; idle polling, graceful stop, callback throttle,
  403/real-network classification і manual Telegram QA лишаються, flag default-off.

## Superseded drafts

Старі `0.2.x-*` drafts для Daily rounds, dense bandage, dice poker, equipment,
party foundation, party-vs-one, Lore Board, Bard MVP, Varenyk Sated тощо вже
мають shipped task. Їх слід архівувати й не запускати verbatim.

Fuller Big Barrel draft не є повністю «мертвим»: це post-MVP content/reward input,
але не generic group-combat architecture.

## Справді deferred

- party-vs-many;
- guild membership/roles/invites, weekly goal і cosmetic XP;
- contribution-aware broader raid rewards;
- feedback/admin/product telemetry tail;
- Rogue reputation/location risk;
- collections і wider Hunt/Єгер;
- altar/greeting/food/consumables/resale;
- item instances, two-sided trade/market;
- seasons, guild wars, Mini App.

## Старий architecture debt, який треба памʼятати

`docs/tasks/0.2.x-combat-application-decomposition.md` містив умовний gate:
декомпозувати, коли start/turn/timeout/settlement не можна незалежно ревʼювати,
transaction ownership нечіткий або focused tests тягнуть майже весь service.

Не треба запускати цей старий task перед `0.4.0`. Треба виконати його ключове
рішення: generic group workflow не йде в `FightService`; вузький shared facade
виділяється лише якщо вертикальний proof реально цього потребує.

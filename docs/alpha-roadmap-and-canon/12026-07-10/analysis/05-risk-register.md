# Реєстр ризиків

| ID | Пріоритет | Ризик | Імовірність / вплив | Ранній сигнал | Дія | Exit evidence |
|---|---|---|---|---|---|---|
| R-01 | P0 | Manual QA debt приховує player-visible regression | висока / висока | релізи мають «not run» | виконати current critical smoke | dated checklist, actor setup, results, defects |
| R-02 | P0 | Docs canon веде Codex до shipped/superseded задач | висока / висока | старі version guards і broken raw paths | current-state reconciliation + archive prompts | CI paths/status checks, короткий context |
| R-03 | P0 | Втрата production SQLite або невідновний backup | середня / критична | немає restore evidence | daily off-instance backup, retention, monthly drill | successful restore+migrate+smoke, RPO/RTO |
| R-04 | P0 | False-green deploy: сайт живий, bot не готовий | середня / висока | `/health` не перевіряє config/DB/bot | liveness `/health`, readiness `/ready` | missing token/DB failure yields not-ready |
| R-05 | P0 | Поточний реліз має scope creep і interaction regressions | середня / висока | одна гілка містить feature + balance/copy fixes | freeze scope, block-by-block review, multi-actor QA | review log, green check, Telegram evidence |
| R-06 | P1 | Performance work обирається без live evidence | висока / середня | менше 20 samples | зібрати p50/p95/slow і DB-vs-Telegram breakdown | sanitized evidence report and chosen bottleneck |
| R-07 | P1 | Equipment attunement due scan росте з історією | висока / висока з ростом | scheduler lag, scan depth | indexed due-state або bounded checkpoint | oldest-due fairness and restart/replay tests |
| R-08 | P1 | Passage search має unbounded/stuck due rows | середня / висока | due count/age росте | default batch cap, canonical resolution before delivery | cap, missing-target, crash-window tests |
| R-09 | P1 | Achievement evaluation виконує багато історичних queries | висока / середня | high DB span on common events | event-specific aggregates/probes | query-count and behavior regression tests |
| R-10 | P1 | Duel/tournament reads завантажують зайві 31-day records | середня / середня | route p95 і row count ростуть | index, narrow projection, remove duplicate reads | query plan/route measurements and tests |
| R-11 | P1 | Production perf logs містять raw Telegram user id | середня / висока | identifier у structured log | omit або stable pseudonymization | log contract test, documented retention |
| R-12 | P1 | Site обіцяє неправильний maturity state | висока / середня | «майбутні рейди» поруч із shipped news | truthful feature maturity matrix | content tests and current site copy |
| R-13 | P1 | Dev-only vulnerable Vitest/Vite toolchain | середня / низька runtime | full audit reports 5 findings | separate safe upgrade, no production urgency | full audit clear or documented exception |
| R-14 | P1 | Scheduler stop не чекає inflight work | середня / середня | disconnect errors/data replay on shutdown | incremental async drain | shutdown test with inflight job |
| R-15 | P2 | `/news` sync read і unbounded archive ростуть | висока / низька зараз | response size/latency ростуть | cache parsed news, bound/paginate archive | response-size and archive tests |
| R-16 | P2 | PostgreSQL migration відволікає без виміряної потреби | середня / середня | architecture work без contention evidence | визначити triggers, лишити SQLite до них | written thresholds and observed trigger |

## Правило ескалації

P0 блокує ширше запрошення або наступну велику gameplay feature. P1 має owner і план у найближчому циклі, але не обов’язково блокує реліз, якщо ризик не торкається changed path. P2 залишається backlog із вимірюваним trigger.

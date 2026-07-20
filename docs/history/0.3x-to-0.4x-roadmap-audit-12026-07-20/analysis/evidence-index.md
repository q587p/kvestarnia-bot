# Evidence index

Line numbers refer to refreshed PR head
`e223073a65b96a293ca40ed8e6f14e4bef1b930d` and may move. Initial findings were
made on `af56de0d…`; the delta was re-audited.

| Finding | Primary evidence |
| --- | --- |
| 1.1s idle scheduler | `src/bot/partyRaidChatDeliveryScheduler.ts:16,54,71–73` |
| CAS-aware render ack (hardened) | `src/db/repositories/prismaPartyRaidChatRepository.ts:436+` |
| Expected revision/reference redaction ack (hardened) | `src/db/repositories/prismaPartyRaidChatRepository.ts:480+` |
| Transition-unique same-life join key (hardened) | `src/db/repositories/prismaPartySessionRepository.ts:424+` |
| Leave key has joinedAt generation | `src/db/repositories/prismaPartySessionRepository.ts:554` |
| Scheduler tests still lack idle cadence/stop proof | `tests/bot/partyRaidChatDeliveryScheduler.test.ts` |
| Synchronous non-draining stop | `src/bot/partyRaidChatDeliveryScheduler.ts:28,48–61`; `src/app/createRuntime.ts:97–114` |
| Callback answer remains in message gate | `src/bot/commands/partyRaidChatCommand.ts:236–240` |
| 403 edit not classified permanent | `src/bot/partySessionDeliveryCoordinator.ts:21–30` and raid-chat scheduler edit/redact catches |
| Real grammY network message not matched | `src/bot/partyRaidChatDeliveryScheduler.ts` send classifier; grammY `HttpError` shape |
| Restart/remort combat-safe whitelist | `src/bot/middleware/registerCombatLockMiddleware.ts:62,164–188,264–268` |
| Restart directly deletes | `src/services/restartService.ts:8–10`; `src/db/repositories/prismaCharacterRepository.ts:51+` |
| Remort cancels whole PartyBoss | `src/db/repositories/prismaRemortRepository.ts:483,545+` |
| Normal release handles Sated+Inspiration | `src/db/repositories/prismaPartyBossRepository.ts:1811+` |
| PartyBoss parser/status | `src/db/repositories/prismaPartyBossRepository.ts:2009,2019` |
| Full PartyBoss include reused broadly | `src/db/repositories/prismaPartyBossRepository.ts:141` and call sites |
| PartyBoss applies separate gear support only | `src/domain/partyBoss/partyBoss.ts:547,1186+` |
| Remort resource rollback test | `tests/db/prismaRemortRepository.integration.test.ts:866+` |
| Roadmap called 0.2 current | old `docs/product/roadmap.md:99,130–134` |
| Technical plan called groups future | old `docs/architecture/technical-plan.md:322–359` |
| Game design called group activity later | old `docs/design/game-design.md:530–551` |
| Rollout flags default off | `.env.example` and `src/config/env.ts` party/raid/chat/games/recovery/onboarding keys |

Other evidence sources:

- `CHANGELOG.md` and version task docs for shipped traceability;
- `docs/operations/playtesting.md` and feature QA files for pending manual state;
- Prisma schema relations/cascades for restart risk;
- repository metrics (`wc -l`) for application-service growth;
- live GitHub PR/issue metadata refreshed during audit.

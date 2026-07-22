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
| Old Altar is documentation-mature | `docs/tasks/archive/0.2.x-old-altar-blessings-mvp.md`; `docs/design/old-altar-blessings.md`; balance/copy/QA/prompt siblings |
| Priest stat bonus is not canonical in combat summaries | explicit apply helper in `heroService`, class-noncombat and Mantok Chest; plain `summarizeCharacter(...)` at `fightService.ts:1240,1688,2147`, training, duel and party paths |
| Greeting effect is undecided | four alternative directions in `docs/tasks/archive/0.2.x-nearby-greeting-buff.md` |
| Food cap docs conflict | one-active wording in `docs/design/game-design.md:214–215`; up-to-five wording in `docs/balance/notes.md:211–224` and backlog |
| Basic Shynok sale already shipped | `docs/tasks/0.1.24-shynok-drinks-and-mantok-sales.md`; technical plan 42% rounded-up contract |
| Resale threshold draft conflicts | `>= 93` and `> 93` both appear in `docs/tasks/archive/0.2.x-shynok-resale-and-korchmar-recycling.md` |
| Stack model can support bounded first slices | current sale/gift/use/chest/barter/upgrade reservation + fingerprint patterns; no per-copy mutable properties promised |
| Current ItemUseOrder is HP-heal-specific | `src/content/schema.ts:100–109`; `src/domain/itemUse.ts:6–18,60–102`; repository result/presenter unions |
| Food cannot reuse drink row safely | one-row `CharacterDrinkState` in `prisma/schema.prisma:438–456`; a separate food-owned status is required |
| Priest status/remort gap | `NoncombatPriestBlessing` storage lacks current-life predicate and current remort cleanup does not terminate the active row/wait |

Other evidence sources:

- `CHANGELOG.md` and version task docs for shipped traceability;
- `docs/operations/playtesting.md` and feature QA files for pending manual state;
- Prisma schema relations/cascades for restart risk;
- repository metrics (`wc -l`) for application-service growth;
- live GitHub PR/issue metadata refreshed during audit.

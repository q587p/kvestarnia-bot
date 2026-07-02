# Latest Events Feed — design

## Product goal

Add a tavern-readable recent-events surface for Kvestarnia:

```text
📣 Останні події
📜 Хроніки Квестарні
```

The feed should make the world feel alive, help players discover what others are doing, and create screenshot-worthy social proof without becoming a raw audit log.

This is a Telegram-first social surface. It should fit one mobile screen, support buttons, and never require players to read a manual.

## Naming and language

- Player-facing name: `Квестарня`.
- Technical slug / file slug: `kvestarnia` / `latest-events-feed`.
- Player-facing row title: `📜 Хроніки Квестарні`.
- Entry point button: `📣 Останні події`.
- Codex-facing implementation notes stay English; in-game copy examples stay Ukrainian.

## MVP decision

Implement a structured activity ledger and a Telegram feed renderer.

MVP event types:

| Event type | Category | Severity | Why it belongs |
| --- | --- | --- | --- |
| `character.created` | `adventurer` | `normal` | New players make the tavern feel alive. |
| `character.level_reached` | `progression` | `normal` / `high` at milestones | Level-ups are the simplest shared progress signal. |
| `party.raid_won` | `raid` | `high` / `legendary` | Group victory is the strongest social proof. |
| `item.rare_received` | `manatky` | `high` for `rare`, `legendary` for `epic` | Current item schema has rarity, so this is implementable now. |
| `combat.underdog_won` | `combat` | `high` | A win over a monster at least 5 levels stronger is a story, not routine combat. |

Deferred event types:

| Event type | Status | Reason |
| --- | --- | --- |
| `item.upgraded` | deferred unless current `main` has item upgrade mechanics | Do not invent upgrade state only for the feed. |
| `item.overlevel_received` | deferred unless current `main` has item level / required level | Current item content has rarity and effects, not required-level fields. |
| `achievement.unlocked` | not MVP | Existing achievements are rewardless and numerous; forwarding all unlocks would be noisy. |
| `combat.death` / `combat.lost` | not MVP | Avoid public shame unless a future opt-in design exists. |
| `guild.*` / market / crafting | not MVP | Do not promise broad MMO systems in this slice. |

## Feed shape

Default view:

```text
📜 Хроніки Квестарні

Сьогодні
👋 14:23 | Новий пригодник у Квестарні: Арден!
🎉 13:56 | You®4ik бере 7 рівень!
🏆 12:42 | Ватага: перемога. Ціль — «Старший Брат Бочки». У протоколі: 5 пригодників.
🎒 12:18 | Мудрий: рідкісна манатка — «Пляшка Пінного Міражу».
🛡️ 11:07 | Пандочка: перемога. Монстр — «Огрище», перевага рівнів: +6.

Вчора
🎉 23:36 | Val'gert бере 4 рівень!
```

Buttons:

```text
[⭐ Важливе] [👥 Пригодники]
[⚔️ Бої] [🎒 Манатки]
[🔄 Оновити] [Далі ➡️]
[⬅️ До дошки]
```

Empty state:

```text
📜 Хроніки Квестарні

Поки що тихо. Літописець гріє чорнило, Корчмар — підозри.
```

## Row rules

Rows should be neutral about dynamic names to avoid Ukrainian gender/case problems:

- Prefer `Арден бере 7 рівень!` over `Арден досяг/досягла 7 рівня!` unless the renderer deliberately uses character pronouns.
- Prefer `Арден: рідкісна манатка — «...».` over genitive forms like `у Ардена`, because arbitrary player names may not decline safely.
- Use `«»` for item and monster names in Ukrainian copy.
- Escape all dynamic names for Telegram HTML.
- Truncate long player, item and monster names before rendering.
- Replace empty, invisible or suspicious display names with a safe fallback such as `Пригодник без таблички`.

## Data model proposal

Add a Prisma model similar to:

```prisma
model ActivityEvent {
  id                  String   @id @default(uuid())
  eventType           String   @map("event_type")
  category            String
  severity            String
  visibility          String   @default("public")
  actorCharacterId    String?  @map("actor_character_id")
  actorDisplayName    String?  @map("actor_display_name")
  relatedCharacterIds Json?    @map("related_character_ids_json")
  subjectKind         String?  @map("subject_kind")
  subjectId           String?  @map("subject_id")
  subjectName         String?  @map("subject_name")
  sourceType          String?  @map("source_type")
  sourceId            String?  @map("source_id")
  dedupeKey           String?  @unique @map("dedupe_key")
  payloadJson         Json?    @map("payload_json")
  occurredAt          DateTime @map("occurred_at")
  publishedAt         DateTime? @map("published_at")
  createdAt           DateTime @default(now()) @map("created_at")

  @@index([visibility, occurredAt])
  @@index([category, occurredAt])
  @@index([severity, occurredAt])
  @@index([actorCharacterId, occurredAt])
  @@map("activity_events")
}
```

Notes:

- Use string enums/consts in TypeScript to match existing repository style.
- `dedupeKey` should be unique when present. SQLite allows multiple `NULL` values in a unique column, which fits optional dedupe keys.
- Store structured payload, not only rendered text, so filters and future personal/guild/season feeds can reuse the same data.
- Keep event rows public-only in the MVP. Private/admin events can be schema-ready but should not surface until designed.

## Service and repository design

Recommended files:

- `src/db/repositories/activityEventRepository.ts`
- `src/db/repositories/prismaActivityEventRepository.ts`
- `src/services/activityEventService.ts`
- `src/bot/presenters/latestEventsPresenter.ts`
- `src/bot/callbacks/latestEventsCallbackData.ts`
- `src/bot/keyboards/latestEventsKeyboard.ts` if keyboards are split that way
- tests mirroring those layers

Service API sketch:

```ts
export type ActivityEventInput = {
  eventType: ActivityEventType;
  category: ActivityEventCategory;
  severity: ActivityEventSeverity;
  visibility?: "public";
  actorCharacterId?: string;
  actorDisplayName?: string;
  relatedCharacterIds?: string[];
  subjectKind?: string;
  subjectId?: string;
  subjectName?: string;
  sourceType?: string;
  sourceId?: string;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
  occurredAt: Date;
};

class ActivityEventService {
  record(input: ActivityEventInput): Promise<ActivityEventRecord>;
  recordSafely(input: ActivityEventInput): Promise<ActivityEventRecord | null>;
  listRecent(query: ActivityEventQuery): Promise<ActivityEventPage>;
}
```

`recordSafely` must not break the primary gameplay action. If activity logging fails, the player should still receive their level, reward, item, raid settlement or combat result.

## Dedupe keys

Use terminal source ids:

| Event | Dedupe key |
| --- | --- |
| Character creation | `character.created:<characterId>` |
| Level reached | `character.level_reached:<characterId>:<level>` |
| Group raid victory | `party.raid_won:<partyBossSessionId>` |
| Rare item received | `item.rare_received:<sourceType>:<sourceId>:<characterId>:<itemId>` |
| Underdog combat win | `combat.underdog_won:<combatSessionId>` |

If the source id is not stable, do not emit a public event until a stable source can be found.

## Event thresholds

Initial thresholds:

```yaml
latestEvents:
  pageSize: 15
  retentionDays: 93
  filters:
    default: [normal, high, legendary]
    important: [high, legendary]
  levels:
    publicMinLevel: 2
    milestoneLevels: [5, 10, 13]
  combat:
    underdogLevelDelta: 5
  manatky:
    publicRarities: [rare, epic]
    legendaryRarities: [epic]
  raids:
    firstServerWinSeverity: legendary
    ordinaryWinSeverity: high
```

Do not expose hidden odds, exact future rewards or unreleased mechanics in player-facing pre-commit choices. The feed describes events after they happen.

## Emission points

Codex should inspect current `main` and use actual services/handlers. Expected starting points from the current repository shape:

- character creation flow that already triggers `AchievementEvent` type `character.created`;
- level-up/reward settlement that already triggers `level.reached` achievements;
- combat settlement and/or `CombatBalanceBattle` recording for `combat.underdog_won`;
- `PartyBossSession` terminal settlement for `party.raid_won`;
- item receipt/equipment paths that already trigger `item.received` / `equipment.item_equipped` achievements.

Do not emit duplicate activity rows from both a service and an achievement hook unless the dedupe key proves idempotency.

## Telegram routing

Recommended callback prefix: `v1:ev:*`.

Keep callback data under Telegram's 64-byte limit. A compact shape is enough:

```text
v1:ev:l:<filter>:<cursor>
v1:ev:r:<filter>:<cursor>
```

Where:

- `filter` is one short token: `all`, `imp`, `adv`, `cmb`, `itm`;
- `cursor` is empty or an opaque short cursor derived from `occurredAt + id`.

The first MVP may use page numbers if the existing codebase prefers them, but repository APIs should stay cursor-ready because event feeds change while players browse.

## Filters

| Filter | Button | Query |
| --- | --- | --- |
| all | default | public normal/high/legendary events |
| important | `⭐ Важливе` | high/legendary |
| adventurers | `👥 Пригодники` | character created + level reached |
| combat | `⚔️ Бої` | raid + underdog combat |
| manatky | `🎒 Манатки` | rare item and future item events |

## Retention and performance

- Render only a bounded page, default 15 rows.
- Query public events by `occurredAt desc` with indexes.
- MVP can retain 93 days if there is no cleanup job pattern yet; if an existing scheduled-job pattern exists, add a narrow cleanup for old public events.
- Do not perform expensive joins for every row. Store snapshot display fields at event time.

## Privacy and safety

- Never store or display raw Telegram ids in public rows.
- Do not show exact private locations unless that location is already part of a public game surface.
- Do not publish losses, deaths, failed raids or low progress in MVP.
- Do not use the feed as moderation/admin audit.
- Do not turn a private achievement recalculation into public spam.
- If a future opt-out setting is added, keep it explicit and documented.

## Relationship to achievements

Kvestarnia already has a rewardless achievement system. The activity feed should not become a second achievement system.

Recommended rule:

- achievements record durable personal milestones;
- latest events record public tavern-worthy moments;
- some source events may feed both systems;
- activity rows grant no XP, gold, items, combat power, title power or hidden progress.

## Auto-announcements

Not MVP by default.

A future slice may auto-post only `legendary` events to a configured group/channel, but it needs a chat-level opt-in, flood protection and moderator controls. Do not add unsolicited broadcasts in this slice unless the user explicitly asks.

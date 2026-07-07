import { describe, expect, it } from "vitest";
import type {
  ActivityEventPage,
  ActivityEventRecord,
  ActivityEventRepository,
  ListRecentActivityEventsQuery,
  RecordActivityEventInput
} from "../../src/db/repositories/activityEventRepository";
import { achievements } from "../../src/content";
import { BIG_BARREL_BROTHER_BOSS_KEY, BIG_BARREL_BROTHER_RULES_VERSION } from "../../src/domain/partyBoss/partyBoss";
import { ActivityEventService } from "../../src/services/activityEventService";
import {
  LATEST_EVENTS_IMPORTANT_UNDERDOG_LEVEL_DELTA,
  LATEST_EVENTS_MILESTONE_LEVELS,
  PublicActivityEventPublisher
} from "../../src/services/publicActivityEventPublisher";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";

describe("ActivityEventService", () => {
  it("records and dedupes public activity rows", async () => {
    const repository = new FakeActivityEventRepository();
    const service = new ActivityEventService(repository);
    const input = {
      eventType: "character.created" as const,
      category: "adventurer" as const,
      severity: "normal" as const,
      actorCharacterId: "character-1",
      actorDisplayName: "Арден",
      dedupeKey: "character.created:character-1",
      occurredAt: new Date("2026-07-02T10:00:00.000Z")
    };

    const first = await service.record(input);
    const second = await service.record(input);

    expect(first.id).toBe(second.id);
    expect(repository.rows).toHaveLength(1);
  });

  it("recordSafely catches logging failures", async () => {
    const repository = new FakeActivityEventRepository();
    repository.failNext = true;
    const service = new ActivityEventService(repository);

    await expect(service.recordSafely({
      eventType: "character.created",
      category: "adventurer",
      severity: "normal",
      dedupeKey: "character.created:broken",
      occurredAt: new Date("2026-07-02T10:00:00.000Z")
    })).resolves.toBeNull();
  });

  it("publisher keeps source-fact emission best-effort", async () => {
    const repository = new FakeActivityEventRepository();
    repository.failNext = true;
    const publisher = makePublicActivityEventPublisher(repository);

    await expect(publisher.recordCharacterCreatedSafely({
      characterId: "character-broken",
      actorDisplayName: "Арден",
      occurredAt: new Date("2026-07-02T10:00:00.000Z")
    })).resolves.toBeNull();
    expect(repository.rows).toHaveLength(0);
  });

  it("emits configured level and rare item rows without common-item noise", async () => {
    const repository = new FakeActivityEventRepository();
    const publisher = makePublicActivityEventPublisher(repository);

    await publisher.recordRewardEventsSafely({
      characterId: "character-1",
      actorDisplayName: "Мудрий",
      sourceId: "daily-1",
      sourceType: "daily-action",
      occurredAt: new Date("2026-07-02T10:00:00.000Z"),
      levelChange: { oldLevel: 1, newLevel: 5, leveledUp: true },
      remortCount: 4,
      itemIds: [
        "item.pan-of-persuasion",
        "item.towel-of-forty-two-answers",
        "item.loot-v1-w029"
      ]
    });

    expect(repository.rows.map((row) => row.eventType)).toEqual([
      "character.level_reached",
      "item.rare_received",
      "item.rare_received"
    ]);
    expect(repository.rows[0]).toMatchObject({
      severity: "high",
      dedupeKey: "character.level_reached:character-1:5:4",
      payload: { level: 5, remortCount: 4 }
    });
    expect(repository.rows[1]).toMatchObject({
      subjectId: "item.towel-of-forty-two-answers",
      severity: "normal"
    });
    expect(repository.rows[2]).toMatchObject({
      subjectId: "item.loot-v1-w029",
      severity: "legendary"
    });
  });

  it("marks level 8 as an important visible achievement milestone", async () => {
    const repository = new FakeActivityEventRepository();
    const publisher = makePublicActivityEventPublisher(repository);

    await publisher.recordRewardEventsSafely({
      characterId: "character-1",
      actorDisplayName: "Рейдовий Завсідник",
      sourceId: "daily-8",
      sourceType: "daily-action",
      occurredAt: new Date("2026-07-02T10:00:00.000Z"),
      levelChange: { oldLevel: 7, newLevel: 8, leveledUp: true },
      remortCount: 0
    });

    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0]).toMatchObject({
      eventType: "character.level_reached",
      severity: "high",
      dedupeKey: "character.level_reached:character-1:8:0",
      payload: { level: 8, remortCount: 0 }
    });
  });

  it("keeps important level milestones backed by enabled visible level achievements", () => {
    const visibleAchievementLevels = achievements.flatMap((achievement) => {
      if (achievement.status !== "enabled" || achievement.hidden || achievement.trigger.type !== "level.reached") {
        return [];
      }

      return typeof achievement.trigger.threshold === "number" ? [achievement.trigger.threshold] : [];
    });

    expect(visibleAchievementLevels).toEqual([2, 3, 5, 8, 10, 13]);
    expect(LATEST_EVENTS_MILESTONE_LEVELS.every((level) => visibleAchievementLevels.includes(level))).toBe(true);
  });

  it("emits underdog wins from +5 but marks only +8 and above as important", async () => {
    const repository = new FakeActivityEventRepository();
    const publisher = makePublicActivityEventPublisher(repository);
    const occurredAt = new Date("2026-07-02T10:00:00.000Z");

    await publisher.recordUnderdogCombatWinSafely({
      characterId: "character-1",
      actorDisplayName: "Пандочка",
      combatSessionId: "combat-ordinary",
      monsterId: "monster-a",
      monsterName: "Огрище",
      monsterLevel: 6,
      characterLevel: 2,
      occurredAt
    });
    await publisher.recordUnderdogCombatWinSafely({
      characterId: "character-1",
      actorDisplayName: "Пандочка",
      combatSessionId: "combat-underdog-7",
      monsterId: "monster-b",
      monsterName: "Огрище",
      monsterLevel: 9,
      characterLevel: 2,
      occurredAt
    });
    await publisher.recordUnderdogCombatWinSafely({
      characterId: "character-1",
      actorDisplayName: "Пандочка",
      combatSessionId: "combat-underdog-8",
      monsterId: "monster-c",
      monsterName: "Огрище",
      monsterLevel: 10,
      characterLevel: 2,
      occurredAt
    });

    expect(repository.rows).toHaveLength(2);
    expect(repository.rows[0]).toMatchObject({
      eventType: "combat.underdog_won",
      severity: "normal",
      dedupeKey: "combat.underdog_won:combat-underdog-7",
      payload: { levelDelta: 7 }
    });
    expect(repository.rows[1]).toMatchObject({
      eventType: "combat.underdog_won",
      severity: "high",
      dedupeKey: "combat.underdog_won:combat-underdog-8",
      payload: { levelDelta: 8 }
    });
  });

  it("skips underdog wins below the public feed threshold", async () => {
    const repository = new FakeActivityEventRepository();
    const publisher = makePublicActivityEventPublisher(repository);

    await publisher.recordUnderdogCombatWinSafely({
      characterId: "character-1",
      actorDisplayName: "Пандочка",
      combatSessionId: "combat-ordinary",
      monsterId: "monster-a",
      monsterName: "Огрище",
      monsterLevel: 7,
      characterLevel: 3,
      occurredAt: new Date("2026-07-02T10:00:00.000Z")
    });

    expect(repository.rows).toHaveLength(0);
  });

  it("emits Big Barrel Brother raid completion rows for wins and losses", async () => {
    const repository = new FakeActivityEventRepository();
    const publisher = makePublicActivityEventPublisher(repository);
    const wonSession = makeBigBarrelSession("won", "boss-session-won");
    const lostSession = makeBigBarrelSession("lost", "boss-session-lost");

    await publisher.recordPartyRaidCompletedSafely(wonSession);
    await publisher.recordPartyRaidCompletedSafely(wonSession);
    await publisher.recordPartyRaidCompletedSafely(lostSession);

    expect(repository.rows).toHaveLength(2);
    expect(repository.rows[0]).toMatchObject({
      eventType: "raid.completed",
      severity: "high",
      dedupeKey: "raid.completed:party-boss:boss-session-won",
      subjectName: "Старший Брат Бочки",
      payload: { mode: "group", outcome: "won", participantCount: 2 }
    });
    expect(repository.rows[1]).toMatchObject({
      eventType: "raid.completed",
      severity: "normal",
      dedupeKey: "raid.completed:party-boss:boss-session-lost",
      payload: { mode: "group", outcome: "lost", participantCount: 2 }
    });
  });

  it("emits solo raid completions as normal raid rows", async () => {
    const repository = new FakeActivityEventRepository();
    const publisher = makePublicActivityEventPublisher(repository);

    await publisher.recordSoloRaidCompletedSafely({
      characterId: "character-1",
      actorDisplayName: "Арден",
      raidId: "barrel-period-1",
      raidName: "Бочка Пінного Міражу",
      outcome: "won",
      occurredAt: new Date("2026-07-02T10:00:00.000Z")
    });

    expect(repository.rows).toHaveLength(1);
    expect(repository.rows[0]).toMatchObject({
      eventType: "raid.completed",
      category: "raid",
      severity: "normal",
      actorCharacterId: "character-1",
      actorDisplayName: "Арден",
      dedupeKey: "raid.completed:solo:character-1:barrel-period-1",
      payload: { mode: "solo", outcome: "won", participantCount: 1 }
    });
  });

  it("maps list filters to bounded repository queries", async () => {
    const repository = new FakeActivityEventRepository();
    const service = new ActivityEventService(repository);

    await service.listRecent("cmb", { page: 2 });

    expect(repository.lastQuery).toMatchObject({
      categories: ["combat", "raid"],
      page: 2,
      pageSize: 15,
      retentionDays: 93
    });
  });

  it("keeps rare manatky out of the important latest-events filter", async () => {
    const repository = new FakeActivityEventRepository();
    const service = new ActivityEventService(repository);

    await service.listRecent("imp");

    expect(repository.lastQuery).toMatchObject({
      severities: ["high", "legendary"],
      excludeRareManatky: true,
      minimumUnderdogLevelDelta: LATEST_EVENTS_IMPORTANT_UNDERDOG_LEVEL_DELTA,
      pageSize: 15,
      retentionDays: 93
    });
  });
});

function makePublicActivityEventPublisher(repository: ActivityEventRepository): PublicActivityEventPublisher {
  return new PublicActivityEventPublisher(new ActivityEventService(repository));
}

class FakeActivityEventRepository implements ActivityEventRepository {
  rows: ActivityEventRecord[] = [];
  failNext = false;
  lastQuery: ListRecentActivityEventsQuery | null = null;

  record(input: RecordActivityEventInput): Promise<ActivityEventRecord> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("boom");
    }

    const existing = input.dedupeKey
      ? this.rows.find((row) => row.dedupeKey === input.dedupeKey)
      : null;
    if (existing) {
      return Promise.resolve(existing);
    }

    const record: ActivityEventRecord = {
      id: `event-${this.rows.length + 1}`,
      eventType: input.eventType,
      category: input.category,
      severity: input.severity,
      visibility: input.visibility ?? "public",
      actorCharacterId: input.actorCharacterId ?? null,
      actorDisplayName: input.actorDisplayName ?? null,
      relatedCharacterIds: input.relatedCharacterIds ? [...input.relatedCharacterIds] : null,
      subjectKind: input.subjectKind ?? null,
      subjectId: input.subjectId ?? null,
      subjectName: input.subjectName ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      payload: input.payload ?? null,
      occurredAt: input.occurredAt,
      publishedAt: input.publishedAt ?? null,
      createdAt: input.occurredAt
    };
    this.rows.push(record);
    return Promise.resolve(record);
  }

  listRecent(query: ListRecentActivityEventsQuery = {}): Promise<ActivityEventPage> {
    this.lastQuery = query;
    return Promise.resolve({
      events: this.rows,
      page: query.page ?? 0,
      pageSize: query.pageSize ?? 15,
      hasNextPage: false
    });
  }
}

function makeBigBarrelSession(status: "won" | "lost", id = "boss-session-1"): PartyBossSessionRecord {
  const now = new Date("2026-07-02T10:00:00.000Z");

  return {
    id,
    partySessionId: "party-session-1",
    partyInviteToken: "party-token",
    leaderCharacterId: "character-1",
    status,
    turn: 3,
    version: 1,
    rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
    bossKey: BIG_BARREL_BROTHER_BOSS_KEY,
    state: {
      rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
      partySessionId: "party-session-1",
      status,
      turn: 3,
      boss: {
        monsterId: BIG_BARREL_BROTHER_BOSS_KEY,
        name: "Старший Брат Бочки",
        level: 8,
        hp: status === "won" ? 0 : 10,
        hpMax: 10,
        attack: 10,
        armor: 2,
        resist: 1,
        dexterity: 8,
        tags: ["boss", "barrel"]
      },
      participants: [
        makeParticipant("character-1", "Арден"),
        makeParticipant("character-2", "Мудрий")
      ],
      roundLog: [],
      startedAt: now.toISOString(),
      completedAt: now.toISOString()
    },
    result: {
      status,
      completedAt: now.toISOString(),
      bossHpAfter: status === "won" ? 0 : 10,
      participants: []
    },
    turnExpiresAt: now,
    completedAt: now,
    participants: []
  };
}

function makeParticipant(characterId: string, name: string) {
  return {
    characterId,
    name,
    remortCount: 0,
    status: "active" as const,
    combatStats: {
      level: 8,
      hpMax: 30,
      manaMax: 10,
      raceId: "race.human-ish",
      classId: "class.warrior",
      strength: 5,
      agility: 5,
      intelligence: 5,
      charisma: 5,
      luck: 5,
      armor: 1,
      resist: 1,
      weaponDamage: 2,
      spellPower: 1
    },
    resources: { hp: 10, hpMax: 30, mana: 5, manaMax: 10 },
    contribution: {
      submittedActions: 1,
      timeoutActions: 0,
      damageDealt: 10,
      damageTaken: 0
    }
  };
}

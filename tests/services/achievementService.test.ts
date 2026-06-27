import { describe, expect, it } from "vitest";
import type {
  AchievementRepository,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterAchievementSnapshot,
  UnlockAchievementInput,
  UnlockAchievementResult
} from "../../src/db/repositories/achievementRepository";
import { AchievementService } from "../../src/services/achievementService";

describe("AchievementService", () => {
  it("unlocks character creation once and grants cosmetic title provenance", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const event = {
      type: "character.created" as const,
      characterId: "character-1",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "character-1"
    };

    const first = await service.trackEvent(event);
    const second = await service.trackEvent(event);

    expect(first.map((unlock) => unlock.id)).toEqual(["achievement.character.created"]);
    expect(second).toEqual([]);
    expect(repo.snapshot.achievements).toHaveLength(1);
    expect(repo.snapshot.titleGrants).toMatchObject([
      {
        titleGrantId: "cosmetic-title.first-ink",
        achievementId: "achievement.character.created",
        sourceType: "character.created",
        sourceId: "character-1"
      }
    ]);
  });

  it("keeps level progress monotonic and unlocks thresholds once", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    await service.trackEvent({
      type: "level.reached",
      characterId: "character-1",
      level: 4,
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "daily-1"
    });
    await service.trackEvent({
      type: "level.reached",
      characterId: "character-1",
      level: 2,
      occurredAt: new Date("2026-06-28T09:01:00.000Z"),
      sourceId: "daily-2"
    });
    const levelFive = await service.trackEvent({
      type: "level.reached",
      characterId: "character-1",
      level: 5,
      occurredAt: new Date("2026-06-28T09:02:00.000Z"),
      sourceId: "daily-3"
    });

    expect(repo.progressFor("achievement.level.3")?.current).toBe(3);
    expect(repo.progressFor("achievement.level.5")?.current).toBe(5);
    expect(levelFive.map((unlock) => unlock.id)).toEqual(["achievement.level.5"]);
  });

  it("ignores disabled definitions", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "combat.finished",
      characterId: "character-1",
      outcome: "expired",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "session-1"
    });

    expect(unlocks).toEqual([]);
  });

  it("lists earned, locked, hidden and unknown stored entries safely", async () => {
    const repo = new FakeAchievementRepository();
    repo.snapshot.achievements.push({
      id: "stored-unknown",
      characterId: "character-1",
      achievementId: "achievement.retired.example",
      sourceType: "test",
      sourceId: null,
      sourceJson: null,
      unlockedAt: new Date("2026-06-28T09:00:00.000Z"),
      notifiedAt: null,
      createdAt: new Date("2026-06-28T09:00:00.000Z")
    });
    const service = new AchievementService(repo);

    const firstPage = await service.listForCharacter("character-1");
    const secondPage = await service.listForCharacter("character-1", 1);

    expect(secondPage.entries.some((entry) => entry.earned && entry.unknownStored)).toBe(true);
    const hiddenLocked = firstPage.entries.find((entry) => entry.id === "achievement.remort.first-memory");
    expect(hiddenLocked).toMatchObject({
      earned: false,
      title: "Таємна ачівка"
    });
    expect(hiddenLocked?.description).not.toContain("реморт");
  });
});

class FakeAchievementRepository implements AchievementRepository {
  snapshot: CharacterAchievementSnapshot = {
    achievements: [],
    progress: [],
    titleGrants: []
  };

  listForCharacter(): Promise<CharacterAchievementSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  unlockAchievement(input: UnlockAchievementInput): Promise<UnlockAchievementResult> {
    const existing = this.snapshot.achievements.find(
      (row) => row.characterId === input.characterId && row.achievementId === input.achievementId
    );

    if (existing) {
      return Promise.resolve({
        created: false,
        achievement: existing,
        titleGrant: input.cosmeticTitleGrantId
          ? this.snapshot.titleGrants.find((row) => row.titleGrantId === input.cosmeticTitleGrantId) ?? null
          : null
      });
    }

    const achievement: CharacterAchievementRecord = {
      id: `achievement-row-${this.snapshot.achievements.length + 1}`,
      characterId: input.characterId,
      achievementId: input.achievementId,
      sourceType: input.source.type,
      sourceId: input.source.id ?? null,
      sourceJson: null,
      unlockedAt: input.source.occurredAt,
      notifiedAt: null,
      createdAt: input.source.occurredAt
    };
    this.snapshot.achievements.push(achievement);

    const titleGrant = input.cosmeticTitleGrantId
      ? {
          id: `title-row-${this.snapshot.titleGrants.length + 1}`,
          characterId: input.characterId,
          titleGrantId: input.cosmeticTitleGrantId,
          achievementId: input.achievementId,
          sourceType: input.source.type,
          sourceId: input.source.id ?? null,
          grantedAt: input.source.occurredAt,
          createdAt: input.source.occurredAt
        }
      : null;

    if (titleGrant) {
      this.snapshot.titleGrants.push(titleGrant);
    }

    return Promise.resolve({ created: true, achievement, titleGrant });
  }

  updateProgressMax(input: {
    characterId: string;
    achievementId: string;
    current: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord> {
    const existing = this.progressFor(input.achievementId);

    if (existing && existing.current >= input.current) {
      return Promise.resolve(existing);
    }

    const row = existing ?? {
      id: `progress-row-${this.snapshot.progress.length + 1}`,
      characterId: input.characterId,
      achievementId: input.achievementId,
      current: 0,
      target: input.target ?? null,
      updatedAt: new Date("2026-06-28T09:00:00.000Z"),
      createdAt: new Date("2026-06-28T09:00:00.000Z")
    };
    row.current = input.current;
    row.target = input.target ?? row.target;

    if (!existing) {
      this.snapshot.progress.push(row);
    }

    return Promise.resolve(row);
  }

  progressFor(achievementId: string): CharacterAchievementProgressRecord | undefined {
    return this.snapshot.progress.find((row) => row.achievementId === achievementId);
  }
}

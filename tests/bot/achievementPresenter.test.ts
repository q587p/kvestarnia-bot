import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  presentAchievementUnlockNotification,
  presentAchievements
} from "../../src/bot/presenters/achievementPresenter";
import type { AchievementListView } from "../../src/services/achievementService";

describe("achievement presenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders earned, locked and hidden achievements without hidden criteria", () => {
    const text = presentAchievements({
      entries: [
        {
          id: "achievement.character.created",
          title: "Де тут вихід?",
          description: "створити пригодника.",
          category: "onboarding",
          hidden: false,
          earned: true,
          unlockedAt: new Date("2026-06-28T09:00:00.000Z"),
          progressCurrent: null,
          progressTarget: null,
          cosmeticTitleGrantId: "cosmetic-title.first-ink",
          unknownStored: false
        },
        {
          id: "achievement.level.5",
          title: "Палиця вже не випадкова",
          description: "досягти 5 рівня.",
          category: "level",
          hidden: false,
          earned: false,
          unlockedAt: null,
          progressCurrent: 3,
          progressTarget: 5,
          cosmeticTitleGrantId: "cosmetic-title.level-five-stick",
          unknownStored: false
        },
        {
          id: "achievement.remort.first-memory",
          title: "Таємна ачівка",
          description: "Умова прихована, бо літописець хихоче.",
          category: "weird",
          hidden: true,
          earned: false,
          unlockedAt: null,
          progressCurrent: null,
          progressTarget: null,
          cosmeticTitleGrantId: null,
          unknownStored: false
        }
      ],
      earnedCount: 1,
      totalCount: 3,
      page: 0,
      totalPages: 1
    } satisfies AchievementListView);

    expect(text).toContain("Отримано: <b>1/3</b>");
    expect(text).toContain("✅ <b>Де тут вихід?</b>");
    expect(text).toContain("титульний запис");
    expect(text).toContain("🔒 <b>Палиця вже не випадкова</b>");
    expect(text).toContain("3/5");
    expect(text).toContain("❔ <b>Таємна ачівка</b> — Умова прихована");
    expect(text).not.toContain("реморт");
  });

  it("groups several unlock notifications", () => {
    const text = presentAchievementUnlockNotification([
      {
        id: "achievement.level.3",
        title: "Перший поверх амбіцій",
        cosmeticTitleGrantId: "cosmetic-title.level-three-witness",
        unlockedAt: new Date()
      },
      {
        id: "achievement.item.first-received",
        title: "Манатка дивиться першою",
        cosmeticTitleGrantId: "cosmetic-title.first-mantok-witness",
        unlockedAt: new Date()
      }
    ]);

    expect(text).toContain("Нові ачівки: 2");
    expect(text).toContain("✅ Перший поверх амбіцій");
    expect(text).toContain("✅ Манатка дивиться першою");
  });
});

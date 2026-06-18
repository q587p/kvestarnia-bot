import { describe, expect, it } from "vitest";
import {
  presentYegerCorner,
  presentYegerHelp,
  presentYegerHuntOutside,
  presentYegerQuest,
  presentYegerStart,
  presentYegerTrackingNone,
  presentYegerTrackingPending,
  presentYegerTrackingStart,
  presentYegerTurnIn
} from "../../src/bot/presenters/yegerPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("Yeger presenter", () => {
  it("shows the offered quest without unsafe HTML", () => {
    const text = presentYegerQuest({
      state: "offered",
      character: {
        ...character,
        name: "<b>Мандрівник</b>",
        title: "Титул <i>підступу</i>"
      },
      progress: { wins: 0, target: 5 }
    });

    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>");
    expect(text).toContain("🧥 Єгерський куток");
    expect(text).toContain("У темному кутку сидить людисько-єгер у капюшоні");
    expect(text).toContain("Єгер:\n<blockquote>");
    expect(text).toContain("</blockquote>");
    expect(text).toContain("Доступна справа:");
    expect(text).toContain("<b>Неспокійні справи</b>");
    expect(text).not.toContain("<b>Мандрівник</b>");
  });

  it("renders progress and turn-in copy", () => {
    const text = presentYegerQuest({
      state: "turn-in-ready",
      character,
      progress: { wins: 5, target: 5 }
    });

    expect(text).toContain("Прогрес: <b>5/5</b>.");
    expect(text).toContain("🧥 Єгерський куток");
    expect(text).toContain("Єгер має вираз обличчя");
  });

  it("renders completed reward as separate lines", () => {
    const text = presentYegerTurnIn({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
      },
      levelChange: {
        oldLevel: 4,
        newLevel: 4,
        leveledUp: false
      }
    });

    expect(text).toContain("Нагорода:");
    expect(text).toContain("<b>+80 XP\n+120 золота</b>");
    expect(text).toContain("Здобуто: <i>Єгерська риска на дощечці</i>");
  });

  it("does not leak item ids when replaying a completed turn-in", () => {
    const text = presentYegerTurnIn({
      state: "already-completed",
      character,
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }],
        itemReplayUnavailable: true
      },
      levelChange: null
    });

    expect(text).toContain("Здобуто: <i>Єгерська риска на дощечці</i>");
    expect(text).not.toContain("Сувенір уже шукайте");
    expect(text).not.toContain("item.yeger.first-notch");
    expect(text).not.toContain("item.");
  });

  it("keeps completed quest details out of the base Yeger corner", () => {
    const text = presentYegerCorner({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }],
        itemReplayUnavailable: true
      }
    });

    expect(text).toContain("🧥 Єгерський куток");
    expect(text).toContain("Єгер:\n<blockquote>");
    expect(text).toContain("Неспокійні справи закрито.");
    expect(text).not.toContain("Нагорода:");
    expect(text).not.toContain("Здобуто:");
  });

  it("explains start and target help", () => {
    expect(
      presentYegerStart({
        state: "in-progress",
        character,
        progress: { wins: 0, target: 5 },
        tracking: { state: "none" }
      })
    ).toContain("дозвіл на прогрес");
    expect(presentYegerHelp()).toContain("Втеча, поразка й протермінований бій");
  });

  it("uses biography-aware ranger corner reactions", () => {
    const text = presentYegerQuest({
      state: "offered",
      character: {
        ...character,
        raceId: "race.domovyk",
        raceName: "Домовик"
      },
      progress: { wins: 0, target: 5 }
    });

    expect(text).toContain("На мить я подумав про гобітів");
    expect(text).toContain("Єгер:\n<blockquote>На мить я подумав про гобітів");
    expect(text).toContain("Доступна справа:");
  });

  it("uses title-aware corner reactions", () => {
    const text = presentYegerQuest({
      state: "offered",
      character: {
        ...character,
        raceId: "race.domovyk",
        raceName: "Домовик",
        title: "Завідувачі Чужої Полиці"
      },
      progress: { wins: 0, target: 5 }
    });

    expect(text).toContain("Єгер:\n<blockquote>Завідувачі полиць рідко губляться.");
    expect(text).not.toContain("На мить я подумав про гобітів");
  });

  it("shows compact quest context before tracking combat", () => {
    const text = presentYegerTrackingStart({
      yegerProgress: { wins: 1, target: 5 },
      thirteenProgress: {
        stageId: "13",
        title: "Тринадцять дрібних проблем",
        wins: 2,
        target: 13,
        completed: false,
        rewardClaimed: false,
        issued: true,
        branchComplete: false
      }
    });

    expect(text).toContain("👣 Ви виходите на слід.");
    expect(text).toContain("Поруч із цим боєм:");
    expect(text).toContain("<b>Неспокійні справи</b>: <b>1/5</b>");
    expect(text).toContain("<b>Тринадцять дрібних проблем</b>: <b>2/13</b>");
    expect(text).not.toContain("відповідні журнали");
    expect(text).not.toContain("⚔️ Бій");
  });

  it("does not repeat already completed side quest context before Yeger combat", () => {
    const text = presentYegerTrackingStart({
      yegerProgress: { wins: 0, target: 5 },
      thirteenProgress: {
        stageId: "13",
        title: "Тринадцять дрібних проблем",
        wins: 13,
        target: 13,
        completed: true,
        rewardClaimed: true,
        issued: true,
        branchComplete: false
      }
    });

    expect(text).toContain("<b>Неспокійні справи</b>: <b>0/5</b> рисок.");
    expect(text).not.toContain("Тринадцять дрібних проблем");
    expect(text).not.toContain("ветеран паперової війни");
  });

  it("shows pending and ready tracking status without formulas", () => {
    const pendingQuest = presentYegerQuest({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: {
        state: "tracking-pending",
        availableAt: new Date("2026-06-15T10:08:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });
    const readyQuest = presentYegerQuest({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: {
        state: "tracking-ready",
        availableAt: new Date("2026-06-15T10:04:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    expect(pendingQuest).toContain("Слід шукається.");
    expect(pendingQuest).toContain("приблизно за 3 хв.");
    expect(readyQuest).toContain("Слід уже чекає перевірки.");
    expect(pendingQuest).not.toContain("65%");
  });

  it("renders the outdoor hunt surface without Yeger-corner actions", () => {
    const text = presentYegerHuntOutside({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: { state: "none" }
    });

    expect(text).toContain("🚪 Надворі біля корчми");
    expect(text).toContain("Єгер лишився біля Бочки");
    expect(text).toContain("Можна взяти новий слід");
    expect(text).not.toContain("Кого шукати?");
    expect(text).not.toContain("Здати Єгерю");
  });

  it("renders tracking start and empty resolution messages", () => {
    const tracking = {
      state: "tracking-pending" as const,
      availableAt: new Date("2026-06-15T10:08:00.000Z"),
      now: new Date("2026-06-15T10:05:00.000Z")
    };
    const started = presentYegerTrackingPending({
      state: "tracking-started",
      character,
      progress: { wins: 1, target: 5 },
      tracking
    });
    const empty = presentYegerTrackingNone({
      state: "tracking-resolved-none",
      character,
      progress: { wins: 1, target: 5 },
      tracking,
      outcome: "near-miss"
    });

    expect(started).toContain("👣 Слід узято.");
    expect(started).toContain("приблизно за 3 хв.");
    expect(empty).toContain("🔎 Слід перевірено.");
    expect(empty).toContain("Неупокоєне сьогодні не знайшлося.");
  });
});

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 4,
  xp: 70,
  nextLevelXp: 110,
  xpToNextLevel: 40,
  gold: 0,
  hpCurrent: 24,
  hpMax: 24,
  manaCurrent: 12,
  manaMax: 12,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
};

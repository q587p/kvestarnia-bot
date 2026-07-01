import { describe, expect, it } from "vitest";
import {
  presentYegerBandages,
  presentYegerBandageBuy,
  presentYegerCorner,
  presentYegerHelp,
  presentYegerHuntOutside,
  presentYegerQuest,
  presentYegerRangerBandage,
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

    expect(text).not.toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).not.toContain("Титул &lt;i&gt;підступу&lt;/i&gt;");
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
        xp: 35,
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
    expect(text).toContain("<b>+35 XP\n+120 золота</b>");
    expect(text).toContain("Здобуто: <i>Єгерська риска на дощечці</i>");
    expect(text).toContain(
      "Здобуто: <i>Єгерська риска на дощечці</i>\n\nВідкрито: Єгер перестав вдавати, що ящик із бинтами є частиною меблів."
    );
    expect(text).toContain("«Неспокійні справи 2.0»");
  });

  it("renames the second Yeger board and previews future advanced supplies", () => {
    const text = presentYegerQuest({
      state: "offered",
      character,
      progress: { wins: 0, target: 17, stageId: "second" }
    });

    expect(text).toContain("<b>Неспокійні справи 2.0</b>");
    expect(text).toContain("наступні 17 неупокоєних проблем");
    expect(text).toContain("щільних бинтів і польової аптечки");
    expect(text).not.toContain("<b>Неспокійні справи</b>\n\nПерша дощечка закрита");
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

  it("renders the bandages submenu without quest details", () => {
    const text = presentYegerBandages({
      state: "completed",
      character: {
        ...character,
        classId: "class.ranger"
      },
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
      }
    });

    expect(text).toContain("🩹 Бинти Єгеря");
    expect(text).toContain("Платні пачки лежать окремо");
    expect(text).toContain("Для єгерів тут є ще один професійний бинт.");
    expect(text).not.toContain("Нагорода:");
    expect(text).not.toContain("Здобуто:");
  });

  it("distinguishes available and cooldown ranger bandage submenu copy", () => {
    const available = presentYegerBandages({
      state: "completed",
      character: {
        ...character,
        classId: "class.ranger"
      },
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: []
      },
      rangerBandage: {
        state: "available"
      }
    });
    const cooldown = presentYegerBandages({
      state: "completed",
      character: {
        ...character,
        classId: "class.ranger"
      },
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: []
      },
      rangerBandage: {
        state: "on-cooldown",
        nextAvailableAt: new Date("2026-06-15T11:38:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    expect(available).toContain("Для єгерів тут є ще один професійний бинт.");
    expect(cooldown).toContain("Професійний бинт для єгерів зараз перевʼязує власну важливість.");
    expect(cooldown).toContain("Повернеться пізніше.");
    expect(cooldown).not.toContain("Він безкоштовний");
    expect(cooldown).not.toBe(available);
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

  it("uses the second Yeger board name in tracking context", () => {
    const text = presentYegerTrackingStart({
      yegerProgress: { wins: 3, target: 17 },
      thirteenProgress: null
    });

    expect(text).toContain("<b>Неспокійні справи 2.0</b>: <b>3/17</b>");
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

  it("does not render accidental double periods after approximate wait times", () => {
    const tracking = {
      state: "tracking-pending" as const,
      availableAt: new Date("2026-06-15T11:38:00.000Z"),
      now: new Date("2026-06-15T10:05:00.000Z")
    };
    const messages = [
      presentYegerTrackingPending({
        state: "tracking-started",
        character,
        progress: { wins: 1, target: 5 },
        tracking
      }),
      presentYegerTrackingNone({
        state: "tracking-resolved-none",
        character,
        progress: { wins: 1, target: 5 },
        tracking,
        outcome: "none"
      }),
      presentYegerRangerBandage({
        state: "claimed",
        character,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", name: "Бинт відповідальної паніки", quantity: 1 }],
        nextAvailableAt: tracking.availableAt,
        now: tracking.now
      }),
      presentYegerRangerBandage({
        state: "on-cooldown",
        character,
        nextAvailableAt: tracking.availableAt,
        now: tracking.now
      })
    ];

    for (const message of messages) {
      expect(message).toContain("приблизно за 93 хв.");
      expect(message).not.toContain("хв..");
      expect(message).not.toContain("..");
      expect(message).not.toContain("...");
    }
  });

  it("renders paid bandage bundle copy with the daily cap and current gold", () => {
    const text = presentYegerBandageBuy({
      state: "preview",
      character: { ...character, gold: 700 },
      token: "123e4567-e89b-42d3-a456-426614174000",
      targetQuantity: 93,
      purchaseQuantity: 88,
      purchasedToday: 5,
      dailyLimit: 93,
      priceGold: 616,
      unitPriceGold: 7,
      currentGold: 700,
      itemGrants: [{ itemId: "item.responsible-panic-bandage", name: "Бинт відповідальної паніки", quantity: 88 }],
      expiresAt: new Date("2026-06-15T10:28:00.000Z"),
      now: new Date("2026-06-15T10:05:00.000Z")
    });

    expect(text).toContain("🩹 Купити бинти");
    expect(text).toContain("Планка на сьогодні: <b>93</b>. Уже куплено: <b>5</b>.");
    expect(text).toContain("Єгер докладе: <b>88</b>.");
    expect(text).toContain("Після купівлі: <i>Бинт відповідальної паніки ×88</i>.");
    expect(text).not.toContain("Здобуто:");
    expect(text).toContain("Ціна: <b>616 золота</b>.");
    expect(text).toContain("У вас: <b>700 золота</b>.");
    expect(text).toContain("ящик першої підозрілої допомоги");
  });

  it("renders the paid bandage daily cap state", () => {
    const capped = presentYegerBandageBuy({
      state: "daily-limit",
      character,
      purchasedToday: 93,
      dailyLimit: 93
    });

    expect(capped).toContain("Сьогодні куплено: <b>93/93</b>.");
    expect(capped).toContain("Бинти теж мають робочий день");
  });

  it("renders an affordable paid bandage fallback after insufficient gold", () => {
    const text = presentYegerBandageBuy({
      state: "insufficient-gold",
      character: { ...character, gold: 20 },
      requiredGold: 119,
      affordablePreview: {
        token: "123e4567-e89b-42d3-a456-426614174000",
        purchaseQuantity: 2,
        purchasedToday: 0,
        dailyLimit: 93,
        priceGold: 14,
        unitPriceGold: 7,
        currentGold: 20,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", name: "Бинт відповідальної паніки", quantity: 2 }],
        expiresAt: new Date("2026-06-15T10:28:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    expect(text).toContain("Єгер показує ціну: <b>119 золота</b>.");
    expect(text).toContain("гаманець ще дихає на <b>2</b> бинти");
    expect(text).toContain("Це буде <b>14 золота</b>. У вас: <b>20 золота</b>.");
    expect(text).toContain("Купити стільки, на скільки вистачає?");
  });

  it("mentions the ranger discount in the affordable paid bandage fallback", () => {
    const text = presentYegerBandageBuy({
      state: "insufficient-gold",
      character: { ...character, classId: "class.ranger", gold: 20 },
      requiredGold: 68,
      affordablePreview: {
        token: "123e4567-e89b-42d3-a456-426614174000",
        purchaseQuantity: 5,
        purchasedToday: 0,
        dailyLimit: 93,
        priceGold: 20,
        unitPriceGold: 4,
        currentGold: 20,
        itemGrants: [{ itemId: "item.responsible-panic-bandage", name: "Бинт відповідальної паніки", quantity: 5 }],
        expiresAt: new Date("2026-06-15T10:28:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    expect(text).toContain("гаманець ще дихає на <b>5</b> бинтів");
    expect(text).toContain("Єгерська знижка вже в ціні");
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

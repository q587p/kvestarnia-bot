import { describe, expect, it } from "vitest";
import {
  presentTavern,
  presentTavernAlreadyRaided,
  presentKorchmaHall,
  presentPendingRaidActionBlock,
  presentTavernRanger,
  presentTavernNoCharacter,
  presentTavernRaidAuditBreak,
  presentTavernRaidPending,
  presentTavernRaidReadyToComplete,
  presentTavernRaidResult,
  presentTavernRoundOffer,
  presentTavernRoundResult
} from "../../src/bot/presenters/tavernPresenter";
import type { TavernRaidResult } from "../../src/services/tavernRaidService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { PresenceGroup } from "../../src/services/presenceService";

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Герой",
  level: 1,
  xp: 7,
  nextLevelXp: 10,
  xpToNextLevel: 3,
  gold: 5,
  hpCurrent: 22,
  hpMax: 22,
  manaCurrent: 10,
  manaMax: 10,
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

describe("tavern presenter", () => {
  it("shows the korchma hall as the hub", () => {
    const text = presentKorchmaHall(character);

    expect(text).toContain("Зала корчми");
    expect(text).toContain("<b>Мандрівник</b> · <i>Пересічний Герой</i>");
    expect(text).toContain("Корчма Квестарні");
    expect(text).toContain(
      "без нагляду.\n\nПраворуч стоїть <i>Стіл зі справами</i>"
    );
    expect(text).toContain("<i>Бочка Пінного Міражу</i>");
    expect(text).toContain("<i>Підвал</i>");
    expect(text).toContain("<i>Дошка вістей</i>");
    expect(text).toContain("Залізо тримайте спокійно");
    expect(text).toContain("Куди йдемо?");
    expect(text).not.toContain("Таверна Квестарні");
  });

  it("says only-you only when the current player is the sole active person inside", () => {
    const text = presentKorchmaHall(
      character,
      {
        active: [{ telegramUserId: 42n, name: "Мандрівник", status: "active" }],
        idle: [],
        total: 1
      },
      42n
    );

    expect(text).toContain("За столами: поки тільки ви й підозрілий єгер у кутку біля бочки.");
  });

  it("summarizes all active and idle people inside the korchma", () => {
    const text = presentKorchmaHall(
      character,
      {
        active: [
          { telegramUserId: 42n, name: "Мандрівник", status: "active" },
          { telegramUserId: 77n, name: "Дара", status: "active", level: 2 }
        ],
        idle: [{ telegramUserId: 88n, name: "Нестор Межовий", status: "idle" }],
        total: 3
      },
      42n
    );

    expect(text).toContain("За столами й закутками корчми: 2 активні, 1 притихлий.");
    expect(text).toContain("Єгер у кутку біля бочки не рахується");
    expect(text).toContain("Дара · рівень 2");
    expect(text).toContain("Нестор Межовий");
    expect(text).not.toContain("поки тільки ви");
  });

  it("does not say only-you when the sole interior person is not the current player", () => {
    const presence: PresenceGroup = {
      active: [{ telegramUserId: 77n, name: "Дара", status: "active" }],
      idle: [],
      total: 1
    };

    const text = presentKorchmaHall(character, presence, 42n);

    expect(text).toContain("За столами й закутками корчми: 1 активний.");
    expect(text).toContain("Дара");
    expect(text).not.toContain("поки тільки ви");
  });

  it("shows a short Ukrainian tavern screen", () => {
    const text = presentTavern(character);

    expect(text).toContain("Біля Бочки Пінного Міражу");
    expect(text).toContain("Бочка Пінного Міражу");
    expect(text).toContain(
      "У кутку героїчно піниться Бочка Пінного Міражу.\n\nПоруч із нею сидить людисько-єгер у капюшоні"
    );
    expect(text).toContain(
      "Корчмар:\n<blockquote>Це не проблема. Дві-три хвилини. Максимум.</blockquote>"
    );
    expect(text).toContain("людисько-єгер у капюшоні");
    expect(text).toContain("<i>Порада дня:");
    expect(text).toContain("стояти між бочкою");
    expect(text).not.toContain("За столами:");
    expect(text).toContain("Що робимо?");
    expect(text.length).toBeLessThan(720);
  });

  it("keeps barrel screen focused on the barrel instead of table presence", () => {
    const text = presentTavern(character);

    expect(text).not.toContain("За столами:");
    expect(text).not.toContain("Дара");
    expect(text).not.toContain("Нестор");
    expect(text).toContain("Що робимо?");
  });

  it("escapes character names and titles in tavern scene headers", () => {
    const text = presentTavern({
      ...character,
      name: "<b>Мандрівник</b>",
      title: "<i>Пересічний Герой</i>"
    });

    expect(text).toContain(
      "<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b> · <i>&lt;i&gt;Пересічний Герой&lt;/i&gt;</i>"
    );
    expect(text).not.toContain("<b>Мандрівник</b>");
    expect(text).not.toContain("<i>Пересічний Герой</i>");
  });

  it("prompts /start when no character exists", () => {
    expect(presentTavernNoCharacter()).toContain("/start");
  });

  it("shows a different tavern screen after the current raid period is already done", () => {
    const text = presentTavernAlreadyRaided(character);

    expect(text).toContain("Бочка Пінного Міражу в цьому відтинку вже пережила ваш героїзм");
    expect(text).toContain("Єгер у капюшоні все ще сидить у кутку");
    expect(text).toContain("Лічильник клацне на 23-й хвилині");
    expect(text).not.toContain("За столами:");
    expect(text).toContain("/hero");
    expect(text).not.toContain("Дві-три хвилини. Максимум");
    expect(text).not.toContain("Що робимо?");
  });

  it("presents first completion and repeated completion without real drinking framing", () => {
    const completed: Exclude<TavernRaidResult, { state: "no-character" }> = {
      state: "completed",
      character,
      reward: {
        xp: 7,
        gold: 5,
        localDate: "2026-06-12",
        itemGrants: [
          {
            itemId: "item.wet-hero-ticket",
            name: "Квиток мокрого героя",
            quantity: 1
          }
        ]
      },
      levelChange: {
        oldLevel: 1,
        newLevel: 1,
        leveledUp: false
      }
    };
    const repeated = {
      ...completed,
      state: "already-completed" as const,
      levelChange: null
    };

    expect(presentTavernRaidResult(completed)).toContain("<b>+7 XP · +5 золота</b>");
    expect(presentTavernRaidResult(completed)).toContain(
      "Здобуто: <i>Квиток мокрого героя</i>"
    );
    expect(presentTavernRaidResult(completed)).not.toContain("×1");
    expect(presentTavernRaidResult(repeated)).toContain("уже зараховано");
    expect(presentTavernRaidResult(repeated)).toContain("23-й хвилині");
    expect(presentTavernRaidResult(repeated)).toContain(
      "Вже отримано: <b>+7 XP · +5 золота</b>"
    );
    expect(presentTavernRaidResult(repeated)).not.toContain("Здобуто:");
    expect(presentTavernRaidResult(completed).toLowerCase()).not.toContain("пий");
  });

  it("presents pending barrel raid without awarding rewards yet", () => {
    const pending: Exclude<TavernRaidResult, { state: "no-character" }> = {
      state: "pending-started",
      character,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:00.000Z"),
      periodId: "2026-06-13T10:23"
    };
    const text = presentTavernRaidPending(pending);

    expect(text).toContain("Рейд почався");
    expect(text).toContain("Єгер у капюшоні");
    expect(text).toContain("Поверніться через <b>8 хв.</b>");
    expect(text).not.toContain("хв..");
    expect(text).toContain("не видаю нових пригод");
    expect(text).not.toContain("+7 XP");
  });

  it("presents pending raid block for other activities", () => {
    const text = presentPendingRaidActionBlock({
      state: "pending",
      character,
      availableAt: new Date("2026-06-13T10:31:00.000Z"),
      now: new Date("2026-06-13T10:30:01.000Z"),
      periodId: "2026-06-13T10:23"
    });

    expect(text).toContain("Ви зараз у рейді");
    expect(text).toContain("Інші пригоди тимчасово недоступні");
    expect(text).toContain("Перевірте бочку через <b>1 хв.</b>");
    expect(text).not.toContain("за:");
    expect(text).not.toContain("хв..");
  });

  it("presents ready-to-complete barrel raid without exact timestamps", () => {
    const text = presentTavernRaidReadyToComplete({
      state: "pending-complete",
      character,
      availableAt: new Date("2026-06-13T10:31:00.000Z"),
      now: new Date("2026-06-13T10:32:00.000Z"),
      periodId: "2026-06-13T10:23"
    });

    expect(text).toContain("Бочка підозріло притихла");
    expect(text).toContain("Очікування <b>вже скінчилось</b>");
    expect(text).toContain("Натисніть <b>🍺 Перевірити бочку</b>.");
    expect(text).not.toContain("`🍺 Перевірити бочку`");
    expect(text).not.toContain("10:31");
  });

  it("presents early-morning barrel accounting break", () => {
    const text = presentTavernRaidAuditBreak({
      state: "audit-break",
      character,
      now: new Date("2026-06-13T04:30:00.000Z"),
      nextAvailableAt: new Date("2026-06-13T08:23:00.000Z")
    });

    expect(text).toContain("Бочка на переобліку");
    expect(text).toContain("04:00 до 08:23");
    expect(text).toContain("корчмар рахує піну");
    expect(text).toContain("через <b>233 хв.</b>");
  });

  it("keeps level-up out of the raid result message", () => {
    const completed: Exclude<TavernRaidResult, { state: "no-character" }> = {
      state: "completed",
      character,
      reward: {
        xp: 7,
        gold: 5,
        localDate: "2026-06-12",
        itemGrants: []
      },
      levelChange: {
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      }
    };

    expect(presentTavernRaidResult(completed)).not.toContain("Рівень підріс");
    expect(presentTavernRaidResult(completed)).not.toContain("Стало краще");
  });

  it("presents round states with gold spending humor", () => {
    expect(
      presentTavernRoundResult({
        state: "raid-required",
        character,
        leaderboard: emptyRoundLeaderboard
      })
    ).toContain("Спочатку розберіться з Бочкою");
    expect(
      presentTavernRoundResult({
        state: "not-enough-gold",
        character,
        gold: 5,
        leaderboard: emptyRoundLeaderboard
      })
    ).toContain("у підвалі миші ведуть дрібний бізнес");
    expect(
      presentTavernRoundResult({
        state: "simple-round",
        character: {
          ...character,
          gold: 2
        },
        spentGold: 10,
        remainingGold: 2,
        leaderboard: roundLeaderboard,
        becameLeader: []
      })
    ).toContain("Списано: <b>10 золота</b>");
    const fineRound = presentTavernRoundResult({
        state: "fine-round",
        character: {
          ...character,
          gold: 25
        },
        spentGold: 100,
        remainingGold: 25,
        leaderboard: roundLeaderboard,
        becameLeader: ["day", "week"]
      });
    expect(fineRound).toContain("Всім якісного пива");
    expect(fineRound).toContain("Єгер у кутку двічі плескає");
    expect(fineRound).toContain("Ви вирвались на перше місце");
    expect(fineRound).toContain("За добу");
    expect(fineRound).toContain("Мандрівник — 2 частування · 110 золота");
  });

  it("separates korchma round toast, action, and ranger reaction with blank lines", () => {
    const text = presentTavernRoundResult({
      state: "simple-round",
      character,
      spentGold: 10,
      remainingGold: 2,
      leaderboard: emptyRoundLeaderboard,
      becameLeader: []
    });

    expect(text).toContain(
      [
        "🍻 Всім простого пива!",
        "",
        "Корчмар виставив просте пиво. Воно просте тільки за ціною; характер у нього складний.",
        "",
        "Єгер у кутку мовчки піднімає кухоль. Підозріло, але ввічливо.",
        "",
        "Списано: <b>10 золота</b>"
      ].join("\n")
    );
  });

  it("escapes leaderboard names in tavern round results", () => {
    const text = presentTavernRoundResult({
      state: "simple-round",
      character,
      spentGold: 10,
      remainingGold: 2,
      leaderboard: {
        day: [
          {
            characterId: "character-unsafe",
            name: "<b>Дара</b>",
            roundCount: 1,
            spentGold: 10
          }
        ],
        week: [],
        month: []
      },
      becameLeader: []
    });

    expect(text).toContain("&lt;b&gt;Дара&lt;/b&gt; — 1 частування · 10 золота");
    expect(text).not.toContain("<b>Дара</b>");
  });

  it("presents a round offer before any gold is spent", () => {
    const text = presentTavernRoundOffer({
      state: "ready",
      character,
      gold: 125,
      canBuySimple: true,
      canBuyFine: true,
      leaderboard: roundLeaderboard
    });

    expect(text).toContain("покажіть, що саме наливаємо");
    expect(text).toContain("якісне за 100 золота");
    expect(text).toContain("просте за 10");
    expect(text).toContain("Рейтинг щедрості");
    expect(text).not.toContain("Списано");
  });

  it("presents the hooded ranger with biography-aware reactions", () => {
    const humanRanger = {
      ...character,
      classId: "class.ranger",
      className: "Єгер"
    };
    const domovyk = {
      ...character,
      raceId: "race.domovyk",
      raceName: "Домовик"
    };
    const rogue = {
      ...character,
      classId: "class.rogue",
      className: "Злодій"
    };

    expect(presentTavernRanger(humanRanger)).toContain("Людисько-єгер");
    expect(presentTavernRanger(domovyk)).toContain("ліцензійною магією");
    expect(presentTavernRanger(rogue)).toContain("Ваші руки надто чесно поводяться");
  });
});

const emptyRoundLeaderboard = {
  day: [],
  week: [],
  month: []
};

const roundLeaderboard = {
  day: [
    {
      characterId: "character-42",
      name: "Мандрівник",
      roundCount: 2,
      spentGold: 110
    }
  ],
  week: [
    {
      characterId: "character-42",
      name: "Мандрівник",
      roundCount: 2,
      spentGold: 110
    }
  ],
  month: [
    {
      characterId: "character-42",
      name: "Мандрівник",
      roundCount: 2,
      spentGold: 110
    }
  ]
};


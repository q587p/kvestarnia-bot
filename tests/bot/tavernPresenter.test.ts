import { describe, expect, it } from "vitest";
import {
  presentTavern,
  presentTavernAlreadyRaided,
  presentKorchmaArrivalBoard,
  presentKorchmaBar,
  presentDuelWinnersBoard,
  presentKorchmaDeepClosed,
  presentKorchmaFightingCorner,
  presentKorchmaFront,
  presentKorchmaHall,
  presentKorchmaMemorialBoard,
  presentPendingRaidActionBlock,
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
  title: "Пересічний Пригодник",
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
  it("formats the korchma name at the front door", () => {
    const text = presentKorchmaFront(character);

    expect(text).toContain("За дверима гуде <b>Корчма Квестарні</b>.");
    expect(text).not.toContain("Усередині вже чекають:");
    expect(text).not.toContain("<i>Стіл зі справами</i>");
    expect(text).not.toContain("<i>Шинок</i>");
    expect(text).not.toContain("<i>Бочка Пінного Міражу</i>");
    expect(text).not.toContain("<i>Льох</i>");
    expect(text).not.toContain("<i>Дошка вістей</i>");
    expect(text).toContain("<i>табличка прибулих</i>");
    expect(text).toContain("<i>пропамʼятна дошка</i>");
    expect(text).toContain("За дверима біля Бочки сидить <i>Єгер</i>");
    expect(text).toContain("сліди просить перевіряти надворі");
  });

  it("shows a front-door arrivals plaque with escaped visitor names", () => {
    const text = presentKorchmaArrivalBoard(character, {
      entries: [
        {
          telegramUserId: 77n,
          name: "<b>Дара</b>",
          level: 2,
          locationName: "Зала корчми"
        }
      ]
    });

    expect(text).toContain("Табличка прибулих");
    expect(text).toContain("Останні зарубки:");
    expect(text).toContain("&lt;b&gt;Дара&lt;/b&gt; · рівень 2 · Зала корчми");
    expect(text).not.toContain("Видатні жителі");
    expect(text).not.toContain("Перші зарубки за рівні:");
    expect(text).not.toContain("<b>Дара</b>");
  });

  it("shows a separate memorial board with escaped level firsts", () => {
    const text = presentKorchmaMemorialBoard(character, {
      levels: [
        {
          level: 4,
          entries: [
            {
              rank: 1,
              telegramUserId: 77n,
              characterId: "character-dara",
              name: "<b>Дара</b>",
              level: 4,
              reachedAt: new Date("2026-06-15T10:00:00.000Z")
            },
            {
              rank: 2,
              telegramUserId: 88n,
              characterId: "character-nestor",
              name: "Нестор Межовий",
              level: 4,
              reachedAt: new Date("2026-06-15T10:05:00.000Z")
            }
          ]
        }
      ]
    });

    expect(text).toContain("Пропамʼятна дошка");
    expect(text).toContain("Видатні жителі");
    expect(text).toContain("Перші зарубки за рівні:");
    expect(text).toContain("• рівень 4: 🥇 &lt;b&gt;Дара&lt;/b&gt; · 🥈 Нестор Межовий");
    expect(text).not.toContain("Останні зарубки:");
    expect(text).not.toContain("<b>Дара</b>");
  });

  it("shows the fighting corner as a choice screen instead of an immediate fight", () => {
    const text = presentKorchmaFightingCorner(character);

    expect(text).toContain("🥊 Бійцівський куток");
    expect(text).toContain("Тут не бʼються одразу");
    expect(text).toContain("Сумлінним Допельґанґером");
    expect(text).toContain("дружній виклик");
    expect(text).toContain("найпереконливіше махав честю");
  });

  it("shows the Nyz descent with its first surface copy", () => {
    const text = presentKorchmaDeepClosed(character);

    expect(text).toContain("🪜 Спуск до Низу");
    expect(text).toContain("За бочками в коморі є сходи.");
    expect(text).not.toContain("Ярус I: Сутерени Корчми");
  });

  it("shows duel winners for day week and month", () => {
    const text = presentDuelWinnersBoard(character, {
      day: [{ characterId: "character-1", name: "<b>Дара</b>", winCount: 2, drawCount: 1, lossCount: 5 }],
      week: [],
      month: [{ characterId: "character-2", name: "Нестор", winCount: 5, drawCount: 2, lossCount: 1 }]
    });

    expect(text).toContain("🏆 Переможці дуелей");
    expect(text).toContain("<b>За добу</b>:");
    expect(text).toContain("1. &lt;b&gt;Дара&lt;/b&gt; — 2 перемоги, 1 нічия, 5 поразок");
    expect(text).toContain("<b>За тиждень</b>: ще ніхто не переміг");
    expect(text).toContain("1. Нестор — 5 перемог, 2 нічиї, 1 поразка");
    expect(text).not.toContain("<b>Дара</b>");
  });

  it("uses Ukrainian count forms for duel board totals", () => {
    const text = presentDuelWinnersBoard(character, {
      day: [{ characterId: "character-1", name: "Дара", winCount: 11, drawCount: 12, lossCount: 14 }],
      week: [],
      month: []
    });

    expect(text).toContain("1. Дара — 11 перемог, 12 нічиїх, 14 поразок");
  });

  it("shows remort memorial board entries with escaped names", () => {
    const text = presentKorchmaMemorialBoard(
      character,
      { levels: [] },
      {
        remorts: [
          {
            remortNumber: 2,
            entries: [
              {
                rank: 1,
                characterId: "character-dara",
                name: "<b>Дара</b>",
                remortNumber: 2,
                reachedAt: new Date("2026-06-16T10:00:00.000Z")
              },
              {
                rank: 2,
                characterId: "character-nestor",
                name: "Нестор Межовий",
                remortNumber: 2,
                reachedAt: new Date("2026-06-16T10:05:00.000Z")
              },
              {
                rank: 3,
                characterId: "character-shannar",
                name: "Shannar de Kassal",
                remortNumber: 2,
                reachedAt: new Date("2026-06-16T10:10:00.000Z")
              },
              {
                rank: 4,
                characterId: "character-extra",
                name: "Зайвий Рядок",
                remortNumber: 2,
                reachedAt: new Date("2026-06-16T10:15:00.000Z")
              }
            ]
          }
        ]
      }
    );

    expect(text).toContain("🕯️ Реморти Тринадцятки");
    expect(text).toContain("• реморт 2: 🥇 &lt;b&gt;Дара&lt;/b&gt; · 🥈 Нестор Межовий · 🥉 Shannar de Kassal");
    expect(text).not.toContain("Зайвий Рядок");
    expect(text).not.toContain("<b>Дара</b>");
  });

  it("omits the remort group prefix while only first remorts exist", () => {
    const text = presentKorchmaMemorialBoard(
      character,
      { levels: [] },
      {
        remorts: [
          {
            remortNumber: 1,
            entries: [
              {
                rank: 1,
                characterId: "character-astery",
                name: "Astery Tey",
                remortNumber: 1,
                reachedAt: new Date("2026-06-16T10:00:00.000Z")
              }
            ]
          }
        ]
      }
    );

    expect(text).toContain("🕯️ Реморти Тринадцятки");
    expect(text).toContain("🥇 Astery Tey");
    expect(text).not.toContain("реморт 1:");
  });

  it("shows the korchma hall as the hub", () => {
    const text = presentKorchmaHall(character);

    expect(text).toContain("Зала корчми");
    expect(text).toContain("<b>Мандрівник</b> · <i>Пересічний Пригодник</i>");
    expect(text).toContain("Корчма Квестарні");
    expect(text).toContain("Ліворуч гупає <i>бійцівський куток</i>");
    expect(text).toContain("праворуч терпить життя <i>стіл зі справами</i>");
    expect(text).toContain("шумить <i>шинок</i>");
    expect(text).toContain("<i>Бочка Пінного Міражу</i>");
    expect(text).toContain("<i>спуск до Низу</i>");
    expect(text).toContain("<i>льох</i>");
    expect(text).toContain("<i>дошка вістей</i>");
    expect(text).toContain("<i>надвір</i>");
    expect(text).toContain("Корчмар:\n<blockquote>");
    expect(text).toContain("Куди йдемо?");
    expect(text).not.toContain("Таверна Квестарні");
    expect(text).not.toContain("запалилася свічка");
  });

  it("shows a personal remort candle in the korchma hall at level 13", () => {
    const text = presentKorchmaHall({ ...character, level: 13 });

    expect(text).toContain("На стійці запалилася свічка персонально для вас.");
    expect(text).toContain("тринадцятий рівень");
  });

  it("shows Шинок as the korchmar and beer location", () => {
    const text = presentKorchmaBar(character);

    expect(text).toContain("🍻 Шинок");
    expect(text).toContain("<i>Шинок</i>");
    expect(text).toContain("корчмаря");
    expect(text).toContain("частують пивом");
    expect(text).toContain("Що наливаємо?");
  });

  it("mentions available Шинок actions in the location text", () => {
    const take = presentKorchmaBar(character, { problemQuestAction: "take" });
    const turnIn = presentKorchmaBar(character, { problemQuestAction: "turn-in" });
    const next = presentKorchmaBar(character, { problemQuestAction: "next" });
    const bottle = presentKorchmaBar(character, { includeBottleTurnIn: true });

    expect(take).toContain("можна взяти як нову справу");
    expect(turnIn).toContain("готову справу можна здати просто тут");
    expect(next).toContain("Корчмар відкриє новий лічильник");
    expect(bottle).toContain("є місце для пляшки з льоху");
  });

  it("accepts a changing flavor seed for korchma hall greetings", () => {
    const text = presentKorchmaHall(character, null, undefined, {
      flavorSeed: "korchma-hall:test-seed"
    });

    expect(text).toContain("Корчмар:\n<blockquote>");
    expect(text).toContain("</blockquote>");
    expect(text).toContain("Куди йдемо?");
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

  it("summarizes active and idle counts inside the korchma without listing people", () => {
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
    expect(text).toContain("Підозрілий єгер у кутку біля бочки не рахується");
    expect(text).not.toContain("Дара");
    expect(text).not.toContain("Нестор Межовий");
    expect(text).not.toContain("рівень 2");
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
    expect(text).not.toContain("Дара");
    expect(text).not.toContain("поки тільки ви");
  });

  it("shows a short Ukrainian tavern screen", () => {
    const text = presentTavern(character);

    expect(text).toContain("Біля Бочки Пінного Міражу");
    expect(text).toContain("Бочка Пінного Міражу");
    expect(text).toContain("У кутку героїчно піниться Бочка Пінного Міражу.");
    expect(text).toContain(
      "Корчмар:\n<blockquote>Це не проблема. Дві-три хвилини. Максимум.</blockquote>"
    );
    expect(text).not.toContain("людисько-єгер у капюшоні");
    expect(text).not.toContain("<i>Порада дня:");
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
      title: "<i>Пересічний Пригодник</i>"
    });

    expect(text).toContain(
      "<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b> · <i>&lt;i&gt;Пересічний Пригодник&lt;/i&gt;</i>"
    );
    expect(text).not.toContain("<b>Мандрівник</b>");
    expect(text).not.toContain("<i>Пересічний Пригодник</i>");
  });

  it("prompts /start when no character exists", () => {
    expect(presentTavernNoCharacter()).toContain("/start");
  });

  it("shows a different tavern screen after the current raid period is already done", () => {
    const text = presentTavernAlreadyRaided(character);

    expect(text).toContain("Бочка Пінного Міражу в цьому відтинку вже пережила ваше втручання");
    expect(text).toContain("Єгер у капюшоні все ще сидить у кутку");
    expect(text).toContain("лічильник клацне на 23-й хвилині");
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
        xp: 25,
        gold: 10,
        localDate: "2026-06-12",
        itemGrants: [
          {
            itemId: "item.wet-hero-ticket",
            name: "Квиток мокрого пригодника",
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

    expect(presentTavernRaidResult(completed)).toContain("<b>+25 XP\n+10 золота</b>");
    expect(presentTavernRaidResult(completed)).toContain(
      "Здобуто: <i>Квиток мокрого пригодника</i>"
    );
    expect(presentTavernRaidResult(completed)).not.toContain("×1");
    expect(presentTavernRaidResult(repeated)).toContain("уже зараховано");
    expect(presentTavernRaidResult(repeated)).toContain("23-й хвилині");
    expect(presentTavernRaidResult(repeated)).toContain(
      "Вже отримано:\n<b>+25 XP\n+10 золота</b>"
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
      expect(text).toContain("Рейд почався.\n\nВи пішли розбиратися");
      expect(text).toContain(
        "Ви пішли розбиратися з Бочкою Пінного Міражу. Бочка робить вигляд, що це довга стратегія, а не паніка.\n\n"
      );
      expect(text).toContain("\n\nКорчмар:\n<blockquote>");
      expect(text).toContain("<i>Порада дня:");
      expect(text).not.toContain("Ще одна порада");
      expect(text.match(/Порада дня:/g)).toHaveLength(1);
      expect(text.indexOf("<i>Порада дня:")).toBeLessThan(text.indexOf("Поверніться через"));
      expect(text).toMatch(/Єгер|Підлога|Бочка|Стріла|Табурет/);
      expect(text).toContain("Поверніться через <b>8 хв.</b>");
      expect(text).not.toContain("хв..");
    expect(text).toContain("не видаю нових пригод");
    expect(text).not.toContain("+25 XP");
  });

  it("varies pending barrel flavor when the player checks again", () => {
    const first = presentTavernRaidPending({
      state: "pending",
      character,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:00.000Z"),
      periodId: "2026-06-13T10:23"
    });
    const second = presentTavernRaidPending({
      state: "pending",
      character,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:10.000Z"),
      periodId: "2026-06-13T10:23"
    });

    expect(second).not.toBe(first);
    expect(second).toContain("Рейд ще триває");
    expect(second).toContain("Рейд ще триває.\n\nВи пішли розбиратися");
    expect(second).toContain("Поверніться через <b>8 хв.</b>");
    expect(extractRaidAdvice(second)).not.toBe(extractRaidAdvice(first));
  });

  it("keeps start flavor stable and rotates ranger actions on later checks", () => {
    const rogue = {
      ...character,
      classId: "class.rogue",
      className: "Злодій"
    };
    const firstStart = presentTavernRaidPending({
      state: "pending-started",
      character: rogue,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:00.000Z"),
      periodId: "2026-06-13T10:23"
    });
    const secondStart = presentTavernRaidPending({
      state: "pending-started",
      character: rogue,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:10.000Z"),
      periodId: "2026-06-13T10:23"
    });
    const firstCheck = presentTavernRaidPending({
      state: "pending",
      character: rogue,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:00.000Z"),
      periodId: "2026-06-13T10:23"
    });
    const secondCheck = presentTavernRaidPending({
      state: "pending",
      character: rogue,
      availableAt: new Date("2026-06-13T10:38:00.000Z"),
      now: new Date("2026-06-13T10:30:10.000Z"),
      periodId: "2026-06-13T10:23"
    });

    expect(extractRangerAction(secondStart)).toBe(extractRangerAction(firstStart));
    expect(extractRaidAdvice(secondStart)).toBe(extractRaidAdvice(firstStart));
    expect(extractRangerAction(secondCheck)).not.toBe(extractRangerAction(firstCheck));
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
    expect(text).toContain("🍺 Ви зараз у рейді.\n\nІнші пригоди тимчасово недоступні");
    expect(text).toContain("драматичної піни.\n\n<i>Порада дня:");
    expect(text).toContain("Інші пригоди тимчасово недоступні");
    expect(text.match(/Порада дня:/g)).toHaveLength(1);
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
      now: new Date("2026-06-13T00:30:00.000Z"),
      nextAvailableAt: new Date("2026-06-13T04:00:00.000Z")
    });

    expect(text).toContain("Бочка на переобліку");
    expect(text).toContain("🛢️ Бочка на переобліку.\n\nЗа київським корчемним часом");
    expect(text).toContain("київським корчемним часом");
    expect(text).toContain("з 03:00 до 07:00");
    expect(text).toContain("корчмар рахує піну");
    expect(text).toContain("через <b>210 хв.</b>");
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
    ).toContain("у льосі миші ведуть дрібний бізнес");
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

function extractRaidAdvice(text: string): string {
  return text.match(/<i>Порада дня: (?<advice>.+)<\/i>/)?.groups?.advice ?? "";
}

function extractRangerAction(text: string): string {
  return text.match(/паніка\.\n\n(?<action>.+)\n\nКорчмар:/)?.groups?.action ?? "";
}


import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import {
  sendKorchmaArrivalBoard,
  sendKorchmaFront,
  sendTavern
} from "../../src/bot/commands/tavernCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { PresenceService } from "../../src/services/presenceService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";

describe("tavern command screens", () => {
  it("shows front-of-korchma options with an enter button", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaFront(
      makeContext(replies),
      readyTavernService(),
      capturingPresenceService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("Усередині вже чекають:");
    expect(replies[0]?.text).toContain("/tavern");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму",
              callback_data: makePlaceCallbackData("hall")
            }
          ],
          [
            {
              text: "📜 Табличка прибулих",
              callback_data: makePlaceCallbackData("arrivals")
            }
          ]
        ]
      }
    });
  });

  it("shows a front-door arrivals plaque from known korchma visitors", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendKorchmaArrivalBoard(
      makeContext(replies),
      readyTavernService(),
      korchmaArrivalService(),
      "reply"
    );

    expect(replies[0]?.text).toContain("📜 Табличка прибулих");
    expect(replies[0]?.text).toContain("Дара · рівень 2 · Зала корчми");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚪 Зайти в корчму",
              callback_data: makePlaceCallbackData("hall")
            }
          ],
          [
            {
              text: "⬅️ До дверей",
              callback_data: makePlaceCallbackData("front")
            }
          ]
        ]
      }
    });
  });

  it("shows interior korchma presence counts on the hall screen", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendTavern(makeContext(replies), readyTavernService(), korchmaPresenceService(), "reply");

    expect(replies[0]?.text).toContain(
      "За столами й закутками корчми: 2 активні, 1 притихлий."
    );
    expect(replies[0]?.text).not.toContain("Дара");
    expect(replies[0]?.text).not.toContain("Нестор Межовий");
    expect(replies[0]?.text).not.toContain("рівень 2");
    expect(replies[0]?.text).not.toContain("поки тільки ви");
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
  title: "Пригодники місцевого значення",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
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

function readyTavernService(): TavernRaidService {
  return {
    getTavernForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character
      })
  } as unknown as TavernRaidService;
}

function capturingPresenceService(): PresenceService {
  return {
    markAction: () => Promise.resolve()
  } as unknown as PresenceService;
}

function korchmaPresenceService(): PresenceService {
  return {
    markAction: () => Promise.resolve(),
    getKorchmaInteriorPresence: () =>
      Promise.resolve({
        active: [
          { telegramUserId: 42n, name: "Мандрівник", status: "active" },
          { telegramUserId: 77n, name: "Дара", status: "active", level: 2 }
        ],
        idle: [{ telegramUserId: 88n, name: "Нестор Межовий", status: "idle" }],
        total: 3
      })
  } as unknown as PresenceService;
}

function korchmaArrivalService(): PresenceService {
  return {
    markAction: () => Promise.resolve(),
    getKorchmaArrivalBoard: () =>
      Promise.resolve({
        entries: [
          {
            telegramUserId: 77n,
            name: "Дара",
            level: 2,
            locationName: "Зала корчми"
          }
        ]
      })
  } as unknown as PresenceService;
}

function makeContext(replies: Array<{ text: string; options: unknown }>): Context {
  return {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тест"
    },
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({});
    }
  } as unknown as Context;
}

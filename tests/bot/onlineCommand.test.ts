import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { sendOnline } from "../../src/bot/commands/onlineCommand";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import { BIG_BARREL_PARTY_ORIGIN_LOCATION_ID } from "../../src/services/partySessionService";
import { PRESENCE_LOCATION_KORCHMA_BARREL, type PresenceService } from "../../src/services/presenceService";

describe("online command", () => {
  it("shows current online snapshot without nearby action buttons when only the player is active nearby", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 1,
          location: {
            id: "location.korchma.hall",
            name: "Зала корчми",
            people: {
              active: [{ telegramUserId: 42n, name: "Тестовий Герой", status: "active" }],
              idle: [],
              total: 1
            }
          },
          activity: null
        })
    } as unknown as PresenceService;

    await sendOnline(ctx, presenceService, { duelEnabled: true, itemGiftEnabled: true });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("👥 У грі зараз: 1");
    expect(replies[0]?.text).toContain("📍 Зала корчми: тільки ти.");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:nd:open");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:gift:open");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:sh:bp");
  });

  it("shows nearby duel, Bard performance and gift buttons when an eligible Bard has another active player nearby", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 2,
          location: {
            id: "location.korchma.hall",
            name: "Зала корчми",
            people: {
              active: [
                { telegramUserId: 42n, name: "Тестовий Герой", classId: "class.bard", level: 3, status: "active" },
                { telegramUserId: 93n, name: "Сусідній Дуеліст", status: "active" }
              ],
              idle: [],
              total: 2
            }
          },
          activity: null
        })
    } as unknown as PresenceService;

    await sendOnline(ctx, presenceService, {
      bardPerformanceEnabled: true,
      duelEnabled: true,
      itemGiftEnabled: true
    });

    expect(replies).toHaveLength(1);
    expect(JSON.stringify(replies[0]?.options)).toContain("🥊 Кинути виклик присутнім");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:nd:open");
    expect(JSON.stringify(replies[0]?.options)).toContain("🎶 Виступити");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:sh:bp");
    expect(JSON.stringify(replies[0]?.options)).toContain("🎁 Подарувати манатку");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:gift:open");
  });

  it("shows live party invite action above the nearby duel action", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 2,
          location: {
            id: "location.korchma.bar",
            name: "Шинок",
            people: {
              active: [
                { telegramUserId: 42n, name: "Тестовий Герой", status: "active" },
                { telegramUserId: 93n, name: "Сусідній Дуеліст", status: "active" }
              ],
              idle: [],
              total: 2
            }
          },
          activity: null
        })
    } as unknown as PresenceService;

    await sendOnline(ctx, presenceService, {
      duelEnabled: true,
      partySessions: {
        getLiveRecruitingByTelegramUser: () => Promise.resolve({ id: "party-1" })
      } as never
    });

    expect(replies).toHaveLength(1);
    expect(inlineButtonTexts(replies[0]?.options)).toEqual([
      "🧭 Покликати у ватагу",
      "🥊 Кинути виклик присутнім"
    ]);
    expect(inlineButtonCallbacks(replies[0]?.options)).toEqual([
      "v1:party:no",
      "v1:nd:open"
    ]);
  });

  it("shows Big Barrel Brother recruiting raids near the Barrel with join buttons by leader", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 1,
          location: {
            id: PRESENCE_LOCATION_KORCHMA_BARREL,
            name: "Бочка Пінного Міражу",
            people: {
              active: [{ telegramUserId: 42n, name: "Тестовий Герой", status: "active" }],
              idle: [],
              total: 1
            }
          },
          activity: null
        })
    } as unknown as PresenceService;
    const listRecruitingBigBarrelBrother = vi.fn().mockResolvedValue([
      makeRecruitingBigBarrelParty("partyABC12", "Kyjivan BooksDragon", [
        "Kyjivan BooksDragon",
        "Мала Буря"
      ]),
      makeRecruitingBigBarrelParty("partyDEF34", "Ватажок Другий", ["Ватажок Другий"])
    ]);

    await sendOnline(ctx, presenceService, {
      partySessions: {
        getLiveRecruitingByTelegramUser: vi.fn().mockResolvedValue(null),
        listRecruitingBigBarrelBrother
      } as never
    });

    expect(listRecruitingBigBarrelBrother).toHaveBeenCalledOnce();
    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("🍺 У груповому рейді «Старший Брат Бочки»: 2");
    expect(replies[0]?.text).toContain("— <b>Kyjivan BooksDragon</b>");
    expect(replies[0]?.text).toContain("🍺 У груповому рейді «Старший Брат Бочки»: 1");
    expect(inlineButtonTexts(replies[0]?.options)).toEqual([
      "🤝 До рейду: Kyjivan BooksDragon",
      "🤝 До рейду: Ватажок Другий"
    ]);
    expect(inlineButtonCallbacks(replies[0]?.options)).toEqual([
      "v1:party:j:partyABC12",
      "v1:party:j:partyDEF34"
    ]);
  });

  it("does not show the Bard performance button to non-Bards nearby", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 2,
          location: {
            id: "location.korchma.front",
            name: "Перед корчмою",
            people: {
              active: [
                { telegramUserId: 42n, name: "Тестовий Герой", classId: "class.warrior", level: 3, status: "active" },
                { telegramUserId: 93n, name: "Сусідній Слухач", status: "active" }
              ],
              idle: [],
              total: 2
            }
          },
          activity: null
        })
    } as unknown as PresenceService;

    await sendOnline(ctx, presenceService, {
      bardPerformanceEnabled: true,
      itemGiftEnabled: true
    });

    expect(replies).toHaveLength(1);
    expect(JSON.stringify(replies[0]?.options)).not.toContain("🎶 Виступити");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:sh:bp");
    expect(JSON.stringify(replies[0]?.options)).toContain("🎁 Подарувати манатку");
  });

  it("shows the gift button from nearby view outside the Shynok", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 2,
          location: {
            id: "location.korchma.deep.left",
            name: "Лівий прохід",
            people: {
              active: [
                { telegramUserId: 42n, name: "Тестовий Герой", status: "active" },
                { telegramUserId: 93n, name: "Сусідній Дароприймач", status: "active" }
              ],
              idle: [],
              total: 2
            }
          },
          activity: null
        })
    } as unknown as PresenceService;

    await sendOnline(ctx, presenceService, { itemGiftEnabled: true });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("📍 Лівий прохід: 2");
    expect(JSON.stringify(replies[0]?.options)).toContain("🎁 Подарувати манатку");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:gift:open");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:nd:open");
  });
});

function inlineButtonTexts(options: unknown): string[] {
  return (
    (options as { reply_markup?: { inline_keyboard?: Array<Array<{ text: string }>> } })
      .reply_markup?.inline_keyboard ?? []
  ).flatMap((row) => row.map((button) => button.text));
}

function inlineButtonCallbacks(options: unknown): string[] {
  return (
    (options as { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data: string }>> } })
      .reply_markup?.inline_keyboard ?? []
  ).flatMap((row) => row.map((button) => button.callback_data));
}

function makeRecruitingBigBarrelParty(
  inviteToken: string,
  leaderName: string,
  participantNames: string[]
): PartySessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makePartyCharacter("character-leader", 42n, leaderName);

  return {
    id: `party-${inviteToken}`,
    inviteToken,
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: "2026-06-30T11:23",
    originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    version: 1,
    activeLeaderKey: `party-leader:${leader.id}`,
    createdAt: now,
    updatedAt: now,
    leader,
    participants: participantNames.map((name, index) => {
      const character = index === 0
        ? leader
        : makePartyCharacter(`character-${inviteToken}-${index}`, BigInt(93 + index), name);

      return {
        id: `participant-${inviteToken}-${index}`,
        sessionId: `party-${inviteToken}`,
        characterId: character.id,
        remortCount: 0,
        status: "joined",
        joinSource: index === 0 ? "leader" : "nearby",
        joinedAt: now,
        leftAt: null,
        chatId: character.telegramUserId,
        messageId: null,
        character
      };
    })
  };
}

function makePartyCharacter(
  id: string,
  telegramUserId: bigint,
  name: string
): PartySessionRecord["leader"] {
  return {
    id,
    userId: `user-${id}`,
    telegramUserId,
    currentLocationId: PRESENCE_LOCATION_KORCHMA_BARREL,
    name,
    pronoun: "they",
    path: "path.boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 8,
    xp: 587,
    gold: 42,
    hpCurrent: 60,
    hpMax: 60,
    manaCurrent: 20,
    manaMax: 20,
    hpRegenAt: null,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: {},
    remortCount: 0
  };
}

import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import { sendCurrentLocation } from "../../src/bot/modules/mainMenu";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { BIG_BARREL_PARTY_ORIGIN_LOCATION_ID } from "../../src/services/partySessionService";
import { PRESENCE_LOCATION_KORCHMA_BARREL } from "../../src/services/presenceService";

const BOT_USERNAME = "kvestarnia_test_bot";
const PARTY_TOKEN = "partyABC12";
const PARTY_INVITE_URL = `https://t.me/${BOT_USERNAME}?start=party_${PARTY_TOKEN}`;

describe("Big Barrel Brother invite routing", () => {
  it("keeps the Korchma Barrel place callback on the old Barrel card without auto-creating a party", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute();
    const calls = await captureCallbackApiCalls(makePlaceCallbackData("barrel"), services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some((call) => String(call.payload.text).includes(PARTY_INVITE_URL))).toBe(false);
    expect(createForTelegramUser).not.toHaveBeenCalled();
  });

  it("keeps current-location Barrel resume on the old Barrel card without auto-creating a party", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute();
    const reply = vi.fn().mockResolvedValue({ message_id: 1 });
    const ctx = {
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat: {
        id: 42,
        type: "private"
      },
      message: {
        text: "🛢️ Бочка"
      },
      reply
    } as unknown as Context;

    await sendCurrentLocation(ctx, services, { botUsername: BOT_USERNAME });

    expect(reply.mock.calls.some((call) => String(call[0]).includes(PARTY_INVITE_URL))).toBe(false);
    expect(createForTelegramUser).not.toHaveBeenCalled();
  });

  it("threads botUsername into the explicit Barrel raid start card as an active link", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute();
    const calls = await captureCallbackApiCalls(makeTavernCallbackData("raid"), services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some((call) =>
      call.method === "editMessageText" &&
      String(call.payload.text).includes(`href="${PARTY_INVITE_URL}"`)
    )).toBe(true);
    expect(createForTelegramUser).toHaveBeenCalledOnce();
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureCallbackApiCalls(
  callbackData: string,
  services: BotServices,
  options: { botUsername?: string | undefined } = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services, options);
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();
  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: "callback-1",
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "chat-instance",
      data: callbackData,
      message: {
        message_id: 10,
        date: 0,
        chat: {
          id: 42,
          type: "private",
          first_name: "Тест"
        },
        text: "old"
      }
    }
  });

  return calls;
}

function servicesForBigBarrelRoute(): {
  services: BotServices;
  session: PartySessionRecord;
  createForTelegramUser: ReturnType<typeof vi.fn>;
} {
  const session = makePartySession();
  const createForTelegramUser = vi.fn().mockResolvedValue({
    state: "created",
    session
  });
  const services = {
    achievements: {},
    adventure: {},
    bardPerformance: undefined,
    cellarErrand: {},
    dailyKorchmaRound: {
      getExistingForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" })
    },
    devReset: {
      isEnabled: () => false
    },
    fight: {
      getFightOverviewForTelegramUser: vi.fn().mockResolvedValue({
        state: "ready",
        character: makeCharacterSummary()
      })
    },
    hero: {},
    hunt: {},
    inventory: {},
    itemUse: {},
    levelBarter: {},
    mantokChest: {},
    onboarding: {},
    partyBoss: {
      areDevHelpersEnabled: () => false,
      getActiveForTelegramUser: vi.fn().mockResolvedValue(null)
    },
    partySessions: {
      areDevHelpersEnabled: () => false,
      isBigBarrelBrotherEnabled: () => true,
      createForTelegramUser
    },
    playerHints: {},
    presence: {
      markAction: vi.fn().mockResolvedValue(undefined),
      getCurrentActivityForTelegramUser: vi.fn().mockResolvedValue({
        state: "ready",
        currentAdventureId: null
      }),
      getCurrentPlaceForTelegramUser: vi.fn().mockResolvedValue({
        state: "ready",
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        locationName: "Бочка Пінного Міражу",
        insideKorchma: true
      }),
      getKorchmaInteriorPresence: vi.fn().mockResolvedValue({
        totalActive: 0,
        totalIdle: 0,
        total: 0,
        locations: []
      }),
      getRaidParticipantsForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" }),
      getAdventureParticipantsForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" }),
      getOnlineForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" }),
      getLookForTelegramUser: vi.fn().mockResolvedValue({ state: "no-character" })
    },
    restart: {},
    tavern: {
      getActivePendingFridayBarrelRaidForTelegramUser: vi.fn().mockResolvedValue({ state: "none" }),
      getTavernForTelegramUser: vi.fn().mockResolvedValue({
        state: "ready",
        character: makeCharacterSummary()
      })
    },
    yeger: {}
  } as unknown as BotServices;

  return { services, session, createForTelegramUser };
}

function makePartySession(): PartySessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makePartyCharacter();

  return {
    id: "party-1",
    inviteToken: PARTY_TOKEN,
    status: "recruiting",
    leaderCharacterId: leader.id,
    periodId: "2026-06-30T11:23",
    originLocationId: BIG_BARREL_PARTY_ORIGIN_LOCATION_ID,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    version: 1,
    activeLeaderKey: "party-leader:character-42",
    createdAt: now,
    updatedAt: now,
    leader,
    participants: [
      {
        id: "participant-42",
        sessionId: "party-1",
        characterId: leader.id,
        remortCount: 0,
        status: "joined",
        joinSource: "leader",
        joinedAt: now,
        leftAt: null,
        chatId: 42n,
        messageId: 10,
        character: leader
      }
    ]
  };
}

function makePartyCharacter(): PartySessionRecord["leader"] {
  return {
    id: "character-42",
    userId: "user-42",
    telegramUserId: 42n,
    currentLocationId: PRESENCE_LOCATION_KORCHMA_BARREL,
    name: "Тестова Лідерка",
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

function makeCharacterSummary(): CharacterSummary {
  return {
    name: "Тестова Лідерка",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: 8,
    xp: 587,
    nextLevelXp: 800,
    xpToNextLevel: 213,
    gold: 42,
    hpCurrent: 60,
    hpMax: 60,
    manaCurrent: 20,
    manaMax: 20,
    stats: {
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      charisma: 10,
      luck: 10
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
}

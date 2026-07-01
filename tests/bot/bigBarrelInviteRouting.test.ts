import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import { sendCurrentLocation } from "../../src/bot/modules/mainMenu";
import type { PartySessionRecord } from "../../src/db/repositories/partySessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { BIG_BARREL_PARTY_ORIGIN_LOCATION_ID } from "../../src/services/partySessionService";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_HALL
} from "../../src/services/presenceService";

const BOT_USERNAME = "kvestarnia_test_bot";
const PARTY_TOKEN = "partyABC12";
const PARTY_INVITE_URL = `https://t.me/${BOT_USERNAME}?start=party_${PARTY_TOKEN}`;

describe("Big Barrel Brother invite routing", () => {
  it("keeps the Korchma Barrel place callback on the old Barrel card without auto-creating a party", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute({
      character: { level: 3, remortCount: 1 },
      partyCharacter: { level: 3, remortCount: 1 },
      currentLocationId: PRESENCE_LOCATION_KORCHMA_HALL
    });
    const calls = await captureCallbackApiCalls(makePlaceCallbackData("barrel"), services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some(hasBigApproachNotice)).toBe(true);
    expect(calls.some((call) => String(call.payload.text).includes(PARTY_INVITE_URL))).toBe(false);
    expect(createForTelegramUser).not.toHaveBeenCalled();
  });

  it("keeps current-location Barrel resume on the old Barrel card without auto-creating a party", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute({
      character: { level: 3, remortCount: 1 },
      partyCharacter: { level: 3, remortCount: 1 }
    });
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

  it("opens Big recruiting from /raid without auto-sending the forwardable invite card", async () => {
    const { services, createForTelegramUser, recordParticipantMessageReference } = servicesForBigBarrelRoute({
      character: { level: 3, remortCount: 1 },
      partyCharacter: { level: 3, remortCount: 1 }
    });
    const calls = await captureMessageApiCalls("/raid", services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some(hasBigApproachNotice)).toBe(true);
    expect(calls.some(hasMainRecruitingFurnitureNotice)).toBe(false);
    expect(calls.some(hasBigRecruitingCardInviteLine)).toBe(false);
    expect(calls.some(hasForwardableInviteUrl)).toBe(false);
    expect(calls.some(hasShareInviteButton)).toBe(true);
    expect(createForTelegramUser).toHaveBeenCalledOnce();
    expect(recordParticipantMessageReference).toHaveBeenCalledWith(42n, PARTY_TOKEN, {
      chatId: 42n,
      messageId: 101
    });
  });

  it("shows a Big loss cooldown wait message from /raid without creating invite controls", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute({
      character: { level: 8, remortCount: 0 },
      createResult: { state: "ineligible" }
    });
    const calls = await captureMessageApiCalls("/raid", services, {
      botUsername: BOT_USERNAME
    });

    expect(createForTelegramUser).toHaveBeenCalledOnce();
    expect(calls.some((call) => String(call.payload.text).includes("короткий перепочинок"))).toBe(true);
    expect(calls.some(hasForwardableInviteUrl)).toBe(false);
    expect(calls.some(hasShareInviteButton)).toBe(false);
  });


  it("opens explicit Barrel raid recruiting without auto-sending the forwardable invite card", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute({
      character: { level: 3, remortCount: 1 },
      partyCharacter: { level: 3, remortCount: 1 }
    });
    const calls = await captureCallbackApiCalls(makeTavernCallbackData("raid"), services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some(hasBigApproachNotice)).toBe(true);
    expect(calls.some(hasMainRecruitingFurnitureNotice)).toBe(false);
    expect(calls.some(hasBigRecruitingCardInviteLine)).toBe(false);
    expect(calls.some(hasForwardableInviteUrl)).toBe(false);
    expect(calls.some(hasShareInviteButton)).toBe(true);
    expect(createForTelegramUser).toHaveBeenCalledOnce();
  });

  it("keeps a remorted level 2 character on the legacy Barrel route even when Big is enabled", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute({
      character: { level: 2, remortCount: 1 },
      partyCharacter: { level: 2, remortCount: 1 }
    });
    const calls = await captureMessageApiCalls("/raid", services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some((call) => String(call.payload.text).includes(PARTY_INVITE_URL))).toBe(false);
    expect(createForTelegramUser).not.toHaveBeenCalled();
  });

  it("keeps a non-remorted level 7 character on the legacy Barrel route even when Big is enabled", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute({
      character: { level: 7, remortCount: 0 },
      partyCharacter: { level: 7, remortCount: 0 }
    });
    const calls = await captureMessageApiCalls("/raid", services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some((call) => String(call.payload.text).includes(PARTY_INVITE_URL))).toBe(false);
    expect(createForTelegramUser).not.toHaveBeenCalled();
  });

  it("still opens Big recruiting from the explicit Barrel raid start for a non-remorted level 8 character", async () => {
    const { services, createForTelegramUser } = servicesForBigBarrelRoute();
    const calls = await captureCallbackApiCalls(makeTavernCallbackData("raid"), services, {
      botUsername: BOT_USERNAME
    });

    expect(calls.some(hasBigApproachNotice)).toBe(true);
    expect(calls.some(hasMainRecruitingFurnitureNotice)).toBe(false);
    expect(calls.some(hasBigRecruitingCardInviteLine)).toBe(false);
    expect(calls.some(hasForwardableInviteUrl)).toBe(false);
    expect(calls.some(hasShareInviteButton)).toBe(true);
    expect(createForTelegramUser).toHaveBeenCalledOnce();
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function hasBigRecruitingCardInviteLine(call: ApiCall): boolean {
  return (call.method === "sendMessage" || call.method === "editMessageText") &&
    String(call.payload.text).includes("Збір до Старшого Брата Бочки") &&
    String(call.payload.text).includes(PARTY_INVITE_URL);
}

function hasForwardableInviteUrl(call: ApiCall): boolean {
  return call.method === "sendMessage" &&
    !String(call.payload.text).includes("Збір до Старшого Брата Бочки") &&
    String(call.payload.text).includes(PARTY_INVITE_URL);
}

function hasShareInviteButton(call: ApiCall): boolean {
  return (call.method === "sendMessage" || call.method === "editMessageText") &&
    JSON.stringify(call.payload.reply_markup ?? {}).includes("https://t.me/share/url") &&
    JSON.stringify(call.payload.reply_markup ?? {}).includes(`party_${PARTY_TOKEN}`);
}

function hasBigApproachNotice(call: ApiCall): boolean {
  const text = String(call.payload.text);

  return call.method === "sendMessage" &&
    text.includes("Ви підійшли до Бочки Пінного Міражу.") &&
    (text.includes("ватаг") || text.includes("гуртов") || text.includes("повноцін"));
}

function hasMainRecruitingFurnitureNotice(call: ApiCall): boolean {
  const text = String(call.payload.text);

  return (call.method === "sendMessage" || call.method === "editMessageText") &&
    text.includes("Збір до Старшого Брата Бочки") &&
    text.includes("Бочку довго ображали словом «меблі»");
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
      result: method === "sendMessage"
        ? { message_id: 101, date: 0, chat: { id: 42, type: "private" } }
        : true
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

async function captureMessageApiCalls(
  text: string,
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
      result: method === "sendMessage"
        ? { message_id: 101, date: 0, chat: { id: 42, type: "private" } }
        : true
    });
  });

  await bot.init();
  await bot.handleUpdate(commandUpdate(text));

  return calls;
}

function servicesForBigBarrelRoute(options: {
  character?: Partial<CharacterSummary>;
  partyCharacter?: Partial<PartySessionRecord["leader"]>;
  bigEnabled?: boolean;
  createResult?: { state: "ineligible" };
  currentLocationId?: string;
} = {}): {
  services: BotServices;
  session: PartySessionRecord;
  createForTelegramUser: ReturnType<typeof vi.fn>;
  recordParticipantMessageReference: ReturnType<typeof vi.fn>;
} {
  const character = makeCharacterSummary(options.character);
  const session = makePartySession(options.partyCharacter);
  const createForTelegramUser = vi.fn().mockResolvedValue(options.createResult ?? {
    state: "created",
    session
  });
  const recordParticipantMessageReference = vi.fn().mockResolvedValue(session);
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
        character
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
      isBigBarrelBrotherEnabled: () => options.bigEnabled ?? true,
      createForTelegramUser,
      recordParticipantMessageReference
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
        locationId: options.currentLocationId ?? PRESENCE_LOCATION_KORCHMA_BARREL,
        locationName: options.currentLocationId === PRESENCE_LOCATION_KORCHMA_HALL
          ? "Зала корчми"
          : "Бочка Пінного Міражу",
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
        character
      })
    },
    yeger: {}
  } as unknown as BotServices;

  return { services, session, createForTelegramUser, recordParticipantMessageReference };
}

function makePartySession(characterOverrides: Partial<PartySessionRecord["leader"]> = {}): PartySessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const leader = makePartyCharacter(characterOverrides);

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

function makePartyCharacter(overrides: Partial<PartySessionRecord["leader"]> = {}): PartySessionRecord["leader"] {
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
    remortCount: 0,
    ...overrides
  };
}

function makeCharacterSummary(overrides: Partial<CharacterSummary> = {}): CharacterSummary {
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
    },
    ...overrides
  };
}

function commandUpdate(text: string) {
  const commandLength = text.split(" ", 1)[0]?.length ?? text.length;

  return {
    update_id: 2,
    message: {
      message_id: 11,
      date: 0,
      chat: {
        id: 42,
        type: "private" as const,
        first_name: "Тест"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text,
      entities: [
        {
          type: "bot_command" as const,
          offset: 0,
          length: commandLength
        }
      ]
    }
  };
}

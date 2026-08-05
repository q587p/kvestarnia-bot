import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { registerGuildPassageSearchGuard } from "../../src/bot/modules/passageSearchGuard";
import { sendFight } from "../../src/bot/commands/fightCommand";

vi.mock("../../src/bot/commands/fightCommand", () => ({
  sendFight: vi.fn().mockResolvedValue(undefined)
}));

describe("guild passage-search routing guard", () => {
  it.each([
    ["persistent button", textUpdate("🏰 Ґільдії"), "reply"],
    ["fallback command", textUpdate("/guild_create"), "reply"],
    ["Nest read", callbackUpdate("v1:g:no"), "edit"],
    ["invite mutation", callbackUpdate("v1:g:a:inviteABC12"), "edit"],
    ["private deep link", textUpdate("/start guild_inviteABC12"), "reply"],
    ["guided invite reply", promptReplyUpdate(), "reply"]
  ] as const)("blocks the %s before every guild and presence side effect", async (_name, update, mode) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const getActiveSearch = vi.fn().mockResolvedValue(runningResult());
    const guildRepository = vi.fn();
    const invitationDelivery = vi.fn();
    const audit = vi.fn();
    const presenceMutation = vi.fn();

    registerGuildPassageSearchGuard(bot, {
      passageSearch: { getActiveSearch }
    } as unknown as BotServices);
    bot.use(() => {
      presenceMutation();
      guildRepository();
      invitationDelivery();
      audit();
      return Promise.resolve();
    });

    await bot.handleUpdate(update);

    expect(getActiveSearch).toHaveBeenCalledWith(1001n);
    expect(presenceMutation).not.toHaveBeenCalled();
    expect(guildRepository).not.toHaveBeenCalled();
    expect(invitationDelivery).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(mode === "reply" ? 1 : 0);
    expect(calls.edits).toHaveLength(mode === "edit" ? 1 : 0);
    expect(calls.answers).toHaveLength(mode === "edit" ? 1 : 0);
    expect((calls.sends[0]?.text ?? calls.edits[0]?.text)).toContain("Пошук триває");
  });

  it("settles a completed search from a guild route before guild work continues", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    registerGuildPassageSearchGuard(bot, {
      passageSearch: { getActiveSearch: vi.fn().mockResolvedValue(completedResult()) }
    } as unknown as BotServices);
    bot.use(downstream);

    await bot.handleUpdate(textUpdate("/guild"));

    expect(downstream).not.toHaveBeenCalled();
    expect(calls.sends).toHaveLength(1);
    expect(calls.sends[0]?.text).toContain("Щось знайшлося");
  });

  it("hands a monster attack from a guild callback to the canonical fight route", async () => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    const services = {
      passageSearch: { getActiveSearch: vi.fn().mockResolvedValue(monsterAttackResult()) },
      fight: {},
      presence: {},
      tavern: {}
    } as unknown as BotServices;
    registerGuildPassageSearchGuard(bot, services);
    bot.use(downstream);

    await bot.handleUpdate(callbackUpdate("v1:g:no"));

    expect(downstream).not.toHaveBeenCalled();
    expect(calls.edits[0]?.text).toContain("Пошук образив");
    expect(sendFight).toHaveBeenCalledWith(expect.anything(), services.fight, "reply", expect.objectContaining({
      requireKorchmaInterior: false
    }));
  });

  it.each([
    ["ordinary enabled route", textUpdate("/guild")],
    ["flag-off recovery callback", callbackUpdate("v1:g:o")]
  ] as const)("keeps the %s reachable when there is no active search", async (_name, update) => {
    const calls = apiCalls();
    const bot = testBot(calls.middleware);
    const downstream = vi.fn();
    registerGuildPassageSearchGuard(bot, {
      passageSearch: { getActiveSearch: vi.fn().mockResolvedValue(null) }
    } as unknown as BotServices);
    bot.use(downstream);

    await bot.handleUpdate(update);

    expect(downstream).toHaveBeenCalledOnce();
    expect(calls.sends).toHaveLength(0);
    expect(calls.edits).toHaveLength(0);
  });
});

function runningResult() {
  return {
    state: "running" as const,
    character: character(),
    action: action(),
    remainingSeconds: 23
  };
}

function completedResult() {
  return {
    state: "completed" as const,
    character: character(),
    action: action(),
    loot: { gold: 3, itemGrants: [] },
    achievementUnlocks: []
  };
}

function monsterAttackResult() {
  return {
    state: "monster-attack" as const,
    character: character(),
    action: action(),
    fight: { state: "invalid-preview" as const }
  };
}

function action() {
  const startedAt = new Date("2026-08-05T10:00:00.000Z");
  const endsAt = new Date("2026-08-05T10:00:23.000Z");
  return {
    id: "search-action-13",
    token: "searchToken13",
    characterId: "character-1",
    nodeKey: "passage:deep-left",
    nodeKind: "passage" as const,
    status: "running" as const,
    startedAt,
    endsAt,
    payload: {
      nodeKey: "passage:deep-left",
      nodeKind: "passage" as const,
      originLocationId: "location.korchma.deep.level1.left",
      passage: "deep-left" as const,
      durationMs: 23_000,
      safeAtStart: true,
      dangerTier: 0,
      searchTier: 3,
      playerLuckSnapshot: 0,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString()
    },
    result: null,
    createdAt: startedAt,
    updatedAt: startedAt
  };
}

function character() {
  return {
    name: "Маршрутник",
    level: 7,
    xp: 0,
    xpToNextLevel: 100,
    remortCount: 0,
    hp: 23,
    hpMax: 23,
    mana: 13,
    manaMax: 13,
    stats: { strength: 5, agility: 5, charisma: 5, luck: 5 },
    combat: { attack: 5, defense: 5 },
    gold: 587,
    equipment: []
  };
}

function testBot(middleware: Parameters<Bot["api"]["config"]["use"]>[0]): Bot {
  const bot = new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
  bot.api.config.use(middleware);
  return bot;
}

function apiCalls() {
  const sends: Array<{ text: string }> = [];
  const edits: Array<{ text: string }> = [];
  const answers: unknown[] = [];
  return {
    sends,
    edits,
    answers,
    middleware: ((_prev, method, payload) => {
      if (method === "sendMessage") {
        sends.push({ text: String(payload.text) });
        return Promise.resolve({
          ok: true,
          result: { message_id: 93, date: 0, chat: { id: Number(payload.chat_id), type: "private" } }
        });
      }
      if (method === "editMessageText") {
        edits.push({ text: String(payload.text) });
        return Promise.resolve({ ok: true, result: true });
      }
      if (method === "answerCallbackQuery") {
        answers.push(payload);
        return Promise.resolve({ ok: true, result: true });
      }
      return Promise.resolve({ ok: true, result: true });
    }) as Parameters<Bot["api"]["config"]["use"]>[0]
  };
}

function textUpdate(text: string) {
  return {
    update_id: nextUpdateId(),
    message: {
      message_id: 13,
      date: 1,
      chat: { id: 1001, type: "private" as const },
      from: { id: 1001, is_bot: false, first_name: "Маршрутник" },
      text
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: nextUpdateId(),
    callback_query: {
      id: `callback-${nextUpdateId()}`,
      from: { id: 1001, is_bot: false, first_name: "Маршрутник" },
      data,
      message: {
        message_id: 13,
        date: 1,
        chat: { id: 1001, type: "private" as const },
        text: "Стара картка"
      }
    }
  };
}

function promptReplyUpdate() {
  const update = textUpdate("inviteABC12");
  return {
    ...update,
    message: {
      ...update.message,
      reply_to_message: {
        message_id: 12,
        date: 1,
        chat: { id: 1001, type: "private" as const },
        from: { id: 123, is_bot: true, first_name: "Квестарня" },
        text: "📨 Запрошення до ґільдії · крок 1 із 2\n\nВставте код."
      }
    }
  };
}

let updateId = 100;
function nextUpdateId(): number {
  updateId += 1;
  return updateId;
}

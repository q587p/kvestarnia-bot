import { Bot, type Api, type Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  handleGroupCombatCallback,
  registerGroupCombatDevCommand
} from "../../src/bot/commands/groupCombatCommand";
import { deliverGroupCombatCards } from "../../src/bot/groupCombatCardDelivery";
import type { GroupCombatSessionRecord } from "../../src/db/repositories/groupCombatRepository";
import type { GroupCombatService } from "../../src/services/groupCombatService";
import { registerSocialBotModule } from "../../src/bot/modules/social";
import type { BotServices } from "../../src/bot/botServices";

describe("group combat bot flow", () => {
  it("cannot mutate through a dev command when the production gate is closed", async () => {
    const bot = testBot();
    const startProof = vi.fn();
    registerGroupCombatDevCommand(bot, {
      areDevHelpersEnabled: () => false,
      startProof
    } as unknown as GroupCombatService);

    await bot.handleUpdate(commandUpdate("/dev_group_combat proof-token-13"));
    expect(startProof).not.toHaveBeenCalled();
  });

  it("does not register the command or callback route when production disables the service", async () => {
    const bot = testBot();
    const startProof = vi.fn();
    const submitAction = vi.fn();
    registerSocialBotModule(bot, {
      services: {
        groupCombat: {
          isEnabled: () => false,
          areDevHelpersEnabled: () => false,
          startProof,
          submitAction
        }
      } as unknown as BotServices,
      options: {}
    });

    await bot.handleUpdate(commandUpdate("/dev_group_combat proof-token-13"));
    await bot.handleUpdate(callbackUpdate("v1:gc:v:proof-token-13"));
    expect(startProof).not.toHaveBeenCalled();
    expect(submitAction).not.toHaveBeenCalled();
  });

  it("maps a callback target against canonical state and refreshes stale cards", async () => {
    const session = makeSession();
    const submitAction = vi.fn().mockResolvedValue({ state: "stale" });
    const findByToken = vi.fn().mockResolvedValue(session);
    const editMessageText = vi.fn().mockResolvedValue(true);
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = {
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      callbackQuery: { id: "callback-1", data: "unused" },
      api: { editMessageText } as unknown as Api,
      answerCallbackQuery
    } as unknown as Context;

    await handleGroupCombatCallback(ctx, {
      type: "action",
      token: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetIndex: 1
    }, {
      findByToken,
      submitAction
    } as unknown as GroupCombatService);

    expect(submitAction).toHaveBeenCalledWith({
      telegramUserId: 1001n,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: "enemy-2"
    });
    expect(answerCallbackQuery).toHaveBeenCalled();
    expect(editMessageText).toHaveBeenCalledTimes(2);
  });

  it("repairs an unavailable canonical message after combat already committed", async () => {
    const session = makeSession();
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ message_id: 31 })
      .mockResolvedValueOnce({ message_id: 32 });
    const editMessageText = vi.fn().mockRejectedValue(new Error("Bad Request: message to edit not found"));
    const compareAndSetParticipantCard = vi.fn().mockResolvedValue(true);
    const api = { editMessageText, sendMessage } as unknown as Api;

    const delivered = await deliverGroupCombatCards(api, {
      compareAndSetParticipantCard
    } as unknown as GroupCombatService, session);

    expect(delivered).toBe(2);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(compareAndSetParticipantCard).toHaveBeenCalledTimes(2);
    expect(compareAndSetParticipantCard).toHaveBeenCalledWith(expect.objectContaining({
      expectedReferenceVersion: 1,
      messageId: 31
    }));
  });
});

function makeSession(): GroupCombatSessionRecord {
  return {
    id: "group-session",
    partySessionId: "party-session",
    partyInviteToken: "proof-token-13",
    status: "active",
    turn: 1,
    version: 1,
    turnExpiresAt: new Date("2026-07-22T10:00:23.000Z"),
    completedAt: null,
    result: null,
    participants: [
      participantRecord("character-1", 1001n, "Лідерка", 0, 21),
      participantRecord("character-2", 1002n, "Друг", 1, 22)
    ],
    queuedActions: [],
    state: {
      rulesVersion: "group-combat.v1",
      sessionId: "group-session",
      partySessionId: "party-session",
      encounterKey: "proof-cellar-many",
      deterministicSeed: 42,
      status: "active",
      turn: 1,
      participants: [
        actor("character-1", "1001", "Лідерка", 0),
        actor("character-2", "1002", "Друг", 1)
      ],
      enemies: [
        { id: "enemy-1", name: "Шурхіт", order: 0, hp: 12, hpMax: 12, attack: 4, defense: 0 },
        { id: "enemy-2", name: "Гуп", order: 1, hp: 14, hpMax: 14, attack: 5, defense: 1 }
      ],
      contributions: [
        { characterId: "character-1", damage: 0, healing: 0, guardedTurns: 0 },
        { characterId: "character-2", damage: 0, healing: 0, guardedTurns: 0 }
      ],
      recap: []
    }
  };
}

function participantRecord(characterId: string, telegramUserId: bigint, name: string, rosterOrder: number, messageId: number) {
  return {
    characterId,
    telegramUserId,
    name,
    remortCount: 0,
    rosterOrder,
    chatId: telegramUserId,
    messageId,
    referenceVersion: 1
  };
}

function actor(characterId: string, telegramUserId: string, name: string, rosterOrder: number) {
  return {
    characterId,
    telegramUserId,
    name,
    remortCount: 0,
    rosterOrder,
    hp: 30,
    hpMax: 30,
    mana: 13,
    manaMax: 13,
    attack: 8,
    defense: 2,
    support: 5,
    equipmentItemIds: []
  };
}

function testBot(): Bot {
  return new Bot("test-token", {
    botInfo: { id: 123, is_bot: true, first_name: "Квестарня", username: "kvestarnia_bot" }
  });
}

function commandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 1001, type: "private" as const },
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      text,
      entities: [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0]!.length }]
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: "callback-2",
      from: { id: 1001, is_bot: false, first_name: "Лідерка" },
      chat_instance: "proof",
      data,
      message: {
        message_id: 2,
        date: 1,
        chat: { id: 1001, type: "private" as const }
      }
    }
  };
}

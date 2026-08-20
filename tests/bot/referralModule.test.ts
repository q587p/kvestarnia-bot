import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { registerReferralBotModule } from "../../src/bot/modules/referral";
import { REFERRAL_INVITE_SHARE_TEXT_COUNT, referralInviteShareText } from "../../src/content/referralInviteCopy";
import type { ReferralService } from "../../src/services/referralService";

describe("referral bot module", () => {
  it("opens and regenerates owner-bound share drafts without rotating the stable URL", async () => {
    const inviteUrl = "https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890";
    const inviterIdentity = {
      name: "Кличко",
      activeCosmeticTitle: "Перший писар",
      guildCrest: "🐉"
    };
    const shareTexts = Array.from(
      { length: REFERRAL_INVITE_SHARE_TEXT_COUNT },
      (_, index) => referralInviteShareText(index, inviterIdentity)
    );
    const getDashboard = vi.fn().mockResolvedValue({
      state: "ready",
      inviteUrl,
      shareText: shareTexts[0],
      shareTexts,
      inviterIdentity,
      hasCharacter: true,
      arrivedTotal: 0,
      grantedStageTotal: 0,
      pendingStageTotal: 0,
      earnedByMilestone: { LEVEL_3: 0, LEVEL_5: 0, LEVEL_8: 0, LEVEL_13: 0 }
    });
    const edits: Array<{ text: string; reply_markup: unknown }> = [];
    const answers: unknown[] = [];
    const bot = testBot();
    bot.api.config.use((_prev, method, payload) => {
      if (method === "editMessageText") {
        edits.push({ text: String(payload.text), reply_markup: payload.reply_markup });
      }
      if (method === "answerCallbackQuery") {
        answers.push(payload);
      }
      return Promise.resolve(method === "answerCallbackQuery"
        ? { ok: true, result: true }
        : { ok: true, result: { message_id: 13 } });
    });
    registerReferralBotModule(bot, {
      getDashboard,
      areDevHelpersEnabled: () => false
    } as unknown as ReferralService);

    await bot.handleUpdate(callbackUpdate("v1:ref:s:1"));

    expect(getDashboard).toHaveBeenCalledWith(42n);
    expect(answers).toContainEqual(expect.objectContaining({
      text: "Інший текст готовий; посилання не змінилося."
    }));
    expect(edits).toHaveLength(1);
    expect(edits[0]?.text).toContain("🐉 <b>Кличко</b> (<i>«Перший писар»</i>) кличе тебе до Квестарні");
    expect(edits[0]?.text).not.toContain("«<b>Кличко</b>»");
    expect(edits[0]?.text).not.toContain("Ґільдія:");
    expect(edits[0]?.text).toContain(inviteUrl);
    expect(edits[0]?.text).not.toContain("Варіянт");
    const buttons = (edits[0]?.reply_markup as {
      inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
    }).inline_keyboard.flat();
    expect(buttons).toEqual([expect.objectContaining({
      text: "🎲 Інший текст",
      callback_data: "v1:ref:s:2"
    })]);
  });
});

function testBot(): Bot {
  return new Bot("test-token", {
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: "Квестарня",
      username: "kvestarnia_bot"
    }
  });
}

function callbackUpdate(data: string) {
  return {
    update_id: 93,
    callback_query: {
      id: "callback-93",
      from: { id: 42, is_bot: false, first_name: "Тест" },
      chat_instance: "test",
      data,
      message: {
        message_id: 13,
        date: 1,
        chat: { id: 42, type: "private" as const },
        text: "Стара картка"
      }
    }
  };
}

import { describe, expect, it } from "vitest";
import {
  makeDuelAcceptCallbackData,
  makeDuelAcceptRiskCallbackData,
  makeDuelCancelCallbackData,
  makeDuelDeclineCallbackData,
  makeDuelViewCallbackData
} from "../../src/bot/callbacks/duelCallbackData";
import {
  buildDuelAcceptConfirmationKeyboard,
  buildDuelChallengeKeyboard,
  buildDuelOwnerChallengeKeyboard,
  buildDuelTargetedInviteKeyboard
} from "../../src/bot/keyboards/duelKeyboard";
import type { DuelChallengeView } from "../../src/services/duelChallengeService";

const TOKEN = "abcDEF12";
const pending = {
  state: "pending",
  challenge: { inviteToken: TOKEN }
} as unknown as Extract<DuelChallengeView, { state: "pending" }>;

describe("duel decision keyboards", () => {
  it("uses details instead of a misleading accept action on initial invite cards", () => {
    expect(buildDuelChallengeKeyboard(pending).inline_keyboard).toEqual([
      [{ text: "📖 Детальніше", callback_data: makeDuelAcceptCallbackData(TOKEN) }],
      [{ text: "🙅 Відмовитись", callback_data: makeDuelDeclineCallbackData(TOKEN) }],
      [{ text: "🔄 Оновити", callback_data: makeDuelViewCallbackData(TOKEN) }]
    ]);
    expect(buildDuelTargetedInviteKeyboard(pending).inline_keyboard).toEqual([
      [{ text: "📖 Детальніше", callback_data: makeDuelAcceptCallbackData(TOKEN) }],
      [{ text: "🙅 Відмовитись", callback_data: makeDuelDeclineCallbackData(TOKEN) }],
      [{ text: "🔄 Оновити", callback_data: makeDuelViewCallbackData(TOKEN) }]
    ]);
  });

  it("keeps decision actions off the invite owner's status card", () => {
    expect(buildDuelOwnerChallengeKeyboard(TOKEN).inline_keyboard).toEqual([
      [{ text: "🧹 Скасувати виклик", callback_data: makeDuelCancelCallbackData(TOKEN) }],
      [{ text: "🔄 Оновити", callback_data: makeDuelViewCallbackData(TOKEN) }]
    ]);
  });

  it("keeps the only player-facing accept action on the detailed confirmation card", () => {
    const keyboard = buildDuelAcceptConfirmationKeyboard(TOKEN).inline_keyboard;

    expect(keyboard[0]).toEqual([
      { text: "🤝 Так, прийняти", callback_data: makeDuelAcceptRiskCallbackData(TOKEN) }
    ]);
    expect(keyboard.flat().map((button) => button.text)).not.toContain("📖 Детальніше");
  });
});

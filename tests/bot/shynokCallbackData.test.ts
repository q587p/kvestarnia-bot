import { describe, expect, it } from "vitest";
import {
  makeShynokBardPerformanceApplaudCallbackData,
  makeShynokBardPerformanceStartCallbackData,
  makeShynokBardPerformanceTipCallbackData,
  makeShynokDicePokerCancelCallbackData,
  makeShynokDicePokerCreateCallbackData,
  makeShynokDicePokerDoppelgangerCreateCallbackData,
  makeShynokDicePokerModeCallbackData,
  makeShynokDicePokerRollCallbackData,
  makeShynokDicePokerRulesCallbackData,
  makeShynokDicePokerScoreCallbackData,
  makeShynokDicePokerToggleCallbackData,
  makeShynokDicePokerViewCallbackData,
  makeShynokDoppelgangerMenuCallbackData,
  makeShynokDoppelgangerModeCallbackData,
  makeShynokDrinkConfirmCallbackData,
  makeShynokDrinkPreviewCallbackData,
  makeShynokGameCancelCallbackData,
  makeShynokGameCreateCallbackData,
  makeShynokGameInviteRotateCallbackData,
  makeShynokGameJoinCallbackData,
  makeShynokGameLeaderboardCallbackData,
  makeShynokGameReadinessCallbackData,
  makeShynokGameRematchCallbackData,
  makeShynokGameResolveCallbackData,
  makeShynokGameRulesCallbackData,
  makeShynokGameShareCallbackData,
  makeShynokGamesCallbackData,
  makeShynokKostiDecisionCallbackData,
  makeShynokRoundConfirmCallbackData,
  makeShynokRoundOfferOpenCallbackData,
  makeShynokRoundReplacementConfirmCallbackData,
  makeShynokSaleAddCallbackData,
  makeShynokSaleConfirmCallbackData,
  makeShynokTavleiDoppelgangerCreateCallbackData,
  makeShynokTavleiDecisionCallbackData,
  parseShynokCallbackData
} from "../../src/bot/callbacks/shynokCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("shynokCallbackData", () => {
  const token = "12345678-1234-4234-9234-123456789abc";

  it("round-trips compact drink, round and sale callbacks", () => {
    expect(parseShynokCallbackData(makeShynokDrinkPreviewCallbackData("drink.thyme-tea"))).toEqual({
      ok: true,
      value: { type: "drink-preview", drinkKey: "drink.thyme-tea" }
    });
    expect(parseShynokCallbackData(makeShynokDrinkConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "drink-confirm", token }
    });
    expect(parseShynokCallbackData(makeShynokRoundConfirmCallbackData("fine", token))).toEqual({
      ok: true,
      value: { type: "round-confirm", tier: "fine", token }
    });
    expect(parseShynokCallbackData(makeShynokRoundOfferOpenCallbackData(token))).toEqual({
      ok: true,
      value: { type: "round-offer-open", offerId: token }
    });
    expect(parseShynokCallbackData(makeShynokRoundReplacementConfirmCallbackData(token, "abcdef1234567890"))).toEqual({
      ok: true,
      value: { type: "round-replace-confirm", offerId: token, replacementGuard: "abcdef1234567890" }
    });
    expect(parseShynokCallbackData(makeShynokSaleAddCallbackData(token, 2, 4))).toEqual({
      ok: true,
      value: { type: "sale-add", token, page: 2, index: 4 }
    });
    expect(parseShynokCallbackData(makeShynokSaleConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "sale-confirm", token }
    });
    expect(parseShynokCallbackData(makeShynokBardPerformanceStartCallbackData())).toEqual({
      ok: true,
      value: { type: "bard-performance-start" }
    });
    expect(parseShynokCallbackData(makeShynokBardPerformanceApplaudCallbackData(token))).toEqual({
      ok: true,
      value: { type: "bard-performance-applaud", reactionId: token }
    });
    expect(parseShynokCallbackData(makeShynokBardPerformanceTipCallbackData(token, 13))).toEqual({
      ok: true,
      value: { type: "bard-performance-tip", reactionId: token, tipGold: 13 }
    });
  });

  it("rejects invalid or oversized callbacks", () => {
    expect(parseShynokCallbackData("v1:sh:dp:not-a-drink").ok).toBe(false);
    expect(parseShynokCallbackData("v1:sh:dc:not-a-token").ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:rr:${token}:not-a-guard`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:bt:${token}:2`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:dc:${"a".repeat(80)}`).ok).toBe(false);
  });

  it("keeps round replacement confirmation callbacks below Telegram limits", () => {
    expect(Buffer.byteLength(makeShynokRoundReplacementConfirmCallbackData(token, "abcdef1234567890"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokBardPerformanceTipCallbackData(token, 13), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("round-trips tavern social game callbacks", () => {
    expect(parseShynokCallbackData(makeShynokGamesCallbackData())).toEqual({
      ok: true,
      value: { type: "games" }
    });
    expect(parseShynokCallbackData(makeShynokGameLeaderboardCallbackData())).toEqual({
      ok: true,
      value: { type: "game-leaderboard" }
    });
    expect(parseShynokCallbackData(makeShynokGameRulesCallbackData("kosti"))).toEqual({
      ok: true,
      value: { type: "game-rules", gameKey: "kosti" }
    });
    expect(parseShynokCallbackData(makeShynokGameCreateCallbackData("tavlei", 13))).toEqual({
      ok: true,
      value: { type: "game-create", gameKey: "tavlei", stakeGold: 13 }
    });
    expect(parseShynokCallbackData(makeShynokDoppelgangerMenuCallbackData())).toEqual({
      ok: true,
      value: { type: "game-doppelganger-menu" }
    });
    expect(parseShynokCallbackData(makeShynokDoppelgangerModeCallbackData("tavlei"))).toEqual({
      ok: true,
      value: { type: "game-doppelganger-mode", gameKey: "tavlei" }
    });
    expect(parseShynokCallbackData(makeShynokTavleiDoppelgangerCreateCallbackData(13))).toEqual({
      ok: true,
      value: { type: "game-tavlei-doppelganger-create", stakeGold: 13 }
    });
    expect(parseShynokCallbackData(makeShynokGameJoinCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-join", token }
    });
    expect(parseShynokCallbackData(makeShynokGameReadinessCallbackData(token, "ready"))).toEqual({
      ok: true,
      value: { type: "game-readiness", token, readiness: "ready" }
    });
    expect(parseShynokCallbackData(makeShynokGameReadinessCallbackData(token, "waiting"))).toEqual({
      ok: true,
      value: { type: "game-readiness", token, readiness: "waiting" }
    });
    expect(parseShynokCallbackData(makeShynokGameRematchCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-rematch", token }
    });
    expect(parseShynokCallbackData(makeShynokGameShareCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-share", token }
    });
    expect(parseShynokCallbackData(makeShynokGameInviteRotateCallbackData(token, 13))).toEqual({
      ok: true,
      value: { type: "game-invite", token, templateIndex: 13 }
    });
    expect(parseShynokCallbackData(makeShynokGameCancelCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-cancel", token }
    });
    expect(parseShynokCallbackData(makeShynokTavleiDecisionCallbackData(token, "quiet_trap"))).toEqual({
      ok: true,
      value: { type: "game-tavlei-decision", token, tactic: "quiet_trap" }
    });
    expect(parseShynokCallbackData(makeShynokKostiDecisionCallbackData(token, "sign_hunter", "straight"))).toEqual({
      ok: true,
      value: { type: "game-kosti-decision", token, style: "sign_hunter", sign: "straight" }
    });
    expect(parseShynokCallbackData(makeShynokGameResolveCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-resolve", token }
    });
  });

  it("keeps combined Kosti decision callbacks below Telegram limits", () => {
    expect(Buffer.byteLength(makeShynokKostiDecisionCallbackData(token, "sign_hunter", "straight"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokDoppelgangerModeCallbackData("scorecard"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokTavleiDoppelgangerCreateCallbackData(93), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokGameRematchCallbackData(token), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokGameShareCallbackData(token), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokGameInviteRotateCallbackData(token, 93), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokGameReadinessCallbackData(token, "ready"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("round-trips compact dice poker callbacks", () => {
    expect(parseShynokCallbackData(makeShynokDicePokerModeCallbackData("quick"))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-mode", mode: "quick" }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerModeCallbackData("scorecard"))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-mode", mode: "scorecard" }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerCreateCallbackData("quick", 13))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-create", mode: "quick", stakeGold: 13 }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerCreateCallbackData("scorecard", 23))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-create", mode: "scorecard", stakeGold: 23 }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerDoppelgangerCreateCallbackData("quick", 13))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-doppelganger-create", mode: "quick", stakeGold: 13 }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerRulesCallbackData())).toEqual({
      ok: true,
      value: { type: "game-dice-poker-rules" }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerRulesCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-rules", token }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerViewCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-view", token }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerToggleCallbackData(token, 4))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-toggle", token, index: 4 }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerRollCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-roll", token }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerScoreCallbackData(token, "full_house"))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-score", token, category: "full_house" }
    });
    expect(parseShynokCallbackData(makeShynokDicePokerCancelCallbackData(token))).toEqual({
      ok: true,
      value: { type: "game-dice-poker-cancel", token }
    });
  });

  it("keeps dice poker callbacks below Telegram limits", () => {
    expect(Buffer.byteLength(makeShynokDicePokerScoreCallbackData(token, "large_straight"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokDicePokerToggleCallbackData(token, 4), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokDicePokerRulesCallbackData(token), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokDicePokerViewCallbackData(token), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("rejects invalid tavern social game callbacks", () => {
    expect(parseShynokCallbackData("v1:sh:gc:x:3").ok).toBe(false);
    expect(parseShynokCallbackData("v1:sh:gdo:x").ok).toBe(false);
    expect(parseShynokCallbackData("v1:sh:gtn:0").ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:gt:${token}:bad`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:gk:${token}:st:bad`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:gdt:${token}:5`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:gds:${token}:bad`).ok).toBe(false);
  });
});

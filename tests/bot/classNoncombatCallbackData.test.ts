import { describe, expect, it } from "vitest";
import {
  makeClassNoncombatOpenCallbackData,
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeRoguePickpocketCallbackData,
  makeRogueRetaliationDuelCallbackData,
  parseClassNoncombatCallbackData
} from "../../src/bot/callbacks/classNoncombatCallbackData";

describe("class noncombat callback data", () => {
  it("encodes open callbacks with mode and page", () => {
    expect(parseClassNoncombatCallbackData(makeClassNoncombatOpenCallbackData("priest", 2))).toEqual({
      ok: true,
      value: { type: "open", mode: "priest", page: 2 }
    });

    expect(parseClassNoncombatCallbackData(makeClassNoncombatOpenCallbackData("rogue"))).toEqual({
      ok: true,
      value: { type: "open", mode: "rogue", page: 0 }
    });
  });

  it("encodes Priest self heal and blessing with remort counters", () => {
    expect(parseClassNoncombatCallbackData(makePriestHealCallbackData({
      targetTelegramUserId: null,
      actorRemortCount: 2,
      targetRemortCount: 2,
      page: 3
    }))).toEqual({
      ok: true,
      value: {
        type: "priest-heal",
        targetTelegramUserId: null,
        actorRemortCount: 2,
        targetRemortCount: 2,
        page: 3
      }
    });

    expect(parseClassNoncombatCallbackData(makePriestBlessCallbackData({
      targetTelegramUserId: 123456789n,
      actorRemortCount: 1,
      targetRemortCount: 4
    }))).toEqual({
      ok: true,
      value: {
        type: "priest-bless",
        targetTelegramUserId: 123456789n,
        actorRemortCount: 1,
        targetRemortCount: 4,
        page: 0
      }
    });
  });

  it("encodes Rogue target callbacks and rejects self target payloads", () => {
    expect(parseClassNoncombatCallbackData(makeRoguePickpocketCallbackData({
      targetTelegramUserId: 987654321n,
      actorRemortCount: 0,
      targetRemortCount: 1,
      page: 1
    }))).toEqual({
      ok: true,
      value: {
        type: "rogue-pickpocket",
        targetTelegramUserId: 987654321n,
        actorRemortCount: 0,
        targetRemortCount: 1,
        page: 1
      }
    });

    expect(parseClassNoncombatCallbackData("v1:nc:p:s:0:0:0")).toEqual({
      ok: false,
      error: "invalid-target"
    });
  });

  it("encodes Rogue retaliation duel callbacks with an opaque attempt token and mode", () => {
    expect(parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      mode: "quick",
      retaliationToken: "abc123xy"
    }))).toEqual({
      ok: true,
      value: {
        type: "rogue-retaliation-duel",
        mode: "quick",
        retaliationToken: "abc123xy"
      }
    });

    expect(parseClassNoncombatCallbackData(makeRogueRetaliationDuelCallbackData({
      mode: "turn-based",
      retaliationToken: "turn1234"
    }))).toEqual({
      ok: true,
      value: {
        type: "rogue-retaliation-duel",
        mode: "turn-based",
        retaliationToken: "turn1234"
      }
    });

    expect(parseClassNoncombatCallbackData("v1:nc:rd:abc123xy")).toEqual({
      ok: true,
      value: {
        type: "rogue-retaliation-duel",
        mode: "quick",
        retaliationToken: "abc123xy"
      }
    });

    expect(parseClassNoncombatCallbackData("v1:nc:rd:short")).toEqual({
      ok: false,
      error: "invalid-target"
    });
    expect(parseClassNoncombatCallbackData("v1:nc:rd:x:abc123xy")).toEqual({
      ok: false,
      error: "invalid-target"
    });
    expect(parseClassNoncombatCallbackData(`v1:nc:rd:${"a".repeat(60)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
    expect(parseClassNoncombatCallbackData("v1:nc:rd:q:abc123xy:extra")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
  });
});

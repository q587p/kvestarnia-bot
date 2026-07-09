import { describe, expect, it } from "vitest";
import {
  makeDuelTournamentClaimCallbackData,
  makeDuelTournamentOpenCallbackData,
  makeDuelTournamentRulesCallbackData,
  parseDuelTournamentCallbackData
} from "../../src/bot/callbacks/duelTournamentCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("duel tournament callback data", () => {
  it("round-trips open and claim callbacks", () => {
    expect(parseDuelTournamentCallbackData(makeDuelTournamentOpenCallbackData("day"))).toEqual({
      ok: true,
      value: { action: "open", period: "day" }
    });
    expect(parseDuelTournamentCallbackData(makeDuelTournamentOpenCallbackData("week"))).toEqual({
      ok: true,
      value: { action: "open", period: "week" }
    });
    expect(parseDuelTournamentCallbackData(makeDuelTournamentRulesCallbackData("week"))).toEqual({
      ok: true,
      value: { action: "rules", period: "week" }
    });
    expect(parseDuelTournamentCallbackData(makeDuelTournamentClaimCallbackData("month", "2026-07"))).toEqual({
      ok: true,
      value: { action: "claim", period: "month", periodKey: "2026-07" }
    });
  });

  it("rejects stale malformed period keys and keeps data compact", () => {
    expect(parseDuelTournamentCallbackData("v1:tour:c:d:20260708")).toEqual({
      ok: false,
      error: "invalid-period-key"
    });
    expect(parseDuelTournamentCallbackData("v1:tour:o:x")).toEqual({
      ok: false,
      error: "invalid-period"
    });
    expect(Buffer.byteLength(makeDuelTournamentClaimCallbackData("week", "2026-W28"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });
});

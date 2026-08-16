import { describe, expect, it } from "vitest";
import {
  GUILD_CREST_CATALOG,
  GUILD_CREATION_GOLD,
  GUILD_DESCRIPTION_MAX_GRAPHEMES,
  GUILD_INITIAL_MEMBER_CAPACITY,
  GUILD_MAX_MEMBER_CAPACITY,
  isEligibleGuildFounder,
  validateGuildCrest,
  validateGuildIdentity,
  validateGuildProfile
} from "../../src/domain/guild";

describe("guild identity", () => {
  it("normalizes Unicode, case and whitespace into one server-owned name key", () => {
    expect(validateGuildIdentity({
      displayName: "  ВАРЕНИЧНИЙ   Статут  ",
      crest: "🛡️",
      description: "  Коротко   й безпечно. "
    })).toEqual({
      ok: true,
      displayName: "ВАРЕНИЧНИЙ Статут",
      normalizedName: "вареничний статут",
      crest: "🛡️",
      crestKind: "catalog",
      crestReservationKey: "🛡️",
      description: "Коротко й безпечно."
    });
  });

  it.each([
    [{ displayName: "Квестарня", crest: "🛡️", description: "" }, "name-reserved"],
    [{ displayName: "<b>Печатка</b>", crest: "🛡️", description: "" }, "name-unsafe"],
    [{ displayName: "Добра Печатка", crest: "Щ", description: "" }, "crest"],
    [{ displayName: "Добра Pечатка", crest: "🛡️", description: "" }, "name-unsafe"],
    [{ displayName: "Добра Печатка", crest: "🛡️", description: "x".repeat(GUILD_DESCRIPTION_MAX_GRAPHEMES + 1) }, "description-length"]
  ] as const)("rejects unsafe guild identity with %s", (input, reason) => {
    expect(validateGuildIdentity(input)).toEqual({ ok: false, reason });
  });

  it("keeps the accepted founder, gold and crest boundaries exact", () => {
    expect(GUILD_CREATION_GOLD).toBe(587);
    expect(GUILD_CREST_CATALOG).toHaveLength(13);
    expect(GUILD_INITIAL_MEMBER_CAPACITY).toBe(8);
    expect(GUILD_MAX_MEMBER_CAPACITY).toBe(13);
    expect(GUILD_INITIAL_MEMBER_CAPACITY).toBeLessThan(GUILD_MAX_MEMBER_CAPACITY);
    expect(isEligibleGuildFounder(5, 0)).toBe(true);
    expect(isEligibleGuildFounder(3, 1)).toBe(true);
    expect(isEligibleGuildFounder(4, 0)).toBe(false);
    expect(isEligibleGuildFounder(2, 42)).toBe(false);
  });

  it("accepts genuine emoji sequences and rejects text, lone flags or several graphemes", () => {
    const englandFlag = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
    expect(validateGuildCrest("🛡️")).toEqual({
      ok: true, crest: "🛡️", crestKind: "catalog", crestReservationKey: "🛡️"
    });
    expect(validateGuildCrest(" 🧿 ")).toEqual({
      ok: true, crest: "🧿", crestKind: "custom", crestReservationKey: "🧿"
    });
    expect(validateGuildCrest("🇺🇦")).toEqual({
      ok: true, crest: "🇺🇦", crestKind: "custom", crestReservationKey: "🇺🇦"
    });
    expect(validateGuildCrest("👍🏽")).toEqual({
      ok: true, crest: "👍🏽", crestKind: "custom", crestReservationKey: "👍🏽"
    });
    expect(validateGuildCrest("👩‍⚕️")).toEqual({
      ok: true, crest: "👩‍⚕️", crestKind: "custom", crestReservationKey: "👩‍⚕"
    });
    expect(validateGuildCrest(englandFlag)).toEqual({
      ok: true, crest: englandFlag, crestKind: "custom", crestReservationKey: englandFlag
    });
    expect(validateGuildCrest("Щ")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("🇺")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("🧿🦉")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("😀‍😀")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("🧿‍🐉")).toEqual({ ok: false, reason: "crest" });
  });

  it("rejects variation-decorated text and canonicalizes presentation aliases", () => {
    expect(validateGuildCrest("A️")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("<️")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("&️")).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildCrest("🛡")).toEqual({
      ok: true, crest: "🛡️", crestKind: "catalog", crestReservationKey: "🛡️"
    });
    expect(validateGuildCrest("🛡️")).toEqual({
      ok: true, crest: "🛡️", crestKind: "catalog", crestReservationKey: "🛡️"
    });
    expect(validateGuildCrest("❤")).toEqual({
      ok: true, crest: "❤", crestKind: "custom", crestReservationKey: "❤"
    });
    expect(validateGuildCrest("❤️")).toEqual({
      ok: true, crest: "❤️", crestKind: "custom", crestReservationKey: "❤"
    });
  });

  it.each([
    "\u2764\uFE0E",
    "\u00A9\uFE0E",
    "\u2122\uFE0E",
    "\u{1F469}\u200D\u2695\uFE0E",
    "\u2600\uFE0E"
  ])("rejects explicit text-presentation crest %s", (crest) => {
    expect(validateGuildCrest(crest)).toEqual({ ok: false, reason: "crest" });
  });

  it("validates leader-editable crest and 93-grapheme description independently of names", () => {
    expect(validateGuildProfile({ crest: "🦉", description: "  Тиха   рада. " })).toEqual({
      ok: true,
      crest: "🦉",
      crestKind: "catalog",
      crestReservationKey: "🦉",
      description: "Тиха рада."
    });
    expect(validateGuildProfile({ crest: "🧿", description: "" })).toEqual({
      ok: true,
      crest: "🧿",
      crestKind: "custom",
      crestReservationKey: "🧿",
      description: ""
    });
    expect(validateGuildProfile({ crest: "🦉", description: "x".repeat(94) })).toEqual({
      ok: false,
      reason: "description-length"
    });
  });
});

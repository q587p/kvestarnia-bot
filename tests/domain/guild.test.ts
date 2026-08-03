import { describe, expect, it } from "vitest";
import {
  GUILD_CREST_CATALOG,
  GUILD_CREATION_GOLD,
  GUILD_DESCRIPTION_MAX_GRAPHEMES,
  isEligibleGuildFounder,
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
    expect(isEligibleGuildFounder(5, 0)).toBe(true);
    expect(isEligibleGuildFounder(3, 1)).toBe(true);
    expect(isEligibleGuildFounder(4, 0)).toBe(false);
    expect(isEligibleGuildFounder(2, 42)).toBe(false);
  });

  it("validates leader-editable crest and 93-grapheme description independently of names", () => {
    expect(validateGuildProfile({ crest: "🦉", description: "  Тиха   рада. " })).toEqual({
      ok: true,
      crest: "🦉",
      description: "Тиха рада."
    });
    expect(validateGuildProfile({ crest: "🧿", description: "" })).toEqual({ ok: false, reason: "crest" });
    expect(validateGuildProfile({ crest: "🦉", description: "x".repeat(94) })).toEqual({
      ok: false,
      reason: "description-length"
    });
  });
});

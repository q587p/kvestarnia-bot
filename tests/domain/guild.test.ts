import { describe, expect, it } from "vitest";
import { validateGuildIdentity } from "../../src/domain/guild";

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
    [{ displayName: "Добра Печатка", crest: "🛡️", description: "x".repeat(121) }, "description-length"]
  ] as const)("rejects unsafe guild identity with %s", (input, reason) => {
    expect(validateGuildIdentity(input)).toEqual({ ok: false, reason });
  });
});

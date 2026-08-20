import { describe, expect, it } from "vitest";
import {
  REFERRAL_INVITE_SHARE_TEXT_COUNT,
  REFERRAL_INVITE_SHARE_TEXT_TEMPLATES,
  normalizeReferralInviteShareTextIndex,
  referralInviteShareText
} from "../../src/content/referralInviteCopy";

describe("referral invitation copy", () => {
  it("provides thirteen distinct compact Ukrainian variants", () => {
    const identity = {
      name: "Кличко",
      activeCosmeticTitle: "Перший писар",
      guildCrest: "🐉",
      guildName: "Лускаті рахівники"
    };
    const texts = REFERRAL_INVITE_SHARE_TEXT_TEMPLATES.map((_, index) =>
      referralInviteShareText(index, identity)
    );

    expect(REFERRAL_INVITE_SHARE_TEXT_COUNT).toBe(13);
    expect(new Set(texts).size).toBe(13);
    expect(texts.every((text) =>
      text.includes("«Кличко»") &&
      text.includes("Титул: «Перший писар»") &&
      text.includes("Ґільдія: 🐉 Лускаті рахівники") &&
      text.length <= 320
    )).toBe(true);
    expect(texts.join(" ")).not.toContain("item.");
  });

  it("cycles variants without changing or embedding a referral token", () => {
    expect(normalizeReferralInviteShareTextIndex(13)).toBe(0);
    expect(normalizeReferralInviteShareTextIndex(-1)).toBe(12);
    expect(referralInviteShareText(13, "Кличко")).toBe(referralInviteShareText(0, "Кличко"));
    expect(referralInviteShareText(0, "Кличко")).not.toContain("ref1_");
  });
});

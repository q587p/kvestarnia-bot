import { describe, expect, it } from "vitest";
import { parseReferralCallbackData } from "../../src/bot/callbacks/referralCallbackData";
import { buildReferralDashboardKeyboard } from "../../src/bot/keyboards/referralKeyboard";
import {
  presentReferralConsent,
  presentReferralDashboard,
  presentReferralInvitees,
  presentReferralNotification
} from "../../src/bot/presenters/referralPresenter";

const dashboard = {
  state: "ready" as const,
  inviteUrl: "https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890",
  shareText: "📨 Поклик до Квестарні\n\n«Кличко» лишає тобі поклик.",
  hasCharacter: true,
  arrivedTotal: 1,
  grantedStageTotal: 1,
  pendingStageTotal: 1,
  earnedByMilestone: { LEVEL_3: 1, LEVEL_5: 1, LEVEL_8: 0, LEVEL_13: 0 }
};

describe("referral Telegram surfaces", () => {
  it("keeps future rewards qualitative, preserves privacy disclosure, and escapes names", () => {
    expect(presentReferralDashboard(dashboard)).toContain("Пізніші етапи щедріші");
    expect(presentReferralDashboard(dashboard)).not.toContain("1830");
    expect(presentReferralDashboard(dashboard)).not.toContain("Щільний бинт");
    expect(presentReferralDashboard(dashboard)).toContain("⏳ Автоматичної доставки чекає: <b>1</b>");
    const consent = presentReferralConsent("<Марта>\u0000");
    expect(consent).toContain("«&lt;Марта&gt;»");
    expect(consent).toContain("Telegram-профіль, місце, справи, речі, золото та ґільдія лишаться приватними");
    expect(consent).toContain("Хроніки Квестарні публічно запишуть");
  });

  it("keeps callback data token-free, bounded, and rejects malformed pages", () => {
    expect(parseReferralCallbackData("v1:ref:l:93")).toEqual({ ok: true, value: { type: "list", page: 93 } });
    expect(parseReferralCallbackData("v1:ref:l:-1")).toEqual({ ok: false });
    expect(parseReferralCallbackData(`v1:ref:${"x".repeat(70)}`)).toEqual({ ok: false });
    expect(JSON.stringify(buildReferralDashboardKeyboard(dashboard).inline_keyboard)).not.toContain("v1:ref:abCD_123-xyZ7890");
    const shareButton = buildReferralDashboardKeyboard(dashboard).inline_keyboard.flat()
      .find((button) => "url" in button && button.url.startsWith("https://t.me/share/url?"));
    expect(shareButton && "url" in shareButton ? decodeURIComponent(shareButton.url) : "")
      .toContain(`url=${dashboard.inviteUrl}&text=${dashboard.shareText}`);
    expect(dashboard.shareText).not.toContain(dashboard.inviteUrl);
  });

  it("provides reachable pagination and separates pending from granted history", () => {
    const page = {
      rows: [{
        attributionId: "a1",
        name: "<Оля>",
        level: 5,
        stages: [
          { milestoneKey: "LEVEL_3" as const, state: "GRANTED" as const },
          { milestoneKey: "LEVEL_5" as const, state: "PENDING" as const }
        ]
      }],
      page: 1,
      totalPages: 3,
      totalCount: 13
    };
    const text = presentReferralInvitees(page);
    expect(text).toContain("«&lt;Оля&gt;»");
    expect(text).toContain("3:✅ · 5:⏳ · 8:▫️ · 13:▫️");
  });

  it("rejects corrupt notification payloads and renders only safe grant details", () => {
    expect(presentReferralNotification("REFERRAL_PAYOUT_GRANTED", { level: 3, gold: 50, items: "bad" })).toBeNull();
    expect(presentReferralNotification("REFERRAL_PAYOUT_GRANTED", {
      milestoneKey: "LEVEL_3",
      level: 3,
      gold: 50,
      items: [{ itemId: "item.counterfeit", quantity: 1 }]
    })).toBeNull();
    const text = presentReferralNotification("REFERRAL_PAYOUT_GRANTED", {
      milestoneKey: "LEVEL_3",
      inviteeName: "<Лада>",
      level: 3,
      gold: 50,
      items: [
        { itemId: "item.dense-bandage", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 5 }
      ]
    });
    expect(text).toContain("«&lt;Лада&gt;»");
    expect(text).not.toContain("telegram");
  });
});

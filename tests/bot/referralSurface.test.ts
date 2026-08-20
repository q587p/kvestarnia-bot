import { describe, expect, it } from "vitest";
import { parseReferralCallbackData } from "../../src/bot/callbacks/referralCallbackData";
import {
  buildReferralDashboardKeyboard,
  buildReferralShareKeyboard
} from "../../src/bot/keyboards/referralKeyboard";
import {
  REFERRAL_INVITE_SHARE_TEXT_COUNT,
  referralInviteShareText
} from "../../src/content/referralInviteCopy";
import {
  presentReferralConsent,
  presentReferralDashboard,
  presentReferralInvitees,
  presentReferralNotification,
  presentReferralShareDraft
} from "../../src/bot/presenters/referralPresenter";

const dashboard = {
  state: "ready" as const,
  inviteUrl: "https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890",
  shareText: "📨 Поклик до Квестарні\n\n«Кличко» лишає тобі поклик.",
  shareTexts: Array.from(
    { length: REFERRAL_INVITE_SHARE_TEXT_COUNT },
    (_, index) => referralInviteShareText(index, "Кличко")
  ),
  hasCharacter: true,
  arrivedTotal: 1,
  grantedStageTotal: 1,
  pendingStageTotal: 1,
  earnedByMilestone: { LEVEL_3: 1, LEVEL_5: 1, LEVEL_8: 0, LEVEL_13: 0 }
};

describe("referral Telegram surfaces", () => {
  it("discloses the owner-approved exact dashboard track while preserving invitee privacy", () => {
    const text = presentReferralDashboard(dashboard);
    expect(text).toContain("3 рівень — 🩹 Щільний бинт ×1 · ✨ 5 Іскрокаменів · 💰 50 золота");
    expect(text).toContain("5 рівень — ⚕️ Польова аптечка ×1 · ✨ 13 Іскрокаменів · 💰 120 золота");
    expect(text).toContain("8 рівень — ⚕️ Польова аптечка ×2 · ✨ 65 Іскрокаменів · 💰 760 золота");
    expect(text).toContain("13 рівень — ⚕️ Польова аптечка ×3 · ✨ 193 Іскрокамені · 💰 900 золота");
    expect(text).not.toContain("Разом —");
    expect(text).not.toContain("item.");
    expect(text).not.toContain("після її досягнення");
    expect(presentReferralDashboard(dashboard)).toContain("⏳ Автоматичної доставки чекає: <b>1</b>");
    const consent = presentReferralConsent("<Марта>\u0000");
    expect(consent).toContain("«&lt;Марта&gt;»");
    expect(consent).toContain("Telegram-профіль, місце, справи, речі, золото та ґільдія лишаться приватними");
    expect(consent).toContain("Хроніки Квестарні публічно запишуть");
  });

  it("keeps callback data token-free, bounded, and rejects malformed pages", () => {
    expect(parseReferralCallbackData("v1:ref:l:93")).toEqual({ ok: true, value: { type: "list", page: 93 } });
    expect(parseReferralCallbackData("v1:ref:s:c")).toEqual({ ok: true, value: { type: "share", variant: 12 } });
    expect(parseReferralCallbackData("v1:ref:s:d")).toEqual({ ok: false });
    expect(parseReferralCallbackData("v1:ref:l:-1")).toEqual({ ok: false });
    expect(parseReferralCallbackData(`v1:ref:${"x".repeat(70)}`)).toEqual({ ok: false });
    expect(JSON.stringify(buildReferralDashboardKeyboard(dashboard).inline_keyboard)).not.toContain("v1:ref:abCD_123-xyZ7890");
    const dashboardButtons = buildReferralDashboardKeyboard(dashboard).inline_keyboard.flat();
    expect(dashboardButtons).toContainEqual(expect.objectContaining({
      text: "📝 Згенерувати запрошення",
      callback_data: "v1:ref:s:0"
    }));
    expect(dashboardButtons.some((button) => "url" in button)).toBe(false);
    const renderedShareTexts = dashboard.shareTexts.map((expectedText, variant) => {
      const buttons = buildReferralShareKeyboard(dashboard, variant).inline_keyboard.flat();
      const share = buttons.find((button) => "url" in button && button.url.startsWith("https://t.me/share/url?"));
      expect(share && "url" in share ? new URL(share.url).searchParams.get("url") : null)
        .toBe(dashboard.inviteUrl);
      expect(share && "url" in share ? new URL(share.url).searchParams.get("text") : null)
        .toBe(expectedText);
      expect(buttons).toContainEqual(expect.objectContaining({
        text: "🎲 Перегенерувати текст",
        callback_data: `v1:ref:s:${((variant + 1) % REFERRAL_INVITE_SHARE_TEXT_COUNT).toString(36)}`
      }));
      expect(presentReferralShareDraft(dashboard, variant)).toContain(
        `Варіянт <b>${variant + 1}/${REFERRAL_INVITE_SHARE_TEXT_COUNT}</b>`
      );
      return expectedText;
    });
    expect(new Set(renderedShareTexts).size).toBe(13);
    expect(renderedShareTexts.every((text) => !text.includes(dashboard.inviteUrl))).toBe(true);
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
    expect(text).toContain("🩹 Щільний бинт ×1, ✨ 5 Іскрокаменів");
    expect(text).not.toContain("item.");
    expect(text).not.toContain("telegram");
  });
});

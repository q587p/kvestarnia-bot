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
  inviterIdentity: {
    name: "Shannar de Kassal",
    activeCosmeticTitle: "Перший писар",
    guildCrest: "🐉"
  },
  shareText: referralInviteShareText(0, {
    name: "Shannar de Kassal",
    activeCosmeticTitle: "Перший писар",
    guildCrest: "🐉"
  }),
  shareTexts: Array.from(
    { length: REFERRAL_INVITE_SHARE_TEXT_COUNT },
    (_, index) => referralInviteShareText(index, {
      name: "Shannar de Kassal",
      activeCosmeticTitle: "Перший писар",
      guildCrest: "🐉"
    })
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
      const buttons = buildReferralShareKeyboard(variant).inline_keyboard.flat();
      expect(buttons).toEqual([expect.objectContaining({
        text: "🎲 Інший текст",
        callback_data: `v1:ref:s:${((variant + 1) % REFERRAL_INVITE_SHARE_TEXT_COUNT).toString(36)}`
      })]);
      expect(buttons.some((button) => "url" in button || "copy_text" in button)).toBe(false);
      const draft = presentReferralShareDraft(dashboard, variant);
      expect(draft).toContain("<b>📨 Поклик до Квестарні</b>");
      expect(draft).toContain("🐉 <b>Shannar de Kassal</b> (<i>«Перший писар»</i>)");
      expect(draft).not.toContain("«<b>Shannar de Kassal</b>»");
      expect(draft).not.toContain("Ґільдія:");
      expect(draft).not.toContain("Лускаті рахівники");
      expect(draft).toContain(`\n\n${dashboard.inviteUrl}`);
      expect(draft).not.toContain("🔗");
      expect(draft).not.toContain("<a href=");
      expect(draft).not.toContain("Варіянт");
      expect(draft).not.toContain("Перегенеровується лише текст");
      expect(draft).not.toContain("<blockquote>");
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

import { describe, expect, it } from "vitest";
import {
  presentForwardableSocialInvite,
  presentSocialInviteIdentity,
  presentSocialInviteIdentityLine
} from "../../src/bot/presenters/socialInvitePresenter";

describe("shared social invitation presenter", () => {
  it("renders the raid-shaped body and a visible forwardable link", () => {
    const identity = {
      name: "<Shannar>",
      activeCosmeticTitle: "Писар & свідок",
      guildCrest: "<🐉>"
    };
    const text = presentForwardableSocialInvite({
      heading: "📨 Поклик до Квестарні",
      bodyHtml: `${presentSocialInviteIdentity(identity)} лишає тобі поклик.`,
      inviteUrl: "https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890"
    });

    expect(text).toContain("<b>📨 Поклик до Квестарні</b>");
    expect(text).toContain("&lt;🐉&gt; <b>&lt;Shannar&gt;</b> (<i>«Писар &amp; свідок»</i>) лишає тобі поклик.");
    expect(text).toContain("\n\nhttps://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890");
    expect(text).not.toContain("Ґільдія:");
    expect(text).not.toContain("🔗");
    expect(text).not.toContain("<a href=");
    expect(text).not.toContain("Варіянт");
    expect(text).not.toContain("blockquote");
  });

  it("shares the canonical title-and-crest identity line with party invitations", () => {
    expect(presentSocialInviteIdentityLine("Ватажок", {
      name: "Shannar de Kassal",
      activeCosmeticTitle: "Перший писар",
      guildCrest: "🐉"
    })).toBe("Ватажок: 🐉 <b>Shannar de Kassal</b> (<i>«Перший писар»</i>)");
  });
});

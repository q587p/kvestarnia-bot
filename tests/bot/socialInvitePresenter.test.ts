import { describe, expect, it } from "vitest";
import {
  presentForwardableSocialInvite,
  presentSocialInviteIdentityLine
} from "../../src/bot/presenters/socialInvitePresenter";

describe("shared social invitation presenter", () => {
  it("renders escaped identity metadata and a visible forwardable link", () => {
    const identity = {
      name: "<Shannar>",
      activeCosmeticTitle: "Писар & свідок",
      guildCrest: "<🐉>",
      guildName: "Лускаті <рахівники>"
    };
    const text = presentForwardableSocialInvite({
      heading: "📨 Поклик до Квестарні",
      bodyHtml: "«<b>&lt;Shannar&gt;</b>» лишає тобі поклик.",
      inviterIdentity: identity,
      inviteUrl: "https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890"
    });

    expect(text).toContain("<b>📨 Поклик до Квестарні</b>");
    expect(text).toContain("Титул: <i>«Писар &amp; свідок»</i>");
    expect(text).toContain("Ґільдія: &lt;🐉&gt; <b>Лускаті &lt;рахівники&gt;</b>");
    expect(text).toContain(
      '🔗 <a href="https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890">https://t.me/kvestarnia_bot?start=ref1_abCD_123-xyZ7890</a>'
    );
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

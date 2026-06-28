import { describe, expect, it } from "vitest";
import {
  presentActiveCosmeticTitle,
  presentCharacterDisplayName
} from "../../src/bot/presenters/characterDisplay";

describe("character display presenter", () => {
  it("renders a plain character name when no active cosmetic title is selected", () => {
    expect(presentCharacterDisplayName({ name: "Дара" })).toBe("<b>Дара</b>");
  });

  it("renders selected cosmetic titles as escaped Ukrainian quote labels", () => {
    expect(presentCharacterDisplayName({
      name: "Дара <&>",
      activeCosmeticTitle: "Перший <пергамент> не зʼїв"
    })).toBe("<b>Дара &lt;&amp;&gt;</b>, «Перший &lt;пергамент&gt; не зʼїв»");
  });

  it("can render compact unbolded and truncated social labels", () => {
    expect(presentCharacterDisplayName({
      name: "Довге Імʼя",
      activeCosmeticTitle: "Дуже довгий титул"
    }, {
      boldName: false,
      maxNameLength: 6,
      maxTitleLength: 8
    })).toBe("Довге…, «Дуже до…»");
  });

  it("omits blank titles", () => {
    expect(presentActiveCosmeticTitle("   ")).toBe("");
  });
});

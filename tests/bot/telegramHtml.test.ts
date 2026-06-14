import { describe, expect, it } from "vitest";
import { escapeHtml, npcQuote, presentCharacterHeader } from "../../src/bot/presenters/telegramHtml";

describe("telegram HTML presenter helpers", () => {
  it("escapes Telegram HTML special characters", () => {
    expect(escapeHtml("Мандрівник <&>")).toBe("Мандрівник &lt;&amp;&gt;");
  });

  it("formats NPC speech as a Telegram blockquote", () => {
    expect(npcQuote("Корчмар", "То не моя.")).toBe(
      "Корчмар:\n<blockquote>То не моя.</blockquote>"
    );
  });

  it("formats character scene headers consistently and safely", () => {
    expect(
      presentCharacterHeader({
        name: "<b>Мандрівник</b>",
        title: "<i>Коментатор Тіньового Проходу</i>"
      })
    ).toBe(
      "<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b> · <i>&lt;i&gt;Коментатор Тіньового Проходу&lt;/i&gt;</i>"
    );
  });
});

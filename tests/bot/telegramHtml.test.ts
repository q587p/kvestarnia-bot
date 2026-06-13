import { describe, expect, it } from "vitest";
import { escapeHtml, npcQuote } from "../../src/bot/presenters/telegramHtml";

describe("telegram HTML presenter helpers", () => {
  it("escapes Telegram HTML special characters", () => {
    expect(escapeHtml("Мандрівник <&>")).toBe("Мандрівник &lt;&amp;&gt;");
  });

  it("formats NPC speech as a Telegram blockquote", () => {
    expect(npcQuote("Корчмар", "То не моя.")).toBe(
      "Корчмар:\n<blockquote>То не моя.</blockquote>"
    );
  });
});

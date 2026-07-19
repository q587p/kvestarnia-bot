import { describe, expect, it } from "vitest";
import { presentTimedStatusLine } from "../../src/bot/presenters/timedStatusPresenter";

describe("timed status presenter", () => {
  it("keeps the status name and remaining duration bold with one shared shape", () => {
    expect(presentTimedStatusLine({
      emoji: "✨",
      name: "Натхнення",
      remaining: "13 хв",
      tailHtml: " — <b>+1</b> до влучання"
    })).toBe("✨ Стан: <b>Натхнення</b> ще <b>13 хв</b> — <b>+1</b> до влучання.");
  });

  it("supports authored labels and participant subjects without losing escaping", () => {
    expect(presentTimedStatusLine({
      emoji: "🍻",
      label: "Баф",
      name: "Пиво <міцне>",
      remaining: "42 хв"
    })).toBe("🍻 Баф: <b>Пиво &lt;міцне&gt;</b> ще <b>42 хв</b>.");

    expect(presentTimedStatusLine({
      emoji: "🍻",
      label: null,
      name: "Пиво <міцне>",
      remaining: "42 хв"
    })).toBe("🍻 <b>Пиво &lt;міцне&gt;</b> ще <b>42 хв</b>.");

    expect(presentTimedStatusLine({
      emoji: "😋",
      name: "Ситий",
      remaining: "2 ходи",
      subjectHtml: "Стан: <b>Ситий</b> у <b>Голова</b>",
      tailHtml: " (<b>+1 HP / +1 мани</b>)",
      terminalPunctuation: false
    })).toBe("😋 Стан: <b>Ситий</b> у <b>Голова</b> ще <b>2 ходи</b> (<b>+1 HP / +1 мани</b>)");
  });
});

import { describe, expect, it } from "vitest";
import { presentQuestRewardBlock } from "../../src/bot/presenters/rewardPresenter";

describe("reward presenter", () => {
  it("separates quest reward amounts from compact item grant rows", () => {
    expect(presentQuestRewardBlock({
      xp: 33,
      gold: 20,
      itemGrants: [
        { name: "Іскрокамінь", quantity: 2 },
        { name: "Рожеве мило першого правила", quantity: 1 }
      ]
    })).toBe([
      "<i>Отримано:</i>",
      "+33 XP",
      "+20 золота",
      "",
      "Здобуто: <i>Іскрокамінь ×2</i>",
      "Здобуто: <i>Рожеве мило першого правила</i>"
    ].join("\n"));
  });

  it("does not append a trailing paragraph when no items were granted", () => {
    expect(presentQuestRewardBlock({ xp: 13, gold: 0, itemGrants: [] })).toBe([
      "<i>Отримано:</i>",
      "+13 XP"
    ].join("\n"));
  });
});

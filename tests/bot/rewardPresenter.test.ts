import { describe, expect, it } from "vitest";
import {
  presentQuestRewardBlock,
  presentRewardBlock
} from "../../src/bot/presenters/rewardPresenter";

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

  it("uses the same separated item paragraph for combat and raid rewards", () => {
    expect(presentRewardBlock({
      xp: 42,
      gold: 91,
      label: "Винагорода за бій",
      itemGrants: [{ name: "Іскрокамінь", quantity: 2 }]
    })).toBe([
      "Винагорода за бій:",
      "<b>+42 XP",
      "+91 золота</b>",
      "",
      "Здобуто: <i>Іскрокамінь ×2</i>"
    ].join("\n"));
  });

  it("supports an aggregate item label without changing reward spacing", () => {
    expect(presentRewardBlock({
      xp: 5,
      gold: 9,
      label: "Загальна винагорода рейду",
      itemLabel: "Здобуто загалом",
      itemGrants: [{ name: "Дзеркальце Самоперевірки", quantity: 3 }]
    })).toContain("</b>\n\nЗдобуто загалом: <i>Дзеркальце Самоперевірки ×3</i>");
  });
});

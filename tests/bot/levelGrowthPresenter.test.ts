import { describe, expect, it } from "vitest";
import { presentLevelUpCelebration } from "../../src/bot/presenters/levelGrowthPresenter";

describe("level growth presenter", () => {
  it("renders level-up as a separate celebratory message", () => {
    expect(
      presentLevelUpCelebration(
        {
          oldLevel: 2,
          newLevel: 3,
          leveledUp: true
        },
        "class.rogue"
      )
    ).toBe(
      [
        "🎉 Рівень підріс!",
        "",
        "✨ <b>2 → 3</b>",
        "📈 Стало краще: <b>+4 HP · +2 мани · +1 Спритності</b>",
        "",
        "Корчма робить вигляд, що так і планувала."
      ].join("\n")
    );
  });

  it("does not render anything when level is unchanged", () => {
    expect(
      presentLevelUpCelebration(
        {
          oldLevel: 2,
          newLevel: 2,
          leveledUp: false
        },
        "class.rogue"
      )
    ).toBeNull();
  });
});

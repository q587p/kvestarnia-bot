import { describe, expect, it } from "vitest";
import { presentHelp } from "../../src/bot/presenters/helpPresenter";

describe("help presenter", () => {
  it("lists only currently available commands by default", () => {
    const text = presentHelp(false);

    expect(text).toContain("/start");
    expect(text).toContain("/hero");
    expect(text).toContain("/profile");
    expect(text).toContain("/me");
    expect(text).toContain("/tavern");
    expect(text).toContain("/raid");
    expect(text).toContain("/adventure");
    expect(text).toContain("/quest");
    expect(text).toContain("/fight");
    expect(text).toContain("/hunt");
    expect(text).toContain("/bestiary");
    expect(text).toContain("/monsters");
    expect(text).toContain("/cellar");
    expect(text).toContain("/inventory");
    expect(text).toContain("/items");
    expect(text).toContain("/bag");
    expect(text).toContain("/equipment");
    expect(text).toContain("/gear");
    expect(text).toContain("/equip");
    expect(text).toContain("/online");
    expect(text).toContain("/look");
    expect(text).toContain("/guild");
    expect(text).toContain("/restart");
    expect(text).toContain("/remort");
    expect(text).toContain("/version");
    expect(text).toContain("/news");
    expect(text).toContain("/support");
    expect(text).toContain("/help");
    expect(text).not.toContain("/dev_reset_me");
    expect(text).not.toContain("/dev_add_level");
    expect(text).not.toContain("/dev_add_xp");
    expect(text).not.toContain("/dev_add_gold");
    expect(text).not.toContain("/dev_add_random_item");
    expect(text).toContain("👤 /hero, /profile, /me — персонаж і прогрес");
    expect(text).toContain("🍺 /tavern, /raid — корчма й рейд на бочку");
    expect(text).toContain("🗺️ /quest — стіл зі справами");
    expect(text).toContain("🌯 /adventure — пригода з шаурмою");
    expect(text).toContain("⚔️ /fight — сутичка з монстром");
    expect(text).toContain("🏹 /hunt — дошка полювання");
    expect(text).toContain("📚 /bestiary, /monsters — бестіарій із 3 рівня");
    expect(text).toContain("🧹 /cellar — льохова справа");
    expect(text).toContain("🎒 /inventory, /items, /bag — манатки й торба");
    expect(text).toContain("🧥 /equipment, /gear, /equip — спорядження й бонуси");
    expect(text).toContain("👥 /online — хто поруч");
    expect(text).toContain("👀 /look — озирнутися");
    expect(text).toContain("🔄 /restart, /remort — нове коло героя");
    expect(text).toContain("📖 /help — допомога");
    expect(text).toContain("🫙 /support — добровільна підтримка без бонусів");
    expect(text).toContain("👤 /hero, /profile, /me");
    expect(text).not.toContain("🪪 /profile");
    expect(text).not.toContain("🧭 /me");
    expect(text).toContain("\n\n👤 /hero");
    expect(text).toContain("прогрес\n\n🍺");
    expect(text).not.toContain("те саме, що");
    expect(text).not.toContain("/hunt — ще");
    expect(text).toContain("Лут, ґільдії й повна бойова бухгалтерія");
    expect(text).toContain(
      "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
    );
    expect(text.split("\n").length).toBeLessThanOrEqual(42);
  });

  it("includes dev reset only when enabled", () => {
    expect(presentHelp(true)).toContain("🧪 /dev_reset_me");
    expect(presentHelp(true)).toContain("🪜 /dev_add_level");
    expect(presentHelp(true)).toContain("🔢 /dev_add_xp");
    expect(presentHelp(true)).toContain("🪙 /dev_add_gold");
    expect(presentHelp(true)).toContain("🎲 /dev_add_random_item");
    expect(presentHelp(true)).toContain("допомога\n\n🧪");
  });
});

import { describe, expect, it } from "vitest";
import { presentDevHelp, presentHelp } from "../../src/bot/presenters/helpPresenter";

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
    expect(text).toContain("/spar");
    expect(text).toContain("/duel");
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
    expect(text).not.toContain("/dev_help");
    expect(text).not.toContain("/dev_reset_me");
    expect(text).not.toContain("/dev_adventure_reset");
    expect(text).not.toContain("/dev_reset_korchma_round");
    expect(text).not.toContain("/dev_raid_stop");
    expect(text).not.toContain("/dev_reset_monster_rest");
    expect(text).not.toContain("/dev_add_level");
    expect(text).not.toContain("/dev_add_xp");
    expect(text).not.toContain("/dev_add_gold");
    expect(text).not.toContain("/dev_heal");
    expect(text).not.toContain("/dev_restore_mana");
    expect(text).not.toContain("/dev_add_random_item");
    expect(text).not.toContain("/dev_add_bandage");
    expect(text).not.toContain("/dev_reset_yeger_bandage");
    expect(text).not.toContain("/dev_reset_bard_performance");
    expect(text).toContain("👤 /hero, /profile, /me — персонаж і прогрес");
    expect(text).toContain("🍺 /tavern, /raid — корчма й рейд на бочку");
    expect(text).toContain("🗺️ /quest — стіл зі справами");
    expect(text).toContain("🪧 /adventure — вибір пригоди");
    expect(text).toContain("⚔️ /fight, /spar, /duel — сутичка, тренування й виклик");
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
    expect(text).toContain("Крамниці, ремесло й ґільдії ще готуються.");
    expect(text).not.toContain("Лут, ґільдії й повна бойова бухгалтерія");
    expect(text).toContain(
      "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
    );
    expect(text.split("\n").length).toBeLessThanOrEqual(42);
  });

  it("includes dev reset and value grants only when each gate is enabled", () => {
    const resetOnly = presentHelp({ includeDevReset: true, includeDevGrant: false });
    const grantsEnabled = presentHelp({ includeDevReset: true, includeDevGrant: true });

    expect(resetOnly).toContain("🧪 /dev_help");
    expect(resetOnly).toContain("/dev_reset_me");
    expect(resetOnly).toContain("/dev_adventure_reset");
    expect(resetOnly).toContain("/dev_reset_korchma_round");
    expect(resetOnly).toContain("/dev_raid_stop");
    expect(resetOnly).toContain("/dev_reset_monster_rest");
    expect(resetOnly).not.toContain("🪜 /dev_add_level");
    expect(resetOnly).not.toContain("🔢 /dev_add_xp");
    expect(resetOnly).not.toContain("🪙 /dev_add_gold");
    expect(resetOnly).not.toContain("🩹 /dev_heal");
    expect(resetOnly).not.toContain("🔮 /dev_restore_mana");
    expect(resetOnly).not.toContain("🎲 /dev_add_random_item");
    expect(resetOnly).not.toContain("🧻 /dev_add_bandage");
    expect(resetOnly).not.toContain("🧷 /dev_reset_yeger_bandage");
    expect(resetOnly).not.toContain("/dev_reset_yeger_bandage_day");
    expect(resetOnly).not.toContain("/dev_reset_bard_performance");
    expect(resetOnly).toContain("допомога\n\n🧪");

    expect(grantsEnabled).toContain("🧪 /dev_help");
    expect(grantsEnabled).toContain("/dev_reset_me");
    expect(grantsEnabled).toContain("/dev_adventure_reset");
    expect(grantsEnabled).toContain("/dev_reset_korchma_round");
    expect(grantsEnabled).toContain("/dev_raid_stop");
    expect(grantsEnabled).toContain("/dev_reset_monster_rest");
    expect(grantsEnabled).toContain("🪜 /dev_add_level");
    expect(grantsEnabled).toContain("🔢 /dev_add_xp");
    expect(grantsEnabled).toContain("🪙 /dev_add_gold");
    expect(grantsEnabled).toContain("🩹 /dev_heal");
    expect(grantsEnabled).toContain("🔮 /dev_restore_mana");
    expect(grantsEnabled).toContain("🎲 /dev_add_random_item");
    expect(grantsEnabled).toContain("🧻 /dev_add_bandage");
    expect(grantsEnabled).toContain("🧷 /dev_reset_yeger_bandage");
    expect(grantsEnabled).toContain("/dev_reset_yeger_bandage_day");
    expect(grantsEnabled).toContain("🎶 /dev_reset_bard_performance");
  });

  it("renders a compact dev-only help screen from available dev commands", () => {
    const resetOnly = presentDevHelp({ includeDevReset: true, includeDevGrant: false });
    const grantsEnabled = presentDevHelp({ includeDevReset: true, includeDevGrant: true });
    const disabled = presentDevHelp({ includeDevReset: false, includeDevGrant: false });

    expect(resetOnly).toContain("🧰 Dev-довідка Квестарні");
    expect(resetOnly).toContain("🧰 /dev_help");
    expect(resetOnly).toContain("🧪 /dev_reset_me");
    expect(resetOnly).toContain("⏱️ /dev_adventure_reset");
    expect(resetOnly).toContain("⏹️ /dev_raid_stop");
    expect(resetOnly).toContain("⌛ /dev_reset_monster_rest");
    expect(resetOnly).not.toContain("/dev_add_xp");

    expect(grantsEnabled).toContain("🔢 /dev_add_xp");
    expect(grantsEnabled).toContain("🎲 /dev_add_random_item");
    expect(grantsEnabled).toContain("🧻 /dev_add_bandage");
    expect(grantsEnabled).toContain("🧷 /dev_reset_yeger_bandage");
    expect(grantsEnabled).toContain("/dev_reset_yeger_bandage_day");
    expect(grantsEnabled).toContain("🎶 /dev_reset_bard_performance");
    expect(disabled).toBe("Dev-команди тут не ввімкнені. Корчмар сховав викрутку.");
  });
});

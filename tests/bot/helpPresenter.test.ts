import { describe, expect, it } from "vitest";
import { presentDevHelp, presentHelp } from "../../src/bot/presenters/helpPresenter";

describe("help presenter", () => {
  it("renders player help with public command catalog rows", () => {
    const text = presentHelp(false);

    expect(text).toContain("📖 Допомога Квестарні");
    expect(text).toContain("👤 Персонаж — рівень, HP/мана, прогрес і титули.");
    expect(text).toContain("🍺 Корчма — зала, стіл зі справами, Низ, Бочка, шинок і Дошка корчми.");
    expect(text).toContain(
      "📰 Дошка корчми — Вісти, Останні події, Перекази, подарунки й Пошта Квестарні."
    );
    expect(text).toContain("Квести — пригоди, Низ, Єгер, льох і бойові справи.");
    expect(text).toContain(
      "🎒 Манатки — інвентар, спорядження й корисні дрібниці; воїн може тримати по зброї в кожній руці."
    );
    expect(text).toContain("👀 Хто поруч — пригодники поруч і соціяльні дії.");
    expect(text).toContain("Команди:");
    expect(text).toContain("🚪 /start — почати пригоду");
    expect(text).toContain("👤 /hero — персонаж і прогрес");
    expect(text).toContain("🗺️ /quest — стіл зі справами");
    expect(text).toContain("📖 /help — допомога");
    expect(text).toContain("🫙 /support — добровільна підтримка без бонусів");
    expect(text).toContain("Підказка: найзручніше ходити кнопками основної клавіатури.");
    expect(text).not.toContain("/dev_help");
    expect(text).not.toContain("/dev_party");
    expect(text).not.toContain("/dev_add_xp");
    expect(text).not.toContain("🎲 Ігри за столом");
    expect(text).not.toContain("/games");
    expect(text).toContain("Крамниці, ремесло й ґільдії ще готуються.");
    expect(text).toContain(
      "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
    );
  });

  it("mentions Shynok table games only when their player surface is enabled", () => {
    expect(presentHelp({
      includeDevReset: false,
      includeTavernGames: true
    })).toContain("🎲 Ігри за столом — тавлеї та кості у шинку.");
    expect(presentHelp({
      includeDevReset: false,
      includeTavernGames: true
    })).toContain("♟️ /games — ігри за столом");

    expect(presentHelp({
      includeDevReset: false,
      includeTavernGames: false
    })).not.toContain("🎲 Ігри за столом");
  });

  it("keeps dev commands out of player help even when local gates are enabled", () => {
    const resetOnly = presentHelp({ includeDevReset: true, includeDevGrant: false });
    const grantsEnabled = presentHelp({ includeDevReset: true, includeDevGrant: true });
    const partyEnabled = presentHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includePartySessions: true
    });

    expect(resetOnly).not.toContain("/dev_help");
    expect(resetOnly).not.toContain("/dev_party");
    expect(resetOnly).not.toContain("/dev_reset_me");
    expect(resetOnly).not.toContain("/dev_adventure_reset");
    expect(resetOnly).not.toContain("/dev_reset_korchma_round");
    expect(resetOnly).not.toContain("/dev_raid_stop");
    expect(resetOnly).not.toContain("/dev_raid_reset");
    expect(resetOnly).not.toContain("/dev_raid_win");
    expect(resetOnly).not.toContain("/dev_reset_monster_rest");
    expect(resetOnly).not.toContain("🪜 /dev_add_level");
    expect(resetOnly).not.toContain("🔢 /dev_add_xp");
    expect(resetOnly).not.toContain("🪙 /dev_add_gold");
    expect(resetOnly).not.toContain("🩹 /dev_heal");
    expect(resetOnly).not.toContain("🔮 /dev_restore_mana");
    expect(resetOnly).not.toContain("🎲 /dev_add_random_item");
    expect(resetOnly).not.toContain("🧻 /dev_add_bandage");
    expect(resetOnly).not.toContain("🧵 /dev_add_dense_bandage");
    expect(resetOnly).not.toContain("🩺 /dev_add_field_kit");
    expect(resetOnly).not.toContain("/dev_add_yeger_line");
    expect(resetOnly).not.toContain("🧷 /dev_reset_yeger_bandage");
    expect(resetOnly).not.toContain("/dev_reset_yeger_bandage_day");
    expect(resetOnly).not.toContain("/dev_reset_yeger_trail");
    expect(resetOnly).not.toContain("/dev_reset_priest_blessing");
    expect(resetOnly).not.toContain("/dev_reset_quiet_pocket");
    expect(resetOnly).not.toContain("/dev_reset_rogue");
    expect(resetOnly).not.toContain("/dev_yeger_first_done");
    expect(resetOnly).not.toContain("/dev_yeger_second_done");
    expect(resetOnly).not.toContain("/dev_reset_bard_performance");

    expect(grantsEnabled).not.toContain("/dev_help");
    expect(grantsEnabled).not.toContain("/dev_party");
    expect(grantsEnabled).not.toContain("/dev_reset_me");
    expect(grantsEnabled).not.toContain("/dev_add_level");
    expect(grantsEnabled).not.toContain("/dev_add_xp");
    expect(grantsEnabled).not.toContain("/dev_add_gold");
    expect(grantsEnabled).not.toContain("/dev_heal");
    expect(grantsEnabled).not.toContain("/dev_restore_mana");
    expect(grantsEnabled).not.toContain("/dev_add_random_item");
    expect(grantsEnabled).not.toContain("/dev_add_bandage");
    expect(grantsEnabled).not.toContain("/dev_add_dense_bandage");
    expect(grantsEnabled).not.toContain("/dev_add_field_kit");
    expect(grantsEnabled).not.toContain("/dev_add_yeger_line");
    expect(grantsEnabled).not.toContain("/dev_reset_yeger_bandage");
    expect(grantsEnabled).not.toContain("/dev_reset_yeger_bandage_day");
    expect(grantsEnabled).not.toContain("/dev_reset_yeger_trail");
    expect(grantsEnabled).not.toContain("/dev_reset_priest_blessing");
    expect(grantsEnabled).not.toContain("/dev_reset_quiet_pocket");
    expect(grantsEnabled).not.toContain("/dev_reset_rogue");
    expect(grantsEnabled).not.toContain("/dev_yeger_first_done");
    expect(grantsEnabled).not.toContain("/dev_yeger_second_done");
    expect(grantsEnabled).not.toContain("/dev_reset_bard_performance");
    expect(partyEnabled).not.toContain("/dev_party");
    expect(partyEnabled).not.toContain("/dev_help");
  });

  it("renders a compact dev-only help screen from available dev commands", () => {
    const resetOnly = presentDevHelp({ includeDevReset: true, includeDevGrant: false });
    const grantsEnabled = presentDevHelp({ includeDevReset: true, includeDevGrant: true });
    const partyEnabled = presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includePartySessions: true
    });
    const disabled = presentDevHelp({ includeDevReset: false, includeDevGrant: false });

    expect(resetOnly).toContain("🧰 Dev-довідка Квестарні");
    expect(resetOnly).toContain("🧰 /dev_help");
    expect(resetOnly).not.toContain("/dev_party");
    expect(resetOnly).toContain("🧪 /dev_reset_me");
    expect(resetOnly).toContain("⏱️ /dev_adventure_reset");
    expect(resetOnly).toContain("⏹️ /dev_raid_stop");
    expect(resetOnly).toContain("🔁 /dev_raid_reset");
    expect(resetOnly).toContain("🏁 /dev_raid_win");
    expect(resetOnly).toContain("⌛ /dev_reset_monster_rest");
    expect(resetOnly).not.toContain("/dev_add_xp");

    expect(grantsEnabled).toContain("🔢 /dev_add_xp");
    expect(grantsEnabled).toContain("🎲 /dev_add_random_item");
    expect(grantsEnabled).toContain("🧻 /dev_add_bandage");
    expect(grantsEnabled).toContain("🧵 /dev_add_dense_bandage");
    expect(grantsEnabled).toContain("🩺 /dev_add_field_kit");
    expect(grantsEnabled).toContain("📏 /dev_add_yeger_line");
    expect(grantsEnabled).toContain("🧷 /dev_reset_yeger_bandage");
    expect(grantsEnabled).toContain("/dev_reset_yeger_bandage_day");
    expect(grantsEnabled).toContain("👣 /dev_reset_yeger_trail");
    expect(grantsEnabled).toContain("🙏 /dev_reset_priest_blessing");
    expect(grantsEnabled).toContain("🗡️ /dev_reset_quiet_pocket");
    expect(grantsEnabled).toContain("🧤 /dev_reset_rogue");
    expect(grantsEnabled).toContain("5️⃣ /dev_yeger_first_done");
    expect(grantsEnabled).toContain("7️⃣ /dev_yeger_second_done");
    expect(grantsEnabled).toContain("🎶 /dev_reset_bard_performance");
    expect(partyEnabled).toContain("🪢 /dev_party — зібрати тимчасову ватагу локально");
    expect(partyEnabled).not.toContain("/dev_help");
    expect(disabled).toBe("Dev-команди тут не ввімкнені. Корчмар сховав викрутку.");
  });
});

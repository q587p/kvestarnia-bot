import { describe, expect, it } from "vitest";
import { getHelpCommandEntries } from "../../src/bot/botCommandCatalog";
import type { HelpPage } from "../../src/bot/callbacks/helpCallbackData";
import { presentDevHelp, presentHelp } from "../../src/bot/presenters/helpPresenter";

describe("help presenter", () => {
  it("renders a compact section menu without the old command wall", () => {
    const text = presentHelp(false);

    expect(text).toContain("📖 Допомога Квестарні");
    expect(text).toContain("👤 Персонаж — початок, прогрес і нове життя.");
    expect(text).toContain("⚔️ Пригоди й бої — справи, монстри та Низ.");
    expect(text).toContain("🎒 Манатки — торба, спорядження й гачки.");
    expect(text).toContain("🍺 Корчма й люди — місця, Бочка та дозвілля.");
    expect(text).toContain("📰 Довідки й вісті — дошка, Перекази й підтримка.");
    expect(text).toContain("Оберіть розділ кнопкою нижче.");
    expect(text).not.toContain("Команди:");
    expect(text).not.toContain("/start");
    expect(text).not.toContain("/dev_help");
  });

  it("places every available public command on exactly one focused page", () => {
    const pages: Array<Exclude<HelpPage, "menu">> = ["hero", "adventures", "items", "korchma", "news"];
    const visibility = { includeDevReset: true, includeDevGrant: true, includeTavernGames: true };
    const commandRows = pages.flatMap((page) =>
      presentHelp(visibility, page).match(/^\S+ \/[a-z_]+(?:, \/[a-z_]+)* — .+$/gmu) ?? []
    );
    const renderedCommands = commandRows.flatMap((row) =>
      [...row.matchAll(/\/([a-z_]+)/gu)].map((match) => match[1])
    );
    const expectedCommands = getHelpCommandEntries(visibility)
      .filter((entry) => !entry.devOnly)
      .map((entry) => entry.command);

    expect([...renderedCommands].sort()).toEqual([...expectedCommands].sort());
    expect(new Set(renderedCommands).size).toBe(renderedCommands.length);
    expect(presentHelp(visibility, "items")).toContain("Воїн може тримати по зброї в кожній руці.");
    expect(presentHelp(visibility, "news")).toContain("Крамниці, ремесло й ґільдії ще готуються.");
  });

  it("keeps related command aliases on shared compact rows", () => {
    expect(presentHelp(false, "hero")).toContain(
      "👤 /hero, /profile — персонаж і прогрес"
    );
    expect(presentHelp(false, "adventures")).toContain(
      "📚 /bestiary, /monsters — бестіарій із 3 рівня"
    );
    expect(presentHelp(false, "items")).toContain(
      "🧥 /equipment, /gear — огляд спорядження"
    );
    expect(presentHelp(false, "items")).toContain("🪝 /equip — змінити спорядження");
  });

  it("shows table games only on the Korchma page when their surface is enabled", () => {
    expect(presentHelp({ includeDevReset: false, includeTavernGames: true }, "korchma"))
      .toContain("♟️ /games — ігри за столом");
    expect(presentHelp({ includeDevReset: false, includeTavernGames: false }, "korchma"))
      .not.toContain("/games");
  });

  it("keeps dev commands out of player help even when local gates are enabled", () => {
    const pages: Array<Exclude<HelpPage, "menu">> = ["hero", "adventures", "items", "korchma", "news"];
    const resetOnly = pages.map((page) => presentHelp({ includeDevReset: true }, page)).join("\n");
    const grantsEnabled = pages.map((page) => presentHelp({
      includeDevReset: true,
      includeDevGrant: true
    }, page)).join("\n");
    const partyEnabled = pages.map((page) => presentHelp({
      includeDevReset: false,
      includePartySessions: true
    }, page)).join("\n");

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
    expect(resetOnly).not.toContain("🧾 /dev_add_item");
    expect(resetOnly).not.toContain("🧻 /dev_add_bandage");
    expect(resetOnly).not.toContain("🧵 /dev_add_dense_bandage");
    expect(resetOnly).not.toContain("🩺 /dev_add_field_kit");
    expect(resetOnly).not.toContain("✨ /dev_add_iskrokamin");
    expect(resetOnly).not.toContain("/dev_add_yeger_line");
    expect(resetOnly).not.toContain("🧷 /dev_reset_yeger_bandage");
    expect(resetOnly).not.toContain("/dev_reset_yeger_bandage_day");
    expect(resetOnly).not.toContain("/dev_reset_yeger_trail");
    expect(resetOnly).not.toContain("/dev_reset_cellar_mouse");
    expect(resetOnly).not.toContain("/dev_reset_priest_blessing");
    expect(resetOnly).not.toContain("/dev_reset_quiet_pocket");
    expect(resetOnly).not.toContain("/dev_reset_bureaucramancer_protocol");
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
    expect(grantsEnabled).not.toContain("/dev_add_item");
    expect(grantsEnabled).not.toContain("/dev_add_bandage");
    expect(grantsEnabled).not.toContain("/dev_add_dense_bandage");
    expect(grantsEnabled).not.toContain("/dev_add_field_kit");
    expect(grantsEnabled).not.toContain("/dev_add_iskrokamin");
    expect(grantsEnabled).not.toContain("/dev_add_yeger_line");
    expect(grantsEnabled).not.toContain("/dev_reset_yeger_bandage");
    expect(grantsEnabled).not.toContain("/dev_reset_yeger_bandage_day");
    expect(grantsEnabled).not.toContain("/dev_reset_yeger_trail");
    expect(grantsEnabled).not.toContain("/dev_reset_cellar_mouse");
    expect(grantsEnabled).not.toContain("/dev_reset_priest_blessing");
    expect(grantsEnabled).not.toContain("/dev_reset_quiet_pocket");
    expect(grantsEnabled).not.toContain("/dev_reset_bureaucramancer_protocol");
    expect(grantsEnabled).not.toContain("/dev_reset_rogue");
    expect(grantsEnabled).not.toContain("/dev_yeger_first_done");
    expect(grantsEnabled).not.toContain("/dev_yeger_second_done");
    expect(grantsEnabled).not.toContain("/dev_reset_bard_performance");
    expect(grantsEnabled).not.toContain("/dev_reset_tavern_games");
    expect(partyEnabled).not.toContain("/dev_party");
    expect(partyEnabled).not.toContain("/dev_help");
  });

  it("renders a compact dev-only help screen from available dev commands", () => {
    const resetVisibility = { includeDevReset: true, includeDevGrant: false };
    const grantVisibility = { includeDevReset: true, includeDevGrant: true };
    const resetMenu = presentDevHelp(resetVisibility);
    const grantMenu = presentDevHelp(grantVisibility);
    const resetGeneral = presentDevHelp(resetVisibility, "general");
    const resetCombat = presentDevHelp(resetVisibility, "combat");
    const resetQuests = presentDevHelp(resetVisibility, "quests");
    const grantResources = presentDevHelp(grantVisibility, "resources");
    const grantQuests = presentDevHelp(grantVisibility, "quests");
    const partyEnabled = presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includePartySessions: true
    }, "combat");
    const groupCombatEnabled = presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includeGroupCombat: true
    }, "combat");
    const hpRecoveryEnabled = presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includeHpRecovery: true
    }, "combat");
    const raidChatEnabled = presentDevHelp({
      includeDevReset: false,
      includeDevGrant: false,
      includeRaidChat: true
    }, "combat");
    const disabled = presentDevHelp({ includeDevReset: false, includeDevGrant: false });

    expect(resetMenu).toContain("🧰 Dev-довідка Квестарні");
    expect(resetMenu).toContain("🧰 Загальне — персонаж і довідка.");
    expect(resetMenu).toContain("⚔️ Бої й ватага — сутички, рейди й гурт.");
    expect(resetMenu).toContain("🗺️ Справи й очікування — квести, кулдауни й повтори.");
    expect(resetMenu).not.toContain("/dev_help");
    expect(resetMenu).not.toContain("/dev_add_level");
    expect(grantMenu).toContain("🪜 /dev_add_level — додати рівні локально");
    expect(grantMenu.indexOf("Що саме треба підкрутити?")).toBeLessThan(
      grantMenu.indexOf("🪜 /dev_add_level — додати рівні локально")
    );
    expect(grantMenu.indexOf("🪜 /dev_add_level — додати рівні локально")).toBeLessThan(
      grantMenu.indexOf("🧰 Загальне — персонаж і довідка.")
    );
    expect(grantMenu.match(/\/dev_add_level/gu)).toHaveLength(1);
    expect(resetGeneral).toContain("🧰 /dev_help");
    expect(resetGeneral).toContain("🧪 /dev_reset_me");
    expect(resetCombat).toContain("⏹️ /dev_raid_stop");
    expect(resetCombat).toContain("🔁 /dev_raid_reset");
    expect(resetCombat).toContain("🏁 /dev_raid_win");
    expect(resetCombat).toContain("⌛ /dev_reset_monster_rest");
    expect(resetCombat).not.toContain("/dev_party");
    expect(resetQuests).toContain("⏱️ /dev_adventure_reset");
    expect(resetQuests).not.toContain("/dev_add_xp");

    expect(grantResources).toContain("🔢 /dev_add_xp");
    expect(grantResources).not.toContain("/dev_add_level");
    expect(grantResources).toContain("🎲 /dev_add_random_item");
    expect(grantResources).toContain("🧾 /dev_add_item");
    expect(grantResources).toContain("🧻 /dev_add_bandage");
    expect(grantResources).toContain("🧵 /dev_add_dense_bandage");
    expect(grantResources).toContain("🩺 /dev_add_field_kit");
    expect(grantResources).toContain("✨ /dev_add_iskrokamin");
    expect(grantResources).toContain("📏 /dev_add_yeger_line");
    expect(grantQuests).toContain("🧷 /dev_reset_yeger_bandage");
    expect(grantQuests).toContain("/dev_reset_yeger_bandage_day");
    expect(grantQuests).toContain("👣 /dev_reset_yeger_trail");
    expect(grantQuests).toContain("🐭 /dev_reset_cellar_mouse");
    expect(grantQuests).toContain("🙏 /dev_reset_priest_blessing");
    expect(grantQuests).toContain("🗡️ /dev_reset_quiet_pocket");
    expect(grantQuests).toContain("📄 /dev_reset_bureaucramancer_protocol");
    expect(grantQuests).toContain("🧤 /dev_reset_rogue");
    expect(grantQuests).toContain("5️⃣ /dev_yeger_first_done");
    expect(grantQuests).toContain("7️⃣ /dev_yeger_second_done");
    expect(grantQuests).toContain("🎶 /dev_reset_bard_performance");
    expect(grantQuests).toContain("🎲 /dev_reset_tavern_games");
    expect(partyEnabled).toContain("🪢 /dev_party — зібрати тимчасову ватагу локально");
    expect(partyEnabled).not.toContain("/dev_raid_chat");
    expect(groupCombatEnabled).toContain("⚔️ /dev_group_combat — запустити доказову сутичку 2–3 на 2–3");
    expect(groupCombatEnabled).not.toContain("/dev_party");
    expect(raidChatEnabled).toContain("💬 /dev_raid_chat");
    expect(partyEnabled).not.toContain("/dev_help");
    expect(hpRecoveryEnabled).toContain(
      "❤️‍🩹 /dev_hp_recovery_due — підготувати сповіщення про відновлення HP локально"
    );
    expect(hpRecoveryEnabled).not.toContain("/dev_reset_me");
    expect(disabled).toBe("Dev-команди тут не ввімкнені. Корчмар сховав викрутку.");
  });
});

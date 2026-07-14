import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import type {
  DevGrantItemsResult,
  DevGrantRandomItemFilter,
  DevGrantResult
} from "../../src/services/devGrantService";

describe("dev grant commands", () => {
  it("passes explicit and default amounts to the dev grant service", async () => {
    const devGrant = fakeDevGrantService();
    const defaultLevelCalls = await captureMessageCalls("/dev_add_level", devGrant);
    const explicitLevelCalls = await captureMessageCalls("/dev_add_level 3", devGrant);
    const xpCalls = await captureMessageCalls("/dev_add_xp 7", devGrant);
    const largeGoldCalls = await captureMessageCalls("/dev_add_gold 9999", devGrant);
    const itemCalls = await captureMessageCalls("/dev_add_random_item", devGrant);
    const toolItemCalls = await captureMessageCalls("/dev_add_random_item slot=tool", devGrant);
    const taggedItemCalls = await captureMessageCalls("/dev_add_random_item 3 tag=twohand", devGrant);
    const combinedItemCalls = await captureMessageCalls("/dev_add_random_item 2 slot=weapon tag=twohand", devGrant);
    const exactItemCalls = await captureMessageCalls(
      "/dev_add_item 2 itemId=item.ability.last-page-rapier",
      devGrant
    );
    const defaultBandageCalls = await captureMessageCalls("/dev_add_bandage", devGrant);
    const explicitBandageCalls = await captureMessageCalls("/dev_add_bandage 5", devGrant);
    const defaultDenseBandageCalls = await captureMessageCalls("/dev_add_dense_bandage", devGrant);
    const explicitDenseBandageCalls = await captureMessageCalls("/dev_add_dense_bandage 2", devGrant);
    const defaultFieldKitCalls = await captureMessageCalls("/dev_add_field_kit", devGrant);
    const explicitFieldKitCalls = await captureMessageCalls("/dev_add_field_kit 3", devGrant);
    const defaultIskrokaminCalls = await captureMessageCalls("/dev_add_iskrokamin", devGrant);
    const explicitIskrokaminCalls = await captureMessageCalls("/dev_add_iskrokamin 5", devGrant);
    const fullHealCalls = await captureMessageCalls("/dev_heal", devGrant);
    const partialHealCalls = await captureMessageCalls("/dev_heal 7", devGrant);
    const fullManaCalls = await captureMessageCalls("/dev_restore_mana", devGrant);
    const partialManaCalls = await captureMessageCalls("/dev_restore_mana 4", devGrant);
    const yegerResetCalls = await captureMessageCalls("/dev_reset_yeger_bandage", devGrant);
    const yegerDayResetCalls = await captureMessageCalls("/dev_reset_yeger_bandage_day", devGrant);
    const yegerTrailResetCalls = await captureMessageCalls("/dev_reset_yeger_trail", devGrant);
    const cellarMouseResetCalls = await captureMessageCalls("/dev_reset_cellar_mouse", devGrant);
    const priestResetCalls = await captureMessageCalls("/dev_reset_priest_blessing", devGrant);
    const quietPocketResetCalls = await captureMessageCalls("/dev_reset_quiet_pocket", devGrant);
    const varenykSatedResetCalls = await captureMessageCalls("/dev_reset_varenyk_sated", devGrant);
    const rogueResetCalls = await captureMessageCalls("/dev_reset_rogue", devGrant);
    const yegerFirstDoneCalls = await captureMessageCalls("/dev_yeger_first_done", devGrant);
    const yegerSecondDoneCalls = await captureMessageCalls("/dev_yeger_second_done", devGrant);
    const equipment = fakeEquipmentService({ count: 2 });
    const finishAttunementsCalls = await captureMessageCalls(
      "/dev_finish_attunements",
      devGrant,
      undefined,
      equipment
    );
    const tavernGames = fakeTavernGamesService();
    const tavernGameResetCalls = await captureMessageCalls(
      "/dev_reset_tavern_games",
      devGrant,
      tavernGames
    );

    expect(devGrant.addLevel).toHaveBeenCalledWith(42n, 1);
    expect(devGrant.addLevel).toHaveBeenCalledWith(42n, 3);
    expect(devGrant.addXp).toHaveBeenCalledWith(42n, 7);
    expect(devGrant.addGold).toHaveBeenCalledWith(42n, 9999);
    expect(devGrant.addRandomItems).toHaveBeenCalledWith(42n, 1, {});
    expect(devGrant.addRandomItems).toHaveBeenCalledWith(42n, 1, { equipmentSlot: "tool" });
    expect(devGrant.addRandomItems).toHaveBeenCalledWith(42n, 3, { tag: "twohand" });
    expect(devGrant.addRandomItems).toHaveBeenCalledWith(42n, 2, {
      equipmentSlot: "weapon",
      tag: "twohand"
    });
    expect(devGrant.addItemById).toHaveBeenCalledWith(42n, "item.ability.last-page-rapier", 2);
    expect(devGrant.addBandages).toHaveBeenCalledWith(42n, 1);
    expect(devGrant.addBandages).toHaveBeenCalledWith(42n, 5);
    expect(devGrant.addDenseBandages).toHaveBeenCalledWith(42n, 1);
    expect(devGrant.addDenseBandages).toHaveBeenCalledWith(42n, 2);
    expect(devGrant.addFieldKits).toHaveBeenCalledWith(42n, 1);
    expect(devGrant.addFieldKits).toHaveBeenCalledWith(42n, 3);
    expect(devGrant.addIskrokamin).toHaveBeenCalledWith(42n, 1);
    expect(devGrant.addIskrokamin).toHaveBeenCalledWith(42n, 5);
    expect(devGrant.heal).toHaveBeenCalledWith(42n, undefined);
    expect(devGrant.heal).toHaveBeenCalledWith(42n, 7);
    expect(devGrant.restoreMana).toHaveBeenCalledWith(42n, undefined);
    expect(devGrant.restoreMana).toHaveBeenCalledWith(42n, 4);
    expect(devGrant.resetYegerBandageCooldown).toHaveBeenCalledWith(42n);
    expect(devGrant.resetYegerBandageDay).toHaveBeenCalledWith(42n);
    expect(devGrant.resetYegerTrackingCooldown).toHaveBeenCalledWith(42n);
    expect(devGrant.resetCellarMouseCooldown).toHaveBeenCalledWith(42n);
    expect(devGrant.resetPriestBlessingCooldown).toHaveBeenCalledWith(42n);
    expect(devGrant.resetQuietPocketCooldown).toHaveBeenCalledWith(42n);
    expect(devGrant.resetVarenykSated).toHaveBeenCalledWith(42n);
    expect(devGrant.resetRogue).toHaveBeenCalledWith(42n);
    expect(devGrant.completeFirstYegerQuestProgress).toHaveBeenCalledWith(42n);
    expect(devGrant.completeSecondYegerQuestProgress).toHaveBeenCalledWith(42n);
    expect(equipment.finishPendingAttunementsForDev).toHaveBeenCalledWith(42n);
    expect(tavernGames.resetCreateCooldownForDev).toHaveBeenCalledWith(42n);
    expect(String(defaultLevelCalls.at(-1)?.payload.text)).toContain("додано 1 рівень");
    expect(String(explicitLevelCalls.at(-1)?.payload.text)).toContain("додано 3 рівні");
    expect(String(xpCalls.at(-1)?.payload.text)).toContain("додано 7 XP");
    expect(String(largeGoldCalls.at(-1)?.payload.text)).toContain("9999");
    expect(String(itemCalls.at(-1)?.payload.text)).toContain("додано 1 манатку");
    expect(String(toolItemCalls.at(-1)?.payload.text)).toContain("Пательня переконання");
    expect(String(taggedItemCalls.at(-1)?.payload.text)).toContain("Пательня переконання ×3");
    expect(String(combinedItemCalls.at(-1)?.payload.text)).toContain("Пательня переконання ×2");
    expect(String(exactItemCalls.at(-1)?.payload.text)).toContain("Рапіра останньої сторінки ×2");
    expect(String(defaultBandageCalls.at(-1)?.payload.text)).toContain("Бинт відповідальної паніки");
    expect(String(explicitBandageCalls.at(-1)?.payload.text)).toContain("Бинт відповідальної паніки ×5");
    expect(String(defaultDenseBandageCalls.at(-1)?.payload.text)).toContain("Щільний бинт");
    expect(String(explicitDenseBandageCalls.at(-1)?.payload.text)).toContain("Щільний бинт ×2");
    expect(String(defaultFieldKitCalls.at(-1)?.payload.text)).toContain("Польова аптечка");
    expect(String(explicitFieldKitCalls.at(-1)?.payload.text)).toContain("Польова аптечка ×3");
    expect(String(defaultIskrokaminCalls.at(-1)?.payload.text)).toContain("Іскрокамінь");
    expect(String(explicitIskrokaminCalls.at(-1)?.payload.text)).toContain("Іскрокамінь ×5");
    expect(String(fullHealCalls.at(-1)?.payload.text)).toContain("HP: 20/20");
    expect(String(partialHealCalls.at(-1)?.payload.text)).toContain("HP: 20/20");
    expect(String(fullManaCalls.at(-1)?.payload.text)).toContain("Мана: 10/10");
    expect(String(partialManaCalls.at(-1)?.payload.text)).toContain("Мана: 10/10");
    expect(String(yegerResetCalls.at(-1)?.payload.text)).toContain("таймер безкоштовного бинта Єгеря");
    expect(String(yegerDayResetCalls.at(-1)?.payload.text)).toContain("день купівлі бинтів Єгеря");
    expect(String(yegerTrailResetCalls.at(-1)?.payload.text)).toContain("очікування Єгерського сліду");
    expect(String(cellarMouseResetCalls.at(-1)?.payload.text)).toContain("мишачий льоховий cooldown");
    expect(String(priestResetCalls.at(-1)?.payload.text)).toContain("жрецьке благословення");
    expect(String(quietPocketResetCalls.at(-1)?.payload.text)).toContain("Тиха кишеня");
    expect(String(varenykSatedResetCalls.at(-1)?.payload.text)).toContain("Ситість");
    expect(String(rogueResetCalls.at(-1)?.payload.text)).toContain("злодійський QA reset");
    expect(String(yegerFirstDoneCalls.at(-1)?.payload.text)).toContain("«Неспокійні справи» доведено до 5/5");
    expect(String(yegerSecondDoneCalls.at(-1)?.payload.text)).toContain("«Неспокійні справи 2.0» доведено до 17/17");
    expect(String(finishAttunementsCalls.at(-1)?.payload.text)).toContain("налаштувань пришвидшено: 2");
    expect(String(tavernGameResetCalls.at(-1)?.payload.text)).toContain(
      "🎲 Столи вже без паузи"
    );
  });

  it("adds Yeger notch lines with default and explicit amounts", async () => {
    const devGrant = fakeDevGrantService();
    const defaultCalls = await captureMessageCalls("/dev_add_yeger_line", devGrant);
    const explicitCalls = await captureMessageCalls("/dev_add_yeger_line 4", devGrant);

    expect(devGrant.addYegerLines).toHaveBeenCalledWith(42n, 1);
    expect(devGrant.addYegerLines).toHaveBeenCalledWith(42n, 4);
    expect(String(defaultCalls.at(-1)?.payload.text)).toContain("Єгерська риска на дощечці");
    expect(String(explicitCalls.at(-1)?.payload.text)).toContain("Єгерська риска на дощечці");
  });

  it("rejects invalid amounts before mutating", async () => {
    const devGrant = fakeDevGrantService();
    const levelCalls = await captureMessageCalls("/dev_add_level 0", devGrant);
    const calls = await captureMessageCalls("/dev_add_gold nope", devGrant);
    const bandageCalls = await captureMessageCalls("/dev_add_bandage 0", devGrant);
    const denseBandageCalls = await captureMessageCalls("/dev_add_dense_bandage 0", devGrant);
    const fieldKitCalls = await captureMessageCalls("/dev_add_field_kit 0", devGrant);
    const iskrokaminCalls = await captureMessageCalls("/dev_add_iskrokamin 0", devGrant);
    const invalidRandomSlotCalls = await captureMessageCalls("/dev_add_random_item slot=helmet", devGrant);
    const invalidRandomTagCalls = await captureMessageCalls("/dev_add_random_item tag=helmet", devGrant);
    const invalidRandomStoryTagCalls = await captureMessageCalls("/dev_add_random_item tag=story", devGrant);
    const invalidRandomDuplicateAmountCalls = await captureMessageCalls("/dev_add_random_item 1 2", devGrant);
    const missingExactItemCalls = await captureMessageCalls("/dev_add_item", devGrant);
    const invalidExactItemCalls = await captureMessageCalls("/dev_add_item 1 2 itemId=item.ability.last-page-rapier", devGrant);
    const healCalls = await captureMessageCalls("/dev_heal 0", devGrant);
    const manaCalls = await captureMessageCalls("/dev_restore_mana 0", devGrant);

    expect(devGrant.addLevel).not.toHaveBeenCalled();
    expect(devGrant.addGold).not.toHaveBeenCalled();
    expect(devGrant.addBandages).not.toHaveBeenCalled();
    expect(devGrant.addDenseBandages).not.toHaveBeenCalled();
    expect(devGrant.addFieldKits).not.toHaveBeenCalled();
    expect(devGrant.addIskrokamin).not.toHaveBeenCalled();
    expect(devGrant.addRandomItems).not.toHaveBeenCalled();
    expect(devGrant.addItemById).not.toHaveBeenCalled();
    expect(devGrant.heal).not.toHaveBeenCalled();
    expect(devGrant.restoreMana).not.toHaveBeenCalled();
    expect(String(levelCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_level [додатне ціле число]."
    );
    expect(String(calls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_gold [додатне ціле число]."
    );
    expect(String(bandageCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_bandage [додатне ціле число]."
    );
    expect(String(denseBandageCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_dense_bandage [додатне ціле число]."
    );
    expect(String(fieldKitCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_field_kit [додатне ціле число]."
    );
    expect(String(iskrokaminCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_iskrokamin [додатне ціле число]."
    );
    expect(String(invalidRandomSlotCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_random_item [додатне ціле число]"
    );
    expect(String(invalidRandomTagCalls.at(-1)?.payload.text)).toContain("tag=twohand|offhand");
    expect(String(invalidRandomStoryTagCalls.at(-1)?.payload.text)).toContain("tag=twohand|offhand");
    expect(String(invalidRandomDuplicateAmountCalls.at(-1)?.payload.text)).toContain("slot=weapon");
    expect(String(missingExactItemCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_add_item [додатне ціле число] itemId=<item.id>."
    );
    expect(String(invalidExactItemCalls.at(-1)?.payload.text)).toContain(
      "itemId=item.ability.last-page-rapier"
    );
    expect(String(healCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_heal [додатне ціле число HP]."
    );
    expect(String(manaCalls.at(-1)?.payload.text)).toContain(
      "Формат: /dev_restore_mana [додатне ціле число мани]."
    );
  });

  it("rejects invalid Yeger notch line amounts before mutating", async () => {
    const devGrant = fakeDevGrantService();
    const calls = await captureMessageCalls("/dev_add_yeger_line 0", devGrant);

    expect(devGrant.addYegerLines).not.toHaveBeenCalled();
    expect(String(calls.at(-1)?.payload.text)).toContain("/dev_add_yeger_line");
  });

  it("shows active combat HP when dev heal updates a battle state", async () => {
    const devGrant = fakeDevGrantService({
      combatHeal: {
        kind: "party-boss",
        hpCurrent: 48,
        hpMax: 48
      }
    });
    const calls = await captureMessageCalls("/dev_heal", devGrant);

    expect(String(calls.at(-1)?.payload.text)).toContain("HP: 20/20");
    expect(String(calls.at(-1)?.payload.text)).toContain("Бій: HP 48/48");
  });

  it("reports unknown exact item ids without mutating through the command", async () => {
    const devGrant = fakeDevGrantService({
      unknownItemIds: new Set(["item.no-such-mantok"])
    });
    const calls = await captureMessageCalls("/dev_add_item itemId=item.no-such-mantok", devGrant);

    expect(devGrant.addItemById).toHaveBeenCalledWith(42n, "item.no-such-mantok", 1);
    expect(String(calls.at(-1)?.payload.text)).toContain("не знайшов такої манатки");
    expect(String(calls.at(-1)?.payload.text)).toContain("item.no-such-mantok");
  });

  it("does not register value-granting commands when disabled", async () => {
    const devGrant = fakeDevGrantService({ enabled: false });
    const calls = await captureMessageCalls("/dev_add_xp 7", devGrant);
    const healCalls = await captureMessageCalls("/dev_heal 7", devGrant);
    const bandageCalls = await captureMessageCalls("/dev_add_bandage 5", devGrant);
    const randomItemCalls = await captureMessageCalls("/dev_add_random_item slot=tool", devGrant);
    const exactItemCalls = await captureMessageCalls("/dev_add_item itemId=item.ability.last-page-rapier", devGrant);
    const denseBandageCalls = await captureMessageCalls("/dev_add_dense_bandage 2", devGrant);
    const fieldKitCalls = await captureMessageCalls("/dev_add_field_kit 3", devGrant);
    const iskrokaminCalls = await captureMessageCalls("/dev_add_iskrokamin 5", devGrant);
    const yegerLineCalls = await captureMessageCalls("/dev_add_yeger_line 4", devGrant);
    const manaCalls = await captureMessageCalls("/dev_restore_mana 4", devGrant);
    const yegerCalls = await captureMessageCalls("/dev_reset_yeger_bandage", devGrant);
    const yegerDayCalls = await captureMessageCalls("/dev_reset_yeger_bandage_day", devGrant);
    const yegerTrailCalls = await captureMessageCalls("/dev_reset_yeger_trail", devGrant);
    const cellarMouseCalls = await captureMessageCalls("/dev_reset_cellar_mouse", devGrant);
    const priestResetCalls = await captureMessageCalls("/dev_reset_priest_blessing", devGrant);
    const quietPocketResetCalls = await captureMessageCalls("/dev_reset_quiet_pocket", devGrant);
    const varenykSatedResetCalls = await captureMessageCalls("/dev_reset_varenyk_sated", devGrant);
    const rogueResetCalls = await captureMessageCalls("/dev_reset_rogue", devGrant);
    const yegerFirstDoneCalls = await captureMessageCalls("/dev_yeger_first_done", devGrant);
    const yegerSecondDoneCalls = await captureMessageCalls("/dev_yeger_second_done", devGrant);
    const equipment = fakeEquipmentService({ count: 2 });
    const finishAttunementsCalls = await captureMessageCalls(
      "/dev_finish_attunements",
      devGrant,
      undefined,
      equipment
    );
    const tavernGames = fakeTavernGamesService();
    const tavernGameResetCalls = await captureMessageCalls(
      "/dev_reset_tavern_games",
      devGrant,
      tavernGames
    );

    expect(devGrant.addXp).not.toHaveBeenCalled();
    expect(devGrant.heal).not.toHaveBeenCalled();
    expect(devGrant.addBandages).not.toHaveBeenCalled();
    expect(devGrant.addRandomItems).not.toHaveBeenCalled();
    expect(devGrant.addItemById).not.toHaveBeenCalled();
    expect(devGrant.addDenseBandages).not.toHaveBeenCalled();
    expect(devGrant.addFieldKits).not.toHaveBeenCalled();
    expect(devGrant.addIskrokamin).not.toHaveBeenCalled();
    expect(devGrant.addYegerLines).not.toHaveBeenCalled();
    expect(devGrant.restoreMana).not.toHaveBeenCalled();
    expect(devGrant.resetYegerBandageCooldown).not.toHaveBeenCalled();
    expect(devGrant.resetYegerBandageDay).not.toHaveBeenCalled();
    expect(devGrant.resetYegerTrackingCooldown).not.toHaveBeenCalled();
    expect(devGrant.resetCellarMouseCooldown).not.toHaveBeenCalled();
    expect(devGrant.resetPriestBlessingCooldown).not.toHaveBeenCalled();
    expect(devGrant.resetQuietPocketCooldown).not.toHaveBeenCalled();
    expect(devGrant.resetVarenykSated).not.toHaveBeenCalled();
    expect(devGrant.resetRogue).not.toHaveBeenCalled();
    expect(devGrant.completeFirstYegerQuestProgress).not.toHaveBeenCalled();
    expect(devGrant.completeSecondYegerQuestProgress).not.toHaveBeenCalled();
    expect(equipment.finishPendingAttunementsForDev).not.toHaveBeenCalled();
    expect(tavernGames.resetCreateCooldownForDev).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(healCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(bandageCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(randomItemCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(exactItemCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(denseBandageCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(fieldKitCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(iskrokaminCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(yegerLineCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(manaCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(yegerCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(yegerDayCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(yegerTrailCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(cellarMouseCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(priestResetCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(quietPocketResetCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(varenykSatedResetCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(rogueResetCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(yegerFirstDoneCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(yegerSecondDoneCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(finishAttunementsCalls.some((call) => call.method === "sendMessage")).toBe(false);
    expect(tavernGameResetCalls.some((call) => call.method === "sendMessage")).toBe(false);
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureMessageCalls(
  text: string,
  devGrant: ReturnType<typeof fakeDevGrantService>,
  tavernGames?: ReturnType<typeof fakeTavernGamesService>,
  equipment?: ReturnType<typeof fakeEquipmentService>
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", servicesWith(devGrant, tavernGames, equipment));
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      date: 0,
      text,
      entities: [
        {
          type: "bot_command",
          offset: 0,
          length: text.split(/\s/, 1)[0]?.length ?? text.length
        }
      ],
      chat: {
        id: 42,
        type: "private"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      }
    }
  });

  return calls;
}

function fakeEquipmentService(input: { count?: number } = {}): {
  finishPendingAttunementsForDev: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<{ state: "finished"; count: number }>>
  >;
} {
  return {
    finishPendingAttunementsForDev: vi.fn(() => Promise.resolve({
      state: "finished",
      count: input.count ?? 0
    }))
  };
}

function fakeTavernGamesService(): {
  resetCreateCooldownForDev: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<{ state: "reset"; updated: number }>>
  >;
} {
  return {
    resetCreateCooldownForDev: vi.fn(() => Promise.resolve({ state: "reset", updated: 2 }))
  };
}

function fakeDevGrantService(input: {
  enabled?: boolean;
  combatHeal?: Extract<DevGrantResult, { state: "updated"; kind: "heal" }>["combat"];
  unknownItemIds?: Set<string>;
} = {}): {
  isEnabled: ReturnType<typeof vi.fn<() => boolean>>;
  addLevel: ReturnType<typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantResult>>>;
  addXp: ReturnType<typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantResult>>>;
  addGold: ReturnType<typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantResult>>>;
  heal: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount?: number) => Promise<DevGrantResult>>
  >;
  restoreMana: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount?: number) => Promise<DevGrantResult>>
  >;
  addRandomItems: ReturnType<
    typeof vi.fn<(
      telegramUserId: bigint,
      amount: number,
      filter?: DevGrantRandomItemFilter
    ) => Promise<DevGrantItemsResult>>
  >;
  addItemById: ReturnType<
    typeof vi.fn<(
      telegramUserId: bigint,
      itemId: string,
      amount: number
    ) => Promise<DevGrantItemsResult>>
  >;
  addBandages: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantItemsResult>>
  >;
  addDenseBandages: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantItemsResult>>
  >;
  addFieldKits: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantItemsResult>>
  >;
  addIskrokamin: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantItemsResult>>
  >;
  addYegerLines: ReturnType<
    typeof vi.fn<(telegramUserId: bigint, amount: number) => Promise<DevGrantItemsResult>>
  >;
  resetYegerBandageCooldown: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetYegerBandageDay: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetYegerTrackingCooldown: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetCellarMouseCooldown: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetPriestBlessingCooldown: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetQuietPocketCooldown: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetBureaucramancerProtocolCooldown: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetVarenykSated: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  resetRogue: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  completeFirstYegerQuestProgress: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
  completeSecondYegerQuestProgress: ReturnType<
    typeof vi.fn<(telegramUserId: bigint) => Promise<DevGrantResult>>
  >;
} {
  const character = {
    id: "character-42",
    userId: "user-42",
    name: "Тестовий пригодник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 7,
    gold: 3,
    hpCurrent: 20,
    hpMax: 20,
    hpRegenAt: null,
    manaCurrent: 10,
    manaMax: 10,
    manaRegenAt: null,
    statsJson: {}
  };

  return {
    isEnabled: vi.fn(() => input.enabled ?? true),
    addLevel: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "level",
      amount,
      character,
      levelChange: {
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      }
    })),
    addXp: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "xp",
      amount,
      character
    })),
    addGold: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "gold",
      amount,
      character
    })),
    heal: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "heal",
      amount: amount ?? character.hpMax,
      character,
      ...(input.combatHeal ? { combat: input.combatHeal } : {})
    })),
    restoreMana: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "mana",
      amount: amount ?? character.manaMax,
      character
    })),
    addRandomItems: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.pan-of-persuasion",
          name: "Пательня переконання",
          quantity: amount
        }
      ]
    })),
    addItemById: vi.fn((_telegramUserId, itemId, amount) => Promise.resolve(
      input.unknownItemIds?.has(itemId)
        ? {
            state: "unknown-item",
            itemId
          }
        : {
            state: "updated",
            kind: "items",
            amount,
            character,
            itemGrants: [
              {
                itemId,
                name: "Рапіра останньої сторінки",
                quantity: amount
              }
            ]
          }
    )),
    addBandages: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.responsible-panic-bandage",
          name: "Бинт відповідальної паніки",
          quantity: amount
        }
      ]
    })),
    addDenseBandages: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.dense-bandage",
          name: "Щільний бинт",
          quantity: amount
        }
      ]
    })),
    addFieldKits: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.field-kit",
          name: "Польова аптечка",
          quantity: amount
        }
      ]
    })),
    addIskrokamin: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.iskrokamin",
          name: "Іскрокамінь",
          quantity: amount
        }
      ]
    })),
    addYegerLines: vi.fn((_telegramUserId, amount) => Promise.resolve({
      state: "updated",
      kind: "items",
      amount,
      character,
      itemGrants: [
        {
          itemId: "item.yeger.first-notch",
          name: "Єгерська риска на дощечці",
          quantity: amount
        }
      ]
    })),
    resetYegerBandageCooldown: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "yeger-bandage-cooldown",
      character,
      cleared: true
    })),
    resetYegerBandageDay: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "yeger-bandage-day",
      character,
      deleted: 3
    })),
    resetYegerTrackingCooldown: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "yeger-tracking-cooldown",
      character,
      cleared: true
    })),
    resetCellarMouseCooldown: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "cellar-mouse-cooldown",
      character,
      cleared: true
    })),
    resetPriestBlessingCooldown: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "priest-blessing-cooldown",
      character,
      cleared: true
    })),
    resetQuietPocketCooldown: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "quiet-pocket-cooldown",
      character,
      cleared: true
    })),
    resetBureaucramancerProtocolCooldown: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "bureaucramancer-protocol-cooldown",
      character,
      cleared: true
    })),
    resetVarenykSated: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "varenyk-sated",
      character,
      cleared: true
    })),
    resetRogue: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "rogue-reset",
      character,
      clearedCooldown: true,
      deletedAttempts: 2
    })),
    completeFirstYegerQuestProgress: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "yeger-quest-progress",
      character,
      stage: "first",
      addedWins: 5,
      wins: 5,
      target: 5,
      started: true
    })),
    completeSecondYegerQuestProgress: vi.fn(() => Promise.resolve({
      state: "updated",
      kind: "yeger-quest-progress",
      character,
      stage: "second",
      addedWins: 17,
      wins: 17,
      target: 17,
      started: true
    }))
  };
}

function servicesWith(
  devGrant: ReturnType<typeof fakeDevGrantService>,
  tavernGames?: ReturnType<typeof fakeTavernGamesService>,
  equipment?: ReturnType<typeof fakeEquipmentService>
): BotServices {
  return {
    adventure: {},
    cellarErrand: {},
    fight: {},
    hunt: {},
    yeger: {},
    onboarding: {},
    hero: {},
    equipment: equipment ?? {},
    inventory: {},
    levelBarter: {},
    mantokChest: {},
    presence: {
      markAction: () => Promise.resolve()
    },
    devGrant,
    devReset: {
      isEnabled: () => true
    },
    restart: {},
    tavern: {},
    ...(tavernGames ? { tavernGames } : {})
  } as unknown as BotServices;
}

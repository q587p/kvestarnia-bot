import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendHero } from "../../src/bot/commands/heroCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { HeroService } from "../../src/services/heroService";

describe("hero command", () => {
  it("does not send stale lazy recovery notice before the hero card", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const heroService = {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character: {
            ...character,
            hpCurrent: 24,
            hpMax: 24
          },
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          restoreToFullItemId: null,
          recoveryNotice: {
            type: "hp-full" as const,
            hpCurrent: 24,
            hpMax: 24
          }
        })
    } as unknown as HeroService;

    await sendHero(makeReplyContext(replies), heroService, "reply");

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).not.toContain("Здоров’я знову повне");
    expect(replies[0]?.text).toContain("<b>Мандрівник</b>");
    expect(replies[0]?.text).toContain("❤️ HP 24/24");
    const options = replies[0]?.options as {
      parse_mode: string;
      reply_markup?: { inline_keyboard?: unknown };
    };

    expect(options.parse_mode).toBe("HTML");
    expect(options.reply_markup?.inline_keyboard).toBeDefined();
  });

  it("does not prefix edited hero cards with stale lazy recovery notice", async () => {
    const edits: Array<{ text: string; options: unknown }> = [];
    const heroService = {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character,
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          restoreToFullItemId: null,
          recoveryNotice: {
            type: "hp-full" as const,
            hpCurrent: 24,
            hpMax: 24
          }
        })
    } as unknown as HeroService;

    await sendHero(makeEditContext(edits), heroService, "edit");

    expect(edits).toHaveLength(1);
    expect(edits[0]?.text).not.toContain("Здоров’я знову повне");
    expect(edits[0]?.text).toContain("<b>Мандрівник</b>");
    expect(edits[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
  });

  it("shows Priest self-heal on the hero card when wounded and mana is available", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const heroService = {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character: {
            ...character,
            classId: "class.priest",
            className: "Жрець",
            level: 3,
            hpCurrent: 11,
            hpMax: 32,
            manaCurrent: 9,
            manaMax: 16,
            remortCount: 2
          },
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          activePriestBlessing: null,
          priestSelfBlessAvailableAt: null,
          restoreToFullItemId: null
        })
    } as unknown as HeroService;

    await sendHero(makeReplyContext(replies), heroService, "reply");

    expect(inlineButtonRows(replies[0]?.options)).toContainEqual(["⚕️ Полікувати себе"]);
    expect(flatInlineButtonCallbacks(replies[0]?.options)).toContain("v1:nc:h:s:2:2:0");
  });

  it("shows Priest self-blessing on the hero card when no repeat wait is active", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const heroService = {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character: {
            ...character,
            classId: "class.priest",
            className: "Жрець",
            level: 3,
            hpCurrent: 32,
            hpMax: 32,
            manaCurrent: 9,
            manaMax: 16,
            remortCount: 2
          },
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          activePriestBlessing: null,
          priestSelfBlessAvailableAt: null,
          restoreToFullItemId: null
        })
    } as unknown as HeroService;

    await sendHero(makeReplyContext(replies), heroService, "reply");

    expect(inlineButtonRows(replies[0]?.options)).toContainEqual(["✨ Благословити себе"]);
    expect(flatInlineButtonCallbacks(replies[0]?.options)).toContain("v1:nc:b:s:2:2:0");
    expect(flatInlineButtonTexts(replies[0]?.options)).not.toContain("⚕️ Полікувати себе");
  });

  it("hides Priest self-heal on the hero card when HP is full or mana is empty", async () => {
    const fullHpReplies: Array<{ text: string; options: unknown }> = [];
    const noManaReplies: Array<{ text: string; options: unknown }> = [];
    const woundedPriest = {
      ...character,
      classId: "class.priest",
      className: "Жрець",
      level: 3,
      hpCurrent: 11,
      hpMax: 32,
      manaCurrent: 9,
      manaMax: 16
    };
    const makeHeroService = (overrides: Partial<CharacterSummary>) => ({
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character: {
            ...woundedPriest,
            ...overrides
          },
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          activePriestBlessing: null,
          priestSelfBlessAvailableAt: null,
          restoreToFullItemId: null
        })
    }) as unknown as HeroService;

    await sendHero(makeReplyContext(fullHpReplies), makeHeroService({ hpCurrent: 32 }), "reply");
    await sendHero(makeReplyContext(noManaReplies), makeHeroService({ manaCurrent: 0 }), "reply");

    expect(flatInlineButtonTexts(fullHpReplies[0]?.options)).not.toContain("⚕️ Полікувати себе");
    expect(flatInlineButtonTexts(noManaReplies[0]?.options)).not.toContain("⚕️ Полікувати себе");
  });

  it("hides Priest self-blessing on the hero card when wait, active flow, or mana blocks it", async () => {
    const waitReplies: Array<{ text: string; options: unknown }> = [];
    const blockedReplies: Array<{ text: string; options: unknown }> = [];
    const noManaReplies: Array<{ text: string; options: unknown }> = [];
    const priest = {
      ...character,
      classId: "class.priest",
      className: "Жрець",
      level: 3,
      hpCurrent: 32,
      hpMax: 32,
      manaCurrent: 9,
      manaMax: 16
    };
    const makeHeroService = (overrides: {
      classNoncombatBlocked?: boolean;
      manaCurrent?: number;
      priestSelfBlessAvailableAt?: Date | null;
    }) => ({
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character: {
            ...priest,
            ...(overrides.manaCurrent !== undefined ? { manaCurrent: overrides.manaCurrent } : {})
          },
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          activePriestBlessing: null,
          classNoncombatBlocked: overrides.classNoncombatBlocked ?? false,
          priestSelfBlessAvailableAt: overrides.priestSelfBlessAvailableAt ?? null,
          restoreToFullItemId: null
        })
    }) as unknown as HeroService;

    await sendHero(
      makeReplyContext(waitReplies),
      makeHeroService({ priestSelfBlessAvailableAt: new Date("2026-07-03T10:33:00.000Z") }),
      "reply"
    );
    await sendHero(makeReplyContext(blockedReplies), makeHeroService({ classNoncombatBlocked: true }), "reply");
    await sendHero(makeReplyContext(noManaReplies), makeHeroService({ manaCurrent: 0 }), "reply");

    expect(flatInlineButtonTexts(waitReplies[0]?.options)).not.toContain("✨ Благословити себе");
    expect(flatInlineButtonTexts(blockedReplies[0]?.options)).not.toContain("✨ Благословити себе");
    expect(flatInlineButtonTexts(noManaReplies[0]?.options)).not.toContain("✨ Благословити себе");
  });

  it("hides Priest self-heal on the hero card while another active flow blocks class aid", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const heroService = {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character" as const,
          character: {
            ...character,
            classId: "class.priest",
            className: "Жрець",
            level: 3,
            hpCurrent: 11,
            hpMax: 32,
            manaCurrent: 9,
            manaMax: 16
          },
          inventoryGoldValue: 0,
          activeDrink: null,
          activeCosmeticTitle: null,
          activePriestBlessing: null,
          priestSelfBlessAvailableAt: null,
          classNoncombatBlocked: true,
          restoreToFullItemId: null
        })
    } as unknown as HeroService;

    await sendHero(makeReplyContext(replies), heroService, "reply");

    expect(flatInlineButtonTexts(replies[0]?.options)).not.toContain("⚕️ Полікувати себе");
  });

  it("hides Varenyk self-feeding when the Hero lookup reports the class-specific adventure gate", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const heroService = {
      findByTelegramUserId: () => Promise.resolve({
        state: "existing-character" as const,
        character: {
          ...character,
          classId: "class.varenyk-mancer",
          className: "Вареник-мант",
          level: 3,
          hpCurrent: 24,
          manaCurrent: 12,
          manaMax: 16
        },
        inventoryGoldValue: 0,
        activeDrink: null,
        activeCosmeticTitle: null,
        activePriestBlessing: null,
        varenykSatedAvailableAt: null,
        classNoncombatBlocked: true,
        restoreToFullItemId: null
      })
    } as unknown as HeroService;

    await sendHero(makeReplyContext(replies), heroService, "reply");

    expect(flatInlineButtonTexts(replies[0]?.options)).not.toContain("🍽️ Нагодувати себе");
  });
});

function makeReplyContext(replies: Array<{ text: string; options: unknown }>): Context {
  return {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тест"
    },
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({});
    }
  } as unknown as Context;
}

function makeEditContext(edits: Array<{ text: string; options: unknown }>): Context {
  return {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тест"
    },
    editMessageText: (text: string, options: unknown) => {
      edits.push({ text, options });
      return Promise.resolve({});
    }
  } as unknown as Context;
}

function inlineButtonRows(options: unknown): string[][] {
  return getInlineKeyboard(options).map((row) => row.map((button) => button.text));
}

function flatInlineButtonTexts(options: unknown): string[] {
  return inlineButtonRows(options).flat();
}

function flatInlineButtonCallbacks(options: unknown): string[] {
  return getInlineKeyboard(options).flat().map((button) => button.callback_data);
}

function getInlineKeyboard(options: unknown): Array<Array<{ text: string; callback_data: string }>> {
  return (options as { reply_markup?: { inline_keyboard?: Array<Array<{ text: string; callback_data: string }>> } })
    .reply_markup?.inline_keyboard ?? [];
}

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 3,
  xp: 25,
  nextLevelXp: 45,
  xpToNextLevel: 20,
  gold: 0,
  hpCurrent: 24,
  hpMax: 24,
  manaCurrent: 12,
  manaMax: 12,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 4,
    manaMax: 2,
    primaryStat: {
      stat: "strength",
      bonus: 1
    }
  }
};

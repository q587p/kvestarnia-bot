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

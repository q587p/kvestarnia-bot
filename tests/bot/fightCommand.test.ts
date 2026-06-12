import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendFight } from "../../src/bot/commands/fightCommand";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { FightService } from "../../src/services/fightService";

describe("fight command", () => {
  it("does not show fight action buttons after today's fight is already completed", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
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
    const fightService = {
      getMimicShawarmaForTelegramUser: () =>
        Promise.resolve({
          state: "already-completed",
          character,
          questAvailable: true
        })
    } as unknown as FightService;

    await sendFight(ctx, fightService, "reply");

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("Сьогоднішню сутичку вже зараховано");
    expect(replies[0]?.text).toContain("/quest");
    expect(replies[0]?.text).not.toContain("Що робимо?");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(replies[0]?.options).not.toHaveProperty("reply_markup");
  });
});

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Герої",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
};

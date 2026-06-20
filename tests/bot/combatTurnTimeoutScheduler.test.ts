import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createCombatTurnTimeoutScheduler } from "../../src/bot/combatTurnTimeoutScheduler";
import type { DueSoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { CombatState } from "../../src/domain/combat";
import type { MonsterContent } from "../../src/content/schema";
import type { FightService, PersistentFightTimeoutResult } from "../../src/services/fightService";

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 3,
  xp: 30,
  nextLevelXp: 50,
  xpToNextLevel: 20,
  gold: 9,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 9,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 6,
    manaMax: 3,
    primaryStat: {
      stat: "strength",
      bonus: 2
    }
  }
};

const monster: MonsterContent = {
  id: "monster.deadline-spider",
  name: "Павук дедлайнів",
  description: "Плете павутину з «сьогодні швиденько».",
  level: 2,
  tags: ["beast", "time", "web"]
};

describe("combat turn timeout scheduler", () => {
  it("edits the active persistent fight card after a due timeout turn resolves", async () => {
    const session = persistentSession();
    const result: PersistentFightTimeoutResult = {
      state: "updated",
      telegramUserId: 42n,
      character,
      session,
      monster,
      questProgress: null,
      fightReward: null
    };
    const fight = {
      listDuePersistentFightTurns: vi.fn(() => Promise.resolve([session])),
      resolveDuePersistentFightTurn: vi.fn(() => Promise.resolve(result)),
      recordPersistentFightMessageReference: vi.fn(() => Promise.resolve())
    };
    const { bot, editMessageText, sendMessage } = fakeBot();
    const scheduler = createCombatTurnTimeoutScheduler(
      { fight: fight as unknown as FightService },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(editMessageText).toHaveBeenCalled());
    scheduler.stop();

    expect(fight.resolveDuePersistentFightTurn).toHaveBeenCalledWith(session);
    const editCall = firstEditCall(editMessageText);
    expect(editCall?.[0]).toBe("42");
    expect(editCall?.[1]).toBe(587);
    expect(editCall?.[2]).toContain("❤️ Ви:");
    expect(editCall?.[3]?.parse_mode).toBe("HTML");
    expect(editCall?.[3]?.reply_markup?.inline_keyboard).toEqual(expect.any(Array));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends a replacement card and records its reference when Telegram cannot edit the old card", async () => {
    const session = persistentSession();
    const result: PersistentFightTimeoutResult = {
      state: "updated",
      telegramUserId: 42n,
      character,
      session,
      monster,
      questProgress: null,
      fightReward: null
    };
    const fight = {
      listDuePersistentFightTurns: vi.fn(() => Promise.resolve([session])),
      resolveDuePersistentFightTurn: vi.fn(() => Promise.resolve(result)),
      recordPersistentFightMessageReference: vi.fn(() => Promise.resolve())
    };
    const editMessageText = vi.fn(() => Promise.reject(new Error("message is gone")));
    const sendMessage = vi.fn(() => Promise.resolve({ message_id: 588 }));
    const { bot } = fakeBot({
      editMessageText,
      sendMessage
    });
    const scheduler = createCombatTurnTimeoutScheduler(
      { fight: fight as unknown as FightService },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    scheduler.stop();

    expect(fight.recordPersistentFightMessageReference).toHaveBeenCalledWith(42n, "session-1", {
      chatId: "42",
      messageId: 588
    });
  });
});

type EditMessageTextCall = [
  chatId: string,
  messageId: number,
  text: string,
  options?: {
    parse_mode?: string;
    reply_markup?: {
      inline_keyboard?: unknown;
    };
  }
];

interface FakeBot {
  bot: Bot;
  editMessageText: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
}

interface FakeBotOverrides {
  editMessageText?: ReturnType<typeof vi.fn>;
  sendMessage?: ReturnType<typeof vi.fn>;
}

function firstEditCall(editMessageText: ReturnType<typeof vi.fn>): EditMessageTextCall | undefined {
  return editMessageText.mock.calls[0] as EditMessageTextCall | undefined;
}

function fakeBot(overrides: FakeBotOverrides = {}): FakeBot {
  const editMessageText = overrides.editMessageText ?? vi.fn(() => Promise.resolve(true));
  const sendMessage = overrides.sendMessage ?? vi.fn(() => Promise.resolve({ message_id: 999 }));

  return {
    bot: {
      api: {
        editMessageText,
        sendMessage
      }
    } as unknown as Bot,
    editMessageText,
    sendMessage
  };
}

function persistentSession(): DueSoloCombatSessionRecord {
  const state: CombatState = {
    id: "session-1",
    source: "normal",
    originLocationId: "location.korchma.deep.level1",
    turnExpiresAt: "2026-06-20T00:00:46.000Z",
    message: {
      chatId: "42",
      messageId: 587
    },
    turn: 2,
    status: "active",
    hero: {
      hp: 18,
      hpMax: 20,
      mana: 10,
      manaMax: 10
    },
    monster: {
      id: monster.id,
      name: monster.name,
      level: monster.level,
      hp: 7,
      hpMax: 12
    },
    lastTurn: {
      action: "attack",
      heroOutcome: "hit",
      monsterOutcome: "hit",
      heroDamage: 5,
      monsterDamage: 2,
      manaSpent: 0,
      critical: false,
      monsterAction: "attack"
    }
  };

  return {
    id: "session-1",
    characterId: "character-1",
    monsterId: monster.id,
    status: "active",
    turn: state.turn,
    state,
    reward: null,
    createdAt: new Date("2026-06-20T00:00:00.000Z"),
    updatedAt: new Date("2026-06-20T00:00:23.000Z"),
    expiresAt: new Date("2026-06-20T00:30:00.000Z"),
    telegramUserId: 42n
  };
}

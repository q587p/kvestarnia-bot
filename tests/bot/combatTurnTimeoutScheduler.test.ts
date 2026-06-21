import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createCombatTurnTimeoutScheduler } from "../../src/bot/combatTurnTimeoutScheduler";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult
} from "../../src/db/repositories/characterRepository";
import type {
  ClaimDailyActionInput,
  ClaimDailyActionResult,
  DailyActionRecord,
  DailyActionRepository
} from "../../src/db/repositories/dailyActionRepository";
import type { DueSoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import type {
  CreateSoloCombatSessionInput,
  RecordSoloCombatRewardInput,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  SoloCombatSessionStatus,
  UpdateSoloCombatSessionInput
} from "../../src/db/repositories/soloCombatSessionRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { CombatState } from "../../src/domain/combat";
import type { MonsterContent } from "../../src/content/schema";
import { FightService, type PersistentFightTimeoutResult } from "../../src/services/fightService";
import type {
  TrainingDoppelgangerService,
  TrainingDoppelgangerTimeoutResult
} from "../../src/services/trainingDoppelgangerService";
import type { TelegramUserProfile } from "../../src/db/repositories/userRepository";
import { FakeRandomSource } from "../../src/shared/random";

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
  it("uses the real fight service timeout result to edit the persisted active card", async () => {
    const world = new SchedulerFightWorld(persistentSession());
    const fight = world.buildFightService();
    const { bot, editMessageText } = fakeBot();
    const scheduler = createCombatTurnTimeoutScheduler(
      { fight },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(editMessageText).toHaveBeenCalled());
    scheduler.stop();

    const updated = world.getSession("session-1");
    expect(updated?.state?.turn).toBe(3);
    expect(updated?.state?.lastTurn?.action).toBe("defend");
    expect(updated?.state?.lastTurn?.debugTrace?.timeoutMode).toBe("auto-defend");
    expect(updated?.state?.message).toEqual({
      chatId: "42",
      messageId: 587
    });
    expect(firstEditCall(editMessageText)?.[1]).toBe(587);
  });

  it("records a replacement card reference after a real timeout result falls back to sendMessage", async () => {
    const world = new SchedulerFightWorld(persistentSession());
    const fight = world.buildFightService();
    const editMessageText = vi.fn(() => Promise.reject(new Error("message is gone")));
    const sendMessage = vi.fn(() => Promise.resolve({ message_id: 588 }));
    const { bot } = fakeBot({
      editMessageText,
      sendMessage
    });
    const scheduler = createCombatTurnTimeoutScheduler(
      { fight },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    scheduler.stop();

    expect(world.getSession("session-1")?.state?.message).toEqual({
      chatId: "42",
      messageId: 588
    });
  });

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

  it("records a replacement terminal card reference when Telegram cannot edit the old persistent card", async () => {
    const dueSession = persistentSession();
    const session = terminalPersistentSession();
    const result: PersistentFightTimeoutResult = {
      state: "terminal",
      telegramUserId: 42n,
      character,
      session,
      monster,
      questProgress: null,
      fightReward: null
    };
    const fight = {
      listDuePersistentFightTurns: vi.fn(() => Promise.resolve([dueSession])),
      resolveDuePersistentFightTurn: vi.fn(() => Promise.resolve(result)),
      recordPersistentFightMessageReference: vi.fn(() => Promise.resolve())
    };
    const editMessageText = vi.fn(() => Promise.reject(new Error("message is gone")));
    const sendMessage = vi.fn(() => Promise.resolve({ message_id: 589 }));
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
      messageId: 589
    });
  });

  it("records a replacement terminal card reference when Telegram cannot edit the old training card", async () => {
    const dueSession = trainingSession();
    const session = terminalTrainingSession();
    const result: TrainingDoppelgangerTimeoutResult = {
      state: "terminal",
      telegramUserId: 42n,
      character,
      doppelganger: trainingDoppelganger(),
      session,
      reward: null
    };
    const fight = {
      listDuePersistentFightTurns: vi.fn(() => Promise.resolve([]))
    };
    const training = {
      listDueTrainingTurns: vi.fn(() => Promise.resolve([dueSession])),
      resolveDueTrainingTurn: vi.fn(() => Promise.resolve(result)),
      recordTrainingDoppelgangerMessageReference: vi.fn(() => Promise.resolve())
    };
    const editMessageText = vi.fn(() => Promise.reject(new Error("message is gone")));
    const sendMessage = vi.fn(() => Promise.resolve({ message_id: 590 }));
    const { bot } = fakeBot({
      editMessageText,
      sendMessage
    });
    const scheduler = createCombatTurnTimeoutScheduler(
      {
        fight: fight as unknown as FightService,
        trainingDoppelganger: training as unknown as TrainingDoppelgangerService
      },
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    scheduler.stop();

    expect(training.recordTrainingDoppelgangerMessageReference).toHaveBeenCalledWith(42n, "session-1", {
      chatId: "42",
      messageId: 590
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

function terminalPersistentSession(): DueSoloCombatSessionRecord {
  const session = persistentSession();
  const state: CombatState = {
    ...session.state!,
    status: "won",
    turn: 3,
    monster: {
      ...session.state!.monster,
      hp: 0
    },
    lastTurn: {
      action: "attack",
      heroOutcome: "won",
      monsterOutcome: "inactive",
      heroDamage: 7,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    }
  };

  return {
    ...session,
    status: "won",
    turn: state.turn,
    state
  };
}

function trainingSession(): DueSoloCombatSessionRecord {
  const session = persistentSession();
  const state: CombatState = {
    ...session.state!,
    source: "training",
    monster: {
      ...session.state!.monster,
      id: "monster.training-doppelganger",
      name: trainingDoppelganger().name
    }
  };

  return {
    ...session,
    monsterId: "monster.training-doppelganger",
    state
  };
}

function terminalTrainingSession(): DueSoloCombatSessionRecord {
  const session = trainingSession();
  const state: CombatState = {
    ...session.state!,
    status: "won",
    turn: 3,
    monster: {
      ...session.state!.monster,
      hp: 0
    },
    lastTurn: {
      action: "attack",
      heroOutcome: "won",
      monsterOutcome: "inactive",
      heroDamage: 7,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    }
  };

  return {
    ...session,
    status: "won",
    turn: state.turn,
    state
  };
}

function trainingDoppelganger() {
  return {
    name: "РњР°РЅРґСЂС–РІРЅРёРє Р· РґР·РµСЂРєР°Р»Р°",
    raceName: character.raceName,
    className: character.className,
    title: character.title,
    level: character.level,
    spawnMode: "COPY_TARGET" as const,
    source: "target" as const,
    copiedEquipmentCount: 0
  };
}

class SchedulerFightWorld implements CharacterRepository, DailyActionRepository, SoloCombatSessionRepository {
  private readonly character: CharacterRecord = {
    id: "character-1",
    userId: "user-1",
    currentLocationId: "location.korchma.deep.level1",
    name: "Мандрівник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 30,
    gold: 9,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {
      strength: 9,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  };
  private readonly sessions = new Map<string, SoloCombatSessionRecord>();

  constructor(session: DueSoloCombatSessionRecord) {
    this.sessions.set(session.id, cloneSession(session));
  }

  buildFightService(): FightService {
    return new FightService(
      this,
      this,
      () => new Date("2026-06-20T00:00:47.000Z"),
      this,
      new FakeRandomSource([0.99, 0.9, 0.99, 0.9, 0.99, 0.9])
    );
  }

  getSession(sessionId: string): SoloCombatSessionRecord | null {
    const session = this.sessions.get(sessionId);

    return session ? cloneSession(session) : null;
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(userId === this.character.userId ? this.character : null);
  }

  findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(telegramUserId === 42n ? this.character : null);
  }

  updateResourcesForTelegramUser(): Promise<CharacterRecord | null> {
    return Promise.resolve(this.character);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    return Promise.resolve(false);
  }

  createForTelegramUserIfMissing(
    _user: TelegramUserProfile,
    _input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    void _user;
    void _input;

    return Promise.resolve({
      character: this.character,
      created: false
    });
  }

  findForTelegramUser(
    _telegramUserId: bigint,
    _input: { key: string; localDate: string }
  ): Promise<DailyActionRecord | null> {
    void _telegramUserId;
    void _input;

    return Promise.resolve(null);
  }

  claimForTelegramUser(
    _telegramUserId: bigint,
    _input: ClaimDailyActionInput
  ): Promise<ClaimDailyActionResult | null> {
    void _telegramUserId;
    void _input;

    return Promise.resolve(null);
  }

  findActiveByTelegramUserId(): Promise<SoloCombatSessionRecord | null> {
    return Promise.resolve(
      [...this.sessions.values()].find((session) => session.status === "active") ?? null
    );
  }

  listDueActiveSessions(): Promise<DueSoloCombatSessionRecord[]> {
    return Promise.resolve(
      [...this.sessions.values()].flatMap((session) =>
        session.status === "active"
          ? [{
              ...cloneSession(session),
              telegramUserId: 42n
            }]
          : []
      )
    );
  }

  countWonByTelegramUserId(): Promise<number> {
    return Promise.resolve(0);
  }

  listCompletedByTelegramUserIdSince(): Promise<[]> {
    return Promise.resolve([]);
  }

  findByIdForTelegramUserId(
    _telegramUserId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null> {
    return Promise.resolve(this.getSession(sessionId));
  }

  createForTelegramUser(
    _telegramUserId: bigint,
    _input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    void _telegramUserId;
    void _input;

    return Promise.resolve(null);
  }

  updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    const updated: SoloCombatSessionRecord = {
      ...session,
      status: input.status,
      turn: input.state.turn,
      state: structuredClone(input.state),
      updatedAt: new Date("2026-06-20T00:00:47.000Z"),
      expiresAt: input.expiresAt ?? session.expiresAt
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(cloneSession(updated));
  }

  updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== "active" || session.turn !== expectedTurn) {
      return Promise.resolve(null);
    }

    return this.updateById(sessionId, input);
  }

  recordRewardById(
    _sessionId: string,
    _input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null> {
    void _sessionId;
    void _input;

    return Promise.resolve(null);
  }

  markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus
  ): Promise<SoloCombatSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Promise.resolve(null);
    }

    const updated = {
      ...session,
      status
    };
    this.sessions.set(sessionId, updated);

    return Promise.resolve(cloneSession(updated));
  }
}

function cloneSession<T extends SoloCombatSessionRecord>(session: T): T {
  return {
    ...session,
    state: session.state ? structuredClone(session.state) : null,
    reward: session.reward
      ? {
          ...session.reward,
          itemGrants: session.reward.itemGrants.map((item) => ({ ...item }))
        }
      : null
  };
}

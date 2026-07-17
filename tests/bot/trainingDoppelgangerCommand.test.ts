import { describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { sendTrainingDoppelganger } from "../../src/bot/commands/trainingDoppelgangerCommand";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import type { PresenceService } from "../../src/services/presenceService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";
import type {
  TrainingDoppelgangerLookupResult,
  TrainingDoppelgangerService,
  TrainingDoppelgangerStartMode
} from "../../src/services/trainingDoppelgangerService";

describe("training doppelganger command", () => {
  it("keeps durable terminal progress when its Telegram notification fails", async () => {
    const terminalSession = trainingSession();
    terminalSession.status = "won";
    terminalSession.state = {
      ...terminalSession.state,
      status: "won",
      completedAt: "2026-07-02T10:00:00.000Z",
      settlement: { status: "completed", version: 1 }
    } as SoloCombatSessionRecord["state"];
    const service = new FakeTrainingDoppelgangerService({
      state: "terminal",
      character: character(),
      doppelganger: doppelganger(),
      session: terminalSession,
      reward: null
    });
    const recordTrainingSessionSafely = vi.fn(() => Promise.resolve([{
      telegramUserId: 42n,
      objective: "training" as const,
      progress: {
        accepted: true,
        trainingCompleted: true,
        quickDuelCompleted: false,
        turnBasedDuelCompleted: false,
        completedObjectives: 1,
        requiredObjectives: 3 as const,
        readyToClaim: false,
        currentLocationId: "location.korchma.fighting_corner"
      }
    }]));
    const presence = capturingPresence();
    let replyCalls = 0;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ctx = {
      from: { id: 42, first_name: "Тестовий" },
      reply: () => {
        replyCalls += 1;
        return replyCalls === 1
          ? Promise.resolve({ message_id: 1 })
          : Promise.reject(new Error("Telegram unavailable"));
      }
    } as unknown as Context;

    await expect(sendTrainingDoppelganger(
      ctx,
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence,
        fightingCornerQuest: { recordTrainingSessionSafely },
        now: () => new Date("2026-07-02T10:00:00.000Z")
      }
    )).resolves.toBeUndefined();

    expect(recordTrainingSessionSafely).toHaveBeenCalledTimes(1);
    expect(presence.marks).toEqual([{
      locationId: "location.korchma.fighting_corner",
      currentRaidId: null,
      currentAdventureId: null
    }]);
    expect(warning).toHaveBeenCalledWith(
      "Kvestarnia: Fighting Corner training progress notification failed.",
      expect.any(Error)
    );
    warning.mockRestore();
  });

  it("records terminal quest progress before non-essential presence fails", async () => {
    const terminalSession = trainingSession();
    terminalSession.status = "lost";
    terminalSession.state = {
      ...terminalSession.state,
      status: "lost",
      completedAt: "2026-07-02T10:00:00.000Z",
      settlement: { status: "completed", version: 1 }
    } as SoloCombatSessionRecord["state"];
    const service = new FakeTrainingDoppelgangerService({
      state: "terminal",
      character: character(),
      doppelganger: doppelganger(),
      session: terminalSession,
      reward: null
    });
    const order: string[] = [];
    const recordTrainingSessionSafely = vi.fn(() => {
      order.push("quest");
      return Promise.resolve([]);
    });
    const presence = {
      markAction: () => {
        order.push("presence");
        return Promise.reject(new Error("presence unavailable"));
      }
    } as unknown as PresenceService;
    const ctx = {
      from: { id: 42, first_name: "Тестовий" },
      reply: vi.fn(() => Promise.resolve({ message_id: 1 }))
    } as unknown as Context;

    await expect(sendTrainingDoppelganger(
      ctx,
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence,
        fightingCornerQuest: { recordTrainingSessionSafely },
        now: () => new Date("2026-07-02T10:00:00.000Z")
      }
    )).rejects.toThrow("presence unavailable");

    expect(order).toEqual(["quest", "presence"]);
    expect(recordTrainingSessionSafely).toHaveBeenCalledWith(42n, terminalSession);
  });

  it("blocks pending Barrel raids before starting the training fight", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const service = new FakeTrainingDoppelgangerService({ state: "no-character" });

    await sendTrainingDoppelganger(
      {
        from: {
          id: 42,
          first_name: "Тестовий"
        },
        reply: (text: string, options: unknown) => {
          replies.push({ text, options });
          return Promise.resolve({} as never);
        }
      } as unknown as Context,
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence: fakePresence(),
        tavernRaid: {
          getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({
            state: "pending",
            character: character(),
            availableAt: new Date("2026-06-17T09:35:00.000Z"),
            now: new Date("2026-06-17T09:30:00.000Z"),
            periodId: "2026-06-17T09"
          })
        } as unknown as TavernRaidService,
        requireKorchmaInterior: true
      }
    );

    expect(service.calls).toBe(0);
    expect(replies[0]?.text).toContain("🍺 Ви зараз у рейді.");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:tavern:raid");
  });

  it("sends the doppelganger to Shynok at night instead of starting training", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const service = new FakeTrainingDoppelgangerService({
      state: "ready",
      character: character(),
      choices: []
    });

    await sendTrainingDoppelganger(
      makeContext(replies),
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence: fakePresence(),
        requireKorchmaInterior: true,
        now: () => new Date("2026-07-02T20:00:00.000Z")
      }
    );

    expect(service.calls).toBe(0);
    expect(replies[0]?.text).toContain("зараз тут немає");
    expect(replies[0]?.text).toContain("🎲 Кості й покер");
    expect(replies[0]?.text).not.toContain("після 23:00");
    expect(replies[0]?.text).not.toContain("до 07:00");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:place:fighting-corner");
  });

  it("marks active training at the fighting corner", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = capturingPresence();
    const session = trainingSession();
    session.state = {
      ...session.state,
      turn: 2,
      lastTurn: {
        action: "attack",
        heroOutcome: "hit",
        heroDamage: 3,
        monsterDamage: 2,
        manaSpent: 0,
        critical: false
      }
    } as SoloCombatSessionRecord["state"];
    const service = new FakeTrainingDoppelgangerService({
      state: "active",
      character: character(),
      doppelganger: doppelganger(),
      session
    });

    await sendTrainingDoppelganger(
      makeContext(replies),
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence,
        requireKorchmaInterior: true,
        startMode: "copy-target",
        now: () => new Date("2026-07-02T10:00:00.000Z")
      }
    );

    expect(service.calls).toBe(1);
    expect(presence.marks).toEqual([
      {
        locationId: "location.korchma.fighting_corner",
        currentRaidId: null,
        currentAdventureId: "adventure.training-doppelganger"
      }
    ]);
    expect(replies[0]?.text).toContain("Бійцівський куток");
    expect(replies[0]?.text).toContain("Проти вас:");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:spar:turn");
    expect(replies[1]?.text).toContain("❤️ Ви:");
    expect(replies[1]?.text).toContain("що робимо?");
    expect(replies[1]?.text).toContain("<blockquote><i>");
    expect((replies[1]?.options as { parse_mode?: string }).parse_mode).toBe("HTML");
    expect(JSON.stringify(replies[1]?.options)).toContain("v1:spar:turn");
  });

  it("shows a doppelganger target choice before starting /spar", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = capturingPresence();
    const service = new FakeTrainingDoppelgangerService({
      state: "ready",
      character: character(),
      choices: [
        {
          mode: "copy-target",
          buttonLabel: "🪞 Копія поточного",
          title: "Копія поточного",
          description: "Допельґанґер бере поточний образ."
        },
        {
          mode: "random-build",
          buttonLabel: "🎲 Випадковий пригодник",
          title: "Випадковий пригодник",
          description: "Дзеркало збирає випадковий образ."
        }
      ]
    });

    await sendTrainingDoppelganger(
      makeContext(replies),
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence,
        requireKorchmaInterior: true,
        now: () => new Date("2026-07-02T10:00:00.000Z")
      }
    );

    expect(service.calls).toBe(1);
    expect(presence.marks).toEqual([]);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("Оберіть, кого сьогодні копіювати");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:spar:mode:copy-target");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:spar:mode:random-build");
    expect(JSON.stringify(replies[0]?.options)).toContain("↩️ Повернутися до кутка");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:place:fighting-corner");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("📋 До справ");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("🍺 До зали");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:spar:turn");
  });

  it("shows a level gate without turn buttons or presence marks", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = capturingPresence();
    const service = new FakeTrainingDoppelgangerService({
      state: "level-gated",
      character: character({ level: 2, xp: 13 }),
      minLevel: 3
    });

    await sendTrainingDoppelganger(
      makeContext(replies),
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence,
        requireKorchmaInterior: true,
        now: () => new Date("2026-07-02T10:00:00.000Z")
      }
    );

    expect(service.calls).toBe(1);
    expect(presence.marks).toEqual([]);
    expect(replies[0]?.text).toContain("3 рівня");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:spar:turn");
    expect(JSON.stringify(replies[0]?.options)).toContain("↩️ Повернутися до кутка");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:place:fighting-corner");
    expect(JSON.stringify(replies[0]?.options)).not.toContain("v1:quest:list");
  });
});

function makeContext(replies: Array<{ text: string; options: unknown }>): Context {
  return {
    from: {
      id: 42,
      first_name: "Тестовий"
    },
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({} as never);
    }
  } as unknown as Context;
}

function fakePresence(): PresenceService {
  return {
    getCurrentPlaceForTelegramUser: () => Promise.resolve({
      state: "ready",
      locationId: "location.korchma.hall",
      locationName: "Зала корчми",
      insideKorchma: true
    }),
    markAction: () => Promise.resolve(undefined)
  } as unknown as PresenceService;
}

function capturingPresence(): PresenceService & {
  marks: Array<{
    locationId?: string;
    currentRaidId?: string | null;
    currentAdventureId?: string | null;
  }>;
} {
  const marks: Array<{
    locationId?: string;
    currentRaidId?: string | null;
    currentAdventureId?: string | null;
  }> = [];

  return {
    marks,
    getCurrentPlaceForTelegramUser: () => Promise.resolve({
      state: "ready",
      locationId: "location.korchma.hall",
      locationName: "Зала корчми",
      insideKorchma: true
    }),
    markAction: (input: {
      locationId?: string;
      currentRaidId?: string | null;
      currentAdventureId?: string | null;
    }) => {
      marks.push({
        locationId: input.locationId,
        currentRaidId: input.currentRaidId,
        currentAdventureId: input.currentAdventureId
      });
      return Promise.resolve(undefined);
    }
  } as unknown as PresenceService & {
    marks: Array<{
      locationId?: string;
      currentRaidId?: string | null;
      currentAdventureId?: string | null;
    }>;
  };
}

function character(overrides: { level?: number; xp?: number } = {}) {
  return summarizeCharacter({
    name: "Мандрівник",
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: overrides.level ?? 3,
    xp: overrides.xp ?? 25,
    gold: 0,
    hpCurrent: 22,
    hpMax: 22,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    }
  });
}

function doppelganger() {
  return {
    name: "Сумлінний Допельґанґер" as const,
    raceName: "Людисько",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: 3,
    spawnMode: "COPY_TARGET" as const,
    source: "target" as const,
    copiedEquipmentCount: 0
  };
}

function trainingSession(): SoloCombatSessionRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    status: "active",
    turn: 1,
    state: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      turn: 1,
      status: "active",
      hero: {
        hp: 22,
        hpMax: 22,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        hp: 22,
        hpMax: 22
      }
    },
    reward: null,
    createdAt: new Date("2026-06-17T09:30:00.000Z"),
    updatedAt: new Date("2026-06-17T09:30:00.000Z"),
    expiresAt: new Date("2026-06-17T09:40:00.000Z")
  };
}

class FakeTrainingDoppelgangerService {
  calls = 0;

  constructor(private readonly result: TrainingDoppelgangerLookupResult) {}

  getStartOptionsForTelegramUser(): Promise<TrainingDoppelgangerLookupResult> {
    this.calls += 1;
    return Promise.resolve(this.result);
  }

  getOrStartForTelegramUser(
    _telegramUserId: bigint,
    _options?: { mode?: TrainingDoppelgangerStartMode }
  ): Promise<TrainingDoppelgangerLookupResult> {
    void _telegramUserId;
    void _options;
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

import { describe, expect, it } from "vitest";
import type { Context } from "grammy";
import { sendTrainingDoppelganger } from "../../src/bot/commands/trainingDoppelgangerCommand";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import type { PresenceService } from "../../src/services/presenceService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";
import type {
  TrainingDoppelgangerLookupResult,
  TrainingDoppelgangerService
} from "../../src/services/trainingDoppelgangerService";

describe("training doppelganger command", () => {
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

  it("marks active training at the quest table rather than a separate location", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const presence = capturingPresence();
    const service = new FakeTrainingDoppelgangerService({
      state: "active",
      character: character(),
      doppelganger: doppelganger(),
      session: trainingSession()
    });

    await sendTrainingDoppelganger(
      makeContext(replies),
      service as unknown as TrainingDoppelgangerService,
      "reply",
      {
        presence,
        requireKorchmaInterior: true
      }
    );

    expect(service.calls).toBe(1);
    expect(presence.marks).toEqual([
      {
        locationId: "location.korchma.quest_table",
        currentRaidId: null,
        currentAdventureId: "adventure.training-doppelganger"
      }
    ]);
    expect(replies[0]?.text).toContain("Бійцівський куток");
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

function character() {
  return summarizeCharacter({
    name: "Мандрівник",
    pronoun: "they",
    path: "path.sun",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 25,
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
    level: 3
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

  getOrStartForTelegramUser(): Promise<TrainingDoppelgangerLookupResult> {
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

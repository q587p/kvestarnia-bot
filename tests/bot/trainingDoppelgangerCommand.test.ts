import { describe, expect, it } from "vitest";
import type { Context } from "grammy";
import { sendTrainingDoppelganger } from "../../src/bot/commands/trainingDoppelgangerCommand";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import type { PresenceService } from "../../src/services/presenceService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";
import type {
  TrainingDoppelgangerResult,
  TrainingDoppelgangerService
} from "../../src/services/trainingDoppelgangerService";

describe("training doppelganger command", () => {
  it("blocks pending Barrel raids before reading the training card", async () => {
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
});

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

class FakeTrainingDoppelgangerService {
  calls = 0;

  constructor(private readonly result: TrainingDoppelgangerResult) {}

  getForTelegramUser(): Promise<TrainingDoppelgangerResult> {
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

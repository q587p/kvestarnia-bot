import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  resolveTrainingDoppelgangerSparring,
  type TrainingDoppelgangerResolution
} from "../domain/trainingDoppelganger";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import { getEquippedItemContents } from "./equipmentService";
import { SeededRandomSource } from "../shared/random";
import { systemClock, toIsoDate, type Clock } from "../shared/time";

export type TrainingDoppelgangerResult =
  | { state: "no-character" }
  | { state: "needs-rest"; character: CharacterSummary }
  | {
      state: "ready";
      character: CharacterSummary;
      doppelganger: TrainingDoppelgangerCopy;
      resolution: TrainingDoppelgangerResolution;
      replayKey: string;
    };

export interface TrainingDoppelgangerCopy {
  name: "Сумлінний Допельґанґер";
  raceName: string;
  className: string;
  title: string;
  level: number;
}

export class TrainingDoppelgangerService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly equipment?: EquipmentRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getForTelegramUser(telegramUserId: bigint): Promise<TrainingDoppelgangerResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const equipmentSnapshot = this.equipment
      ? await this.equipment.listByTelegramUserId(telegramUserId)
      : null;
    const summary = summarizeCharacter(character, {
      equippedItems: equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : []
    });

    if (summary.hpCurrent <= 0) {
      return {
        state: "needs-rest",
        character: summary
      };
    }

    const replayKey = `${character.id}:${toIsoDate(this.clock())}:training-doppelganger`;
    const resolution = resolveTrainingDoppelgangerSparring(
      summary,
      new SeededRandomSource(replayKey)
    );

    return {
      state: "ready",
      character: summary,
      doppelganger: {
        name: "Сумлінний Допельґанґер",
        raceName: summary.raceName,
        className: summary.className,
        title: summary.title,
        level: summary.level
      },
      resolution,
      replayKey
    };
  }
}

import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import { systemClock, type Clock } from "../shared/time";
import {
  summarizeAndSyncCharacterResources,
  type ResourceRecoveryNotice
} from "./characterResourceService";
import { getEquippedItemContents } from "./equipmentService";

export interface HpFullRecoveryNotification {
  telegramUserId: bigint;
  notice: ResourceRecoveryNotice;
}

export class ResourceRecoveryNotificationService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly equipment?: EquipmentRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async resolveDueHpFullNotifications(
    options: { limit?: number } = {}
  ): Promise<HpFullRecoveryNotification[]> {
    if (!this.characters.listRecoverableHpCharacters) {
      return [];
    }

    const now = this.clock();
    const candidates = await this.characters.listRecoverableHpCharacters(now, options);
    const notifications: HpFullRecoveryNotification[] = [];

    for (const candidate of candidates) {
      const equipmentSnapshot = this.equipment
        ? await this.equipment.listByTelegramUserId(candidate.telegramUserId)
        : null;
      const equippedItems = equipmentSnapshot
        ? getEquippedItemContents(equipmentSnapshot.equipment)
        : [];
      const summary = await summarizeAndSyncCharacterResources({
        characters: this.characters,
        telegramUserId: candidate.telegramUserId,
        character: candidate.character,
        equippedItems,
        now,
        ...(candidate.character.remortCount !== undefined
          ? { remortCount: candidate.character.remortCount }
          : {})
      });

      if (summary.recoveryNotice?.type === "hp-full") {
        notifications.push({
          telegramUserId: candidate.telegramUserId,
          notice: summary.recoveryNotice
        });
      }
    }

    return notifications;
  }
}

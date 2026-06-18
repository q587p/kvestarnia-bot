import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import type { InventoryRepository } from "../db/repositories/inventoryRepository";
import type { RemortRepository } from "../db/repositories/remortRepository";
import type { CharacterSummary } from "../domain/characters/characterSummary";
import { systemClock, type Clock } from "../shared/time";
import { summarizeAndSyncCharacterResources } from "./characterResourceService";
import type { ResourceRecoveryNotice } from "./characterResourceService";
import { getEquippedItemContents } from "./equipmentService";
import { calculateInventoryRowsGoldValue } from "./inventoryService";

export type HeroLookupResult =
  | { state: "no-character" }
  | {
      state: "existing-character";
      character: CharacterSummary;
      inventoryGoldValue: number;
      recoveryNotice?: ResourceRecoveryNotice;
    };

export class HeroService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly equipment?: EquipmentRepository,
    private readonly remorts?: Pick<RemortRepository, "countByTelegramUserId">,
    private readonly clock: Clock = systemClock
  ) {}

  async findByTelegramUserId(telegramUserId: bigint): Promise<HeroLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const [inventoryRows, equipmentSnapshot, remortCount] = await Promise.all([
      this.inventory.listByTelegramUserId(telegramUserId),
      this.equipment?.listByTelegramUserId(telegramUserId) ?? Promise.resolve(null),
      this.remorts?.countByTelegramUserId(telegramUserId) ?? Promise.resolve(0)
    ]);

    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
    const resourceAware = await summarizeAndSyncCharacterResources({
      characters: this.characters,
      telegramUserId,
      character,
      equippedItems,
      remortCount,
      now: this.clock()
    });

    return {
      state: "existing-character",
      character: resourceAware.character,
      inventoryGoldValue: inventoryRows ? calculateInventoryRowsGoldValue(inventoryRows) : 0,
      ...(resourceAware.recoveryNotice
        ? { recoveryNotice: resourceAware.recoveryNotice }
        : {})
    };
  }
}

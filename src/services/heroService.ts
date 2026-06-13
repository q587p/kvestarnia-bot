import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { InventoryRepository } from "../db/repositories/inventoryRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { calculateInventoryRowsGoldValue } from "./inventoryService";

export type HeroLookupResult =
  | { state: "no-character" }
  | { state: "existing-character"; character: CharacterSummary; inventoryGoldValue: number };

export class HeroService {
  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository
  ) {}

  async findByTelegramUserId(telegramUserId: bigint): Promise<HeroLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const inventoryRows = await this.inventory.listByTelegramUserId(telegramUserId);

    return {
      state: "existing-character",
      character: summarizeCharacter(character),
      inventoryGoldValue: inventoryRows ? calculateInventoryRowsGoldValue(inventoryRows) : 0
    };
  }
}

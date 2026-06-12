export interface CharacterItemRecord {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryRepository {
  listByTelegramUserId(telegramUserId: bigint): Promise<CharacterItemRecord[] | null>;
}

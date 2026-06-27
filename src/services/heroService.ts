import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import type { CharacterItemRecord, InventoryRepository } from "../db/repositories/inventoryRepository";
import type { RemortRepository } from "../db/repositories/remortRepository";
import type { ShynokDrinkStateRecord, ShynokRepository } from "../db/repositories/shynokRepository";
import { items } from "../content";
import type { CharacterSummary } from "../domain/characters/characterSummary";
import { getItemUseEffect } from "../domain/itemUse";
import {
  buildDrinkEffect,
  buildShynokRecoveryWindows,
  getShynokDrinkDefinition,
  type ShynokDrinkKey,
  type ShynokDrinkPhase
} from "../domain/shynokDrinks";
import { systemClock, type Clock } from "../shared/time";
import { summarizeAndSyncCharacterResources } from "./characterResourceService";
import type { ResourceRecoveryNotice } from "./characterResourceService";
import { getEquippedItemContents } from "./equipmentService";
import { calculateInventoryRowsGoldValue } from "./inventoryService";
import type {
  AchievementListFilter,
  AchievementListView,
  AchievementRecalculationResult,
  AchievementService
} from "./achievementService";

export type HeroLookupResult =
  | { state: "no-character" }
  | {
      state: "existing-character";
      character: CharacterSummary;
      inventoryGoldValue: number;
      activeDrink: HeroActiveDrink | null;
      restoreToFullItemId: string | null;
      recoveryNotice?: ResourceRecoveryNotice;
    };

export interface HeroActiveDrink {
  key: ShynokDrinkKey;
  name: string;
  emoji: string;
  phase: ShynokDrinkPhase;
  startedAt: Date;
  expiresAt: Date;
  recoveryMultiplierBp?: number;
  accuracyPenaltyPp?: number;
  outgoingDamageMultiplierBp?: number;
  incomingDamageMultiplierBp?: number;
}

export class HeroService {
  private readonly shynok:
    | Pick<ShynokRepository, "getActiveDrinkForTelegramUser" | "getRecoveryDrinkForTelegramUser">
    | undefined;
  private readonly clock: Clock;

  constructor(
    private readonly characters: CharacterRepository,
    private readonly inventory: InventoryRepository,
    private readonly equipment?: EquipmentRepository,
    private readonly remorts?: Pick<RemortRepository, "countByTelegramUserId">,
    shynokOrClock?: Pick<ShynokRepository, "getActiveDrinkForTelegramUser" | "getRecoveryDrinkForTelegramUser"> | Clock,
    clock: Clock = systemClock,
    private readonly achievements?: AchievementService
  ) {
    if (typeof shynokOrClock === "function") {
      this.clock = shynokOrClock;
      this.shynok = undefined;
    } else {
      this.shynok = shynokOrClock;
      this.clock = clock;
    }
  }

  async findByTelegramUserId(telegramUserId: bigint): Promise<HeroLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    const now = this.clock();
    const [inventoryRows, equipmentSnapshot, remortCount, activeDrink, recoveryDrink] = await Promise.all([
      this.inventory.listByTelegramUserId(telegramUserId),
      this.equipment?.listByTelegramUserId(telegramUserId) ?? Promise.resolve(null),
      this.remorts?.countByTelegramUserId(telegramUserId) ?? Promise.resolve(0),
      this.shynok?.getActiveDrinkForTelegramUser(telegramUserId, now) ?? Promise.resolve(null),
      this.shynok?.getRecoveryDrinkForTelegramUser?.(telegramUserId) ??
        this.shynok?.getActiveDrinkForTelegramUser(telegramUserId, now) ??
        Promise.resolve(null)
    ]);

    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
    const multiplierWindows = buildShynokRecoveryWindows(recoveryDrink);
    const resourceAware = await summarizeAndSyncCharacterResources({
      characters: this.characters,
      telegramUserId,
      character,
      equippedItems,
      remortCount,
      now,
      ...(multiplierWindows.length > 0 ? { multiplierWindows } : {})
    });

    return {
      state: "existing-character",
      character: resourceAware.character,
      inventoryGoldValue: inventoryRows ? calculateInventoryRowsGoldValue(inventoryRows) : 0,
      activeDrink: presentHeroActiveDrink(activeDrink),
      restoreToFullItemId: resolveRestoreToFullItemId(resourceAware.character, inventoryRows ?? []),
      ...(resourceAware.recoveryNotice
        ? { recoveryNotice: resourceAware.recoveryNotice }
        : {})
    };
  }

  async listAchievementsByTelegramUserId(
    telegramUserId: bigint,
    page = 0,
    filter: AchievementListFilter = "all"
  ): Promise<{ state: "no-character" } | { state: "ready"; view: AchievementListView }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      view: await this.achievements.listForCharacter(character.id, page, filter)
    };
  }

  async recalculateAchievementsByTelegramUserId(
    telegramUserId: bigint,
    filter: AchievementListFilter = "all"
  ): Promise<
    { state: "no-character" } | {
      state: "ready";
      result: AchievementRecalculationResult;
      view: AchievementListView;
    }
  > {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const result = await this.achievements.recalculateForCharacter(character.id);

    return {
      state: "ready",
      result,
      view: await this.achievements.listForCharacter(character.id, 0, filter)
    };
  }
}

function resolveRestoreToFullItemId(
  character: CharacterSummary,
  inventoryRows: readonly CharacterItemRecord[]
): string | null {
  if (character.hpCurrent >= character.hpMax) {
    return null;
  }

  for (const row of inventoryRows) {
    if (row.quantity <= 0) {
      continue;
    }

    const item = items.find((candidate) => candidate.id === row.itemId);
    const effect = item ? getItemUseEffect(item) : null;
    if (!effect || effect.amount <= 0) {
      continue;
    }

    const neededQuantity = Math.ceil((character.hpMax - character.hpCurrent) / Math.max(1, effect.amount));
    if (row.quantity >= neededQuantity) {
      return row.itemId;
    }
  }

  return null;
}

function presentHeroActiveDrink(state: ShynokDrinkStateRecord | null): HeroActiveDrink | null {
  if (!state) {
    return null;
  }

  const definition = getShynokDrinkDefinition(state.drinkKey);
  const effect = buildDrinkEffect({
    drinkKey: state.drinkKey,
    startedAt: state.startedAt
  });

  return {
    key: state.drinkKey,
    name: definition.name,
    emoji: definition.emoji,
    phase: effect.phase,
    startedAt: state.startedAt,
    expiresAt: state.expiresAt,
    ...(effect.recoveryMultiplierBp ? { recoveryMultiplierBp: effect.recoveryMultiplierBp } : {}),
    ...(effect.accuracyPenaltyPp ? { accuracyPenaltyPp: effect.accuracyPenaltyPp } : {}),
    ...(effect.outgoingDamageMultiplierBp
      ? { outgoingDamageMultiplierBp: effect.outgoingDamageMultiplierBp }
      : {}),
    ...(effect.incomingDamageMultiplierBp
      ? { incomingDamageMultiplierBp: effect.incomingDamageMultiplierBp }
      : {})
  };
}

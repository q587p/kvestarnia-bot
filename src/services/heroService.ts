import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import type { InventoryRepository } from "../db/repositories/inventoryRepository";
import type { RemortRepository } from "../db/repositories/remortRepository";
import type { ShynokDrinkStateRecord, ShynokRepository } from "../db/repositories/shynokRepository";
import type { CharacterSummary } from "../domain/characters/characterSummary";
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

export type HeroLookupResult =
  | { state: "no-character" }
  | {
      state: "existing-character";
      character: CharacterSummary;
      inventoryGoldValue: number;
      activeDrink: HeroActiveDrink | null;
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
    clock: Clock = systemClock
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
      ...(resourceAware.recoveryNotice
        ? { recoveryNotice: resourceAware.recoveryNotice }
        : {})
    };
  }
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

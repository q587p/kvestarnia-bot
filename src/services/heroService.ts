import type { CharacterRepository } from "../db/repositories/characterRepository";
import type {
  ClassNoncombatRepository,
  PriestBlessingRecord
} from "../db/repositories/classNoncombatRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import type { CharacterItemRecord, InventoryRepository } from "../db/repositories/inventoryRepository";
import type { RemortRepository } from "../db/repositories/remortRepository";
import type { ShynokDrinkStateRecord, ShynokRepository } from "../db/repositories/shynokRepository";
import { items } from "../content";
import type { CharacterSummary } from "../domain/characters/characterSummary";
import type { StatKey } from "../domain/characters/starterStats";
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
  AchievementUnlock,
  CosmeticTitleListView,
  CosmeticTitleMutationResult,
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
      activePriestBlessing: HeroActivePriestBlessing | null;
      activeCosmeticTitle: string | null;
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

export interface HeroActivePriestBlessing {
  actorName: string;
  targetName: string;
  expiresAt: Date;
  bonusStat: StatKey;
  bonusAmount: number;
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
    private readonly achievements?: AchievementService,
    private readonly classNoncombat?: Pick<ClassNoncombatRepository, "getActivePriestBlessingForTelegramUser">
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
    const [inventoryRows, equipmentSnapshot, remortCount, activeDrink, recoveryDrink, activePriestBlessing] = await Promise.all([
      this.inventory.listByTelegramUserId(telegramUserId),
      this.equipment?.listByTelegramUserId(telegramUserId) ?? Promise.resolve(null),
      this.remorts?.countByTelegramUserId(telegramUserId) ?? Promise.resolve(0),
      this.shynok?.getActiveDrinkForTelegramUser(telegramUserId, now) ?? Promise.resolve(null),
      this.shynok?.getRecoveryDrinkForTelegramUser?.(telegramUserId) ??
        this.shynok?.getActiveDrinkForTelegramUser(telegramUserId, now) ??
        Promise.resolve(null),
      this.classNoncombat?.getActivePriestBlessingForTelegramUser(telegramUserId, now) ?? Promise.resolve(null)
    ]);

    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
    const activeCosmeticTitle = await this.achievements?.getActiveCosmeticTitleForCharacter(
      character.id,
      character.activeCosmeticTitleGrantId
    ) ?? null;
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

    const presentedPriestBlessing = presentHeroActivePriestBlessing(activePriestBlessing);
    const characterSummary = applyPriestBlessingBonus(resourceAware.character, presentedPriestBlessing);

    return {
      state: "existing-character",
      character: characterSummary,
      inventoryGoldValue: inventoryRows ? calculateInventoryRowsGoldValue(inventoryRows) : 0,
      activeDrink: presentHeroActiveDrink(activeDrink),
      activePriestBlessing: presentedPriestBlessing,
      activeCosmeticTitle,
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

    await this.achievements.trackEventSafely({
      type: "achievement.list.opened",
      characterId: character.id,
      occurredAt: this.clock(),
      sourceId: character.id
    });

    return {
      state: "ready",
      view: await this.achievements.listForCharacter(character.id, page, filter)
    };
  }

  async trackLatestEventsOpenedByTelegramUserId(telegramUserId: bigint): Promise<AchievementUnlock[]> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return [];
    }

    return this.achievements.trackEventSafely({
      type: "latest-events.opened",
      characterId: character.id,
      occurredAt: this.clock(),
      sourceId: character.id
    });
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

  async listCosmeticTitlesByTelegramUserId(
    telegramUserId: bigint
  ): Promise<{ state: "no-character" } | { state: "ready"; view: CosmeticTitleListView }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const view = await this.achievements.listCosmeticTitlesForCharacter(character.id);

    return view ? { state: "ready", view } : { state: "no-character" };
  }

  async selectCosmeticTitleByTelegramUserId(
    telegramUserId: bigint,
    titleGrantRowId: string,
    expectedRemortCount: number
  ): Promise<{ state: "no-character" } | { state: "ready"; result: CosmeticTitleMutationResult }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const result = await this.achievements.selectActiveCosmeticTitle({
      characterId: character.id,
      titleGrantRowId,
      expectedRemortCount,
      occurredAt: this.clock()
    });

    return result ? { state: "ready", result } : { state: "no-character" };
  }

  async clearCosmeticTitleByTelegramUserId(
    telegramUserId: bigint,
    expectedRemortCount: number
  ): Promise<{ state: "no-character" } | { state: "ready"; result: CosmeticTitleMutationResult }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const result = await this.achievements.clearActiveCosmeticTitle({
      characterId: character.id,
      expectedRemortCount
    });

    return result ? { state: "ready", result } : { state: "no-character" };
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
    if (!effect || effect.kind !== "heal-hp" || effect.amount <= 0) {
      continue;
    }

    const neededQuantity = Math.ceil((character.hpMax - character.hpCurrent) / Math.max(1, effect.amount));
    if (row.quantity >= neededQuantity) {
      return row.itemId;
    }
  }

  return null;
}

function presentHeroActivePriestBlessing(state: PriestBlessingRecord | null): HeroActivePriestBlessing | null {
  return state
    ? {
        actorName: state.actorName,
        targetName: state.targetName,
        expiresAt: state.expiresAt,
        bonusStat: normalizePriestBlessingStat(state.bonusStat),
        bonusAmount: normalizePriestBlessingAmount(state.bonusAmount)
      }
    : null;
}

function applyPriestBlessingBonus(
  character: CharacterSummary,
  blessing: HeroActivePriestBlessing | null
): CharacterSummary {
  if (!blessing || blessing.bonusAmount <= 0) {
    return character;
  }

  return {
    ...character,
    stats: {
      ...character.stats,
      [blessing.bonusStat]: character.stats[blessing.bonusStat] + blessing.bonusAmount
    }
  };
}

function normalizePriestBlessingStat(value: string | null): StatKey {
  return value === "strength" ||
    value === "dexterity" ||
    value === "intelligence" ||
    value === "charisma" ||
    value === "luck"
    ? value
    : "luck";
}

function normalizePriestBlessingAmount(value: number): number {
  return value > 0 ? Math.floor(value) : 1;
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

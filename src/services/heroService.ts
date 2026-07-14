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
import {
  applyPriestBlessingBonusToSummary,
  normalizePriestBlessingBonus
} from "../domain/noncombat/priestBlessingBonus";
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
      activeVarenykSated: HeroActiveVarenykSated | null;
      varenykSatedAvailableAt: Date | null;
      satedRecovery: { hpRestored: number; manaRestored: number } | null;
      priestSelfBlessAvailableAt: Date | null;
      classNoncombatBlocked: boolean;
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

export interface HeroActiveVarenykSated {
  activationId: string;
  rank: number;
  expiresAt: Date;
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
    private readonly classNoncombat?: Pick<
      ClassNoncombatRepository,
      | "getActivePriestBlessingForTelegramUser"
      | "getPriestSelfBlessAvailableAtForTelegramUser"
      | "isActorBlockedForTelegramUser"
      | "settleVarenykSatedForTelegramUser"
    >
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
    const now = this.clock();
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }
    const satedSettlement = await this.classNoncombat?.settleVarenykSatedForTelegramUser(
      telegramUserId,
      now,
      character.id
    ) ?? null;

    const [
      inventoryRows,
      equipmentSnapshot,
      remortCount,
      activeDrink,
      recoveryDrink,
      activePriestBlessing,
      priestSelfBlessAvailableAt,
      classNoncombatBlocked
    ] = await Promise.all([
      this.inventory.listByTelegramUserId(telegramUserId),
      this.equipment?.listByTelegramUserId(telegramUserId) ?? Promise.resolve(null),
      this.remorts?.countByTelegramUserId(telegramUserId) ?? Promise.resolve(0),
      this.shynok?.getActiveDrinkForTelegramUser(telegramUserId, now) ?? Promise.resolve(null),
      this.shynok?.getRecoveryDrinkForTelegramUser?.(telegramUserId) ??
        this.shynok?.getActiveDrinkForTelegramUser(telegramUserId, now) ??
        Promise.resolve(null),
      this.classNoncombat?.getActivePriestBlessingForTelegramUser(telegramUserId, now) ?? Promise.resolve(null),
      this.classNoncombat?.getPriestSelfBlessAvailableAtForTelegramUser(telegramUserId, now) ?? Promise.resolve(null),
      this.classNoncombat?.isActorBlockedForTelegramUser(telegramUserId) ?? Promise.resolve(false)
    ]);

    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
    const equipmentAttunements = equipmentSnapshot
      ? equipmentSnapshot.equipment.flatMap((row) => {
          if (row.attunement?.state !== "tuning") {
            return [];
          }

          const item = items.find((candidate) => candidate.id === row.itemId);

          return [{
            itemName: item?.name ?? row.itemId,
            readyAt: row.attunement.readyAt,
            strength: row.attunement.strength
          }];
        })
      : [];
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
      equipmentAttunements,
      remortCount,
      now,
      ...(multiplierWindows.length > 0 ? { multiplierWindows } : {})
    });

    const presentedPriestBlessing = presentHeroActivePriestBlessing(activePriestBlessing);
    const characterSummary = applyPriestBlessingBonusToSummary(
      resourceAware.character,
      presentedPriestBlessing,
      now
    );

    return {
      state: "existing-character",
      character: characterSummary,
      inventoryGoldValue: inventoryRows ? calculateInventoryRowsGoldValue(inventoryRows) : 0,
      activeDrink: presentHeroActiveDrink(activeDrink),
      activePriestBlessing: presentedPriestBlessing,
      activeVarenykSated: satedSettlement && Date.parse(satedSettlement.payload.expiresAt) > now.getTime()
        ? {
            activationId: satedSettlement.payload.activationId,
            rank: satedSettlement.payload.rank,
            expiresAt: new Date(satedSettlement.payload.expiresAt)
          }
        : null,
      varenykSatedAvailableAt: satedSettlement && Date.parse(satedSettlement.payload.availableAt) > now.getTime()
        ? new Date(satedSettlement.payload.availableAt)
        : null,
      satedRecovery: satedSettlement && (satedSettlement.hpRestored > 0 || satedSettlement.manaRestored > 0)
        ? { hpRestored: satedSettlement.hpRestored, manaRestored: satedSettlement.manaRestored }
        : null,
      priestSelfBlessAvailableAt,
      classNoncombatBlocked,
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
    telegramUserId: bigint,
    page = 0
  ): Promise<{ state: "no-character" } | { state: "ready"; view: CosmeticTitleListView }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const view = await this.achievements.listCosmeticTitlesForCharacter(character.id, page);

    return view ? { state: "ready", view } : { state: "no-character" };
  }

  async selectCosmeticTitleByTelegramUserId(
    telegramUserId: bigint,
    titleGrantRowId: string,
    expectedRemortCount: number,
    page = 0
  ): Promise<{ state: "no-character" } | { state: "ready"; result: CosmeticTitleMutationResult }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const result = await this.achievements.selectActiveCosmeticTitle({
      characterId: character.id,
      titleGrantRowId,
      expectedRemortCount,
      page,
      occurredAt: this.clock()
    });

    return result ? { state: "ready", result } : { state: "no-character" };
  }

  async clearCosmeticTitleByTelegramUserId(
    telegramUserId: bigint,
    expectedRemortCount: number,
    page = 0
  ): Promise<{ state: "no-character" } | { state: "ready"; result: CosmeticTitleMutationResult }> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character || !this.achievements) {
      return { state: "no-character" };
    }

    const result = await this.achievements.clearActiveCosmeticTitle({
      characterId: character.id,
      expectedRemortCount,
      page
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
  const normalized = normalizePriestBlessingBonus(state);
  return state
    ? {
        actorName: state.actorName,
        targetName: state.targetName,
        expiresAt: state.expiresAt,
        bonusStat: normalized?.bonusStat ?? "luck",
        bonusAmount: normalized?.bonusAmount ?? 1
      }
    : null;
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

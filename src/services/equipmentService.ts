import { findItemContent } from "../content/itemLookup";
import { classes } from "../content/classes";
import { resolveActiveCosmeticTitleLabel } from "../content/cosmeticTitles";
import {
  checkLootExpansionEquipRequirement,
  findLootExpansionTitleBucketName,
  getLootExpansionEquipRequirementDetails,
  isLootExpansionItemId,
  normalizeLootExpansionTitleIds,
  type LootExpansionEquipCheck
} from "../content/lootExpansionV1";
import { activeRaces } from "../content/races";
import type { ItemContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type {
  CharacterEquipmentRecord,
  EquipmentAttunementNotificationRecord,
  EquipmentRepository,
  EquipmentSlot,
  FinishEquipmentAttunementsResult
} from "../db/repositories/equipmentRepository";
import { equipmentSlots } from "../db/repositories/equipmentRepository";
import { normalizeEquipmentSlot } from "../content/equipmentSlots";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../db/repositories/inventoryRepository";
import { summarizeCharacter } from "../domain/characters/characterSummary";
import {
  getEquipmentAttunementDurationMs,
  getEquipmentMagicStrength,
  type EquipmentMagicStrength
} from "../domain/equipment/equipmentAttunement";
import { systemClock, type Clock } from "../shared/time";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export type { EquipmentSlot };
export { equipmentSlots };

export type EquipmentRequirementReason = LootExpansionEquipCheck["reasons"][number];

export interface EquipmentRequirementDetails {
  minLevel: number;
  classes: readonly string[];
  races: readonly string[];
  titles: readonly string[];
}

export interface EquipmentRequirementCheck {
  canEquip: boolean;
  reasons: EquipmentRequirementReason[];
}

export type EquipmentResult =
  | { state: "no-character" }
  | { state: "ready"; slots: EquipmentSlotSummary[] };

export type ItemEquipPreviewResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-equippable" }
  | {
      state: "requirements-not-met";
      reasons: EquipmentRequirementReason[];
      requirements: EquipmentRequirementDetails | null;
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary | null;
    }
  | { state: "unsupported-slot" }
  | {
      state: "slot-not-allowed";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      reason: EquipmentSlotDeniedReason;
    }
  | {
      state: "twohand-confirm-required";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary | null;
      clearedHandItem: EquipmentItemSummary;
    }
  | {
      state: "attunement-confirm-required";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary | null;
      strength: EquipmentMagicStrength;
      durationMinutes: number;
    }
  | {
      state: "attunement-interrupt-confirm-required";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary;
    }
  | {
      state: "can-equip";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      requirements: EquipmentRequirementDetails | null;
      currentItem: EquipmentItemSummary | null;
    };

export type EquipItemResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-equippable" }
  | {
      state: "requirements-not-met";
      reasons: EquipmentRequirementReason[];
      requirements: EquipmentRequirementDetails | null;
      item: EquipmentItemSummary;
    }
  | { state: "unsupported-slot" }
  | {
      state: "slot-not-allowed";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      reason: EquipmentSlotDeniedReason;
    }
  | {
      state: "twohand-confirm-required";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary | null;
      clearedHandItem: EquipmentItemSummary;
    }
  | {
      state: "attunement-confirm-required";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary | null;
      strength: EquipmentMagicStrength;
      durationMinutes: number;
    }
  | {
      state: "attunement-interrupt-confirm-required";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      currentItem: EquipmentItemSummary;
    }
  | {
      state: "equipped";
      slot: EquipmentSlot;
      item: EquipmentItemSummary;
      replacedItem: EquipmentItemSummary | null;
      clearedHandItem?: EquipmentItemSummary | null;
      slots: EquipmentSlotSummary[];
      achievementUnlocks: AchievementUnlock[];
    };

export type UnequipSlotResult =
  | { state: "no-character" }
  | { state: "empty-slot"; slot: EquipmentSlot; slots: EquipmentSlotSummary[] }
  | { state: "unequipped"; slot: EquipmentSlot; slots: EquipmentSlotSummary[] };

export interface EquipmentItemSummary {
  itemId: string;
  content: ItemContent;
}

export interface EquipmentSlotSummary {
  slot: EquipmentSlot;
  item: EquipmentItemSummary | null;
  occupiedByTwohand?: boolean;
  attunement?: CharacterEquipmentRecord["attunement"];
}

export type EquipmentSlotDeniedReason =
  | "not-compatible"
  | "offhand-restricted"
  | "twohand-conflict"
  | "not-enough-copies";

export interface EquipItemOptions {
  confirmTwohand?: boolean;
  confirmAttunement?: boolean;
  confirmAttunementInterrupt?: boolean;
}

export class EquipmentService {
  constructor(
    private readonly equipment: EquipmentRepository,
    private readonly inventory: InventoryRepository,
    private readonly characters?: CharacterRepository,
    private readonly achievements?: AchievementService,
    private readonly clock: Clock = systemClock
  ) {}

  async getEquipmentForTelegramUser(telegramUserId: bigint): Promise<EquipmentResult> {
    const snapshot = await this.equipment.listByTelegramUserId(telegramUserId);

    if (!snapshot) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      slots: buildSlots(snapshot.equipment)
    };
  }

  async previewItemEquipForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetSlot?: EquipmentSlot | null
  ): Promise<ItemEquipPreviewResult> {
    const [snapshot, inventoryRows] = await Promise.all([
      this.equipment.listByTelegramUserId(telegramUserId),
      this.inventory.listByTelegramUserId(telegramUserId)
    ]);

    if (!snapshot || !inventoryRows) {
      return { state: "no-character" };
    }

    const owned = inventoryRows.find((row) => row.itemId === itemId);

    if (!owned) {
      return { state: "not-owned" };
    }

    const content = findKnownItem(owned);

    if (!content) {
      return { state: "not-equippable" };
    }

    const character = this.characters
      ? await this.characters.findByTelegramUserId(telegramUserId)
      : null;
    const slotResolution = resolveEquipmentSlotForItem(
      content,
      targetSlot,
      character?.classId
    );

    if (!slotResolution.slot) {
      return { state: "not-equippable" };
    }

    const slot = slotResolution.slot;

    if (!equipmentSlots.includes(slot)) {
      return { state: "unsupported-slot" };
    }

    const item = {
      itemId,
      content
    };

    if (!slotResolution.allowed) {
      return {
        state: "slot-not-allowed",
        item,
        slot,
        reason: slotResolution.reason
      };
    }

    const handConflict = getHandConflictReason(content, slot);

    if (handConflict) {
      return {
        state: "slot-not-allowed",
        item,
        slot,
        reason: handConflict
      };
    }

    const currentRow = findRowForSlot(snapshot.equipment, slot);
    const currentItem = currentRow ? toEquipmentItemSummary(currentRow) : null;
    const twohandPrompt = getTwohandConfirmPrompt(content, slot, snapshot.equipment);

    if (twohandPrompt) {
      return {
        state: "twohand-confirm-required",
        item,
        slot,
        currentItem,
        clearedHandItem: twohandPrompt.clearedItem
      };
    }

    if (!hasAvailableCopyForSlot(inventoryRows, snapshot.equipment, itemId, slot)) {
      return {
        state: "slot-not-allowed",
        item,
        slot,
        reason: "not-enough-copies"
      };
    }

    const requirements = getEquipmentRequirementDetails(content, itemId);

    if (requirements) {
      const equipCheck = await this.checkEquipmentRequirementForTelegramUser(
        telegramUserId,
        content,
        itemId
      );

      if (!equipCheck) {
        return { state: "no-character" };
      }

      if (!equipCheck.canEquip) {
        return {
          state: "requirements-not-met",
          reasons: equipCheck.reasons,
          requirements,
          item,
          slot,
          currentItem
        };
      }

      return {
        state: "can-equip",
        item,
        slot,
        requirements,
        currentItem
      };
    }

    if (currentRow?.attunement?.state === "tuning" && currentRow.itemId !== itemId) {
      return {
        state: "attunement-interrupt-confirm-required",
        item,
        slot,
        currentItem: toEquipmentItemSummary(currentRow)
      };
    }

    const strength = getEquipmentMagicStrength(itemId);
    if (strength && currentRow?.itemId !== itemId) {
      return {
        state: "attunement-confirm-required",
        item,
        slot,
        currentItem,
        strength,
        durationMinutes: getEquipmentAttunementDurationMinutes(strength, character?.classId)
      };
    }

    return {
      state: "can-equip",
      item,
      slot,
      requirements,
      currentItem
    };
  }

  async equipItemForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetSlot?: EquipmentSlot | null,
    options: EquipItemOptions = {}
  ): Promise<EquipItemResult> {
    const [snapshot, inventoryRows] = await Promise.all([
      this.equipment.listByTelegramUserId(telegramUserId),
      this.inventory.listByTelegramUserId(telegramUserId)
    ]);

    if (!snapshot || !inventoryRows) {
      return { state: "no-character" };
    }

    const owned = inventoryRows.find((row) => row.itemId === itemId);

    if (!owned) {
      return { state: "not-owned" };
    }

    const content = findKnownItem(owned);

    if (!content) {
      return { state: "not-equippable" };
    }

    const character = this.characters
      ? await this.characters.findByTelegramUserId(telegramUserId)
      : null;
    const slotResolution = resolveEquipmentSlotForItem(
      content,
      targetSlot,
      character?.classId
    );

    if (!slotResolution.slot) {
      return { state: "not-equippable" };
    }

    const slot = slotResolution.slot;

    if (!equipmentSlots.includes(slot)) {
      return { state: "unsupported-slot" };
    }

    const item = {
      itemId,
      content
    };

    if (!slotResolution.allowed) {
      return {
        state: "slot-not-allowed",
        item,
        slot,
        reason: slotResolution.reason
      };
    }

    const handConflict = getHandConflictReason(content, slot);

    if (handConflict) {
      return {
        state: "slot-not-allowed",
        item,
        slot,
        reason: handConflict
      };
    }

    const replacedRow = findRowForSlot(snapshot.equipment, slot);
    const replacedItem = replacedRow ? toEquipmentItemSummary(replacedRow) : null;
    const twohandPrompt = getTwohandConfirmPrompt(content, slot, snapshot.equipment);

    if (twohandPrompt && options.confirmTwohand !== true) {
      return {
        state: "twohand-confirm-required",
        item,
        slot,
        currentItem: replacedItem,
        clearedHandItem: twohandPrompt.clearedItem
      };
    }

    if (!hasAvailableCopyForSlot(inventoryRows, snapshot.equipment, itemId, slot)) {
      return {
        state: "slot-not-allowed",
        item,
        slot,
        reason: "not-enough-copies"
      };
    }

    if (
      replacedRow?.attunement?.state === "tuning" &&
      replacedRow.itemId !== itemId &&
      options.confirmAttunementInterrupt !== true
    ) {
      return {
        state: "attunement-interrupt-confirm-required",
        item,
        slot,
        currentItem: toEquipmentItemSummary(replacedRow)
      };
    }

    const requirements = getEquipmentRequirementDetails(content, itemId);

    if (requirements) {
      const equipCheck = await this.checkEquipmentRequirementForTelegramUser(
        telegramUserId,
        content,
        itemId
      );

      if (!equipCheck) {
        return { state: "no-character" };
      }

      if (!equipCheck.canEquip) {
        return {
          state: "requirements-not-met",
          reasons: equipCheck.reasons,
          requirements,
          item
        };
      }
    }

    const strength = getEquipmentMagicStrength(itemId);
    const shouldStartAttunement =
      strength &&
      replacedRow?.itemId !== itemId;

    if (shouldStartAttunement && options.confirmAttunement !== true) {
      return {
        state: "attunement-confirm-required",
        item,
        slot,
        currentItem: replacedItem,
        strength,
        durationMinutes: getEquipmentAttunementDurationMinutes(strength, character?.classId)
      };
    }

    const now = this.clock();
    const equipResult = await this.equipForCharacter({
      characterId: snapshot.characterId,
      slot,
      itemId,
      ...(replacedItem ? { previousItemId: replacedItem.itemId } : {}),
      ...(twohandPrompt && options.confirmTwohand === true
        ? { clearSlot: twohandPrompt.clearedSlot }
        : {}),
      ...(shouldStartAttunement && strength
        ? {
            attunement: {
              strength,
              itemName: content.name,
              startedAt: now,
              readyAt: new Date(now.getTime() + getEquipmentAttunementDurationMs(strength, character?.classId))
            }
          }
        : {})
    });
    const equipped =
      !equipResult.changed && replacedRow?.itemId === itemId && replacedRow.attunement && !equipResult.record.attunement
        ? { ...equipResult.record, attunement: replacedRow.attunement }
        : equipResult.record;
    const changedEquippedItem = equipResult.changed;
    const achievementUnlocks = changedEquippedItem
      ? (await this.achievements?.trackEventSafely({
          type: "equipment.item_equipped",
          characterId: snapshot.characterId,
          itemId,
          occurredAt: new Date(),
          sourceId: equipped.id
        })) ?? []
      : [];
    const nextRows = [
      ...snapshot.equipment.filter((row) => {
        const normalizedSlot = normalizeEquipmentSlot(row.slot);

        return normalizedSlot !== slot && !(twohandPrompt && normalizedSlot === twohandPrompt.clearedSlot);
      }),
      equipped
    ];

    return {
      state: "equipped",
      slot,
      item: {
        itemId,
        content
      },
      replacedItem: replacedItem?.itemId === itemId ? null : replacedItem,
      ...(twohandPrompt ? { clearedHandItem: twohandPrompt.clearedItem } : {}),
      slots: buildSlots(nextRows),
      achievementUnlocks
    };
  }

  private async equipForCharacter(input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    previousItemId?: string;
    clearSlot?: EquipmentSlot;
    attunement?: {
      strength: EquipmentMagicStrength;
      itemName: string;
      startedAt: Date;
      readyAt: Date;
    };
  }): Promise<{ record: CharacterEquipmentRecord; changed: boolean }> {
    if (this.equipment.equipForCharacterAtomically) {
      return this.equipment.equipForCharacterAtomically(input);
    }

    if (input.clearSlot) {
      await this.equipment.unequipForCharacter(input.characterId, input.clearSlot);
    }

    const record = await this.equipment.equipForCharacter(input.characterId, input.slot, input.itemId);

    return {
      record,
      changed: input.previousItemId !== input.itemId
    };
  }

  async listDueAttunementNotifications(
    now = this.clock(),
    options: { limit?: number } = {}
  ): Promise<EquipmentAttunementNotificationRecord[]> {
    return this.equipment.listDueAttunementNotifications
      ? this.equipment.listDueAttunementNotifications(now, options)
      : [];
  }

  async markAttunementNotified(actionId: string, notifiedAt = this.clock()): Promise<boolean> {
    return this.equipment.markAttunementNotified
      ? this.equipment.markAttunementNotified(actionId, notifiedAt)
      : false;
  }

  async finishPendingAttunementsForDev(
    telegramUserId: bigint,
    now = this.clock()
  ): Promise<FinishEquipmentAttunementsResult> {
    return this.equipment.finishPendingAttunementsForTelegramUser
      ? this.equipment.finishPendingAttunementsForTelegramUser(telegramUserId, now)
      : { state: "finished", count: 0 };
  }

  async unequipSlotForTelegramUser(
    telegramUserId: bigint,
    slot: EquipmentSlot
  ): Promise<UnequipSlotResult> {
    const snapshot = await this.equipment.listByTelegramUserId(telegramUserId);

    if (!snapshot) {
      return { state: "no-character" };
    }

    const current = snapshot.equipment.find((row) => normalizeEquipmentSlot(row.slot) === slot);
    const twohandMain = slot === "offhand"
      ? snapshot.equipment.find((row) =>
          normalizeEquipmentSlot(row.slot) === "weapon" &&
          findItemContentForEquipment(row.itemId).tags?.includes("twohand")
        )
      : null;

    if (!current && !twohandMain) {
      return {
        state: "empty-slot",
        slot,
        slots: buildSlots(snapshot.equipment)
      };
    }

    const slotToClear = twohandMain ? "weapon" : slot;

    await this.equipment.unequipForCharacter(snapshot.characterId, slotToClear);

    return {
      state: "unequipped",
      slot,
      slots: buildSlots(snapshot.equipment.filter((row) => normalizeEquipmentSlot(row.slot) !== slotToClear))
    };
  }

  async getCompatibleItemIdsForSlotForTelegramUser(
    telegramUserId: bigint,
    slot: EquipmentSlot
  ): Promise<Set<string> | null> {
    const [snapshot, inventoryRows, character] = await Promise.all([
      this.equipment.listByTelegramUserId(telegramUserId),
      this.inventory.listByTelegramUserId(telegramUserId),
      this.characters ? this.characters.findByTelegramUserId(telegramUserId) : Promise.resolve(null)
    ]);

    if (!snapshot || !inventoryRows) {
      return null;
    }

    return new Set(
      inventoryRows.flatMap((row) => {
        const content = findKnownItem(row);

        if (!content) {
          return [];
        }

        const resolution = resolveEquipmentSlotForItem(content, slot, character?.classId);

        if (!resolution.slot || !resolution.allowed) {
          return [];
        }

        if (getHandConflictReason(content, slot)) {
          return [];
        }

        return hasAvailableCopyForSlot(inventoryRows, snapshot.equipment, row.itemId, slot)
          ? [row.itemId]
          : [];
      })
    );
  }

  private async checkEquipmentRequirementForTelegramUser(
    telegramUserId: bigint,
    item: ItemContent,
    itemId: string
  ): Promise<EquipmentRequirementCheck | null> {
    if (isLootExpansionItemId(itemId)) {
      return this.checkLootExpansionEquipRequirementForTelegramUser(telegramUserId, itemId);
    }

    const requirement = item.equipmentRequirements;

    if (!requirement) {
      return {
        canEquip: true,
        reasons: []
      };
    }

    if (!this.characters) {
      return {
        canEquip: true,
        reasons: []
      };
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const summary = summarizeCharacter(character);
    const reasons: EquipmentRequirementReason[] = [];
    const minLevel = requirement.minLevel ?? 1;
    const classIds = requirement.classIds ?? [];
    const raceIds = requirement.raceIds ?? [];
    const titleLabels = requirement.titleLabels ?? [];
    const titleBucketIds = requirement.titleBucketIds ?? [];
    const activeTitleLabel = resolveActiveCosmeticTitleLabel(character.activeCosmeticTitleGrantId);
    const titleIds = normalizeLootExpansionTitleIds({
      level: summary.level,
      classId: summary.classId,
      raceId: summary.raceId,
      title: summary.title
    });

    if (activeTitleLabel) {
      for (const titleId of normalizeLootExpansionTitleIds({
        level: summary.level,
        classId: summary.classId,
        raceId: summary.raceId,
        title: activeTitleLabel
      })) {
        titleIds.add(titleId);
      }
    }

    if (summary.level < minLevel) {
      reasons.push("min-level");
    }

    if (classIds.length > 0 && !classIds.includes(summary.classId)) {
      reasons.push("class");
    }

    if (raceIds.length > 0 && !raceIds.includes(summary.raceId)) {
      reasons.push("race");
    }

    if (
      (titleLabels.length > 0 || titleBucketIds.length > 0) &&
      !titleLabels.includes(summary.title) &&
      (!activeTitleLabel || !titleLabels.includes(activeTitleLabel)) &&
      !titleBucketIds.some((titleId) => titleBucketMatchesProfile(titleId, titleIds))
    ) {
      reasons.push("title");
    }

    return {
      canEquip: reasons.length === 0,
      reasons
    };
  }

  private async checkLootExpansionEquipRequirementForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<EquipmentRequirementCheck | null> {
    if (!this.characters) {
      return {
        canEquip: true,
        reasons: []
      };
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const summary = summarizeCharacter(character);

    return checkLootExpansionEquipRequirement(itemId, {
      level: summary.level,
      classId: summary.classId,
      raceId: summary.raceId,
      title: summary.title
    });
  }
}

function titleBucketMatchesProfile(titleBucketId: string, titleIds: ReadonlySet<string>): boolean {
  return titleBucketId === "common_title" || titleIds.has(titleBucketId);
}

function getEquipmentRequirementDetails(
  item: ItemContent,
  itemId: string
): EquipmentRequirementDetails | null {
  if (isLootExpansionItemId(itemId)) {
    return getLootExpansionEquipRequirementDetails(itemId);
  }

  const requirement = item.equipmentRequirements;

  if (!requirement) {
    return null;
  }

  return {
    minLevel: requirement.minLevel ?? 1,
    classes: (requirement.classIds ?? []).map((id) => findClassName(id)),
    races: (requirement.raceIds ?? []).map((id) => findRaceName(id)),
    titles: [
      ...(requirement.titleLabels ?? []),
      ...(requirement.titleBucketIds ?? []).map((id) => findLootExpansionTitleBucketName(id))
    ]
  };
}

export function mapItemToEquipmentSlot(item: ItemContent): EquipmentSlot | null {
  if (item.equipmentSlot) {
    return item.equipmentSlot;
  }

  if (item.slot === "weapon") {
    return "weapon";
  }

  if (item.slot === "armor") {
    return "chest";
  }

  if (item.slot === "accessory") {
    return "accessory";
  }

  return null;
}

export function isEquippableItem(item: ItemContent): boolean {
  return mapItemToEquipmentSlot(item) !== null;
}

export function getEquippedItemContents(rows: CharacterEquipmentRecord[]): ItemContent[] {
  return rows.flatMap((row) => {
    if (row.attunement?.state === "tuning") {
      return [];
    }

    const content = findItemContent(row.itemId);

    return content ? [content] : [];
  });
}

function buildSlots(rows: CharacterEquipmentRecord[]): EquipmentSlotSummary[] {
  return equipmentSlots.map((slot) => {
    const row = findRowForSlot(rows, slot);

    if (!row && slot === "offhand") {
      const mainHand = findRowForSlot(rows, "weapon");
      const mainHandContent = mainHand ? findItemContentForEquipment(mainHand.itemId) : null;

      if (mainHand && mainHandContent?.tags?.includes("twohand")) {
        return {
          slot,
          item: {
            itemId: mainHand.itemId,
            content: mainHandContent
          },
          occupiedByTwohand: true,
          ...(mainHand.attunement ? { attunement: mainHand.attunement } : {})
        };
      }
    }

    if (!row) {
      return {
        slot,
        item: null
      };
    }

    const content = findItemContentForEquipment(row.itemId);

    return {
      slot,
      item: {
        itemId: row.itemId,
        content
      },
      ...(row.attunement ? { attunement: row.attunement } : {})
    };
  });
}

export function isItemCompatibleWithEquipmentSlot(
  item: ItemContent,
  slot: EquipmentSlot,
  characterClassId?: string | null
): boolean {
  const resolution = resolveEquipmentSlotForItem(item, slot, characterClassId);

  return resolution.slot === slot && resolution.allowed;
}

function findCurrentItemForSlot(
  rows: CharacterEquipmentRecord[],
  slot: EquipmentSlot
): EquipmentItemSummary | null {
  const row = findRowForSlot(rows, slot);

  if (!row) {
    return null;
  }

  return toEquipmentItemSummary(row);
}

function toEquipmentItemSummary(row: CharacterEquipmentRecord): EquipmentItemSummary {
  return {
    itemId: row.itemId,
    content: findItemContentForEquipment(row.itemId)
  };
}

function getEquipmentAttunementDurationMinutes(
  strength: EquipmentMagicStrength,
  classId?: string | null
): number {
  return Math.ceil(getEquipmentAttunementDurationMs(strength, classId) / 60_000);
}

function resolveEquipmentSlotForItem(
  item: ItemContent,
  targetSlot?: EquipmentSlot | null,
  characterClassId?: string | null
): { slot: EquipmentSlot | null; allowed: true } | {
  slot: EquipmentSlot;
  allowed: false;
  reason: Exclude<EquipmentSlotDeniedReason, "not-enough-copies">;
} {
  const defaultSlot = mapItemToEquipmentSlot(item);

  if (!targetSlot) {
    return defaultSlot ? { slot: defaultSlot, allowed: true } : { slot: null, allowed: true };
  }

  if (targetSlot === defaultSlot) {
    if (targetSlot === "offhand" && item.tags?.includes("twohand")) {
      return {
        slot: targetSlot,
        allowed: false,
        reason: "twohand-conflict"
      };
    }

    return { slot: targetSlot, allowed: true };
  }

  if (targetSlot !== "offhand") {
    return {
      slot: targetSlot,
      allowed: false,
      reason: "not-compatible"
    };
  }

  if (item.tags?.includes("twohand")) {
    return {
      slot: targetSlot,
      allowed: false,
      reason: "twohand-conflict"
    };
  }

  if (item.equipmentSlot === "offhand" || item.tags?.includes("offhand")) {
    return { slot: targetSlot, allowed: true };
  }

  if (item.slot === "weapon" && characterClassId === "class.warrior") {
    return { slot: targetSlot, allowed: true };
  }

  return {
    slot: targetSlot,
    allowed: false,
    reason: "offhand-restricted"
  };
}

function getHandConflictReason(
  item: ItemContent,
  targetSlot: EquipmentSlot
): EquipmentSlotDeniedReason | null {
  if (targetSlot === "offhand") {
    if (item.tags?.includes("twohand")) {
      return "twohand-conflict";
    }
  }

  return null;
}

function getTwohandConfirmPrompt(
  item: ItemContent,
  targetSlot: EquipmentSlot,
  equipmentRows: CharacterEquipmentRecord[]
): { clearedSlot: EquipmentSlot; clearedItem: EquipmentItemSummary } | null {
  if (targetSlot === "weapon" && item.tags?.includes("twohand")) {
    const offhandItem = findCurrentItemForSlot(equipmentRows, "offhand");

    return offhandItem ? { clearedSlot: "offhand", clearedItem: offhandItem } : null;
  }

  if (targetSlot === "offhand") {
    const mainHand = findCurrentItemForSlot(equipmentRows, "weapon");

    return mainHand?.content.tags?.includes("twohand")
      ? { clearedSlot: "weapon", clearedItem: mainHand }
      : null;
  }

  return null;
}

function hasAvailableCopyForSlot(
  inventoryRows: CharacterItemRecord[],
  equipmentRows: CharacterEquipmentRecord[],
  itemId: string,
  targetSlot: EquipmentSlot
): boolean {
  const owned = inventoryRows.find((row) => row.itemId === itemId)?.quantity ?? 0;
  const equippedCount = equipmentRows.filter((row) => row.itemId === itemId).length;
  const alreadyInTarget = equipmentRows.some((row) =>
    row.itemId === itemId && normalizeEquipmentSlot(row.slot) === targetSlot
  );

  return alreadyInTarget || owned > equippedCount;
}

function findRowForSlot(
  rows: CharacterEquipmentRecord[],
  slot: EquipmentSlot
): CharacterEquipmentRecord | null {
  const candidates = rows.filter((row) => normalizeEquipmentSlot(row.slot) === slot);

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const leftCanonical = left.slot === slot ? 0 : 1;
    const rightCanonical = right.slot === slot ? 0 : 1;

    return leftCanonical - rightCanonical || right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0] ?? null;
}

function findKnownItem(row: CharacterItemRecord): ItemContent | null {
  return findItemContent(row.itemId);
}

function findClassName(classId: string): string {
  return classes.find((candidate) => candidate.id === classId)?.name ?? classId;
}

function findRaceName(raceId: string): string {
  return activeRaces.find((candidate) => candidate.id === raceId)?.name ?? raceId;
}

function findItemContentForEquipment(itemId: string): ItemContent {
  return findItemContent(itemId) ?? {
    id: itemId,
    name: "Невідома манатка",
    description: "Вона висить на гачку, але документи ще десь ідуть.",
    rarity: "common",
    slot: "junk",
    priceless: true
  };
}

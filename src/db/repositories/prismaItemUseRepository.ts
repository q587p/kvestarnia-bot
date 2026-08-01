import { Prisma, type Character, type CharacterDrinkState, type CharacterItem, type ItemUseOrder, type PrismaClient } from "@prisma/client";
import type { ItemContent, ItemUseEffectContent } from "../../content/schema";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import {
  blocksAccidentalItemUse,
  calculateItemUsePreview,
  createItemUseFingerprint,
  getItemUsePreviewAppliedAmount,
  getItemUseEffect,
  isOutOfCombatItemUseEffect,
  ITEM_USE_RULES_VERSION,
  recalculateFrozenItemUsePreview
} from "../../domain/itemUse";
import { applyPassiveResourceRegeneration } from "../../domain/resources/resourceRegeneration";
import { buildShynokRecoveryWindows, isShynokDrinkKey } from "../../domain/shynokDrinks";
import type { CharacterRecord } from "./characterRepository";
import { findActiveItemUseReservedItems } from "./itemUseReservations";
import {
  type ItemUseCancelRepositoryResult,
  type ItemUseConfirmRepositoryResult,
  type ItemUseOrderRecord,
  type ItemUseOrderStatus,
  type ItemUsePreview,
  type ItemUsePreviewRepositoryResult,
  type ItemUseRepository,
  type ItemUseResult,
  type ItemUseRestoreToFullRepositoryResult
} from "./itemUseRepository";
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { getIncludedRemortCount } from "./prismaRemortCount";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import { isConsumableCommitAllowed } from "./consumableCommitGate";

type TxClient = Prisma.TransactionClient;

export class PrismaItemUseRepository implements ItemUseRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false)
  ) {}

  async createPreviewForTelegramUser(
    telegramUserId: bigint,
    input: {
      item: ItemContent;
      itemContents: readonly ItemContent[];
      itemFingerprint: string;
      token: string;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ItemUsePreviewRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        if (!(await isQuestConsumableUnlocked(tx, character.id, input.item.id))) {
          return { state: "not-usable" };
        }

        if (character.activeCombatLease) {
          return { state: "combat-locked" };
        }

        await releaseExpiredUseReservations(tx, character.id, input.item.id, input.now);

        const existing = mapOrder(await tx.itemUseOrder.findFirst({
          where: {
            characterId: character.id,
            itemId: input.item.id,
            status: { in: ["pending", "processing"] },
            expiresAt: { gt: input.now }
          },
          orderBy: { createdAt: "desc" }
        }));
        if (existing) {
          await cancelOtherPendingUseOrdersForItem(tx, character.id, input.item.id, existing.id, input.now);
          if (existing.status === "processing") {
            return {
              state: "preview-replayed",
              character: toCharacterRecord(character),
              order: existing
            };
          } else if (isRestoreToFullOrder(existing)) {
            await setTerminalOrder(tx, existing.id, "cancelled", input.now, {
              ...existing.preview,
              kind: "cancelled",
              itemId: existing.itemId,
              itemName: existing.itemName
            }, expectedTerminalOrderStatus(existing));
          } else {
            const effect = getItemUseEffect(input.item);
            const validation = await validatePendingPreviewRefresh(tx, existing, character, {
              item: input.item,
              itemContents: input.itemContents,
              itemFingerprint: input.itemFingerprint,
              now: input.now,
              effect
            });
            if (validation.state !== "valid") {
              if (validation.state === "full-hp" || validation.state === "full-mana") {
                await releasePendingOrder(tx, existing, input.now, {
                    ...validation.preview,
                    kind: validation.state,
                    itemId: existing.itemId,
                    itemName: existing.itemName
                  }, "completed");

                return {
                  state: validation.state,
                  character: toCharacterRecord(character),
                  preview: validation.preview
                };
              }

              await releasePendingOrder(tx, existing, input.now, {
                    ...existing.preview,
                    kind: "expired",
                    itemId: existing.itemId,
                    itemName: existing.itemName
                  }, "expired");

              return { state: validation.state };
            }
            const refreshed = await refreshPendingPreview(tx, existing, validation.preview, input.now);
            return {
              state: "preview-replayed",
              character: toCharacterRecord(character),
              order: refreshed
            };
          }
        }

        const effect = getItemUseEffect(input.item);
        if (!effect || !isOutOfCombatItemUseEffect(effect) || blocksAccidentalItemUse(input.item)) {
          return { state: "not-usable" };
        }

        await lockItemStack(tx, character.id, input.item.id, input.now);

        const [items, equippedItemIds, reservedItemIds] = await Promise.all([
          getItems(tx, character.id),
          getEquippedItemIds(tx, character.id),
          getReservedItemIds(tx, character.id, input.now)
        ]);

        const stack = items.find((item) => item.itemId === input.item.id);
        if (!stack || stack.quantity < 1) {
          return { state: "not-owned" };
        }

        if (equippedItemIds.includes(input.item.id) || reservedItemIds.includes(input.item.id)) {
          return { state: "reserved" };
        }

        if (
          input.itemFingerprint !== createItemUseFingerprint(input.item) ||
          input.itemFingerprint !== createItemUseFingerprint(input.itemContents.find((item) => item.id === input.item.id) ?? input.item)
        ) {
          return { state: "not-usable" };
        }

        const preview = buildPreview(
          character,
          input.itemContents,
          input.now,
          effect,
          createStableRandomResolutionSeed(character.id, input.item.id, getIncludedRemortCount(character), stack.quantity),
          stack.quantity
        );
        if (getItemUsePreviewAppliedAmount(preview) <= 0) {
          return {
            state: getFullState(preview),
            character: toCharacterRecord(character),
            preview
          };
        }

        const order = await tx.itemUseOrder.create({
          data: {
            token: input.token,
            characterId: character.id,
            telegramUserId,
            remortCount: getIncludedRemortCount(character),
            itemId: input.item.id,
            itemName: input.item.name,
            itemFingerprint: input.itemFingerprint,
            quantity: 1,
            effectKind: effect.kind,
            status: "pending",
            reservationKey: createReservationKey(character.id, input.item.id),
            previewJson: preview as unknown as Prisma.InputJsonValue,
            expiresAt: input.expiresAt,
            updatedAt: input.now
          }
        });

        return {
          state: "preview-created",
          character: toCharacterRecord(character),
          order: mapOrder(order) ?? (() => {
            throw new Error("Item use order mapping failed after create.");
          })()
        };
      });
    } catch (error) {
      if (isLiveReservationConflict(error)) {
        return await recoverLivePreviewAfterReservationConflict(this.prisma, telegramUserId, {
          itemId: input.item.id,
          itemContents: input.itemContents,
          now: input.now
        }) ?? { state: "reserved" };
      }

      throw error;
    }
  }

  async confirmForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      itemContents: readonly ItemContent[];
      now: Date;
      allowNonmedicalConsumables?: boolean;
    }
  ): Promise<ItemUseConfirmRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<ItemUseConfirmRepositoryResult> => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        const order = mapOrder(await tx.itemUseOrder.findUnique({ where: { token: input.token } }));
        if (!order || order.characterId !== character.id) {
          return { state: "invalid-token" };
        }

        const terminal = await replayTerminalConfirm(tx, order, character);
        if (terminal) {
          return terminal;
        }

        if (!(await isConsumableCommitAllowed(tx, {
          characterId: character.id,
          itemId: order.itemId,
          allowNonmedicalConsumables: input.allowNonmedicalConsumables === true
        }))) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }

        if (order.expiresAt <= input.now) {
          const expired = await setTerminalOrder(tx, order.id, "expired", input.now, {
            ...order.preview,
            kind: "expired",
            itemId: order.itemId,
            itemName: order.itemName
          }, "pending");
          return mapCanonicalConfirmResult(expired.order, character, expired.changed ? "expired" : undefined);
        }

        if (character.activeCombatLease) {
          return { state: "combat-locked", order };
        }

        if (
          getIncludedRemortCount(character) !== order.remortCount ||
          order.preview.rulesVersion !== ITEM_USE_RULES_VERSION ||
          (!isRestoreToFullOrder(order) && order.quantity !== 1) ||
          (isRestoreToFullOrder(order) && order.quantity < 1)
        ) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }

        const item = input.itemContents.find((candidate) => candidate.id === order.itemId);
        const effect = item ? getItemUseEffect(item) : null;
        if (!item || !effect || blocksAccidentalItemUse(item) || (isRestoreToFullOrder(order) && effect.kind !== "heal-hp")) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }
        const restoreEffect = isRestoreToFullOrder(order) && effect.kind === "heal-hp"
          ? effect
          : null;

        if (
          item.name !== order.itemName ||
          createItemUseFingerprint(item) !== order.itemFingerprint ||
          effect.kind !== order.effectKind
        ) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }

        const [items, equippedItemIds, reservedItemIds] = await Promise.all([
          getItems(tx, character.id),
          getEquippedItemIds(tx, character.id),
          getReservedItemIds(tx, character.id, input.now, order.id)
        ]);

        const stack = items.find((candidate) => candidate.itemId === order.itemId);
        if (
          !stack ||
          stack.quantity < order.quantity ||
          (!isRestoreToFullOrder(order) && stack.quantity !== order.preview.startingStackQuantity) ||
          equippedItemIds.includes(order.itemId) ||
          reservedItemIds.includes(order.itemId)
        ) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }

        const claimed = await tx.itemUseOrder.updateMany({
          where: {
            id: order.id,
            status: "pending",
            expiresAt: { gt: input.now }
          },
          data: {
            status: "processing",
            updatedAt: input.now
          }
        });

        if (claimed.count !== 1) {
          const current = mapOrder(await tx.itemUseOrder.findUnique({ where: { id: order.id } }));
          if (!current) {
            return { state: "invalid-token" };
          }
          return (await replayTerminalConfirm(tx, current, character)) ?? { state: "stale-selection", order: current };
        }

        const settlement = getRegeneratedResources(character, input.itemContents, input.now);
        const restorePreview = isRestoreToFullOrder(order)
          ? buildRestoreToFullPreview(character, input.itemContents, input.now, restoreEffect!)
          : null;
        const preview = restorePreview?.preview ?? recalculateFrozenItemUsePreview({
          hpCurrent: settlement.resources.hpCurrent,
          hpMax: settlement.resources.hpMax,
          manaCurrent: settlement.resources.manaCurrent,
          manaMax: settlement.resources.manaMax,
          effect,
          frozen: {
            resource: order.preview.resource,
            resolvedEffectKind: order.preview.resolvedEffectKind as ItemUseEffectContent["kind"],
            startingStackQuantity: order.preview.startingStackQuantity ?? 0
          }
        });
        if (!preview) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }
        if (getItemUsePreviewAppliedAmount(preview) <= 0) {
          const fullState = getFullState(preview);
          await tx.character.update({
            where: { id: character.id },
            data: {
              hpCurrent: settlement.resources.hpCurrent,
              manaCurrent: settlement.resources.manaCurrent,
              hpRegenAt: settlement.resources.hpRegenAt,
              manaRegenAt: settlement.resources.manaRegenAt
            }
          });
          await this.hpRecoveryProducer.record(tx, character.id, input.now, "suppress");
          const full = await setTerminalOrder(tx, order.id, "completed", input.now, {
            ...preview,
            kind: fullState,
            itemId: order.itemId,
            itemName: order.itemName
          }, "processing");
          const updated = await tx.character.findUniqueOrThrow({
            where: { id: character.id },
            include: characterInclude
          });
          const canonical = mapCanonicalConfirmResult(full.order, updated, full.changed ? fullState : undefined);
          if (!isFullState(canonical.state)) {
            return canonical;
          }
          return {
            state: fullState,
            character: toCharacterRecord(updated),
            order: full.order
          };
        }

        if (restorePreview && restorePreview.neededQuantity !== order.quantity) {
          return await staleTerminalConfirm(tx, order, input.now, character);
        }

        const consumed = await tx.characterItem.updateMany({
          where: {
            characterId: character.id,
            itemId: order.itemId,
            quantity: { gte: order.quantity }
          },
          data: {
            quantity: { decrement: order.quantity }
          }
        });
        if (consumed.count !== 1) {
          throw new StaleItemUseRollback(order);
        }

        await tx.characterItem.deleteMany({
          where: {
            characterId: character.id,
            quantity: { lte: 0 }
          }
        });

        const hpAfter = preview.hpAfter;
        const manaAfter = preview.manaAfter ?? settlement.resources.manaCurrent;
        await tx.character.update({
          where: { id: character.id },
          data: {
            hpCurrent: hpAfter,
            manaCurrent: manaAfter,
            hpRegenAt: hpAfter >= settlement.resources.hpMax ? input.now : settlement.resources.hpRegenAt,
            manaRegenAt: manaAfter >= settlement.resources.manaMax ? input.now : settlement.resources.manaRegenAt
          }
        });
        await this.hpRecoveryProducer.record(
          tx,
          character.id,
          input.now,
          hpAfter >= settlement.resources.hpMax ? "suppress" : "recovering"
        );

        const completed = await setTerminalOrder(tx, order.id, "completed", input.now, {
          ...preview,
          kind: effect.kind as ItemUseResult["kind"],
          itemId: order.itemId,
          itemName: order.itemName
        }, "processing");
        const updated = await tx.character.findUniqueOrThrow({
          where: { id: character.id },
          include: characterInclude
        });

        const canonical = mapCanonicalConfirmResult(completed.order, updated, completed.changed ? "used" : undefined);
        return canonical;
      });
    } catch (error) {
      if (error instanceof StaleItemUseRollback) {
        return { state: "stale-selection", order: error.order };
      }

      throw error;
    }
  }

  async cancelForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      now: Date;
    }
  ): Promise<ItemUseCancelRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }

      const order = mapOrder(await tx.itemUseOrder.findUnique({ where: { token: input.token } }));
      if (!order || order.characterId !== character.id) {
        return { state: "invalid-token" };
      }

      if (order.status === "completed") {
        return { state: "completed", order };
      }
      if (order.status === "cancelled") {
        return { state: "replayed", order };
      }
      if (order.status === "expired") {
        return { state: "expired", order };
      }

      if (order.expiresAt <= input.now) {
        const expired = await setTerminalOrder(tx, order.id, "expired", input.now, {
          ...order.preview,
          kind: "expired",
          itemId: order.itemId,
          itemName: order.itemName
        }, "pending");
        return mapCanonicalCancelResult(expired.order, expired.changed ? "expired" : undefined);
      }

      const cancelled = await setTerminalOrder(tx, order.id, "cancelled", input.now, {
        ...order.preview,
        kind: "cancelled",
        itemId: order.itemId,
        itemName: order.itemName
      }, "pending");
      return mapCanonicalCancelResult(cancelled.order, cancelled.changed ? "cancelled" : undefined);
    });
  }

  async restoreToFullForTelegramUser(
    telegramUserId: bigint,
    input: {
      item: ItemContent;
      itemContents: readonly ItemContent[];
      itemFingerprint: string;
      token: string;
      now: Date;
      expiresAt: Date;
    }
  ): Promise<ItemUseRestoreToFullRepositoryResult> {
    if (input.item.id !== "item.responsible-panic-bandage") {
      return { state: "not-usable" };
    }
    try {
      return await this.prisma.$transaction(async (tx): Promise<ItemUseRestoreToFullRepositoryResult> => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        if (character.activeCombatLease) {
          return { state: "combat-locked" };
        }

        const effect = getItemUseEffect(input.item);
        if (!effect || blocksAccidentalItemUse(input.item) || effect.kind !== "heal-hp" || effect.amount <= 0) {
          return { state: "not-usable" };
        }

        if (
          input.itemFingerprint !== createItemUseFingerprint(input.item) ||
          input.itemFingerprint !== createItemUseFingerprint(input.itemContents.find((item) => item.id === input.item.id) ?? input.item)
        ) {
          return { state: "not-usable" };
        }

        await releaseExpiredUseReservations(tx, character.id, input.item.id, input.now);
        await lockItemStack(tx, character.id, input.item.id, input.now);

        const existing = mapOrder(await tx.itemUseOrder.findFirst({
          where: {
            characterId: character.id,
            itemId: input.item.id,
            status: { in: ["pending", "processing"] },
            expiresAt: { gt: input.now }
          },
          orderBy: { createdAt: "desc" }
        }));
        if (existing) {
          await cancelOtherPendingUseOrdersForItem(tx, character.id, input.item.id, existing.id, input.now);
          if (existing.status === "processing") {
            return {
              state: "preview-replayed",
              character: toCharacterRecord(character),
              order: existing,
              neededQuantity: existing.quantity,
              availableQuantity: existing.quantity
            };
          } else if (!isRestoreToFullOrder(existing)) {
            await setTerminalOrder(tx, existing.id, "cancelled", input.now, {
              ...existing.preview,
              kind: "cancelled",
              itemId: existing.itemId,
              itemName: existing.itemName
            }, expectedTerminalOrderStatus(existing));
          } else {
            const validation = await validatePendingRestoreToFullRefresh(tx, existing, character, {
              item: input.item,
              itemContents: input.itemContents,
              itemFingerprint: input.itemFingerprint,
              now: input.now,
              effect
            });
            if (validation.state === "valid") {
              const refreshed = await refreshPendingPreview(tx, existing, validation.preview, input.now);
              return {
                state: "preview-replayed",
                character: toCharacterRecord(character),
                order: refreshed,
                neededQuantity: validation.neededQuantity,
                availableQuantity: validation.availableQuantity
              };
            }

            await releasePendingOrder(tx, existing, input.now, validation.state === "full-hp"
              ? {
                  ...validation.preview,
                  kind: "full-hp",
                  itemId: existing.itemId,
                  itemName: existing.itemName
                }
              : {
                  ...existing.preview,
                  kind: "expired",
                  itemId: existing.itemId,
                  itemName: existing.itemName
                },
              validation.state === "full-hp" ? "completed" : "expired");

            if (validation.state === "full-hp") {
              return {
                state: "full-hp",
                character: toCharacterRecord(character),
                preview: validation.preview
              };
            }
            if (validation.state === "not-enough") {
              return {
                state: "not-enough",
                character: toCharacterRecord(character),
                neededQuantity: validation.neededQuantity,
                availableQuantity: validation.availableQuantity,
                preview: validation.preview
              };
            }

            return { state: validation.state };
          }
        }

        const [items, equippedItemIds, reservedItemIds] = await Promise.all([
          getItems(tx, character.id),
          getEquippedItemIds(tx, character.id),
          getReservedItemIds(tx, character.id, input.now)
        ]);

        const stack = items.find((candidate) => candidate.itemId === input.item.id);
        if (!stack || stack.quantity < 1) {
          return { state: "not-owned" };
        }

        if (equippedItemIds.includes(input.item.id) || reservedItemIds.includes(input.item.id)) {
          return { state: "reserved" };
        }

        const restore = buildRestoreToFullPreview(character, input.itemContents, input.now, effect);
        if (restore.neededQuantity <= 0) {
          await tx.character.update({
            where: { id: character.id },
            data: {
              hpCurrent: restore.settlement.resources.hpCurrent,
              manaCurrent: restore.settlement.resources.manaCurrent,
              hpRegenAt: restore.settlement.resources.hpRegenAt,
              manaRegenAt: restore.settlement.resources.manaRegenAt
            }
          });
          await this.hpRecoveryProducer.record(tx, character.id, input.now, "suppress");
          const updated = await tx.character.findUniqueOrThrow({
            where: { id: character.id },
            include: characterInclude
          });

          return {
            state: "full-hp",
            character: toCharacterRecord(updated),
            preview: restore.preview
          };
        }

        if (stack.quantity < restore.neededQuantity) {
          return {
            state: "not-enough",
            character: toCharacterRecord(character),
            neededQuantity: restore.neededQuantity,
            availableQuantity: stack.quantity,
            preview: restore.preview
          };
        }

        const order = await tx.itemUseOrder.create({
          data: {
            token: input.token,
            characterId: character.id,
            telegramUserId,
            remortCount: getIncludedRemortCount(character),
            itemId: input.item.id,
            itemName: input.item.name,
            itemFingerprint: input.itemFingerprint,
            quantity: restore.neededQuantity,
            effectKind: effect.kind,
            status: "pending",
            reservationKey: createReservationKey(character.id, input.item.id),
            previewJson: restore.preview as unknown as Prisma.InputJsonValue,
            expiresAt: input.expiresAt,
            updatedAt: input.now
          }
        });

        return {
          state: "preview-created",
          character: toCharacterRecord(character),
          order: mapOrder(order) ?? (() => {
            throw new Error("Restore-to-full item use order mapping failed after create.");
          })(),
          neededQuantity: restore.neededQuantity,
          availableQuantity: stack.quantity
        };
      });
    } catch (error) {
      if (isLiveReservationConflict(error)) {
        return await recoverLiveRestoreToFullAfterReservationConflict(this.prisma, telegramUserId, {
          itemId: input.item.id,
          itemContents: input.itemContents,
          now: input.now
        }) ?? { state: "reserved" };
      }

      throw error;
    }
  }
}

class StaleItemUseRollback extends Error {
  constructor(readonly order: ItemUseOrderRecord) {
    super("Item use selection changed during transaction.");
  }
}

const characterInclude = {
  user: {
    select: {
      lastSeenLocationId: true
    }
  },
  activeCombatLease: true,
  equipment: true,
  drinkState: true,
  _count: {
    select: {
      remorts: true
    }
  }
};

async function findCharacter(tx: TxClient, telegramUserId: bigint) {
  return tx.character.findFirst({
    where: {
      user: { telegramUserId }
    },
    include: characterInclude
  });
}

async function getItems(tx: TxClient, characterId: string): Promise<CharacterItem[]> {
  return tx.characterItem.findMany({
    where: { characterId },
    orderBy: [{ createdAt: "asc" }, { itemId: "asc" }]
  });
}

async function getEquippedItemIds(tx: TxClient, characterId: string): Promise<string[]> {
  const rows = await tx.characterEquipment.findMany({
    where: { characterId },
    select: { itemId: true }
  });

  return rows.map((row) => row.itemId);
}

async function getReservedItemIds(
  tx: TxClient,
  characterId: string,
  now: Date,
  exceptOrderId?: string
): Promise<string[]> {
  const [pendingChestRuns, pendingLevelBarters, pendingSales, pendingTransfers, pendingUses] = await Promise.all([
    tx.mantokChestRun.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.levelBarterExchange.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.korchmaMantokSale.findMany({
      where: {
        characterId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: now }
      },
      select: { selectionJson: true }
    }),
    findActiveTransferReservedItems(tx, { senderCharacterId: characterId, now }),
    findActiveItemUseReservedItems(tx, {
      characterId,
      now,
      ...(exceptOrderId ? { exceptOrderId } : {})
    })
  ]);
  const reserved = new Set<string>();

  for (const run of pendingChestRuns) {
    for (const item of parseItems(run.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const exchange of pendingLevelBarters) {
    for (const item of parseItems(exchange.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const sale of pendingSales) {
    for (const item of parseItems(sale.selectionJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const transfer of pendingTransfers) {
    reserved.add(transfer.itemId);
  }
  for (const use of pendingUses) {
    reserved.add(use.itemId);
  }

  return [...reserved];
}

async function refreshPendingPreview(
  tx: TxClient,
  order: ItemUseOrderRecord,
  preview: ItemUsePreview,
  now: Date
): Promise<ItemUseOrderRecord> {
  const updated = await tx.itemUseOrder.updateMany({
    where: {
      id: order.id,
      status: "pending"
    },
    data: {
      previewJson: preview as unknown as Prisma.InputJsonValue,
      updatedAt: now
    }
  });

  if (updated.count !== 1) {
    return mapOrder(await tx.itemUseOrder.findUnique({ where: { id: order.id } })) ?? order;
  }

  return mapOrder(await tx.itemUseOrder.findUnique({ where: { id: order.id } })) ?? order;
}

type PendingPreviewValidation =
  | { state: "valid"; preview: ItemUsePreview }
  | { state: "full-hp"; preview: ItemUsePreview }
  | { state: "full-mana"; preview: ItemUsePreview }
  | { state: "not-owned" }
  | { state: "not-usable" }
  | { state: "reserved" };

type PendingRestoreToFullValidation =
  | { state: "valid"; preview: ItemUsePreview; neededQuantity: number; availableQuantity: number }
  | { state: "full-hp"; preview: ItemUsePreview }
  | { state: "not-enough"; preview: ItemUsePreview; neededQuantity: number; availableQuantity: number }
  | { state: "not-owned" | "not-usable" | "reserved" };

async function validatePendingPreviewRefresh(
  tx: TxClient,
  order: ItemUseOrderRecord,
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>,
  input: {
    item: ItemContent;
    itemContents: readonly ItemContent[];
    itemFingerprint: string;
    now: Date;
    effect: ReturnType<typeof getItemUseEffect>;
  }
): Promise<PendingPreviewValidation> {
  if (
    getIncludedRemortCount(character) !== order.remortCount ||
    order.preview.rulesVersion !== ITEM_USE_RULES_VERSION ||
    !Number.isInteger(order.preview.startingStackQuantity) ||
    (order.preview.startingStackQuantity ?? 0) < 1 ||
    typeof order.preview.resolvedEffectKind !== "string" ||
    order.quantity !== 1 ||
    input.item.id !== order.itemId
  ) {
    return { state: "not-usable" };
  }

  if (!input.effect || !isOutOfCombatItemUseEffect(input.effect) || blocksAccidentalItemUse(input.item)) {
    return { state: "not-usable" };
  }

  if (!(await isQuestConsumableUnlocked(tx, character.id, order.itemId))) {
    return { state: "not-usable" };
  }

  if (
    input.item.name !== order.itemName ||
    createItemUseFingerprint(input.item) !== order.itemFingerprint ||
    createItemUseFingerprint(input.item) !== input.itemFingerprint ||
    input.effect.kind !== order.effectKind
  ) {
    return { state: "not-usable" };
  }

  const [items, equippedItemIds, reservedItemIds] = await Promise.all([
    getItems(tx, character.id),
    getEquippedItemIds(tx, character.id),
    getReservedItemIds(tx, character.id, input.now, order.id)
  ]);
  const stack = items.find((item) => item.itemId === order.itemId);
  if (!stack || stack.quantity < 1 || stack.quantity !== order.preview.startingStackQuantity) {
    return { state: "not-owned" };
  }

  if (equippedItemIds.includes(order.itemId) || reservedItemIds.includes(order.itemId)) {
    return { state: "reserved" };
  }

  const settlement = getRegeneratedResources(character, input.itemContents, input.now);
  const preview = recalculateFrozenItemUsePreview({
    hpCurrent: settlement.resources.hpCurrent,
    hpMax: settlement.resources.hpMax,
    manaCurrent: settlement.resources.manaCurrent,
    manaMax: settlement.resources.manaMax,
    effect: input.effect,
    frozen: {
      resource: order.preview.resource,
      resolvedEffectKind: order.preview.resolvedEffectKind,
      startingStackQuantity: order.preview.startingStackQuantity ?? 0
    }
  });
  if (!preview) {
    return { state: "not-usable" };
  }
  return getItemUsePreviewAppliedAmount(preview) <= 0
    ? { state: getFullState(preview), preview }
    : { state: "valid", preview };
}

async function validatePendingRestoreToFullRefresh(
  tx: TxClient,
  order: ItemUseOrderRecord,
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>,
  input: {
    item: ItemContent;
    itemContents: readonly ItemContent[];
    itemFingerprint: string;
    now: Date;
    effect: ReturnType<typeof getItemUseEffect>;
  }
): Promise<PendingRestoreToFullValidation> {
  if (
    getIncludedRemortCount(character) !== order.remortCount ||
    order.preview.rulesVersion !== ITEM_USE_RULES_VERSION ||
    !isRestoreToFullOrder(order) ||
    input.item.id !== order.itemId
  ) {
    return { state: "not-usable" };
  }

  if (
    !input.effect ||
    blocksAccidentalItemUse(input.item) ||
    input.effect.kind !== "heal-hp" ||
    input.effect.amount <= 0
  ) {
    return { state: "not-usable" };
  }

  if (
    input.item.name !== order.itemName ||
    createItemUseFingerprint(input.item) !== order.itemFingerprint ||
    createItemUseFingerprint(input.item) !== input.itemFingerprint ||
    input.effect.kind !== order.effectKind
  ) {
    return { state: "not-usable" };
  }

  const [items, equippedItemIds, reservedItemIds] = await Promise.all([
    getItems(tx, character.id),
    getEquippedItemIds(tx, character.id),
    getReservedItemIds(tx, character.id, input.now, order.id)
  ]);
  const stack = items.find((item) => item.itemId === order.itemId);
  if (!stack || stack.quantity < 1) {
    return { state: "not-owned" };
  }

  if (equippedItemIds.includes(order.itemId) || reservedItemIds.includes(order.itemId)) {
    return { state: "reserved" };
  }

  const restore = buildRestoreToFullPreview(character, input.itemContents, input.now, input.effect);
  if (restore.neededQuantity <= 0) {
    return { state: "full-hp", preview: restore.preview };
  }

  if (stack.quantity < restore.neededQuantity) {
    return {
      state: "not-enough",
      preview: restore.preview,
      neededQuantity: restore.neededQuantity,
      availableQuantity: stack.quantity
    };
  }

  return {
    state: "valid",
    preview: restore.preview,
    neededQuantity: restore.neededQuantity,
    availableQuantity: stack.quantity
  };
}

async function releasePendingOrder(
  tx: TxClient,
  order: ItemUseOrderRecord,
  now: Date,
  result: ItemUseResult,
  status: "completed" | "expired"
): Promise<void> {
  await setTerminalOrder(tx, order.id, status, now, result, expectedTerminalOrderStatus(order));
}

async function recoverLivePreviewAfterReservationConflict(
  prisma: PrismaClient,
  telegramUserId: bigint,
  input: {
    itemId: string;
    itemContents: readonly ItemContent[];
    now: Date;
  }
): Promise<ItemUsePreviewRepositoryResult | null> {
  return prisma.$transaction(async (tx) => {
    const character = await findCharacter(tx, telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const item = input.itemContents.find((candidate) => candidate.id === input.itemId);
    const effect = item ? getItemUseEffect(item) : null;
    if (!item || !effect || blocksAccidentalItemUse(item)) {
      return null;
    }

    const existing = mapOrder(await tx.itemUseOrder.findFirst({
      where: {
        characterId: character.id,
        itemId: input.itemId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: input.now }
      },
      orderBy: { createdAt: "desc" }
    }));

    if (!existing) {
      return null;
    }

    if (existing.status === "processing") {
      return {
        state: "preview-replayed",
        character: toCharacterRecord(character),
        order: existing
      };
    }

    const validation = await validatePendingPreviewRefresh(tx, existing, character, {
      item,
      itemContents: input.itemContents,
      itemFingerprint: createItemUseFingerprint(item),
      now: input.now,
      effect
    });
    if (validation.state !== "valid") {
      return null;
    }

    return {
      state: "preview-replayed",
      character: toCharacterRecord(character),
      order: await refreshPendingPreview(tx, existing, validation.preview, input.now)
    };
  });
}

async function recoverLiveRestoreToFullAfterReservationConflict(
  prisma: PrismaClient,
  telegramUserId: bigint,
  input: {
    itemId: string;
    itemContents: readonly ItemContent[];
    now: Date;
  }
): Promise<ItemUseRestoreToFullRepositoryResult | null> {
  return prisma.$transaction(async (tx) => {
    const character = await findCharacter(tx, telegramUserId);
    if (!character) {
      return { state: "no-character" };
    }

    const item = input.itemContents.find((candidate) => candidate.id === input.itemId);
    const effect = item ? getItemUseEffect(item) : null;
    if (!item || !effect || blocksAccidentalItemUse(item) || effect.kind !== "heal-hp" || effect.amount <= 0) {
      return null;
    }

    const existing = mapOrder(await tx.itemUseOrder.findFirst({
      where: {
        characterId: character.id,
        itemId: input.itemId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: input.now }
      },
      orderBy: { createdAt: "desc" }
    }));

    if (!existing || !isRestoreToFullOrder(existing)) {
      return null;
    }

    if (existing.status === "processing") {
      return {
        state: "preview-replayed",
        character: toCharacterRecord(character),
        order: existing,
        neededQuantity: existing.quantity,
        availableQuantity: existing.quantity
      };
    }

    const validation = await validatePendingRestoreToFullRefresh(tx, existing, character, {
      item,
      itemContents: input.itemContents,
      itemFingerprint: createItemUseFingerprint(item),
      now: input.now,
      effect
    });
    if (validation.state !== "valid") {
      return null;
    }

    return {
      state: "preview-replayed",
      character: toCharacterRecord(character),
      order: await refreshPendingPreview(tx, existing, validation.preview, input.now),
      neededQuantity: validation.neededQuantity,
      availableQuantity: validation.availableQuantity
    };
  });
}

function buildPreview(
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>,
  itemContents: readonly ItemContent[],
  now: Date,
  effect: NonNullable<ReturnType<typeof getItemUseEffect>>,
  resolutionSeed: string,
  startingStackQuantity: number
): ItemUsePreview {
  const settlement = getRegeneratedResources(character, itemContents, now);

  return calculateItemUsePreview({
    hpCurrent: settlement.resources.hpCurrent,
    hpMax: settlement.resources.hpMax,
    manaCurrent: settlement.resources.manaCurrent,
    manaMax: settlement.resources.manaMax,
    effect,
    resolutionSeed,
    startingStackQuantity
  });
}

function buildRestoreToFullPreview(
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>,
  itemContents: readonly ItemContent[],
  now: Date,
  effect: Extract<NonNullable<ReturnType<typeof getItemUseEffect>>, { kind: "heal-hp" }>
): {
  preview: ItemUsePreview;
  neededQuantity: number;
  settlement: ReturnType<typeof getRegeneratedResources>;
} {
  const settlement = getRegeneratedResources(character, itemContents, now);
  const hpMax = Math.max(1, Math.floor(settlement.resources.hpMax));
  const hpBefore = Math.min(hpMax, Math.max(0, Math.floor(settlement.resources.hpCurrent)));
  const missingHp = Math.max(0, hpMax - hpBefore);
  const neededQuantity = missingHp > 0
    ? Math.ceil(missingHp / Math.max(1, Math.floor(effect.amount)))
    : 0;

  return {
    preview: {
      rulesVersion: ITEM_USE_RULES_VERSION,
      startingStackQuantity: 0,
      resolvedEffectKind: effect.kind,
      mode: "restore-to-full",
      resource: "hp",
      hpBefore,
      hpMax,
      healAmount: missingHp,
      hpAfter: hpMax,
      manaBefore: settlement.resources.manaCurrent,
      manaMax: settlement.resources.manaMax,
      manaRestoreAmount: 0,
      manaAfter: settlement.resources.manaCurrent
    },
    neededQuantity,
    settlement
  };
}

function getRegeneratedResources(
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>,
  itemContents: readonly ItemContent[],
  now: Date
): ReturnType<typeof applyPassiveResourceRegeneration> {
  const equippedItems = character.equipment.flatMap((slot) => {
    const item = itemContents.find((candidate) => candidate.id === slot.itemId);
    return item ? [item] : [];
  });
  const summary = summarizeCharacter(toCharacterRecord(character), {
    equippedItems,
    remortCount: getIncludedRemortCount(character)
  });
  return applyPassiveResourceRegeneration({
    resources: {
      hpCurrent: summary.hpCurrent,
      hpMax: summary.hpMax,
      manaCurrent: summary.manaCurrent,
      manaMax: summary.manaMax,
      hpRegenAt: character.hpRegenAt,
      manaRegenAt: character.manaRegenAt
    },
    profile: {
      raceId: summary.raceId,
      classId: summary.classId,
      title: summary.title,
      stats: summary.stats
    },
    now,
    multiplierWindows: buildShynokRecoveryWindows(mapDrinkState(character.drinkState))
  });
}

function mapDrinkState(record: CharacterDrinkState | null): Parameters<typeof buildShynokRecoveryWindows>[0] {
  if (!record || !isShynokDrinkKey(record.drinkKey)) {
    return null;
  }

  const phase = record.phase === "timed" || record.phase === "queued"
    ? record.phase
    : null;

  if (!phase) {
    return null;
  }

  return {
    drinkKey: record.drinkKey,
    phase,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    metadata: record.metadataJson
  };
}

async function lockItemStack(
  tx: TxClient,
  characterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.characterItem.updateMany({
    where: { characterId, itemId },
    data: { updatedAt: now }
  });
}

async function releaseExpiredUseReservations(
  tx: TxClient,
  characterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.itemUseOrder.updateMany({
    where: {
      characterId,
      itemId,
        status: { in: ["pending", "processing"] },
      expiresAt: { lte: now }
    },
    data: {
      status: "expired",
      reservationKey: null,
      cancelledAt: now,
      updatedAt: now,
      resultJson: {
        kind: "expired"
      }
    }
  });
}

async function cancelOtherPendingUseOrdersForItem(
  tx: TxClient,
  characterId: string,
  itemId: string,
  exceptOrderId: string,
  now: Date
): Promise<void> {
  await tx.itemUseOrder.updateMany({
    where: {
      characterId,
      itemId,
      id: { not: exceptOrderId },
      status: { in: ["pending", "processing"] },
      expiresAt: { gt: now }
    },
    data: {
      status: "cancelled",
      reservationKey: null,
      cancelledAt: now,
      updatedAt: now,
      resultJson: {
        kind: "cancelled",
        itemId
      }
    }
  });
}

async function replayTerminalConfirm(
  tx: TxClient,
  order: ItemUseOrderRecord,
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>
): Promise<ItemUseConfirmRepositoryResult | null> {
  if (order.status === "pending" || order.status === "processing") {
    return null;
  }

  if (order.status === "completed") {
    const fullState = order.result?.kind === "full-mana"
      ? "full-mana"
      : order.result?.kind === "full-hp"
        ? "full-hp"
        : null;
    return {
      state: fullState ?? "replayed",
      character: toCharacterRecord(character),
      order
    };
  }

  if (order.status === "cancelled") {
    return { state: "cancelled", order };
  }

  if (order.status === "expired") {
    return { state: "expired", order };
  }

  const current = mapOrder(await tx.itemUseOrder.findUnique({ where: { id: order.id } })) ?? order;
  return { state: "stale-selection", order: current };
}

async function staleTerminalConfirm(
  tx: TxClient,
  order: ItemUseOrderRecord,
  now: Date,
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>
): Promise<ItemUseConfirmRepositoryResult> {
  if (!isRestoreToFullOrder(order) && order.status !== "pending") {
    return { state: "stale-selection", order };
  }

  const stale = await setTerminalOrder(tx, order.id, "expired", now, {
    ...order.preview,
    kind: "expired",
    itemId: order.itemId,
    itemName: order.itemName
  }, isRestoreToFullOrder(order) ? "processing" : "pending");
  const terminal = stale.changed || stale.order.status !== "pending" || !isRestoreToFullOrder(order)
    ? stale
    : await setTerminalOrder(tx, order.id, "expired", now, {
        ...order.preview,
        kind: "expired",
        itemId: order.itemId,
        itemName: order.itemName
      }, "pending");
  const canonical = mapCanonicalConfirmResult(terminal.order, character, terminal.changed ? "expired" : undefined);

  return canonical.state === "expired"
    ? { state: "stale-selection", order: terminal.order }
    : canonical;
}

function mapCanonicalConfirmResult(
  order: ItemUseOrderRecord,
  character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>,
  preferredState?: "used" | "full-hp" | "full-mana" | "expired"
): ItemUseConfirmRepositoryResult {
  if (order.status === "completed") {
    if (order.result?.kind === "full-hp" || order.result?.kind === "full-mana") {
      return { state: order.result.kind, character: toCharacterRecord(character), order };
    }

    return {
      state: preferredState === "used" ? "used" : "replayed",
      character: toCharacterRecord(character),
      order
    };
  }

  if (order.status === "cancelled") {
    return { state: "cancelled", order };
  }

  if (order.status === "expired") {
    return { state: "expired", order };
  }

  return { state: "stale-selection", order };
}

function mapCanonicalCancelResult(
  order: ItemUseOrderRecord,
  preferredState?: "cancelled" | "expired"
): ItemUseCancelRepositoryResult {
  if (order.status === "completed") {
    return { state: "completed", order };
  }

  if (order.status === "cancelled") {
    return { state: preferredState === "cancelled" ? "cancelled" : "replayed", order };
  }

  if (order.status === "expired") {
    return { state: "expired", order };
  }

  return { state: "stale-selection", order };
}

async function setTerminalOrder(
  tx: TxClient,
  orderId: string,
  status: "completed" | "cancelled" | "expired",
  now: Date,
  result: ItemUseResult,
  expectedStatus: "pending" | "processing"
): Promise<{ order: ItemUseOrderRecord; changed: boolean }> {
  const updatedRows = await tx.itemUseOrder.updateMany({
    where: {
      id: orderId,
      status: expectedStatus
    },
    data: {
      status,
      reservationKey: null,
      resultJson: result as unknown as Prisma.InputJsonValue,
      ...(status === "completed" ? { completedAt: now } : { cancelledAt: now }),
      updatedAt: now
    }
  });
  const updated = mapOrder(await tx.itemUseOrder.findUnique({ where: { id: orderId } }));
  if (!updated) {
    throw new Error("Item use order disappeared during terminal update.");
  }

  return {
    order: updated,
    changed: updatedRows.count === 1
  };
}

function mapOrder(record: ItemUseOrder | null): ItemUseOrderRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    token: record.token,
    characterId: record.characterId,
    telegramUserId: record.telegramUserId,
    remortCount: record.remortCount,
    itemId: record.itemId,
    itemName: record.itemName,
    itemFingerprint: record.itemFingerprint,
    quantity: record.quantity,
    effectKind: record.effectKind,
    status: parseStatus(record.status),
    preview: parsePreview(record.previewJson),
    result: parseResult(record.resultJson),
    expiresAt: record.expiresAt,
    completedAt: record.completedAt,
    cancelledAt: record.cancelledAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): ItemUseOrderStatus {
  return status === "processing" ||
    status === "completed" ||
    status === "cancelled" ||
    status === "expired"
    ? status
    : "pending";
}

function parsePreview(value: unknown): ItemUsePreview {
  if (!isRecord(value)) {
    return {
      rulesVersion: ITEM_USE_RULES_VERSION,
      resource: "hp",
      hpBefore: 0,
      hpMax: 1,
      healAmount: 0,
      hpAfter: 0,
      manaBefore: 0,
      manaMax: 0,
      manaRestoreAmount: 0,
      manaAfter: 0
    };
  }

  return {
    rulesVersion: typeof value.rulesVersion === "string" ? value.rulesVersion : ITEM_USE_RULES_VERSION,
    ...(value.mode === "restore-to-full" ? { mode: "restore-to-full" as const } : {}),
    startingStackQuantity: numberOrZero(value.startingStackQuantity),
    ...(isItemUseEffectKind(value.resolvedEffectKind) ? { resolvedEffectKind: value.resolvedEffectKind } : {}),
    resource: value.resource === "mana" ? "mana" : value.resource === "both" ? "both" : "hp",
    hpBefore: numberOrZero(value.hpBefore),
    hpMax: Math.max(1, numberOrZero(value.hpMax)),
    healAmount: numberOrZero(value.healAmount),
    hpAfter: numberOrZero(value.hpAfter),
    manaBefore: numberOrZero(value.manaBefore),
    manaMax: Math.max(0, numberOrZero(value.manaMax)),
    manaRestoreAmount: numberOrZero(value.manaRestoreAmount),
    manaAfter: numberOrZero(value.manaAfter)
  };
}

function parseResult(value: unknown): ItemUseResult | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return null;
  }

  const preview = parsePreview(value);
  const kind = value.kind === "heal-hp" ||
    value.kind === "heal-hp-to-min-percent" ||
    value.kind === "restore-mana" ||
    value.kind === "restore-both" ||
    value.kind === "random-resource" ||
    value.kind === "heal-hp-below-percent" ||
    value.kind === "full-hp" ||
    value.kind === "full-mana" ||
    value.kind === "expired" ||
    value.kind === "cancelled"
    ? value.kind
    : "cancelled";

  return {
    ...preview,
    kind,
    itemId: typeof value.itemId === "string" ? value.itemId : "",
    itemName: typeof value.itemName === "string" ? value.itemName : ""
  };
}

function getFullState(preview: Pick<ItemUsePreview, "resource">): "full-hp" | "full-mana" {
  return preview.resource === "mana" ? "full-mana" : "full-hp";
}

function createStableRandomResolutionSeed(
  characterId: string,
  itemId: string,
  remortCount: number,
  stackQuantity: number
): string {
  return `${characterId}:${itemId}:${remortCount}:${stackQuantity}`;
}

async function isQuestConsumableUnlocked(
  tx: TxClient,
  characterId: string,
  itemId: string
): Promise<boolean> {
  if (itemId !== "item.cellar.foamy-mirage-bottle") return true;
  const [acquisition, completion] = await Promise.all([
    tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId,
          key: "cellar.grownup.bottle",
          localDate: "once"
        }
      },
      select: { id: true }
    }),
    tx.dailyAction.findUnique({
      where: {
        characterId_key_localDate: {
          characterId,
          key: "cellar.grownup.completed",
          localDate: "once"
        }
      },
      select: { resultJson: true }
    })
  ]);
  return !acquisition || (isRecord(completion?.resultJson) && completion.resultJson.ending === "keep");
}

function isFullState(state: string): state is "full-hp" | "full-mana" {
  return state === "full-hp" || state === "full-mana";
}

function parseItems(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }

    const quantity = Number(entry.quantity);
    return Number.isInteger(quantity) && quantity > 0
      ? [{ itemId: entry.itemId, quantity }]
      : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isItemUseEffectKind(value: unknown): value is ItemUseEffectContent["kind"] {
  return typeof value === "string" && [
    "heal-hp",
    "heal-hp-to-min-percent",
    "restore-mana",
    "restore-both",
    "random-resource",
    "heal-hp-below-percent",
    "paired-heal",
    "party-heal",
    "guard-response",
    "evade-response",
    "reduce-cooldowns",
    "cleanse-negative",
    "critical-damage"
  ].includes(value);
}

function createReservationKey(characterId: string, itemId: string): string {
  return `use:${characterId}:${itemId}`;
}

function isRestoreToFullOrder(order: ItemUseOrderRecord): boolean {
  return order.preview.mode === "restore-to-full";
}

function expectedTerminalOrderStatus(order: ItemUseOrderRecord): "pending" | "processing" {
  return order.status === "processing" ? "processing" : "pending";
}

function isLiveReservationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toCharacterRecord(
  character: Character & {
    user: { lastSeenLocationId: string | null };
    activeCombatLease?: unknown;
    equipment?: unknown;
    _count?: unknown;
  }
): CharacterRecord {
  const { user, ...record } = character;
  delete (record as { activeCombatLease?: unknown }).activeCombatLease;
  delete (record as { equipment?: unknown }).equipment;
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(character as Character & { _count?: { remorts?: number } })
  };
}

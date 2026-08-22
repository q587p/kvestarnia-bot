import { Prisma, type Character, type DailyAction, type PrismaClient } from "@prisma/client";
import { items } from "../../content";
import { FIELD_KIT_ITEM_ID } from "../../domain/itemCraft";
import { getMantokSetForItem } from "../../domain/equipment/mantokSetBonuses";
import {
  buildItemDismantleGuard,
  buildItemDismantleRulesFingerprint,
  canAccessItemUpgrades,
  calculateItemDismantleYield,
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getItemUpgradeRequiredLevel,
  getItemUpgradeUnlockRewardXp,
  getBaseItemIdForUpgradeVariant,
  getItemDismantleEligibility,
  getDonorBonus,
  getItemUpgradeLevelFromItemId,
  getLuckFromStats,
  getNextItemUpgradeItemId,
  ITEM_UPGRADE_LOCATION_ID,
  ITEM_DISMANTLE_GOLD_COST,
  ITEM_DISMANTLE_MANA_COST,
  ITEM_DISMANTLE_RULES_VERSION,
  ITEM_UPGRADE_UNLOCK_KEY,
  ITEM_UPGRADE_UNLOCK_LOCAL_DATE,
  isItemUpgradeable,
  isMageClassForItemSelfUpgrade,
  MAX_ITEM_UPGRADE_LEVEL,
  normalizeItemUpgradeLevel
} from "../../domain/itemUpgrades";
import { applyXpReward, getLevelForXp } from "../../domain/progression/level";
import { buildQuestIskrokaminBonusGrant } from "../../domain/quests/questIskrokaminBonus";
import { ISKROKAMIN_ITEM_ID } from "../../services/itemGrant";
import type { CharacterRecord } from "./characterRepository";
import type { ItemGrant } from "./dailyActionRepository";
import type {
  ItemDismantleConfirmInput,
  ItemDismantleConfirmResult,
  ItemUpgradeAttemptInput,
  ItemUpgradeAttemptResult,
  ItemUpgradeInventoryRow,
  ItemUpgradeQuestSnapshot,
  ItemUpgradeRepository,
  ItemUpgradeSnapshot,
  ItemUpgradeUnlockResult
} from "./itemUpgradeRepository";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { getIncludedRemortCount } from "./prismaRemortCount";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import { getQuestMarkerReadSnapshot } from "./questMarkerReadContext";
import { findAllActiveReservedItemIds } from "./itemTransferReservations";
import { protectedMantokChestItemIds } from "../../domain/mantokChest/mantokChestScore";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import { applyPassiveResourceRegeneration } from "../../domain/resources/resourceRegeneration";
import {
  InventoryMutationContentionError,
  lockInventoryItemStack,
  runSerializableInventoryMutation
} from "./inventoryMutationSerialization";

type TxClient = Prisma.TransactionClient;

const PITY_LOCAL_DATE = "persistent";
const PITY_KEY_PREFIX = "item-upgrade.pity:";
const PITY_KIND = "item-upgrade-pity";
const ATTEMPT_CLAIM_KEY_PREFIX = "item-upgrade.attempt:";
const ATTEMPT_CLAIM_KIND = "item-upgrade-attempt-claim";
const DISMANTLE_RECEIPT_KEY_PREFIX = "item-dismantle.receipt:";
const DISMANTLE_RECEIPT_LOCAL_DATE = "persistent";

class StaleSnapshotRollbackError extends Error {}

export class PrismaItemUpgradeRepository implements ItemUpgradeRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false)
  ) {}

  async getSnapshotForTelegramUser(telegramUserId: bigint, now = new Date()): Promise<ItemUpgradeSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }

      const [itemRows, equipment, pities, unlocked, reservedItemIds] = await Promise.all([
        tx.characterItem.findMany({ where: { characterId: character.id }, orderBy: [{ createdAt: "asc" }] }),
        tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } }),
        tx.dailyAction.findMany({
          where: { characterId: character.id, key: { startsWith: PITY_KEY_PREFIX }, localDate: PITY_LOCAL_DATE }
        }),
        tx.dailyAction.findUnique({
          where: {
            characterId_key_localDate: {
              characterId: character.id,
              key: ITEM_UPGRADE_UNLOCK_KEY,
              localDate: ITEM_UPGRADE_UNLOCK_LOCAL_DATE
            }
          }
        }),
        findAllActiveReservedItemIds(tx, { characterId: character.id, now })
      ]);
      const equipped = new Set(equipment.map((row) => row.itemId));
      const characterRecord = toCharacterRecord(character);
      const summary = summarizeCharacter(characterRecord, {
        equippedItems: equipment.flatMap((entry) => {
          const item = findItem(entry.itemId);
          return item ? [item] : [];
        })
      });
      const regeneration = applyPassiveResourceRegeneration({
        resources: {
          hpCurrent: characterRecord.hpCurrent,
          hpMax: summary.hpMax,
          manaCurrent: characterRecord.manaCurrent,
          manaMax: summary.manaMax,
          ...(characterRecord.hpRegenAt === undefined ? {} : { hpRegenAt: characterRecord.hpRegenAt }),
          ...(characterRecord.manaRegenAt === undefined ? {} : { manaRegenAt: characterRecord.manaRegenAt })
        },
        profile: {
          raceId: summary.raceId,
          classId: summary.classId,
          title: summary.title,
          stats: summary.stats
        },
        now
      });

      return {
        character: {
          ...characterRecord,
          hpCurrent: regeneration.resources.hpCurrent,
          manaCurrent: regeneration.resources.manaCurrent,
          hpRegenAt: regeneration.resources.hpRegenAt,
          manaRegenAt: regeneration.resources.manaRegenAt
        },
        items: itemRows.map((row) => toInventoryRow(row, equipped)),
        pities: pities.flatMap(mapPity),
        unlocked: Boolean(unlocked),
        reservedItemIds
      };
    });
  }

  async getQuestSnapshotForTelegramUser(telegramUserId: bigint): Promise<ItemUpgradeQuestSnapshot | null> {
    const markerSnapshot = getQuestMarkerReadSnapshot(telegramUserId);
    if (markerSnapshot) {
      if (!markerSnapshot.character) {
        return null;
      }
      const unlocked = markerSnapshot.dailyActions.some(
        (action) => action.key === ITEM_UPGRADE_UNLOCK_KEY && action.localDate === ITEM_UPGRADE_UNLOCK_LOCAL_DATE
      );
      const fieldKitQuantity = markerSnapshot.items.find(
        (item) => item.itemId === FIELD_KIT_ITEM_ID
      )?.quantity ?? 0;
      return { character: markerSnapshot.character, fieldKitQuantity, unlocked };
    }

    const character = await findCharacter(this.prisma, telegramUserId);
    if (!character) {
      return null;
    }

    const [unlocked, fieldKit] = await Promise.all([
      getUnlockAction(this.prisma, character.id),
      this.prisma.characterItem.findUnique({
        where: { characterId_itemId: { characterId: character.id, itemId: FIELD_KIT_ITEM_ID } },
        select: { quantity: true }
      })
    ]);

    return {
      character: toCharacterRecord(character),
      fieldKitQuantity: fieldKit?.quantity ?? 0,
      unlocked: Boolean(unlocked)
    };
  }

  async attemptForTelegramUser(
    telegramUserId: bigint,
    input: ItemUpgradeAttemptInput
  ): Promise<ItemUpgradeAttemptResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        const gate = await getUpgradeGateResult(tx, character);
        if (gate) {
          return gate;
        }

        const [base, equipment] = await Promise.all([
          tx.characterItem.findUnique({
            where: { characterId_itemId: { characterId: character.id, itemId: input.itemId } }
          }),
          tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
        ]);
        const equipped = new Set(equipment.map((row) => row.itemId));
        if (!base || base.quantity <= 0) {
          return { state: "not-owned" };
        }

        const itemContent = findItem(input.itemId);
        const fromLevel = getItemUpgradeLevelFromItemId(input.itemId);
        if (!itemContent || !isItemUpgradeable(itemContent, fromLevel)) {
          return { state: "not-upgradeable" };
        }

        if (fromLevel >= MAX_ITEM_UPGRADE_LEVEL) {
          return { state: "cap-reached", item: toInventoryRow(base, equipped) };
        }

        if (input.expectedFromLevel !== fromLevel || input.expectedQuantity !== base.quantity) {
          return { state: "stale-snapshot", item: toInventoryRow(base, equipped) };
        }
        if (!isAttemptGuard(input.attemptGuard)) {
          return { state: "stale-snapshot", item: toInventoryRow(base, equipped) };
        }

        const targetLevel = fromLevel + 1;
        const nextItemId = getNextItemUpgradeItemId(input.itemId);
        if (!nextItemId || !findItem(nextItemId)) {
          return { state: "not-upgradeable" };
        }

        if (input.method === "self" && !isMageClassForItemSelfUpgrade(character.classId)) {
          return { state: "class-not-allowed" };
        }

        const pityFailuresBefore = await getPityFailureCount(tx, character.id, input.itemId, targetLevel);
        if (input.expectedPityFailures !== pityFailuresBefore) {
          return { state: "stale-snapshot", item: toInventoryRow(base, equipped) };
        }

        const donor = input.donorItemId
          ? await tx.characterItem.findUnique({
              where: { characterId_itemId: { characterId: character.id, itemId: input.donorItemId } }
            })
          : null;
        if (input.donorItemId && (!donor || donor.quantity <= 0 || !isValidDonor(base, donor, input.itemId, input.donorItemId))) {
          return { state: "invalid-donor" };
        }
        const donorContent = input.donorItemId ? findItem(input.donorItemId) : null;
        const baseSet = getMantokSetForItem(input.itemId);
        const donorSet = input.donorItemId ? getMantokSetForItem(input.donorItemId) : null;
        const donorBonus = donor && donorContent
          ? getDonorBonus({
              baseItem: itemContent,
              baseItemId: input.itemId,
              baseSetId: baseSet?.id ?? null,
              donorItem: donorContent,
              donorItemId: input.donorItemId!,
              donorSetId: donorSet?.id ?? null
            })
          : null;
        if (input.donorItemId && !donorBonus) {
          return { state: "invalid-donor" };
        }

        const chance = calculateItemUpgradeChance({
          method: input.method,
          targetLevel,
          luck: getLuckFromStats(parseStats(character.statsJson)),
          pityFailures: pityFailuresBefore,
          donor: donorBonus
        });
        const spent = calculateItemUpgradeCosts({
          method: input.method,
          targetLevel,
          itemRarity: itemContent.rarity,
          isSetPiece: Boolean(baseSet),
          donor: donorBonus
        });
        const iskrokaminRow = await tx.characterItem.findUnique({
          where: { characterId_itemId: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID } }
        });
        const iskrokaminQuantity = iskrokaminRow?.quantity ?? 0;

        if (character.gold < spent.gold) {
          return { state: "not-enough-gold", required: spent.gold, available: character.gold };
        }
        if (character.manaCurrent < spent.mana) {
          return { state: "not-enough-mana", required: spent.mana, available: character.manaCurrent };
        }
        if (iskrokaminQuantity < spent.iskrokamin) {
          return { state: "not-enough-iskrokamin", required: spent.iskrokamin, available: iskrokaminQuantity };
        }

        await createAttemptClaim(tx, character.id, {
          itemId: input.itemId,
          fromLevel,
          targetLevel,
          attemptGuard: input.attemptGuard,
          expectedQuantity: input.expectedQuantity,
          expectedPityFailures: input.expectedPityFailures,
          now: input.now
        });

        const charged = await tx.character.updateMany({
          where: { id: character.id, gold: { gte: spent.gold }, manaCurrent: { gte: spent.mana } },
          data: {
            gold: { decrement: spent.gold },
            manaCurrent: { decrement: spent.mana },
            ...(spent.mana > 0 ? { manaRegenAt: input.now } : {})
          }
        });
        if (charged.count !== 1) {
          throw new StaleSnapshotRollbackError();
        }

        const spentSpark = await tx.characterItem.updateMany({
          where: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID, quantity: { gte: spent.iskrokamin } },
          data: { quantity: { decrement: spent.iskrokamin } }
        });
        if (spentSpark.count !== 1) {
          throw new StaleSnapshotRollbackError();
        }

        let donorConsumed = false;
        if (donor && input.donorItemId) {
          const spentDonor = await tx.characterItem.updateMany({
            where: {
              characterId: character.id,
              itemId: input.donorItemId,
              quantity: { gte: input.donorItemId === input.itemId ? 2 : 1 }
            },
            data: { quantity: { decrement: 1 } }
          });
          if (spentDonor.count !== 1) {
            throw new StaleSnapshotRollbackError();
          }
          donorConsumed = true;
        }

        const success = chance.guaranteed || input.roll * 100 < chance.finalChance;
        const updatedItemId = success ? nextItemId : input.itemId;
        if (success) {
          await replaceOneItemId(tx, character.id, input.itemId, nextItemId);
          await clearPity(tx, character.id, input.itemId, targetLevel);
        } else {
          await setPity(tx, character.id, input.itemId, targetLevel, pityFailuresBefore + 1, input.now);
        }

        await tx.characterItem.deleteMany({ where: { characterId: character.id, quantity: { lte: 0 } } });
        const [updatedCharacter, updatedItem, updatedPity] = await Promise.all([
          tx.character.findUniqueOrThrow({ where: { id: character.id }, include: characterInclude }),
          tx.characterItem.findUniqueOrThrow({
            where: { characterId_itemId: { characterId: character.id, itemId: updatedItemId } }
          }),
          getPityFailureCount(tx, character.id, input.itemId, targetLevel)
        ]);
        if (success && equipped.has(input.itemId)) {
          await this.hpRecoveryProducer.record(tx, character.id, input.now, "recovering");
        }

        return {
          state: "attempted",
          success,
          character: toCharacterRecord(updatedCharacter),
          item: toInventoryRow(updatedItem, new Set([...equipped].map((itemId) => itemId === input.itemId ? updatedItemId : itemId))),
          donorConsumed,
          fromLevel,
          targetLevel,
          finalChance: chance.finalChance,
          pityFailuresBefore,
          pityFailuresAfter: success ? 0 : updatedPity,
          pityGuaranteed: chance.guaranteed,
          spent
        };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error) && !(error instanceof StaleSnapshotRollbackError)) {
        throw error;
      }

      return getStaleSnapshotResult(this.prisma, telegramUserId, input.itemId);
    }
  }

  async setPityForTelegramUser(
    telegramUserId: bigint,
    itemId: string,
    targetLevel: number,
    failureCount: number,
    now: Date
  ): Promise<{ character: CharacterRecord; failureCount: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const safeFailures = Math.max(0, Math.floor(failureCount));

      if (safeFailures === 0) {
        await clearPity(tx, character.id, itemId, targetLevel);
      } else {
        await setPity(tx, character.id, itemId, targetLevel, safeFailures, now);
      }

      return { character: toCharacterRecord(character), failureCount: safeFailures };
    });
  }

  async dismantleForTelegramUser(
    telegramUserId: bigint,
    input: ItemDismantleConfirmInput
  ): Promise<ItemDismantleConfirmResult> {
    try {
      return await runSerializableInventoryMutation(this.prisma, async (tx) => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) return { state: "no-character" };
        const remortCount = getIncludedRemortCount(character);
        if (remortCount !== input.expectedRemortCount) return { state: "stale" };

        await lockInventoryItemStack(tx, character.id, input.itemId, input.now);

        const existingReceipt = await tx.dailyAction.findUnique({
          where: {
            characterId_key_localDate: {
              characterId: character.id,
              key: `${DISMANTLE_RECEIPT_KEY_PREFIX}${input.guard}`,
              localDate: DISMANTLE_RECEIPT_LOCAL_DATE
            }
          }
        });
        const replay = parseDismantleReceipt(existingReceipt, character, input);
        if (replay) return replay;

        const gate = await getUpgradeGateResult(tx, character);
        if (gate) {
          if (gate.state === "wrong-place" || gate.state === "level-locked" || gate.state === "unlock-required") {
            return { state: gate.state };
          }
          return { state: "stale" };
        }

        const [row, equipment, reservedItemIds, sparkBefore] = await Promise.all([
          tx.characterItem.findUnique({
            where: { characterId_itemId: { characterId: character.id, itemId: input.itemId } }
          }),
          tx.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } }),
          findAllActiveReservedItemIds(tx, { characterId: character.id, now: input.now }),
          tx.characterItem.findUnique({
            where: { characterId_itemId: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID } },
            select: { quantity: true }
          })
        ]);
        if (!row || row.quantity <= 0) return { state: "not-owned" };
        if (equipment.some((entry) => entry.itemId === input.itemId)) return { state: "equipped" };
        if (reservedItemIds.includes(input.itemId)) return { state: "reserved" };

        const content = findItem(input.itemId);
        if (!content) return { state: "not-eligible" };
        const eligibility = getItemDismantleEligibility(content, row.quantity, protectedMantokChestItemIds);
        if (eligibility !== "eligible") {
          return { state: eligibility === "protected-last-copy" ? "protected-last-copy" : "not-eligible" };
        }
        const enhancementLevel = getItemUpgradeLevelFromItemId(input.itemId);
        const baseItemId = getBaseItemIdForUpgradeVariant(input.itemId);
        const baseContent = findItem(baseItemId) ?? content;
        const isSetPiece = Boolean(getMantokSetForItem(baseItemId));
        const yieldAmount = calculateItemDismantleYield({
          baseRarity: baseContent.rarity,
          enhancementLevel,
          isSetPiece
        });
        const rulesFingerprint = buildItemDismantleRulesFingerprint({
          baseItemId,
          enhancementLevel,
          baseRarity: baseContent.rarity,
          isSetPiece,
          yield: yieldAmount
        });
        const payment = isMageClassForItemSelfUpgrade(character.classId) ? "mana" : "gold";
        const paymentAmount = payment === "mana" ? ITEM_DISMANTLE_MANA_COST : ITEM_DISMANTLE_GOLD_COST;
        const guard = buildItemDismantleGuard({
          characterId: character.id,
          remortCount,
          itemId: input.itemId,
          baseItemId,
          enhancementLevel,
          baseRarity: baseContent.rarity,
          isSetPiece,
          expectedQuantity: row.quantity,
          yield: yieldAmount,
          payment,
          paymentAmount,
          rulesFingerprint
        });
        if (
          row.quantity !== input.expectedQuantity ||
          yieldAmount !== input.expectedYield ||
          payment !== input.payment ||
          rulesFingerprint !== input.rulesFingerprint ||
          guard !== input.guard
        ) {
          return { state: "stale" };
        }

        const availableGold = character.gold;
        let availableMana = character.manaCurrent;
        if (payment === "mana") {
          const summary = summarizeCharacter(toCharacterRecord(character), {
            equippedItems: equipment.flatMap((entry) => {
              const item = findItem(entry.itemId);
              return item ? [item] : [];
            })
          });
          const regeneration = applyPassiveResourceRegeneration({
            resources: {
              hpCurrent: character.hpCurrent,
              hpMax: summary.hpMax,
              manaCurrent: character.manaCurrent,
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
            now: input.now
          });
          availableMana = regeneration.resources.manaCurrent;
          await tx.character.update({
            where: { id: character.id },
            data: {
              hpCurrent: regeneration.resources.hpCurrent,
              manaCurrent: regeneration.resources.manaCurrent,
              hpRegenAt: regeneration.resources.hpRegenAt,
              manaRegenAt: regeneration.resources.manaRegenAt
            }
          });
        }
        if (payment === "gold" && availableGold < paymentAmount) {
          return { state: "not-enough-gold", required: paymentAmount, available: availableGold };
        }
        if (payment === "mana" && availableMana < paymentAmount) {
          return { state: "not-enough-mana", required: paymentAmount, available: availableMana };
        }

        const receipt = await tx.dailyAction.create({
          data: {
            characterId: character.id,
            key: `${DISMANTLE_RECEIPT_KEY_PREFIX}${input.guard}`,
            localDate: DISMANTLE_RECEIPT_LOCAL_DATE,
            rewardXp: 0,
            rewardGold: 0,
            spentGold: payment === "gold" ? paymentAmount : 0,
            resultJson: {
              version: 1,
              rulesVersion: ITEM_DISMANTLE_RULES_VERSION,
              remortCount,
              itemId: input.itemId,
              baseItemId,
              enhancementLevel,
              baseRarity: baseContent.rarity,
              isSetPiece,
              quantityBefore: row.quantity,
              yield: yieldAmount,
              iskrokaminAfter: (sparkBefore?.quantity ?? 0) + yieldAmount,
              payment,
              paymentAmount,
              rulesFingerprint,
              guard: input.guard
            }
          }
        });
        const charged = await tx.character.updateMany({
          where: payment === "gold"
            ? { id: character.id, gold: { gte: paymentAmount } }
            : { id: character.id, manaCurrent: { gte: paymentAmount } },
          data: payment === "gold"
            ? { gold: { decrement: paymentAmount } }
            : { manaCurrent: { decrement: paymentAmount }, manaRegenAt: input.now }
        });
        const consumed = await tx.characterItem.updateMany({
          where: {
            characterId: character.id,
            itemId: input.itemId,
            quantity: row.quantity
          },
          data: { quantity: { decrement: 1 } }
        });
        if (charged.count !== 1 || consumed.count !== 1) throw new StaleSnapshotRollbackError();
        await tx.characterItem.deleteMany({
          where: { characterId: character.id, itemId: input.itemId, quantity: { lte: 0 } }
        });
        const spark = await tx.characterItem.upsert({
          where: { characterId_itemId: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID } },
          create: { characterId: character.id, itemId: ISKROKAMIN_ITEM_ID, quantity: yieldAmount },
          update: { quantity: { increment: yieldAmount } }
        });
        const updatedCharacter = await tx.character.findUniqueOrThrow({
          where: { id: character.id },
          include: characterInclude
        });
        return {
          state: "dismantled",
          character: toCharacterRecord(updatedCharacter),
          itemId: input.itemId,
          quantityBefore: row.quantity,
          yield: yieldAmount,
          payment,
          paymentAmount,
          iskrokaminAfter: spark.quantity,
          receiptId: receipt.id
        };
      });
    } catch (error) {
      if (error instanceof StaleSnapshotRollbackError) return { state: "stale" };
      if (error instanceof InventoryMutationContentionError) {
        return (await getDismantleReplay(this.prisma, telegramUserId, input)) ?? { state: "stale" };
      }
      if (!isUniqueConstraintError(error)) throw error;
      return (await getDismantleReplay(this.prisma, telegramUserId, input)) ?? { state: "stale" };
    }
  }

  async unlockForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<ItemUpgradeUnlockResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        const wrongPlace = getWrongPlaceResult(character);
        if (wrongPlace) {
          return wrongPlace;
        }

        const levelLocked = getLevelLockedResult(character);
        if (levelLocked) {
          return levelLocked;
        }

        const existing = await getUnlockAction(tx, character.id);
        if (existing) {
          return {
            state: "already-unlocked",
            character: toCharacterRecord(character),
            rewardXp: existing.rewardXp,
            itemGrants: readAppliedItemGrants(existing.resultJson),
            action: existing,
            levelChange: null
          };
        }

        const fieldKit = await tx.characterItem.findUnique({
          where: { characterId_itemId: { characterId: character.id, itemId: FIELD_KIT_ITEM_ID } }
        });
        if (!fieldKit || fieldKit.quantity <= 0) {
          return {
            state: "missing-field-kit",
            character: toCharacterRecord(character),
            fieldKitQuantity: fieldKit?.quantity ?? 0
          };
        }

        const rewardXp = getItemUpgradeUnlockRewardXp(character);
        const itemGrants = buildItemUpgradeUnlockItemGrants(toCharacterRecord(character));
        const action = await tx.dailyAction.create({
          data: {
            characterId: character.id,
            key: ITEM_UPGRADE_UNLOCK_KEY,
            localDate: ITEM_UPGRADE_UNLOCK_LOCAL_DATE,
            rewardXp,
            rewardGold: 0,
            spentGold: 0,
            resultJson: {
              kind: "item-upgrade-unlock",
              version: 1,
              spentItemId: FIELD_KIT_ITEM_ID,
              reward: {
                appliedItemGrants: serializeItemGrants(itemGrants)
              }
            },
            createdAt: now
          }
        });

        await consumeOneItem(tx, character.id, FIELD_KIT_ITEM_ID);
        for (const grant of itemGrants) {
          await grantItem(tx, character.id, grant.itemId, grant.quantity);
        }
        const rewarded = await tx.character.update({
          where: { id: character.id },
          data: { xp: { increment: rewardXp } }
        });
        const remortCount = getIncludedRemortCount(character);
        const rewardProgress = applyXpReward(character.xp, rewardXp, { remortCount });
        const oldLevel = Math.max(character.level, rewardProgress.oldLevel);
        const newLevel = Math.max(rewarded.level, getLevelForXp(rewarded.xp, { remortCount }));
        const updatedCharacter =
          newLevel === rewarded.level
            ? rewarded
            : await tx.character.update({
                where: { id: rewarded.id },
                data: { level: newLevel }
              });
        await recordLevelMilestones(tx, character.id, oldLevel, newLevel, undefined, { remortCount });
        await this.hpRecoveryProducer.record(tx, character.id, now, "recovering");

        return {
          state: "unlocked",
          character: toCharacterRecord({
            ...updatedCharacter,
            user: character.user,
            ...(character._count ? { _count: character._count } : {})
          }),
          rewardXp,
          itemGrants,
          action,
          levelChange: {
            oldLevel,
            newLevel,
            leveledUp: newLevel > oldLevel
          }
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const character = await this.prisma.character.findFirst({
          where: { user: { telegramUserId } },
          include: characterInclude
        });
        const existing = character ? await getUnlockAction(this.prisma, character.id) : null;

        return character && existing
          ? {
              state: "already-unlocked",
              character: toCharacterRecord(character),
              rewardXp: existing.rewardXp,
              itemGrants: readAppliedItemGrants(existing.resultJson),
              action: existing,
              levelChange: null
            }
          : { state: "no-character" };
      }

      throw error;
    }
  }
}

async function getUpgradeGateResult(
  tx: TxClient,
  character: Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } }
): Promise<
  | Extract<ItemUpgradeAttemptResult, { state: "wrong-place" | "level-locked" | "unlock-required" }>
  | null
> {
  const wrongPlace = getWrongPlaceResult(character);
  if (wrongPlace) {
    return wrongPlace;
  }

  const levelLocked = getLevelLockedResult(character);
  if (levelLocked) {
    return levelLocked;
  }

  if (await getUnlockAction(tx, character.id)) {
    return null;
  }

  const fieldKit = await tx.characterItem.findUnique({
    where: { characterId_itemId: { characterId: character.id, itemId: FIELD_KIT_ITEM_ID } },
    select: { quantity: true }
  });

  return {
    state: "unlock-required",
    character: toCharacterRecord(character),
    fieldKitQuantity: fieldKit?.quantity ?? 0
  };
}

function getWrongPlaceResult(
  character: Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } }
): Extract<ItemUpgradeAttemptResult, { state: "wrong-place" }> | null {
  return character.user.lastSeenLocationId === ITEM_UPGRADE_LOCATION_ID
    ? null
    : { state: "wrong-place", character: toCharacterRecord(character) };
}

function getLevelLockedResult(
  character: Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } }
): Extract<ItemUpgradeAttemptResult, { state: "level-locked" }> | null {
  return canAccessItemUpgrades(toCharacterRecord(character))
    ? null
    : {
        state: "level-locked",
        character: toCharacterRecord(character),
        requiredLevel: getItemUpgradeRequiredLevel(toCharacterRecord(character))
      };
}

function buildItemUpgradeUnlockItemGrants(character: CharacterRecord): ItemGrant[] {
  const bonus = buildQuestIskrokaminBonusGrant({
    characterId: character.id,
    characterLevel: character.level,
    sourceIdentity: `${ITEM_UPGRADE_UNLOCK_KEY}:${ITEM_UPGRADE_UNLOCK_LOCAL_DATE}`
  });

  return bonus ? [bonus] : [];
}

function readAppliedItemGrants(value: unknown): ItemGrant[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const reward = (value as { reward?: unknown }).reward;
  if (!reward || typeof reward !== "object" || Array.isArray(reward)) {
    return [];
  }

  const grants = (reward as { appliedItemGrants?: unknown }).appliedItemGrants;
  if (!Array.isArray(grants)) {
    return [];
  }

  return grants.flatMap((grant) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) {
      return [];
    }

    const itemId = (grant as { itemId?: unknown }).itemId;
    const quantity = (grant as { quantity?: unknown }).quantity;

    return typeof itemId === "string" && typeof quantity === "number"
      ? [{ itemId, quantity }]
      : [];
  });
}

function serializeItemGrants(itemGrants: readonly ItemGrant[]): Array<{ itemId: string; quantity: number }> {
  return itemGrants.map((grant) => ({
    itemId: grant.itemId,
    quantity: grant.quantity
  }));
}

async function getUnlockAction(
  tx: Pick<TxClient, "dailyAction"> | Pick<PrismaClient, "dailyAction">,
  characterId: string
): Promise<DailyAction | null> {
  return tx.dailyAction.findUnique({
    where: {
      characterId_key_localDate: {
        characterId,
        key: ITEM_UPGRADE_UNLOCK_KEY,
        localDate: ITEM_UPGRADE_UNLOCK_LOCAL_DATE
      }
    }
  });
}

async function consumeOneItem(tx: TxClient, characterId: string, itemId: string): Promise<void> {
  const consumed = await tx.characterItem.updateMany({
    where: { characterId, itemId, quantity: { gte: 1 } },
    data: { quantity: { decrement: 1 } }
  });
  if (consumed.count !== 1) {
    throw new Error(`Item upgrade unlock source row disappeared: ${itemId}`);
  }

  await tx.characterItem.deleteMany({ where: { characterId, itemId, quantity: { lte: 0 } } });
}

async function grantItem(tx: TxClient, characterId: string, itemId: string, quantity: number): Promise<void> {
  const grantQuantity = Math.max(0, Math.floor(quantity));

  if (grantQuantity <= 0) {
    return;
  }

  await tx.characterItem.upsert({
    where: { characterId_itemId: { characterId, itemId } },
    create: { characterId, itemId, quantity: grantQuantity },
    update: { quantity: { increment: grantQuantity } }
  });
}

async function replaceOneItemId(tx: TxClient, characterId: string, fromItemId: string, toItemId: string): Promise<void> {
  const removed = await tx.characterItem.updateMany({
    where: { characterId, itemId: fromItemId, quantity: { gte: 1 } },
    data: { quantity: { decrement: 1 } }
  });
  if (removed.count !== 1) {
    throw new Error(`Item upgrade source row disappeared: ${fromItemId}`);
  }

  await tx.characterItem.upsert({
    where: { characterId_itemId: { characterId, itemId: toItemId } },
    create: { characterId, itemId: toItemId, quantity: 1 },
    update: { quantity: { increment: 1 } }
  });
  await tx.characterEquipment.updateMany({
    where: { characterId, itemId: fromItemId },
    data: { itemId: toItemId }
  });
}

function isValidDonor(
  base: { itemId: string; quantity: number },
  donor: { itemId: string; quantity: number },
  baseItemId: string,
  donorItemId: string
): boolean {
  if (donorItemId === baseItemId && base.quantity < 2) {
    return false;
  }

  const baseContent = findItem(base.itemId);
  const donorContent = findItem(donor.itemId);
  const baseSet = getMantokSetForItem(baseItemId);
  const donorSet = getMantokSetForItem(donorItemId);

  return Boolean(baseContent && donorContent && getDonorBonus({
    baseItem: baseContent,
    baseItemId,
    baseSetId: baseSet?.id ?? null,
    donorItem: donorContent,
    donorItemId,
    donorSetId: donorSet?.id ?? null
  }));
}

function findItem(itemId: string) {
  return items.find((item) => item.id === itemId) ?? null;
}

function toInventoryRow(
  row: { id: string; characterId: string; itemId: string; quantity: number; createdAt?: Date },
  equippedItemIds: ReadonlySet<string>
): ItemUpgradeInventoryRow {
  return {
    id: row.id,
    characterId: row.characterId,
    itemId: row.itemId,
    quantity: row.quantity,
    equipped: equippedItemIds.has(row.itemId),
    ...(row.createdAt ? { createdAt: row.createdAt } : {})
  };
}

async function getPityFailureCount(
  tx: TxClient,
  characterId: string,
  itemId: string,
  targetLevel: number
): Promise<number> {
  const row = await tx.dailyAction.findUnique({
    where: {
      characterId_key_localDate: {
        characterId,
        key: pityKey(itemId, targetLevel),
        localDate: PITY_LOCAL_DATE
      }
    }
  });

  return mapPity(row).at(0)?.failureCount ?? 0;
}

async function setPity(
  tx: TxClient,
  characterId: string,
  itemId: string,
  targetLevel: number,
  failureCount: number,
  now: Date
): Promise<void> {
  await tx.dailyAction.upsert({
    where: {
      characterId_key_localDate: {
        characterId,
        key: pityKey(itemId, targetLevel),
        localDate: PITY_LOCAL_DATE
      }
    },
    create: {
      characterId,
      key: pityKey(itemId, targetLevel),
      localDate: PITY_LOCAL_DATE,
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 0,
      resultJson: {
        kind: PITY_KIND,
        itemId,
        targetLevel,
        failureCount,
        lastFailureAt: now.toISOString()
      }
    },
    update: {
      resultJson: {
        kind: PITY_KIND,
        itemId,
        targetLevel,
        failureCount,
        lastFailureAt: now.toISOString()
      }
    }
  });
}

async function clearPity(tx: TxClient, characterId: string, itemId: string, targetLevel: number): Promise<void> {
  await tx.dailyAction.deleteMany({
    where: { characterId, key: pityKey(itemId, targetLevel), localDate: PITY_LOCAL_DATE }
  });
}

async function createAttemptClaim(
  tx: TxClient,
  characterId: string,
  input: {
    itemId: string;
    fromLevel: number;
    targetLevel: number;
    attemptGuard: string;
    expectedQuantity: number;
    expectedPityFailures: number;
    now: Date;
  }
): Promise<void> {
  await tx.dailyAction.create({
    data: {
      characterId,
      key: attemptClaimKey(input.itemId, input.fromLevel, input.targetLevel),
      localDate: input.attemptGuard,
      rewardXp: 0,
      rewardGold: 0,
      spentGold: 0,
      createdAt: input.now,
      resultJson: {
        kind: ATTEMPT_CLAIM_KIND,
        version: 1,
        itemId: input.itemId,
        fromLevel: input.fromLevel,
        targetLevel: input.targetLevel,
        attemptGuard: input.attemptGuard,
        expectedQuantity: input.expectedQuantity,
        expectedPityFailures: input.expectedPityFailures,
        claimedAt: input.now.toISOString()
      }
    }
  });
}

function pityKey(itemId: string, targetLevel: number): string {
  return `${PITY_KEY_PREFIX}${itemId}:${normalizeItemUpgradeLevel(targetLevel)}`;
}

function attemptClaimKey(itemId: string, fromLevel: number, targetLevel: number): string {
  return `${ATTEMPT_CLAIM_KEY_PREFIX}${itemId}:${normalizeItemUpgradeLevel(fromLevel)}->${normalizeItemUpgradeLevel(targetLevel)}`;
}

async function getStaleSnapshotResult(
  prisma: PrismaClient,
  telegramUserId: bigint,
  itemId: string
): Promise<Extract<ItemUpgradeAttemptResult, { state: "stale-snapshot" }>> {
  const character = await findCharacter(prisma, telegramUserId);
  if (!character) {
    return { state: "stale-snapshot" };
  }

  const [item, equipment] = await Promise.all([
    prisma.characterItem.findUnique({
      where: { characterId_itemId: { characterId: character.id, itemId } }
    }),
    prisma.characterEquipment.findMany({ where: { characterId: character.id }, select: { itemId: true } })
  ]);

  return {
    state: "stale-snapshot",
    ...(item ? { item: toInventoryRow(item, new Set(equipment.map((row) => row.itemId))) } : {})
  };
}

function mapPity(row: Pick<DailyAction, "key" | "resultJson"> | null): Array<{
  itemId: string;
  targetLevel: number;
  failureCount: number;
}> {
  if (!row || !row.key.startsWith(PITY_KEY_PREFIX) || !isRecord(row.resultJson)) {
    return [];
  }

  return row.resultJson.kind === PITY_KIND &&
    typeof row.resultJson.itemId === "string" &&
    typeof row.resultJson.targetLevel === "number" &&
    typeof row.resultJson.failureCount === "number"
    ? [{
        itemId: row.resultJson.itemId,
        targetLevel: normalizeItemUpgradeLevel(row.resultJson.targetLevel),
        failureCount: Math.max(0, Math.floor(row.resultJson.failureCount))
      }]
    : [];
}

function parseDismantleReceipt(
  row: DailyAction | null,
  character: Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } },
  input: ItemDismantleConfirmInput
): (ItemDismantleConfirmResult & { state: "replayed" }) | null {
  if (!row || !isRecord(row.resultJson)) return null;
  const value = row.resultJson;
  const baseRarity = value.baseRarity;
  if (
    row.key !== `${DISMANTLE_RECEIPT_KEY_PREFIX}${input.guard}` ||
    row.localDate !== DISMANTLE_RECEIPT_LOCAL_DATE ||
    value.version !== 1 ||
    value.rulesVersion !== ITEM_DISMANTLE_RULES_VERSION ||
    !Number.isInteger(value.remortCount) ||
    typeof value.itemId !== "string" ||
    typeof value.baseItemId !== "string" ||
    !Number.isInteger(value.enhancementLevel) ||
    !isItemDismantleRarity(baseRarity) ||
    typeof value.isSetPiece !== "boolean" ||
    !Number.isInteger(value.quantityBefore) ||
    !Number.isInteger(value.yield) ||
    (value.payment !== "gold" && value.payment !== "mana") ||
    !Number.isInteger(value.paymentAmount) ||
    !Number.isInteger(value.iskrokaminAfter) ||
    typeof value.rulesFingerprint !== "string" ||
    typeof value.guard !== "string" ||
    Number(value.remortCount) !== getIncludedRemortCount(character) ||
    Number(value.remortCount) !== input.expectedRemortCount ||
    value.itemId !== input.itemId ||
    Number(value.quantityBefore) !== input.expectedQuantity ||
    Number(value.yield) !== input.expectedYield ||
    value.payment !== input.payment ||
    value.rulesFingerprint !== input.rulesFingerprint ||
    value.guard !== input.guard
  ) {
    return null;
  }
  const expectedPaymentAmount = value.payment === "mana"
    ? ITEM_DISMANTLE_MANA_COST
    : ITEM_DISMANTLE_GOLD_COST;
  const rulesFingerprint = buildItemDismantleRulesFingerprint({
    baseItemId: value.baseItemId,
    enhancementLevel: Number(value.enhancementLevel),
    baseRarity,
    isSetPiece: value.isSetPiece,
    yield: Number(value.yield)
  });
  const guard = buildItemDismantleGuard({
    characterId: character.id,
    remortCount: Number(value.remortCount),
    itemId: value.itemId,
    baseItemId: value.baseItemId,
    enhancementLevel: Number(value.enhancementLevel),
    baseRarity,
    isSetPiece: value.isSetPiece,
    expectedQuantity: Number(value.quantityBefore),
    yield: Number(value.yield),
    payment: value.payment,
    paymentAmount: Number(value.paymentAmount),
    rulesFingerprint: value.rulesFingerprint
  });
  if (
    Number(value.remortCount) < 0 ||
    Number(value.enhancementLevel) !== normalizeItemUpgradeLevel(Number(value.enhancementLevel)) ||
    Number(value.quantityBefore) <= 0 ||
    Number(value.yield) <= 0 ||
    Number(value.paymentAmount) !== expectedPaymentAmount ||
    Number(value.iskrokaminAfter) < Number(value.yield) ||
    row.rewardXp !== 0 ||
    row.rewardGold !== 0 ||
    row.spentGold !== (value.payment === "gold" ? expectedPaymentAmount : 0) ||
    rulesFingerprint !== value.rulesFingerprint ||
    guard !== value.guard
  ) {
    return null;
  }
  return {
    state: "replayed",
    character: toCharacterRecord(character),
    itemId: value.itemId,
    quantityBefore: Number(value.quantityBefore),
    yield: Number(value.yield),
    payment: value.payment,
    paymentAmount: Number(value.paymentAmount),
    iskrokaminAfter: Number(value.iskrokaminAfter),
    receiptId: row.id
  };
}

async function getDismantleReplay(
  prisma: PrismaClient,
  telegramUserId: bigint,
  input: ItemDismantleConfirmInput
): Promise<(ItemDismantleConfirmResult & { state: "replayed" }) | null> {
  const character = await findCharacter(prisma, telegramUserId);
  if (!character || getIncludedRemortCount(character) !== input.expectedRemortCount) return null;
  const row = await prisma.dailyAction.findUnique({
    where: {
      characterId_key_localDate: {
        characterId: character.id,
        key: `${DISMANTLE_RECEIPT_KEY_PREFIX}${input.guard}`,
        localDate: DISMANTLE_RECEIPT_LOCAL_DATE
      }
    }
  });
  return parseDismantleReceipt(row, character, input);
}

function isItemDismantleRarity(value: unknown): value is "common" | "uncommon" | "rare" | "epic" | "legendary" {
  return value === "common" || value === "uncommon" || value === "rare" || value === "epic" || value === "legendary";
}

const characterInclude = {
  _count: {
    select: {
      remorts: true
    }
  },
  user: {
    select: {
      lastSeenLocationId: true
    }
  }
} satisfies Prisma.CharacterInclude;

async function findCharacter(
  tx: Pick<TxClient, "character"> | Pick<PrismaClient, "character">,
  telegramUserId: bigint
): Promise<(Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } }) | null> {
  return tx.character.findFirst({
    where: { user: { telegramUserId } },
    include: characterInclude
  });
}

function toCharacterRecord(
  character: Character & { user: { lastSeenLocationId: string | null }; _count?: { remorts?: number } }
): CharacterRecord {
  const { user, ...record } = character;
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(character)
  };
}

function parseStats(value: unknown) {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

  return {
    strength: numberOrZero(record.strength),
    dexterity: numberOrZero(record.dexterity),
    intelligence: numberOrZero(record.intelligence),
    charisma: numberOrZero(record.charisma),
    luck: numberOrZero(record.luck)
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAttemptGuard(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{8}$/.test(value));
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

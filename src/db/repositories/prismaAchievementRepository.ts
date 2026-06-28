import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AchievementRecalculationSnapshot,
  AchievementRepository,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterAchievementSnapshot,
  CharacterCosmeticTitleGrantRecord,
  UnlockAchievementInput,
  UnlockAchievementResult
} from "./achievementRepository";

const PROBLEM_QUEST_REWARD_KEYS = [
  "quest.thirteen-small-problems",
  "quest.problem-chain.23.reward",
  "quest.problem-chain.42.reward",
  "quest.problem-chain.93.reward"
] as const;

const MIMIC_SHAWARMA_ADVENTURE_KEY = "adventure.mimic-shawarma";
const MIMIC_SHAWARMA_COMBAT_PROBE_KEY = "combat.mimic-shawarma.probe";
const CELLAR_MOUSE_ERRAND_KEY = "cellar.mouse-errand";
const YEGER_UNQUIET_TRIAL_COMPLETED_KEY = "quest.yeger.unquiet-trial.completed";
const LEVEL_MILESTONE_KEY_PATTERN = /^milestone\.(?:remort\.\d+\.)?level\.(\d+)$/u;
const TRAINING_DOPPELGANGER_MONSTER_ID = "monster.training-doppelganger";
const YEGER_RANGER_FREE_BANDAGE_KEY = "yeger.bandage.supply.ranger-free";
const BANDAGE_ITEM_ID = "item.responsible-panic-bandage";

export class PrismaAchievementRepository implements AchievementRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForCharacter(characterId: string): Promise<CharacterAchievementSnapshot> {
    const [achievements, progress, titleGrants] = await Promise.all([
      this.prisma.characterAchievement.findMany({
        where: { characterId },
        orderBy: [{ unlockedAt: "asc" }, { achievementId: "asc" }]
      }),
      this.prisma.characterAchievementProgress.findMany({
        where: { characterId },
        orderBy: [{ achievementId: "asc" }]
      }),
      this.prisma.characterCosmeticTitleGrant.findMany({
        where: { characterId },
        orderBy: [{ grantedAt: "asc" }, { titleGrantId: "asc" }]
      })
    ]);

    return {
      achievements: achievements.map(toAchievementRecord),
      progress: progress.map(toProgressRecord),
      titleGrants: titleGrants.map(toTitleGrantRecord)
    };
  }

  async getRecalculationSnapshot(characterId: string): Promise<AchievementRecalculationSnapshot | null> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        level: true,
        raceId: true,
        classId: true,
        createdAt: true
      }
    });

    if (!character) {
      return null;
    }

    const [
      won,
      lost,
      fled,
      expired,
      combatSessions,
      completedProblemQuestStages,
      problemQuestActions,
      levelMilestoneActions,
      remorts,
      selectedDailyActions,
      inventory,
      equipment,
      equippedItemCount,
      completedChestRuns,
      completedLevelBarters,
      completedTrainingSessions,
      resolvedQuickDuels,
      resolvedTurnBasedDuels,
      duelDefendActions,
      claimedBarrelRaids,
      korchmaRounds,
      completedGiftsSent,
      completedGiftsReceived,
      completedMantokSales,
      completedBardPerformances,
      yegerFreeBandages,
      completedItemUseOrders,
      completedSelfDrinkOrders,
      acceptedRoundDrinks,
      resolvedPassageSearches,
      completedHuntContracts,
      completedAdventureChoices
    ] = await Promise.all([
      this.prisma.soloCombatSession.count({ where: { characterId, status: "won" } }),
      this.prisma.soloCombatSession.count({ where: { characterId, status: "lost" } }),
      this.prisma.soloCombatSession.count({ where: { characterId, status: "fled" } }),
      this.prisma.soloCombatSession.count({ where: { characterId, status: "expired" } }),
      this.prisma.soloCombatSession.findMany({
        where: {
          characterId,
          status: { in: ["won", "lost", "fled", "expired"] }
        },
        select: {
          monsterId: true,
          status: true,
          rewardGold: true,
          rewardItemsJson: true,
          rewardClaimedAt: true,
          stateJson: true,
          updatedAt: true
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.dailyAction.count({
        where: {
          characterId,
          key: { in: [...PROBLEM_QUEST_REWARD_KEYS] }
        }
      }),
      this.prisma.dailyAction.findMany({
        where: {
          characterId,
          key: { in: [...PROBLEM_QUEST_REWARD_KEYS] }
        },
        select: {
          createdAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.dailyAction.findMany({
        where: {
          characterId,
          OR: [
            { key: { startsWith: "milestone.level." } },
            { key: { startsWith: "milestone.remort." } }
          ]
        },
        select: {
          key: true,
          createdAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.characterRemort.findMany({
        where: { characterId },
        select: { createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.dailyAction.findMany({
        where: {
          characterId,
          key: {
            in: [
              MIMIC_SHAWARMA_ADVENTURE_KEY,
              MIMIC_SHAWARMA_COMBAT_PROBE_KEY,
              CELLAR_MOUSE_ERRAND_KEY,
              YEGER_UNQUIET_TRIAL_COMPLETED_KEY
            ]
          }
        },
        select: { key: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.characterItem.findMany({
        where: { characterId },
        select: {
          itemId: true,
          quantity: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      this.prisma.characterEquipment.findMany({
        where: { characterId },
        select: {
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.characterEquipment.count({ where: { characterId } }),
      this.prisma.mantokChestRun.findMany({
        where: { characterId, status: "completed" },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.levelBarterExchange.findMany({
        where: { characterId, status: "completed" },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.soloCombatSession.findMany({
        where: {
          characterId,
          monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
          status: { in: ["won", "lost", "fled", "expired"] }
        },
        select: { rewardClaimedAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.duelChallenge.findMany({
        where: {
          mode: "quick",
          status: "resolved",
          OR: [
            { challengerCharacterId: characterId },
            { targetCharacterId: characterId }
          ]
        },
        select: { resultJson: true, resolvedAt: true, updatedAt: true },
        orderBy: [{ resolvedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.duelChallenge.findMany({
        where: {
          mode: "turnbased",
          status: "resolved",
          OR: [
            { challengerCharacterId: characterId },
            { targetCharacterId: characterId }
          ]
        },
        select: { resultJson: true, resolvedAt: true, updatedAt: true },
        orderBy: [{ resolvedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.duelCombatAction.findMany({
        where: {
          actorCharacterId: characterId,
          actionKey: "defend"
        },
        select: { createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.barrelRaidNotification.findMany({
        where: {
          characterId,
          rewardClaimedAt: { not: null }
        },
        select: { rewardClaimedAt: true, updatedAt: true },
        orderBy: [{ rewardClaimedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.korchmaRoundPurchase.findMany({
        where: { characterId },
        select: { createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.itemTransfer.findMany({
        where: {
          senderCharacterId: characterId,
          status: "completed"
        },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.itemTransfer.findMany({
        where: {
          receiverCharacterId: characterId,
          status: "completed"
        },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.korchmaMantokSale.findMany({
        where: { characterId, status: "completed" },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.bardPerformance.findMany({
        where: { characterId, status: "completed" },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.characterCooldown.findMany({
        where: { characterId, key: YEGER_RANGER_FREE_BANDAGE_KEY },
        select: { updatedAt: true }
      }),
      this.prisma.itemUseOrder.findMany({
        where: { characterId, status: "completed" },
        select: { itemId: true, completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.korchmaDrinkOrder.findMany({
        where: { characterId, status: "completed" },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.korchmaRoundRecipient.findMany({
        where: { characterId, status: "accepted" },
        select: { respondedAt: true, updatedAt: true },
        orderBy: [{ respondedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.passageSearchAction.findMany({
        where: { characterId, status: "resolved" },
        select: { nodeKey: true, resultJson: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.huntContract.findMany({
        where: { characterId, status: "completed" },
        select: { completedAt: true, updatedAt: true },
        orderBy: [{ completedAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }]
      }),
      this.prisma.dailyAction.findMany({
        where: { characterId, key: "adventure.choice-mvp" },
        select: { resultJson: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      })
    ]);

    const inventoryRows = Object.fromEntries(
      inventory.map((row) => [
        row.itemId,
        {
          quantity: row.quantity,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }
      ])
    );
    const equipmentObservedAt = maxDate(equipment.map((row) => row.updatedAt));
    const itemUseDates = completedItemUseOrders.map((row) => row.completedAt ?? row.updatedAt);
    const bandageUseDates = completedItemUseOrders
      .filter((row) => row.itemId === BANDAGE_ITEM_ID)
      .map((row) => row.completedAt ?? row.updatedAt);
    const completedPassageSearchDates = resolvedPassageSearches.map((row) => row.updatedAt);
    const selectedDailyActionDates = groupDailyActionDatesByKey(selectedDailyActions);
    const persistentCombatSessions = combatSessions.filter((row) => row.monsterId !== TRAINING_DOPPELGANGER_MONSTER_ID);
    const resolvedDuelDates = [
      ...resolvedQuickDuels.map((row) => row.resolvedAt ?? row.updatedAt),
      ...resolvedTurnBasedDuels.map((row) => row.resolvedAt ?? row.updatedAt)
    ].sort(compareDates);
    const wonDuelDates = [
      ...resolvedQuickDuels,
      ...resolvedTurnBasedDuels
    ]
      .filter((row) => getDuelWinnerCharacterId(row.resultJson) === characterId)
      .map((row) => row.resolvedAt ?? row.updatedAt)
      .sort(compareDates);
    const threatEscalationDates = combatSessions
      .filter((row) => hasCombatThreat(row.stateJson))
      .map((row) => row.rewardClaimedAt ?? row.updatedAt);
    const activityDates = {
      "remort.completed": remorts.map((row) => row.createdAt),
      "starter.mimic-shawarma.completed": selectedDailyActionDates[MIMIC_SHAWARMA_ADVENTURE_KEY] ?? [],
      "starter.mimic-shawarma.probe.completed": selectedDailyActionDates[MIMIC_SHAWARMA_COMBAT_PROBE_KEY] ?? [],
      "cellar.mouse.completed": selectedDailyActionDates[CELLAR_MOUSE_ERRAND_KEY] ?? [],
      "yeger.trial.completed": selectedDailyActionDates[YEGER_UNQUIET_TRIAL_COMPLETED_KEY] ?? [],
      "mantok.chest.completed": completedChestRuns.map((row) => row.completedAt ?? row.updatedAt),
      "level.barter.completed": completedLevelBarters.map((row) => row.completedAt ?? row.updatedAt),
      "training.doppelganger.finished": completedTrainingSessions.map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "training.doppelganger.won": combatSessions
        .filter((row) => row.monsterId === TRAINING_DOPPELGANGER_MONSTER_ID && row.status === "won")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.won": persistentCombatSessions
        .filter((row) => row.status === "won")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.lost": persistentCombatSessions
        .filter((row) => row.status === "lost")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.fled": persistentCombatSessions
        .filter((row) => row.status === "fled")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.expired": persistentCombatSessions
        .filter((row) => row.status === "expired")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.hard-win": persistentCombatSessions
        .filter((row) => row.status === "won" && isHardPassageWin(row.stateJson))
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.adventure-origin-win": persistentCombatSessions
        .filter((row) => row.status === "won" && getCombatSource(row.stateJson) === "adventure")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.yeger-origin-win": persistentCombatSessions
        .filter((row) => row.status === "won" && getCombatSource(row.stateJson) === "yeger")
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.low-hp-win": persistentCombatSessions
        .filter((row) => row.status === "won" && isLowHpWin(row.stateJson))
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "combat.persistent.zero-gold-item-win": persistentCombatSessions
        .filter((row) => row.status === "won" && isZeroGoldItemWin(row.rewardGold, row.rewardItemsJson))
        .map((row) => row.rewardClaimedAt ?? row.updatedAt),
      "duel.resolved": resolvedDuelDates,
      "duel.won": wonDuelDates,
      "duel.turnbased.defend": duelDefendActions.map((row) => row.createdAt),
      "duel.quick.resolved": resolvedQuickDuels.map((row) => row.resolvedAt ?? row.updatedAt),
      "duel.turnbased.resolved": resolvedTurnBasedDuels.map((row) => row.resolvedAt ?? row.updatedAt),
      "barrel.raid.claimed": claimedBarrelRaids.flatMap((row) => row.rewardClaimedAt ? [row.rewardClaimedAt] : [row.updatedAt]),
      "korchma.round.purchased": korchmaRounds.map((row) => row.createdAt),
      "item.gift.sent": completedGiftsSent.map((row) => row.completedAt ?? row.updatedAt),
      "item.gift.received": completedGiftsReceived.map((row) => row.completedAt ?? row.updatedAt),
      "mantok.sale.completed": completedMantokSales.map((row) => row.completedAt ?? row.updatedAt),
      "bard.performance.completed": completedBardPerformances.map((row) => row.completedAt ?? row.updatedAt),
      "yeger.free-bandage.claimed": yegerFreeBandages.map((row) => row.updatedAt),
      "item.used": itemUseDates,
      [`item.used:${BANDAGE_ITEM_ID}`]: bandageUseDates,
      "shynok.drink.activated": [
        ...completedSelfDrinkOrders.map((row) => row.completedAt ?? row.updatedAt),
        ...acceptedRoundDrinks.map((row) => row.respondedAt ?? row.updatedAt)
      ].sort(compareDates),
      "passage.search.completed": completedPassageSearchDates,
      "passage.search.monster-attack": resolvedPassageSearches
        .filter((row) => getPassageSearchOutcome(row.resultJson) === "monster-attack")
        .map((row) => row.updatedAt),
      "passage.search.unique-nodes": getFirstPassageSearchDatesByNode(resolvedPassageSearches),
      "hunt.contract.completed": completedHuntContracts.map((row) => row.completedAt ?? row.updatedAt),
      "adventure.choice.completed": completedAdventureChoices.map((row) => row.createdAt),
      "adventure.choice.strong-success": completedAdventureChoices
        .filter((row) => isAdventureChoiceStrongSuccess(row.resultJson))
        .map((row) => row.createdAt),
      "adventure.choice.complication": completedAdventureChoices
        .filter((row) => isAdventureChoiceComplication(row.resultJson))
        .map((row) => row.createdAt),
      "combat.threat-escalated": threatEscalationDates,
      "combat.threat-pressure": combatSessions
        .filter((row) => hasCombatThreatPressure(row.stateJson))
        .map((row) => row.rewardClaimedAt ?? row.updatedAt)
    };

    return {
      characterId: character.id,
      level: character.level,
      raceId: character.raceId,
      classId: character.classId,
      createdAt: character.createdAt,
      levelReachedAt: getLevelReachedAt(levelMilestoneActions),
      combat: {
        won,
        lost,
        fled,
        expired
      },
      combatFinishedAt: getCombatFinishedAt(combatSessions),
      completedProblemQuestStages,
      problemQuestCompletedAt: problemQuestActions.map((row) => row.createdAt),
      inventoryItemQuantity: inventory.reduce((sum, row) => sum + row.quantity, 0),
      inventoryItemQuantities: Object.fromEntries(inventory.map((row) => [row.itemId, row.quantity])),
      inventoryItemRows: inventoryRows,
      firstInventoryItemReceivedAt: minDate(inventory.map((row) => row.createdAt)),
      inventoryObservedAt: maxDate(inventory.map((row) => row.updatedAt)),
      equippedItemCount,
      firstEquippedItemAt: equipment[0]?.createdAt ?? null,
      equipmentObservedAt,
      activityDates
    };
  }

  async unlockAchievement(input: UnlockAchievementInput): Promise<UnlockAchievementResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.characterAchievement.findUnique({
        where: {
          characterId_achievementId: {
            characterId: input.characterId,
            achievementId: input.achievementId
          }
        }
      });

      if (existing) {
        return {
          created: false,
          achievement: toAchievementRecord(existing),
          titleGrant: input.cosmeticTitleGrantId
            ? await findTitleGrant(tx, input.characterId, input.cosmeticTitleGrantId)
            : null
        };
      }

      const achievement = await tx.characterAchievement.create({
        data: {
          characterId: input.characterId,
          achievementId: input.achievementId,
          sourceType: input.source.type,
          sourceId: input.source.id ?? null,
          ...(input.source.payload === undefined
            ? {}
            : { sourceJson: normalizeSourceJson(input.source.payload) }),
          unlockedAt: input.source.occurredAt
        }
      });

      const titleGrant = input.cosmeticTitleGrantId
        ? await tx.characterCosmeticTitleGrant.upsert({
            where: {
              characterId_titleGrantId: {
                characterId: input.characterId,
                titleGrantId: input.cosmeticTitleGrantId
              }
            },
            create: {
              characterId: input.characterId,
              titleGrantId: input.cosmeticTitleGrantId,
              achievementId: input.achievementId,
              sourceType: input.source.type,
              sourceId: input.source.id ?? null,
              grantedAt: input.source.occurredAt
            },
            update: {}
          })
        : null;

      return {
        created: true,
        achievement: toAchievementRecord(achievement),
        titleGrant: titleGrant ? toTitleGrantRecord(titleGrant) : null
      };
    });
  }

  async updateProgressMax(input: {
    characterId: string;
    achievementId: string;
    current: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord> {
    const current = Math.max(0, Math.floor(input.current));
    const existing = await this.prisma.characterAchievementProgress.findUnique({
      where: {
        characterId_achievementId: {
          characterId: input.characterId,
          achievementId: input.achievementId
        }
      }
    });

    if (existing && existing.current >= current) {
      return toProgressRecord(existing);
    }

    const row = await this.prisma.characterAchievementProgress.upsert({
      where: {
        characterId_achievementId: {
          characterId: input.characterId,
          achievementId: input.achievementId
        }
      },
      create: {
        characterId: input.characterId,
        achievementId: input.achievementId,
        current,
        target: input.target ?? null
      },
      update: {
        current,
        target: input.target ?? existing?.target ?? null
      }
    });

    return toProgressRecord(row);
  }
}

async function findTitleGrant(
  tx: Prisma.TransactionClient,
  characterId: string,
  titleGrantId: string
): Promise<CharacterCosmeticTitleGrantRecord | null> {
  const row = await tx.characterCosmeticTitleGrant.findUnique({
    where: {
      characterId_titleGrantId: {
        characterId,
        titleGrantId
      }
    }
  });

  return row ? toTitleGrantRecord(row) : null;
}

function normalizeSourceJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function getLevelReachedAt(
  rows: readonly { key: string; createdAt: Date }[]
): Record<number, Date> {
  const reachedAt: Record<number, Date> = {};

  for (const row of rows) {
    const level = Number(row.key.match(LEVEL_MILESTONE_KEY_PATTERN)?.[1]);
    if (!Number.isInteger(level) || level < 2) {
      continue;
    }

    const previous = reachedAt[level];
    if (!previous || row.createdAt < previous) {
      reachedAt[level] = row.createdAt;
    }
  }

  return reachedAt;
}

function getCombatFinishedAt(
  rows: readonly { status: string; rewardClaimedAt: Date | null; updatedAt: Date }[]
): AchievementRecalculationSnapshot["combatFinishedAt"] {
  const result: AchievementRecalculationSnapshot["combatFinishedAt"] = {
    won: [],
    lost: [],
    fled: [],
    expired: []
  };

  for (const row of rows) {
    if (row.status !== "won" && row.status !== "lost" && row.status !== "fled" && row.status !== "expired") {
      continue;
    }

    result[row.status].push(row.rewardClaimedAt ?? row.updatedAt);
  }

  for (const dates of Object.values(result)) {
    dates.sort((left, right) => left.getTime() - right.getTime());
  }

  return result;
}

function minDate(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>((earliest, date) =>
    !earliest || date < earliest ? date : earliest, null);
}

function maxDate(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>((latest, date) =>
    !latest || date > latest ? date : latest, null);
}

function compareDates(left: Date, right: Date): number {
  return left.getTime() - right.getTime();
}

function getPassageSearchOutcome(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const outcome = (value as Record<string, unknown>).outcome;
  return typeof outcome === "string" ? outcome : null;
}

function isAdventureChoiceComplication(value: Prisma.JsonValue | null): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const grade = (value as Record<string, unknown>).grade;
  return grade === "complication";
}

function isAdventureChoiceStrongSuccess(value: Prisma.JsonValue | null): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const grade = (value as Record<string, unknown>).grade;
  return grade === "strong-success";
}

function groupDailyActionDatesByKey(
  rows: readonly { key: string; createdAt: Date }[]
): Record<string, Date[]> {
  const result: Record<string, Date[]> = {};

  for (const row of rows) {
    result[row.key] ??= [];
    result[row.key]!.push(row.createdAt);
  }

  for (const dates of Object.values(result)) {
    dates.sort(compareDates);
  }

  return result;
}

function getDuelWinnerCharacterId(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const winnerCharacterId = (value as Record<string, unknown>).winnerCharacterId;
  return typeof winnerCharacterId === "string" ? winnerCharacterId : null;
}

function hasCombatThreat(value: Prisma.JsonValue | null): boolean {
  const threat = getCombatThreat(value);
  return !!threat && threat.enemyCount === 2 && threat.reason === "ordinary-win-streak";
}

function hasCombatThreatPressure(value: Prisma.JsonValue | null): boolean {
  const threat = getCombatThreat(value);
  return hasCombatThreat(value) && isRecord(threat?.pressure);
}

function getCombatThreat(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const threat = (value as Record<string, unknown>).threat;
  return isRecord(threat) ? threat : null;
}

function getCombatSource(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = (value as Record<string, unknown>).source;
  return typeof source === "string" ? source : null;
}

function isHardPassageWin(value: Prisma.JsonValue | null): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const monster = (value as Record<string, unknown>).monster;
  if (!isRecord(monster)) {
    return false;
  }

  const debugTrace = monster.debugTrace;
  if (!isRecord(debugTrace)) {
    return false;
  }

  return debugTrace.interventionKind === "hinder";
}

function isLowHpWin(value: Prisma.JsonValue | null): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const hero = (value as Record<string, unknown>).hero;
  if (!isRecord(hero)) {
    return false;
  }

  const hp = Number(hero.hp);
  const hpMax = Number(hero.hpMax);

  return Number.isFinite(hp) && Number.isFinite(hpMax) && hpMax > 0 && hp > 0 && hp * 10 <= hpMax;
}

function isZeroGoldItemWin(rewardGold: number | null, rewardItemsJson: Prisma.JsonValue | null): boolean {
  if (rewardGold !== 0 || !Array.isArray(rewardItemsJson)) {
    return false;
  }

  return rewardItemsJson.some((entry) =>
    isRecord(entry) && Number(entry.quantity) > 0 && typeof entry.itemId === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getFirstPassageSearchDatesByNode(
  rows: readonly { nodeKey: string; updatedAt: Date }[]
): Date[] {
  const firstByNode = new Map<string, Date>();

  for (const row of rows) {
    const existing = firstByNode.get(row.nodeKey);
    if (!existing || row.updatedAt < existing) {
      firstByNode.set(row.nodeKey, row.updatedAt);
    }
  }

  return [...firstByNode.values()].sort(compareDates);
}

function toAchievementRecord(row: CharacterAchievementRecord): CharacterAchievementRecord {
  return row;
}

function toProgressRecord(
  row: CharacterAchievementProgressRecord
): CharacterAchievementProgressRecord {
  return row;
}

function toTitleGrantRecord(
  row: CharacterCosmeticTitleGrantRecord
): CharacterCosmeticTitleGrantRecord {
  return row;
}

import type { PrismaClient } from "@prisma/client";
import { PrismaBarrelRaidNotificationRepository } from "../db/repositories/prismaBarrelRaidNotificationRepository";
import { PrismaCellarGrownupQuestRepository } from "../db/repositories/prismaCellarGrownupQuestRepository";
import { PrismaCharacterRepository } from "../db/repositories/prismaCharacterRepository";
import { PrismaCombatBalanceAnalyticsRepository } from "../db/repositories/prismaCombatBalanceAnalyticsRepository";
import { PrismaCooldownRepository } from "../db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../db/repositories/prismaDailyActionRepository";
import { PrismaDevGrantRepository } from "../db/repositories/prismaDevGrantRepository";
import { PrismaDuelChallengeRepository } from "../db/repositories/prismaDuelChallengeRepository";
import { PrismaEquipmentRepository } from "../db/repositories/prismaEquipmentRepository";
import { PrismaHuntContractRepository } from "../db/repositories/prismaHuntContractRepository";
import { PrismaInventoryRepository } from "../db/repositories/prismaInventoryRepository";
import { PrismaItemTransferRepository } from "../db/repositories/prismaItemTransferRepository";
import { PrismaKorchmaRoundPurchaseRepository } from "../db/repositories/prismaKorchmaRoundPurchaseRepository";
import { PrismaLevelBarterRepository } from "../db/repositories/prismaLevelBarterRepository";
import { PrismaLevelMilestoneRepository } from "../db/repositories/prismaLevelMilestoneRepository";
import { PrismaMantokChestRepository } from "../db/repositories/prismaMantokChestRepository";
import { PrismaPendingPassageEncounterRepository } from "../db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaPresenceRepository } from "../db/repositories/prismaPresenceRepository";
import { PrismaRemortRepository } from "../db/repositories/prismaRemortRepository";
import { PrismaShynokRepository } from "../db/repositories/prismaShynokRepository";
import { PrismaSoloCombatSessionRepository } from "../db/repositories/prismaSoloCombatSessionRepository";
import { PrismaUserRepository } from "../db/repositories/prismaUserRepository";

export function createRepositories(prisma: PrismaClient) {
  return {
    users: new PrismaUserRepository(prisma),
    barrelRaidNotifications: new PrismaBarrelRaidNotificationRepository(prisma),
    characters: new PrismaCharacterRepository(prisma),
    cellarGrownupQuests: new PrismaCellarGrownupQuestRepository(prisma),
    combatBalanceAnalytics: new PrismaCombatBalanceAnalyticsRepository(prisma),
    cooldowns: new PrismaCooldownRepository(prisma),
    dailyActions: new PrismaDailyActionRepository(prisma),
    devGrants: new PrismaDevGrantRepository(prisma),
    duelChallenges: new PrismaDuelChallengeRepository(prisma),
    equipment: new PrismaEquipmentRepository(prisma),
    huntContracts: new PrismaHuntContractRepository(prisma),
    inventory: new PrismaInventoryRepository(prisma),
    itemTransfers: new PrismaItemTransferRepository(prisma),
    levelBarter: new PrismaLevelBarterRepository(prisma),
    levelMilestones: new PrismaLevelMilestoneRepository(prisma),
    mantokChestRuns: new PrismaMantokChestRepository(prisma),
    pendingPassageEncounters: new PrismaPendingPassageEncounterRepository(prisma),
    presence: new PrismaPresenceRepository(prisma),
    remorts: new PrismaRemortRepository(prisma),
    roundPurchases: new PrismaKorchmaRoundPurchaseRepository(prisma),
    shynok: new PrismaShynokRepository(prisma),
    soloCombatSessions: new PrismaSoloCombatSessionRepository(prisma)
  };
}

export type ApplicationRepositories = ReturnType<typeof createRepositories>;

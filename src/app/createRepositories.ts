import type { PrismaClient } from "@prisma/client";
import { PrismaActivityEventRepository } from "../db/repositories/prismaActivityEventRepository";
import { PrismaAchievementRepository } from "../db/repositories/prismaAchievementRepository";
import { PrismaBardPerformanceRepository } from "../db/repositories/prismaBardPerformanceRepository";
import { PrismaBarrelRaidNotificationRepository } from "../db/repositories/prismaBarrelRaidNotificationRepository";
import { PrismaCellarGrownupQuestRepository } from "../db/repositories/prismaCellarGrownupQuestRepository";
import { PrismaCharacterRepository } from "../db/repositories/prismaCharacterRepository";
import { PrismaClassNoncombatRepository } from "../db/repositories/prismaClassNoncombatRepository";
import { PrismaCombatBalanceAnalyticsRepository } from "../db/repositories/prismaCombatBalanceAnalyticsRepository";
import { PrismaCooldownRepository } from "../db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../db/repositories/prismaDailyActionRepository";
import { PrismaDevGrantRepository } from "../db/repositories/prismaDevGrantRepository";
import { PrismaDuelChallengeRepository } from "../db/repositories/prismaDuelChallengeRepository";
import { PrismaEquipmentRepository } from "../db/repositories/prismaEquipmentRepository";
import { PrismaHuntContractRepository } from "../db/repositories/prismaHuntContractRepository";
import { PrismaInventoryRepository } from "../db/repositories/prismaInventoryRepository";
import { PrismaItemCraftRepository } from "../db/repositories/prismaItemCraftRepository";
import { PrismaItemUseRepository } from "../db/repositories/prismaItemUseRepository";
import { PrismaItemTransferRepository } from "../db/repositories/prismaItemTransferRepository";
import { PrismaKorchmaRoundPurchaseRepository } from "../db/repositories/prismaKorchmaRoundPurchaseRepository";
import { PrismaLevelBarterRepository } from "../db/repositories/prismaLevelBarterRepository";
import { PrismaLevelMilestoneRepository } from "../db/repositories/prismaLevelMilestoneRepository";
import { PrismaMantokChestRepository } from "../db/repositories/prismaMantokChestRepository";
import { PrismaPendingPassageEncounterRepository } from "../db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaPassageSearchRepository } from "../db/repositories/prismaPassageSearchRepository";
import { PrismaPartyBossRepository } from "../db/repositories/prismaPartyBossRepository";
import { PrismaPartySessionRepository } from "../db/repositories/prismaPartySessionRepository";
import { PrismaPlayerHintReceiptRepository } from "../db/repositories/prismaPlayerHintReceiptRepository";
import { PrismaPresenceRepository } from "../db/repositories/prismaPresenceRepository";
import { PrismaRemortRepository } from "../db/repositories/prismaRemortRepository";
import { PrismaShynokRepository } from "../db/repositories/prismaShynokRepository";
import { PrismaSoloCombatSessionRepository } from "../db/repositories/prismaSoloCombatSessionRepository";
import { PrismaTavernGameRepository } from "../db/repositories/prismaTavernGameRepository";
import { PrismaUserRepository } from "../db/repositories/prismaUserRepository";
import { PrismaYegerNotchExchangeRepository } from "../db/repositories/prismaYegerNotchExchangeRepository";

export function createRepositories(prisma: PrismaClient) {
  return {
    activityEvents: new PrismaActivityEventRepository(prisma),
    achievements: new PrismaAchievementRepository(prisma),
    users: new PrismaUserRepository(prisma),
    bardPerformances: new PrismaBardPerformanceRepository(prisma),
    barrelRaidNotifications: new PrismaBarrelRaidNotificationRepository(prisma),
    characters: new PrismaCharacterRepository(prisma),
    cellarGrownupQuests: new PrismaCellarGrownupQuestRepository(prisma),
    classNoncombat: new PrismaClassNoncombatRepository(prisma),
    combatBalanceAnalytics: new PrismaCombatBalanceAnalyticsRepository(prisma),
    cooldowns: new PrismaCooldownRepository(prisma),
    dailyActions: new PrismaDailyActionRepository(prisma),
    devGrants: new PrismaDevGrantRepository(prisma),
    duelChallenges: new PrismaDuelChallengeRepository(prisma),
    equipment: new PrismaEquipmentRepository(prisma),
    huntContracts: new PrismaHuntContractRepository(prisma),
    inventory: new PrismaInventoryRepository(prisma),
    itemCraft: new PrismaItemCraftRepository(prisma),
    itemUse: new PrismaItemUseRepository(prisma),
    itemTransfers: new PrismaItemTransferRepository(prisma),
    levelBarter: new PrismaLevelBarterRepository(prisma),
    levelMilestones: new PrismaLevelMilestoneRepository(prisma),
    mantokChestRuns: new PrismaMantokChestRepository(prisma),
    pendingPassageEncounters: new PrismaPendingPassageEncounterRepository(prisma),
    passageSearches: new PrismaPassageSearchRepository(prisma),
    partyBossSessions: new PrismaPartyBossRepository(prisma),
    partySessions: new PrismaPartySessionRepository(prisma),
    playerHintReceipts: new PrismaPlayerHintReceiptRepository(prisma),
    presence: new PrismaPresenceRepository(prisma),
    remorts: new PrismaRemortRepository(prisma),
    roundPurchases: new PrismaKorchmaRoundPurchaseRepository(prisma),
    shynok: new PrismaShynokRepository(prisma),
    soloCombatSessions: new PrismaSoloCombatSessionRepository(prisma),
    tavernGames: new PrismaTavernGameRepository(prisma),
    yegerNotchExchange: new PrismaYegerNotchExchangeRepository(prisma)
  };
}

export type ApplicationRepositories = ReturnType<typeof createRepositories>;

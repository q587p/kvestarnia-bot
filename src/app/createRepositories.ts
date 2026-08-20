import type { PrismaClient } from "@prisma/client";
import { PrismaActivityEventRepository } from "../db/repositories/prismaActivityEventRepository";
import { PrismaAchievementRepository } from "../db/repositories/prismaAchievementRepository";
import { PrismaBardPerformanceRepository } from "../db/repositories/prismaBardPerformanceRepository";
import { PrismaBarrelRaidNotificationRepository } from "../db/repositories/prismaBarrelRaidNotificationRepository";
import { PrismaCellarGrownupQuestRepository } from "../db/repositories/prismaCellarGrownupQuestRepository";
import { PrismaCharacterRepository } from "../db/repositories/prismaCharacterRepository";
import { PrismaClassNoncombatRepository } from "../db/repositories/prismaClassNoncombatRepository";
import { PrismaCombatBalanceAnalyticsRepository } from "../db/repositories/prismaCombatBalanceAnalyticsRepository";
import { PrismaCombatLeaseReadRepository } from "../db/repositories/prismaCombatLeaseReadRepository";
import { PrismaCooldownRepository } from "../db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../db/repositories/prismaDailyActionRepository";
import { PrismaDevGrantRepository } from "../db/repositories/prismaDevGrantRepository";
import { PrismaDevAccountResetRepository } from "../db/repositories/prismaDevAccountResetRepository";
import { PrismaDuelChallengeRepository } from "../db/repositories/prismaDuelChallengeRepository";
import { PrismaDuelTournamentRepository } from "../db/repositories/prismaDuelTournamentRepository";
import { PrismaEquipmentRepository } from "../db/repositories/prismaEquipmentRepository";
import { PrismaHuntContractRepository } from "../db/repositories/prismaHuntContractRepository";
import { PrismaGroupCombatRepository } from "../db/repositories/prismaGroupCombatRepository";
import { PrismaGuildRepository } from "../db/repositories/prismaGuildRepository";
import { HpRecoveryNotificationProducer } from "../db/repositories/hpRecoveryNotificationProducer";
import { PrismaHpRecoveryNotificationRepository } from "../db/repositories/prismaHpRecoveryNotificationRepository";
import { PrismaInventoryRepository } from "../db/repositories/prismaInventoryRepository";
import { PrismaItemCraftRepository } from "../db/repositories/prismaItemCraftRepository";
import { PrismaItemUseRepository } from "../db/repositories/prismaItemUseRepository";
import { PrismaItemTransferRepository } from "../db/repositories/prismaItemTransferRepository";
import { PrismaItemUpgradeRepository } from "../db/repositories/prismaItemUpgradeRepository";
import { PrismaKorchmaRoundPurchaseRepository } from "../db/repositories/prismaKorchmaRoundPurchaseRepository";
import { PrismaLevelBarterRepository } from "../db/repositories/prismaLevelBarterRepository";
import { PrismaLevelMilestoneRepository } from "../db/repositories/prismaLevelMilestoneRepository";
import { PrismaMantokChestRepository } from "../db/repositories/prismaMantokChestRepository";
import { PrismaPendingPassageEncounterRepository } from "../db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaPassageSearchRepository } from "../db/repositories/prismaPassageSearchRepository";
import { PrismaPartyBossRepository } from "../db/repositories/prismaPartyBossRepository";
import { PrismaPartyRaidChatRepository } from "../db/repositories/prismaPartyRaidChatRepository";
import { PrismaPartyRaidChatTransactionWriter } from "../db/repositories/prismaPartyRaidChatEvents";
import { PrismaPartySessionRepository } from "../db/repositories/prismaPartySessionRepository";
import { PrismaPlayerHintReceiptRepository } from "../db/repositories/prismaPlayerHintReceiptRepository";
import { PrismaPresenceRepository } from "../db/repositories/prismaPresenceRepository";
import { PrismaQuestMarkerReadRepository } from "../db/repositories/prismaQuestMarkerReadRepository";
import { PrismaReferralRepository } from "../db/repositories/prismaReferralRepository";
import { PrismaRemortRepository } from "../db/repositories/prismaRemortRepository";
import { PrismaShynokRepository } from "../db/repositories/prismaShynokRepository";
import { PrismaSoloCombatSessionRepository } from "../db/repositories/prismaSoloCombatSessionRepository";
import { PrismaTavernGameRepository } from "../db/repositories/prismaTavernGameRepository";
import { PrismaUserRepository } from "../db/repositories/prismaUserRepository";
import { PrismaYegerNotchExchangeRepository } from "../db/repositories/prismaYegerNotchExchangeRepository";

export function createRepositories(
  prisma: PrismaClient,
  options: {
    hpRecoveryNotificationsEnabled?: boolean;
    guildIdentityEnabled?: boolean;
  } = {}
) {
  const hpRecoveryProducer = new HpRecoveryNotificationProducer(
    options.hpRecoveryNotificationsEnabled === true
  );
  const partyRaidChatWriter = new PrismaPartyRaidChatTransactionWriter(true);

  return {
    activityEvents: new PrismaActivityEventRepository(
      prisma,
      options.guildIdentityEnabled === true
    ),
    achievements: new PrismaAchievementRepository(prisma),
    users: new PrismaUserRepository(prisma),
    bardPerformances: new PrismaBardPerformanceRepository(prisma),
    barrelRaidNotifications: new PrismaBarrelRaidNotificationRepository(prisma),
    characters: new PrismaCharacterRepository(
      prisma,
      hpRecoveryProducer,
      options.guildIdentityEnabled === true
    ),
    cellarGrownupQuests: new PrismaCellarGrownupQuestRepository(prisma, hpRecoveryProducer),
    classNoncombat: new PrismaClassNoncombatRepository(prisma, hpRecoveryProducer),
    combatBalanceAnalytics: new PrismaCombatBalanceAnalyticsRepository(prisma),
    combatLeaseReads: new PrismaCombatLeaseReadRepository(prisma),
    cooldowns: new PrismaCooldownRepository(prisma, hpRecoveryProducer),
    dailyActions: new PrismaDailyActionRepository(prisma, hpRecoveryProducer),
    devAccountReset: new PrismaDevAccountResetRepository(prisma),
    devGrants: new PrismaDevGrantRepository(prisma),
    duelChallenges: new PrismaDuelChallengeRepository(
      prisma,
      hpRecoveryProducer,
      undefined,
      options.guildIdentityEnabled === true
    ),
    duelTournaments: new PrismaDuelTournamentRepository(prisma),
    equipment: new PrismaEquipmentRepository(prisma, hpRecoveryProducer),
    huntContracts: new PrismaHuntContractRepository(prisma),
    groupCombatSessions: new PrismaGroupCombatRepository(prisma),
    guilds: new PrismaGuildRepository(prisma),
    hpRecoveryNotifications: new PrismaHpRecoveryNotificationRepository(prisma, hpRecoveryProducer),
    inventory: new PrismaInventoryRepository(prisma),
    itemCraft: new PrismaItemCraftRepository(prisma),
    itemUpgrades: new PrismaItemUpgradeRepository(prisma, hpRecoveryProducer),
    itemUse: new PrismaItemUseRepository(prisma, hpRecoveryProducer),
    itemTransfers: new PrismaItemTransferRepository(prisma),
    levelBarter: new PrismaLevelBarterRepository(prisma, hpRecoveryProducer),
    levelMilestones: new PrismaLevelMilestoneRepository(prisma),
    mantokChestRuns: new PrismaMantokChestRepository(prisma),
    pendingPassageEncounters: new PrismaPendingPassageEncounterRepository(prisma),
    passageSearches: new PrismaPassageSearchRepository(prisma),
    partyBossSessions: new PrismaPartyBossRepository(prisma, hpRecoveryProducer, partyRaidChatWriter),
    partyRaidChat: new PrismaPartyRaidChatRepository(prisma),
    partySessions: new PrismaPartySessionRepository(prisma, partyRaidChatWriter),
    playerHintReceipts: new PrismaPlayerHintReceiptRepository(prisma),
    presence: new PrismaPresenceRepository(
      prisma,
      options.guildIdentityEnabled === true
    ),
    questMarkerReads: new PrismaQuestMarkerReadRepository(prisma),
    referrals: new PrismaReferralRepository(prisma),
    remorts: new PrismaRemortRepository(prisma, hpRecoveryProducer, partyRaidChatWriter),
    roundPurchases: new PrismaKorchmaRoundPurchaseRepository(
      prisma,
      options.guildIdentityEnabled === true
    ),
    shynok: new PrismaShynokRepository(prisma, hpRecoveryProducer),
    soloCombatSessions: new PrismaSoloCombatSessionRepository(prisma, hpRecoveryProducer),
    tavernGames: new PrismaTavernGameRepository(prisma),
    yegerNotchExchange: new PrismaYegerNotchExchangeRepository(prisma)
  };
}

export type ApplicationRepositories = ReturnType<typeof createRepositories>;

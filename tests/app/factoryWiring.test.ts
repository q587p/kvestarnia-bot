import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRepositories } from "../../src/app/createRepositories";
import { createServices } from "../../src/app/createServices";
import type { AppConfig } from "../../src/config/env";
import { PrismaActivityEventRepository } from "../../src/db/repositories/prismaActivityEventRepository";
import { PrismaAchievementRepository } from "../../src/db/repositories/prismaAchievementRepository";
import { PrismaBarrelRaidNotificationRepository } from "../../src/db/repositories/prismaBarrelRaidNotificationRepository";
import { PrismaCellarGrownupQuestRepository } from "../../src/db/repositories/prismaCellarGrownupQuestRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";
import { PrismaCombatBalanceAnalyticsRepository } from "../../src/db/repositories/prismaCombatBalanceAnalyticsRepository";
import { PrismaCombatLeaseReadRepository } from "../../src/db/repositories/prismaCombatLeaseReadRepository";
import { PrismaCooldownRepository } from "../../src/db/repositories/prismaCooldownRepository";
import { PrismaDailyActionRepository } from "../../src/db/repositories/prismaDailyActionRepository";
import { PrismaDevGrantRepository } from "../../src/db/repositories/prismaDevGrantRepository";
import { PrismaDuelChallengeRepository } from "../../src/db/repositories/prismaDuelChallengeRepository";
import { PrismaEquipmentRepository } from "../../src/db/repositories/prismaEquipmentRepository";
import { PrismaHuntContractRepository } from "../../src/db/repositories/prismaHuntContractRepository";
import { PrismaGroupCombatRepository } from "../../src/db/repositories/prismaGroupCombatRepository";
import { PrismaInventoryRepository } from "../../src/db/repositories/prismaInventoryRepository";
import { PrismaItemTransferRepository } from "../../src/db/repositories/prismaItemTransferRepository";
import { PrismaKorchmaRoundPurchaseRepository } from "../../src/db/repositories/prismaKorchmaRoundPurchaseRepository";
import { PrismaLevelBarterRepository } from "../../src/db/repositories/prismaLevelBarterRepository";
import { PrismaLevelMilestoneRepository } from "../../src/db/repositories/prismaLevelMilestoneRepository";
import { PrismaMantokChestRepository } from "../../src/db/repositories/prismaMantokChestRepository";
import { PrismaPendingPassageEncounterRepository } from "../../src/db/repositories/prismaPendingPassageEncounterRepository";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import { PrismaPlayerHintReceiptRepository } from "../../src/db/repositories/prismaPlayerHintReceiptRepository";
import { PrismaPresenceRepository } from "../../src/db/repositories/prismaPresenceRepository";
import { PrismaQuestMarkerReadRepository } from "../../src/db/repositories/prismaQuestMarkerReadRepository";
import { PrismaRemortRepository } from "../../src/db/repositories/prismaRemortRepository";
import { PrismaShynokRepository } from "../../src/db/repositories/prismaShynokRepository";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import { PrismaUserRepository } from "../../src/db/repositories/prismaUserRepository";
import { PrismaYegerNotchExchangeRepository } from "../../src/db/repositories/prismaYegerNotchExchangeRepository";
import { AchievementService } from "../../src/services/achievementService";
import { AdventureService } from "../../src/services/adventureService";
import { CellarErrandService } from "../../src/services/cellarErrandService";
import { CellarGrownupQuestService } from "../../src/services/cellarGrownupQuestService";
import { CombatLeaseReadService } from "../../src/services/combatLeaseReadService";
import { DeployNotificationService } from "../../src/services/deployNotificationService";
import { DevGrantService } from "../../src/services/devGrantService";
import { DevResetService } from "../../src/services/devResetService";
import { DuelChallengeService } from "../../src/services/duelChallengeService";
import { EquipmentService } from "../../src/services/equipmentService";
import { FightService } from "../../src/services/fightService";
import { HeroService } from "../../src/services/heroService";
import { GroupCombatService } from "../../src/services/groupCombatService";
import { HuntService } from "../../src/services/huntService";
import { InventoryService } from "../../src/services/inventoryService";
import { ItemTransferService } from "../../src/services/itemTransferService";
import { LevelBarterService } from "../../src/services/levelBarterService";
import { LevelMilestoneService } from "../../src/services/levelMilestoneService";
import { MantokChestService } from "../../src/services/mantokChestService";
import { OnboardingService } from "../../src/services/onboardingService";
import { PartySessionService } from "../../src/services/partySessionService";
import { PlayerHintService } from "../../src/services/playerHintService";
import { PresenceService } from "../../src/services/presenceService";
import { QuestMarkerReadService } from "../../src/services/questMarkerReadService";
import { RemortService } from "../../src/services/remortService";
import { RestartService } from "../../src/services/restartService";
import { ShynokService } from "../../src/services/shynokService";
import { TavernRaidService } from "../../src/services/tavernRaidService";
import { TrainingDoppelgangerService } from "../../src/services/trainingDoppelgangerService";
import { YegerQuestService } from "../../src/services/yegerQuestService";
import { ActivityEventService } from "../../src/services/activityEventService";

describe("application factory wiring", () => {
  it("creates the expected concrete Prisma repositories", () => {
    const repositories = createRepositories({} as PrismaClient);
    const source = compact(read("src/app/createRepositories.ts"));

    expect(repositories.activityEvents).toBeInstanceOf(PrismaActivityEventRepository);
    expect(repositories.achievements).toBeInstanceOf(PrismaAchievementRepository);
    expect(repositories.users).toBeInstanceOf(PrismaUserRepository);
    expect(repositories.barrelRaidNotifications).toBeInstanceOf(PrismaBarrelRaidNotificationRepository);
    expect(repositories.characters).toBeInstanceOf(PrismaCharacterRepository);
    expect(repositories.cellarGrownupQuests).toBeInstanceOf(PrismaCellarGrownupQuestRepository);
    expect(repositories.combatBalanceAnalytics).toBeInstanceOf(PrismaCombatBalanceAnalyticsRepository);
    expect(repositories.combatLeaseReads).toBeInstanceOf(PrismaCombatLeaseReadRepository);
    expect(repositories.cooldowns).toBeInstanceOf(PrismaCooldownRepository);
    expect(repositories.dailyActions).toBeInstanceOf(PrismaDailyActionRepository);
    expect(repositories.devGrants).toBeInstanceOf(PrismaDevGrantRepository);
    expect(repositories.duelChallenges).toBeInstanceOf(PrismaDuelChallengeRepository);
    expect(repositories.equipment).toBeInstanceOf(PrismaEquipmentRepository);
    expect(repositories.huntContracts).toBeInstanceOf(PrismaHuntContractRepository);
    expect(repositories.groupCombatSessions).toBeInstanceOf(PrismaGroupCombatRepository);
    expect(repositories.inventory).toBeInstanceOf(PrismaInventoryRepository);
    expect(repositories.itemTransfers).toBeInstanceOf(PrismaItemTransferRepository);
    expect(repositories.levelBarter).toBeInstanceOf(PrismaLevelBarterRepository);
    expect(repositories.levelMilestones).toBeInstanceOf(PrismaLevelMilestoneRepository);
    expect(repositories.mantokChestRuns).toBeInstanceOf(PrismaMantokChestRepository);
    expect(repositories.pendingPassageEncounters).toBeInstanceOf(PrismaPendingPassageEncounterRepository);
    expect(repositories.partySessions).toBeInstanceOf(PrismaPartySessionRepository);
    expect(repositories.playerHintReceipts).toBeInstanceOf(PrismaPlayerHintReceiptRepository);
    expect(repositories.presence).toBeInstanceOf(PrismaPresenceRepository);
    expect(repositories.questMarkerReads).toBeInstanceOf(PrismaQuestMarkerReadRepository);
    expect(repositories.remorts).toBeInstanceOf(PrismaRemortRepository);
    expect(repositories.roundPurchases).toBeInstanceOf(PrismaKorchmaRoundPurchaseRepository);
    expect(repositories.shynok).toBeInstanceOf(PrismaShynokRepository);
    expect(repositories.soloCombatSessions).toBeInstanceOf(PrismaSoloCombatSessionRepository);
    expect(repositories.yegerNotchExchange).toBeInstanceOf(PrismaYegerNotchExchangeRepository);
    expect(source).toContain("new PrismaPartyRaidChatTransactionWriter(true)");
    expect(source).not.toContain("bigBarrelRaidChatEnabled");
  });

  it("creates the expected application service surface", () => {
    const services = createServices(createRepositories({} as PrismaClient), makeConfig());

    expect(services.activityEvents).toBeInstanceOf(ActivityEventService);
    expect(services.achievements).toBeInstanceOf(AchievementService);
    expect(services.adventure).toBeInstanceOf(AdventureService);
    expect(services.barrelRaidNotifications).toBeInstanceOf(PrismaBarrelRaidNotificationRepository);
    expect(services.cellarErrand).toBeInstanceOf(CellarErrandService);
    expect(services.cellarGrownup).toBeInstanceOf(CellarGrownupQuestService);
    expect(services.combatLeases).toBeInstanceOf(CombatLeaseReadService);
    expect(services.deployNotifications).toBeInstanceOf(DeployNotificationService);
    expect(services.devGrant).toBeInstanceOf(DevGrantService);
    expect(services.devReset).toBeInstanceOf(DevResetService);
    expect(services.duel).toBeInstanceOf(DuelChallengeService);
    expect(services.equipment).toBeInstanceOf(EquipmentService);
    expect(services.fight).toBeInstanceOf(FightService);
    expect(services.hero).toBeInstanceOf(HeroService);
    expect(services.hunt).toBeInstanceOf(HuntService);
    expect(services.groupCombat).toBeInstanceOf(GroupCombatService);
    expect(services.inventory).toBeInstanceOf(InventoryService);
    expect(services.itemTransfers).toBeInstanceOf(ItemTransferService);
    expect(services.levelBarter).toBeInstanceOf(LevelBarterService);
    expect(services.levelMilestones).toBeInstanceOf(LevelMilestoneService);
    expect(services.mantokChest).toBeInstanceOf(MantokChestService);
    expect(services.onboarding).toBeInstanceOf(OnboardingService);
    expect(services.partySessions).toBeInstanceOf(PartySessionService);
    expect(services.playerHints).toBeInstanceOf(PlayerHintService);
    expect(services.presence).toBeInstanceOf(PresenceService);
    expect(services.questMarkerReads).toBeInstanceOf(QuestMarkerReadService);
    expect(services.remort).toBeInstanceOf(RemortService);
    expect(services.restart).toBeInstanceOf(RestartService);
    expect(services.shynok).toBeInstanceOf(ShynokService);
    expect(services.tavern).toBeInstanceOf(TavernRaidService);
    expect(services.trainingDoppelganger).toBeInstanceOf(TrainingDoppelgangerService);
    expect(services.yeger).toBeInstanceOf(YegerQuestService);
  });

  it("pins service constructor dependencies", () => {
    const source = compact(read("src/app/createServices.ts"));

    expect(source).toContain("const partyRaidChatEnabled = config.bigBarrelBrotherRaidEnabled");
    expect(source).not.toContain("config.bigBarrelRaidChatEnabled");

    expect(source).toContain(compact(`
      const fight = new FightService({
        characters: repositories.characters,
        dailyActions: repositories.dailyActions,
        combatSessions: repositories.soloCombatSessions,
        equipment: repositories.equipment,
        inventory: repositories.inventory,
        cooldowns: repositories.cooldowns,
        combatAnalytics: combatBalanceAnalytics,
        pendingPassageEncounters: repositories.pendingPassageEncounters,
        shynok: repositories.shynok,
        achievements,
        activityEvents: publicActivityEvents,
        fightingCornerQuest,
        consumableManatkaUsesEnabled: config.consumableManatkaUsesEnabled
      });
    `));
    expect(source).toContain(compact(`
      adventure: new AdventureService(
        repositories.characters,
        repositories.dailyActions,
        undefined,
        repositories.soloCombatSessions,
        repositories.equipment,
        achievements,
        publicActivityEvents
      )
    `));
    expect(source).toContain(compact(`
      duel: new DuelChallengeService(
        repositories.duelChallenges,
        repositories.characters,
        undefined,
        undefined,
        presence,
        achievements,
        publicActivityEvents,
        fightingCornerQuest
      )
    `));
    expect(source).toContain(compact(`
      trainingDoppelganger: new TrainingDoppelgangerService(
        repositories.characters,
        repositories.cooldowns,
        repositories.dailyActions,
        repositories.soloCombatSessions,
        repositories.equipment,
        undefined,
        undefined,
        {},
        repositories.duelChallenges,
        combatBalanceAnalytics
      )
    `));
    expect(source).toContain(compact(`
      const fightingCornerQuest = new FightingCornerQuestService(
        repositories.characters,
        repositories.dailyActions,
        repositories.classNoncombat,
        {
          enabled: nonProduction || config.fightingCornerOnboardingQuestEnabled,
          devHelpersEnabled: nonProduction && config.fightingCornerOnboardingQuestDevHelpersEnabled
        }
      )
    `));
    expect(source).toContain(compact(`
      itemUse: new ItemUseService(repositories.itemUse, undefined, achievements, config.consumableManatkaUsesEnabled)
    `));
    expect(source).toContain(compact(`
      itemUpgrades: new ItemUpgradeService(
        repositories.itemUpgrades,
        undefined,
        undefined,
        achievements,
        publicActivityEvents
      )
    `));
    expect(source).toContain(compact(`
      levelBarter: new LevelBarterService(repositories.levelBarter, undefined, achievements, publicActivityEvents)
    `));
    expect(source).toContain(compact(`
      mantokChest: new MantokChestService(repositories.mantokChestRuns, undefined, undefined, achievements, publicActivityEvents)
    `));
    expect(source).toContain(compact(`
      partyBoss: new PartyBossService(repositories.partyBossSessions, {
        enabled: nonProduction ||
          config.bigBarrelBrotherRaidEnabled,
        devHelpersEnabled: nonProduction,
        consumableManatkaUsesEnabled: config.consumableManatkaUsesEnabled
      }, undefined, achievements, publicActivityEvents, repositories.inventory, barrelBeerTutorial, repositories.dailyActions)
    `));
    expect(source).toContain(compact(`
      partySessions: new PartySessionService(repositories.partySessions, {
        enabled: nonProduction ||
          config.partySessionFoundationEnabled ||
          config.bigBarrelBrotherRaidEnabled ||
          config.leftPassagePartyAttackEnabled,
        runtimeServicingEnabled: true,
        devHelpersEnabled: nonProduction,
        bigBarrelBrotherEnabled: config.bigBarrelBrotherRaidEnabled,
        leftPassagePartyAttackEnabled: config.leftPassagePartyAttackEnabled
      }, undefined, achievements)
    `));
    expect(source).toContain(compact(`
      yeger: new YegerQuestService(
        repositories.characters,
        repositories.dailyActions,
        repositories.soloCombatSessions,
        fight,
        repositories.cooldowns,
        repositories.yegerNotchExchange,
        undefined,
        undefined,
        achievements,
        publicActivityEvents
      )
    `));
  });

  it("does not let party-session dev helper flags enable dev commands in production", () => {
    const services = createServices(createRepositories({} as PrismaClient), makeConfig({
      nodeEnv: "production",
      partySessionDevHelpersEnabled: true,
      bigBarrelBrotherRaidEnabled: true
    }));

    expect(services.partySessions.isEnabled()).toBe(true);
    expect(services.partySessions.areDevHelpersEnabled()).toBe(false);
    expect(services.partyBoss.isEnabled()).toBe(true);
    expect(services.partyBoss.areDevHelpersEnabled()).toBe(false);
  });

  it("services group combat in production while keeping proof and left-passage entry disabled", async () => {
    const services = createServices(createRepositories({} as PrismaClient), makeConfig({
      nodeEnv: "production",
      groupCombatProofEnabled: true
    }));

    expect(services.groupCombat.isEnabled()).toBe(true);
    expect(services.groupCombat.areDevHelpersEnabled()).toBe(false);
    expect(services.groupCombat.isLeftPassageEntryEnabled()).toBe(false);
    await expect(services.groupCombat.startProof(42n, "proof-token-13")).resolves.toEqual({ state: "disabled" });
  });

  it("keeps raid chat on the existing Big Barrel rollout and isolates the helper in production", async () => {
    const repositories = createRepositories({} as PrismaClient);
    expect(createServices(repositories, makeConfig({
      bigBarrelBrotherRaidEnabled: false
    })).partyRaidChat.isEnabled()).toBe(false);

    const production = createServices(repositories, makeConfig({
      nodeEnv: "production",
      bigBarrelBrotherRaidEnabled: true
    })).partyRaidChat;
    expect(production.isEnabled()).toBe(true);
    expect(production.areDevHelpersEnabled()).toBe(false);
    await expect(production.devFill(1n, 14)).resolves.toBe(0);
    await expect(production.devClear(1n)).resolves.toBe(false);
    await expect(production.devExpire(1n, "retention")).resolves.toBe(false);
  });

  it("does not let the Fighting Corner helper flag enable reset mutation in production", async () => {
    const services = createServices(createRepositories({} as PrismaClient), makeConfig({
      nodeEnv: "production",
      fightingCornerOnboardingQuestEnabled: true,
      fightingCornerOnboardingQuestDevHelpersEnabled: true
    }));

    expect(services.fightingCornerQuest.isDevHelperEnabled()).toBe(false);
    await expect(services.fightingCornerQuest.resetCurrentLifeForTelegramUser(42n)).resolves.toBe("disabled");
  });

  it("keeps Bard dev mutation disabled in production", async () => {
    const services = createServices(createRepositories({} as PrismaClient), makeConfig({
      nodeEnv: "production",
      devGrantCommandsEnabled: true
    }));

    expect(services.bardPerformance.areDevHelpersEnabled()).toBe(false);
    await expect(services.bardPerformance.resetForDev(42n)).resolves.toEqual({ state: "disabled" });
    await expect(services.bardPerformance.setInspirationForDev(42n, 5)).resolves.toEqual({ state: "disabled" });
  });
});

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    databaseUrl: "file:./test.db",
    deployNotificationsEnabled: false,
    devGrantCommandsEnabled: false,
    combatBalanceAnalyticsEnabled: false,
    partySessionFoundationEnabled: false,
    partySessionDevHelpersEnabled: false,
    bigBarrelBrotherRaidEnabled: false,
    groupCombatProofEnabled: false,
    ...overrides
  };
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function compact(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

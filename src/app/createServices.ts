import type { BotServices } from "../bot/botServices";
import type { AppConfig } from "../config/env";
import { readAppVersion } from "../shared/appVersion";
import { ActivityEventService } from "../services/activityEventService";
import { PublicActivityEventPublisher } from "../services/publicActivityEventPublisher";
import { AchievementService } from "../services/achievementService";
import { AdventureService } from "../services/adventureService";
import { BardPerformanceService } from "../services/bardPerformanceService";
import { BarrelBeerTutorialService } from "../services/barrelBeerTutorialService";
import { CellarErrandService } from "../services/cellarErrandService";
import { CellarGrownupQuestService } from "../services/cellarGrownupQuestService";
import { ClassNoncombatService } from "../services/classNoncombatService";
import { CombatBalanceAnalyticsService } from "../services/combatBalanceAnalyticsService";
import { DeployNotificationService } from "../services/deployNotificationService";
import { DevGrantService } from "../services/devGrantService";
import { DailyKorchmaRoundService } from "../services/dailyKorchmaRoundService";
import { DevResetService } from "../services/devResetService";
import { DuelChallengeService } from "../services/duelChallengeService";
import { DuelTournamentService } from "../services/duelTournamentService";
import { EquipmentService } from "../services/equipmentService";
import { FightService } from "../services/fightService";
import { FirstKorchmaQuestService } from "../services/firstKorchmaQuestService";
import { FightingCornerQuestService } from "../services/fightingCornerQuestService";
import { HeroService } from "../services/heroService";
import { HealthRecoveryNotificationService } from "../services/healthRecoveryNotificationService";
import { HuntService } from "../services/huntService";
import { InventoryService } from "../services/inventoryService";
import { ItemCraftService } from "../services/itemCraftService";
import { ItemUpgradeService } from "../services/itemUpgradeService";
import { ItemUseService } from "../services/itemUseService";
import { ItemTransferService } from "../services/itemTransferService";
import { LevelBarterService } from "../services/levelBarterService";
import { LevelMilestoneService } from "../services/levelMilestoneService";
import { MantokChestService } from "../services/mantokChestService";
import { OnboardingService } from "../services/onboardingService";
import { PassageSearchService } from "../services/passageSearchService";
import { PartyBossService } from "../services/partyBossService";
import { PartySessionService } from "../services/partySessionService";
import { PlayerHintService } from "../services/playerHintService";
import { PresenceService } from "../services/presenceService";
import { RemortService } from "../services/remortService";
import { RestartService } from "../services/restartService";
import { ShynokService } from "../services/shynokService";
import { TavernGameService } from "../services/tavernGameService";
import { TavernRaidService } from "../services/tavernRaidService";
import { TrainingDoppelgangerService } from "../services/trainingDoppelgangerService";
import { YegerQuestService } from "../services/yegerQuestService";
import type { ApplicationRepositories } from "./createRepositories";

export interface ApplicationServices extends BotServices {
  deployNotifications: DeployNotificationService;
  healthRecoveryNotifications: HealthRecoveryNotificationService;
}

export function createServices(
  repositories: ApplicationRepositories,
  config: AppConfig
): ApplicationServices {
  const nonProduction = config.nodeEnv !== "production";
  const activityEvents = new ActivityEventService(repositories.activityEvents);
  const publicActivityEvents = new PublicActivityEventPublisher(activityEvents);
  const achievements = new AchievementService(repositories.achievements);
  const combatBalanceAnalytics = new CombatBalanceAnalyticsService(
    repositories.combatBalanceAnalytics,
    { enabled: config.combatBalanceAnalyticsEnabled }
  );
  const fightingCornerQuest = new FightingCornerQuestService(
    repositories.characters,
    repositories.dailyActions,
    repositories.classNoncombat,
    {
      enabled: nonProduction || config.fightingCornerOnboardingQuestEnabled,
      devHelpersEnabled: nonProduction && config.fightingCornerOnboardingQuestDevHelpersEnabled
    }
  );
  const fight = new FightService({
    characters: repositories.characters,
    dailyActions: repositories.dailyActions,
    combatSessions: repositories.soloCombatSessions,
    equipment: repositories.equipment,
    combatAnalytics: combatBalanceAnalytics,
    pendingPassageEncounters: repositories.pendingPassageEncounters,
    shynok: repositories.shynok,
    achievements,
    activityEvents: publicActivityEvents,
    fightingCornerQuest
  });
  const presence = new PresenceService(repositories.presence);
  const tavern = new TavernRaidService(
    repositories.characters,
    repositories.dailyActions,
    repositories.roundPurchases,
    repositories.cooldowns,
    undefined,
    undefined,
    publicActivityEvents
  );
  const barrelBeerTutorial = new BarrelBeerTutorialService(
    repositories.characters,
    repositories.dailyActions,
    repositories.shynok,
    undefined,
    achievements
  );
  const firstKorchmaQuest = new FirstKorchmaQuestService(
    repositories.characters,
    repositories.dailyActions,
    achievements
  );

  return {
    activityEvents,
    achievements,
    adventure: new AdventureService(
      repositories.characters,
      repositories.dailyActions,
      undefined,
      repositories.soloCombatSessions,
      repositories.equipment,
      achievements,
      publicActivityEvents
    ),
    bardPerformance: new BardPerformanceService(repositories.bardPerformances),
    barrelBeerTutorial,
    barrelRaidNotifications: repositories.barrelRaidNotifications,
    cellarErrand: new CellarErrandService(repositories.cooldowns, undefined, repositories.equipment),
    cellarGrownup: new CellarGrownupQuestService(
      repositories.cellarGrownupQuests,
      repositories.dailyActions,
      repositories.cooldowns
    ),
    classNoncombat: new ClassNoncombatService(
      repositories.classNoncombat,
      undefined,
      undefined,
      achievements,
      repositories.equipment
    ),
    dailyKorchmaRound: new DailyKorchmaRoundService(
      repositories.characters,
      repositories.dailyActions,
      presence,
      fight,
      tavern,
      achievements,
      publicActivityEvents
    ),
    deployNotifications: new DeployNotificationService(repositories.users, {
      enabled: config.deployNotificationsEnabled,
      databaseUrl: config.databaseUrl,
      version: readAppVersion()
    }),
    devGrant: new DevGrantService(
      repositories.devGrants,
      config.nodeEnv,
      config.devGrantCommandsEnabled,
      undefined,
      achievements
    ),
    devReset: new DevResetService(repositories.characters, config.nodeEnv),
    duel: new DuelChallengeService(
      repositories.duelChallenges,
      repositories.characters,
      undefined,
      undefined,
      presence,
      achievements,
      publicActivityEvents,
      fightingCornerQuest
    ),
    duelTournaments: new DuelTournamentService(
      repositories.duelTournaments,
      repositories.duelChallenges,
      publicActivityEvents
    ),
    equipment: new EquipmentService(
      repositories.equipment,
      repositories.inventory,
      repositories.characters,
      achievements
    ),
    fight,
    firstKorchmaQuest,
    fightingCornerQuest,
    hero: new HeroService(
      repositories.characters,
      repositories.inventory,
      repositories.equipment,
      repositories.remorts,
      repositories.shynok,
      undefined,
      achievements,
      repositories.classNoncombat
    ),
    healthRecoveryNotifications: new HealthRecoveryNotificationService(
      repositories.hpRecoveryNotifications,
      config.hpRecoveryNotificationsEnabled,
      nonProduction,
      () => new Date()
    ),
    hunt: new HuntService(
      repositories.characters,
      repositories.dailyActions,
      repositories.huntContracts
    ),
    inventory: new InventoryService(repositories.inventory),
    itemCraft: new ItemCraftService(repositories.itemCraft, undefined, achievements),
    itemUpgrades: new ItemUpgradeService(
      repositories.itemUpgrades,
      undefined,
      undefined,
      achievements,
      publicActivityEvents
    ),
    itemUse: new ItemUseService(repositories.itemUse, undefined, achievements),
    itemTransfers: new ItemTransferService(repositories.itemTransfers, presence),
    levelBarter: new LevelBarterService(repositories.levelBarter, undefined, achievements, publicActivityEvents),
    levelMilestones: new LevelMilestoneService(repositories.levelMilestones),
    mantokChest: new MantokChestService(repositories.mantokChestRuns, undefined, undefined, achievements, publicActivityEvents),
    onboarding: new OnboardingService(repositories.users, repositories.characters, achievements, publicActivityEvents),
    passageSearch: new PassageSearchService(
      repositories.passageSearches,
      fight,
      undefined,
      achievements,
      publicActivityEvents
    ),
    partyBoss: new PartyBossService(repositories.partyBossSessions, {
      enabled: nonProduction ||
        config.bigBarrelBrotherRaidEnabled,
      devHelpersEnabled: nonProduction
    }, undefined, achievements, publicActivityEvents, repositories.inventory, barrelBeerTutorial),
    partySessions: new PartySessionService(repositories.partySessions, {
      enabled: nonProduction ||
        config.partySessionFoundationEnabled ||
        config.bigBarrelBrotherRaidEnabled,
      devHelpersEnabled: nonProduction,
      bigBarrelBrotherEnabled: config.bigBarrelBrotherRaidEnabled
    }, undefined, achievements),
    playerHints: new PlayerHintService(repositories.playerHintReceipts),
    presence,
    remort: new RemortService(repositories.remorts, undefined, achievements),
    restart: new RestartService(repositories.characters),
    shynok: new ShynokService(
      repositories.shynok,
      repositories.characters,
      repositories.dailyActions,
      repositories.roundPurchases
    ),
    tavernGames: new TavernGameService(repositories.tavernGames, config, undefined, achievements),
    tavern,
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
    ),
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
  };
}

import type { BotServices } from "../bot/botServices";
import type { AppConfig } from "../config/env";
import { readAppVersion } from "../shared/appVersion";
import { AdventureService } from "../services/adventureService";
import { CellarErrandService } from "../services/cellarErrandService";
import { CellarGrownupQuestService } from "../services/cellarGrownupQuestService";
import { CombatBalanceAnalyticsService } from "../services/combatBalanceAnalyticsService";
import { DeployNotificationService } from "../services/deployNotificationService";
import { DevGrantService } from "../services/devGrantService";
import { DevResetService } from "../services/devResetService";
import { DuelChallengeService } from "../services/duelChallengeService";
import { EquipmentService } from "../services/equipmentService";
import { FightService } from "../services/fightService";
import { HeroService } from "../services/heroService";
import { HuntService } from "../services/huntService";
import { InventoryService } from "../services/inventoryService";
import { ItemUseService } from "../services/itemUseService";
import { ItemTransferService } from "../services/itemTransferService";
import { LevelBarterService } from "../services/levelBarterService";
import { LevelMilestoneService } from "../services/levelMilestoneService";
import { MantokChestService } from "../services/mantokChestService";
import { OnboardingService } from "../services/onboardingService";
import { PresenceService } from "../services/presenceService";
import { RemortService } from "../services/remortService";
import { RestartService } from "../services/restartService";
import { ShynokService } from "../services/shynokService";
import { TavernRaidService } from "../services/tavernRaidService";
import { TrainingDoppelgangerService } from "../services/trainingDoppelgangerService";
import { YegerQuestService } from "../services/yegerQuestService";
import type { ApplicationRepositories } from "./createRepositories";

export interface ApplicationServices extends BotServices {
  deployNotifications: DeployNotificationService;
}

export function createServices(
  repositories: ApplicationRepositories,
  config: AppConfig
): ApplicationServices {
  const combatBalanceAnalytics = new CombatBalanceAnalyticsService(
    repositories.combatBalanceAnalytics,
    { enabled: config.combatBalanceAnalyticsEnabled }
  );
  const fight = new FightService(
    repositories.characters,
    repositories.dailyActions,
    undefined,
    repositories.soloCombatSessions,
    undefined,
    repositories.equipment,
    combatBalanceAnalytics,
    repositories.pendingPassageEncounters,
    repositories.shynok
  );
  const presence = new PresenceService(repositories.presence);

  return {
    adventure: new AdventureService(
      repositories.characters,
      repositories.dailyActions,
      undefined,
      repositories.soloCombatSessions,
      repositories.equipment
    ),
    barrelRaidNotifications: repositories.barrelRaidNotifications,
    cellarErrand: new CellarErrandService(repositories.cooldowns, undefined, repositories.equipment),
    cellarGrownup: new CellarGrownupQuestService(
      repositories.cellarGrownupQuests,
      repositories.dailyActions,
      repositories.cooldowns
    ),
    deployNotifications: new DeployNotificationService(repositories.users, {
      enabled: config.deployNotificationsEnabled,
      databaseUrl: config.databaseUrl,
      version: readAppVersion()
    }),
    devGrant: new DevGrantService(
      repositories.devGrants,
      config.nodeEnv,
      config.devGrantCommandsEnabled
    ),
    devReset: new DevResetService(repositories.characters, config.nodeEnv),
    duel: new DuelChallengeService(
      repositories.duelChallenges,
      repositories.characters,
      undefined,
      undefined,
      presence
    ),
    equipment: new EquipmentService(
      repositories.equipment,
      repositories.inventory,
      repositories.characters
    ),
    fight,
    hero: new HeroService(
      repositories.characters,
      repositories.inventory,
      repositories.equipment,
      repositories.remorts,
      repositories.shynok
    ),
    hunt: new HuntService(
      repositories.characters,
      repositories.dailyActions,
      repositories.huntContracts
    ),
    inventory: new InventoryService(repositories.inventory),
    itemUse: new ItemUseService(repositories.itemUse),
    itemTransfers: new ItemTransferService(repositories.itemTransfers, presence),
    levelBarter: new LevelBarterService(repositories.levelBarter),
    levelMilestones: new LevelMilestoneService(repositories.levelMilestones),
    mantokChest: new MantokChestService(repositories.mantokChestRuns),
    onboarding: new OnboardingService(repositories.users, repositories.characters),
    presence,
    remort: new RemortService(repositories.remorts),
    restart: new RestartService(repositories.characters),
    shynok: new ShynokService(
      repositories.shynok,
      repositories.characters,
      repositories.dailyActions,
      repositories.roundPurchases
    ),
    tavern: new TavernRaidService(
      repositories.characters,
      repositories.dailyActions,
      repositories.roundPurchases,
      repositories.cooldowns
    ),
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
      repositories.cooldowns
    )
  };
}

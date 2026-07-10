import type { BotServices } from "./botServices";
import type { QuestMarkerInput } from "./keyboards/questButtonMarkers";
import { safeOptionalUiLookup } from "./optionalUiLookup";
import { startPerfSpan } from "./performanceLogger";

export async function buildQuestMarkerSnapshotForTelegramUser(
  telegramUserId: bigint,
  services: Pick<
    BotServices,
    | "adventure"
    | "cellarErrand"
    | "cellarGrownup"
    | "dailyKorchmaRound"
    | "fight"
    | "yeger"
  > & Partial<Pick<BotServices, "barrelBeerTutorial" | "firstKorchmaQuest" | "itemUpgrades">>
): Promise<QuestMarkerInput | null> {
  if (
    typeof services.adventure?.getAdventureOfferForTelegramUser !== "function" ||
    typeof services.fight?.getFightOverviewForTelegramUser !== "function" ||
    typeof services.fight?.getProblemQuestProgressForTelegramUser !== "function" ||
    (
      typeof services.yeger?.getQuestMarkerForTelegramUser !== "function" &&
      typeof services.yeger?.getForTelegramUser !== "function"
    ) ||
    typeof services.cellarErrand?.getForTelegramUser !== "function"
  ) {
    return null;
  }

  const barrelBeerTutorialService = services.barrelBeerTutorial;
  const firstKorchmaQuestService = services.firstKorchmaQuest;
  const itemUpgradesService = services.itemUpgrades;
  const cellarGrownupService = services.cellarGrownup;
  const perf = startPerfSpan("main-menu.quest-markers", { telegramUserId });

  const [
    adventure,
    starterAdventure,
    fight,
    problemQuest,
    firstKorchmaQuest,
    yeger,
    cellar,
    barrelBeerTutorial,
    dailyKorchmaRound,
    itemUpgrades
  ] = await perf.measureDb(() => Promise.all([
    typeof services.adventure?.getAdventureOfferForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "adventure offer",
          () => services.adventure.getAdventureOfferForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    typeof services.adventure.getMimicShawarmaForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "starter adventure",
          () => services.adventure.getMimicShawarmaForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    typeof services.fight?.getFightOverviewForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "fight overview",
          () => services.fight.getFightOverviewForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    typeof services.fight?.getProblemQuestProgressForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "problem quest",
          () => services.fight.getProblemQuestProgressForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    typeof firstKorchmaQuestService?.getForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "first Korchma quest",
          () => firstKorchmaQuestService.getForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    (
      typeof services.yeger?.getQuestMarkerForTelegramUser === "function" ||
      typeof services.yeger?.getForTelegramUser === "function"
    )
      ? optionalQuestMarkerLookup(
          "yeger",
          () => services.yeger.getQuestMarkerForTelegramUser?.(telegramUserId)
            ?? services.yeger.getForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    typeof services.cellarErrand?.getForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "cellar",
          () => services.cellarErrand.getForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    typeof barrelBeerTutorialService?.getForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "barrel beer tutorial",
          () => barrelBeerTutorialService.getForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    services.dailyKorchmaRound
      ? optionalQuestMarkerLookup(
          "daily korchma round",
          () => services.dailyKorchmaRound.getExistingForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null),
    (
      typeof itemUpgradesService?.getQuestMarkerForTelegramUser === "function" ||
      typeof itemUpgradesService?.getUnlockQuestForTelegramUser === "function"
    )
      ? optionalQuestMarkerLookup(
          "item upgrades",
          () => itemUpgradesService.getQuestMarkerForTelegramUser?.(telegramUserId)
            ?? itemUpgradesService.getUnlockQuestForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null)
  ]));

  const cellarGrownup =
    cellarGrownupService && cellar?.state === "level-retired"
      ? await perf.measureDb(() => optionalQuestMarkerLookup(
          "cellar grownup",
          () => cellarGrownupService.getForTelegramUser(telegramUserId)
        ))
      : null;

  const characterLevel = [
    adventure,
    starterAdventure,
    fight,
    problemQuest,
    firstKorchmaQuest,
    yeger,
    cellar,
    barrelBeerTutorial,
    dailyKorchmaRound,
    itemUpgrades,
    cellarGrownup
  ].map(getCharacterLevel).find((level) => level !== undefined);

  if (characterLevel === undefined) {
    perf.end({ resultState: "empty", rowCount: 0 });
    return null;
  }

  const snapshot = {
    characterLevel,
    ...(adventure && adventure.state !== "no-character" ? { adventure } : {}),
    ...(starterAdventure && starterAdventure.state !== "no-character" ? { starterAdventure } : {}),
    ...(fight && fight.state !== "no-character" ? { fight } : {}),
    ...(firstKorchmaQuest && firstKorchmaQuest.state !== "no-character" ? { firstKorchmaQuest } : {}),
    ...(problemQuest && problemQuest.state !== "no-character" ? { problemQuest: problemQuest.progress } : {}),
    ...(yeger && yeger.state !== "no-character" ? { yeger } : {}),
    ...(cellar && cellar.state !== "no-character" ? { cellar } : {}),
    ...(barrelBeerTutorial && barrelBeerTutorial.state !== "no-character" ? { barrelBeerTutorial } : {}),
    ...(dailyKorchmaRound && dailyKorchmaRound.state !== "no-character" ? { dailyKorchmaRound } : {}),
    ...(itemUpgrades && itemUpgrades.state !== "no-character" ? { itemUpgrades } : {}),
    ...(cellarGrownup && cellarGrownup.state !== "no-character" && cellarGrownup.state !== "too-young"
      ? { cellarGrownup }
      : {})
  };
  perf.end({
    resultState: "ready",
    rowCount: Object.keys(snapshot).length - 1
  });

  return snapshot;
}

function getCharacterLevel(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || !("character" in result)) {
    return undefined;
  }

  const character = (result as { character?: { level?: unknown } }).character;

  return typeof character?.level === "number" ? character.level : undefined;
}

function optionalQuestMarkerLookup<T>(
  label: string,
  lookup: () => Promise<T>
): Promise<T | null> {
  return safeOptionalUiLookup<T | null>(`quest marker ${label}`, lookup, null);
}

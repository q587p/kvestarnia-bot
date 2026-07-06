import type { BotServices } from "./botServices";
import type { QuestMarkerInput } from "./keyboards/questButtonMarkers";

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
  > & Partial<Pick<BotServices, "barrelBeerTutorial">>
): Promise<QuestMarkerInput | null> {
  if (
    typeof services.adventure?.getAdventureOfferForTelegramUser !== "function" ||
    typeof services.fight?.getFightOverviewForTelegramUser !== "function" ||
    typeof services.fight?.getProblemQuestProgressForTelegramUser !== "function" ||
    typeof services.yeger?.getForTelegramUser !== "function" ||
    typeof services.cellarErrand?.getForTelegramUser !== "function"
  ) {
    return null;
  }

  const [
    adventure,
    starterAdventure,
    fight,
    problemQuest,
    yeger,
    cellar,
    barrelBeerTutorial,
    dailyKorchmaRound
  ] = await Promise.all([
    typeof services.adventure?.getAdventureOfferForTelegramUser === "function"
      ? services.adventure.getAdventureOfferForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    typeof services.adventure.getMimicShawarmaForTelegramUser === "function"
      ? services.adventure.getMimicShawarmaForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    typeof services.fight?.getFightOverviewForTelegramUser === "function"
      ? services.fight.getFightOverviewForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    typeof services.fight?.getProblemQuestProgressForTelegramUser === "function"
      ? services.fight.getProblemQuestProgressForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    typeof services.yeger?.getForTelegramUser === "function"
      ? services.yeger.getForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    typeof services.cellarErrand?.getForTelegramUser === "function"
      ? services.cellarErrand.getForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    typeof services.barrelBeerTutorial?.getForTelegramUser === "function"
      ? services.barrelBeerTutorial.getForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    services.dailyKorchmaRound
      ? services.dailyKorchmaRound.getExistingForTelegramUser(telegramUserId)
      : Promise.resolve(null)
  ]);

  const cellarGrownup =
    services.cellarGrownup && cellar?.state === "level-retired"
      ? await services.cellarGrownup.getForTelegramUser(telegramUserId)
      : null;

  const characterLevel = [
    adventure,
    starterAdventure,
    fight,
    problemQuest,
    yeger,
    cellar,
    barrelBeerTutorial,
    dailyKorchmaRound,
    cellarGrownup
  ].map(getCharacterLevel).find((level) => level !== undefined);

  if (characterLevel === undefined) {
    return null;
  }

  return {
    characterLevel,
    ...(adventure && adventure.state !== "no-character" ? { adventure } : {}),
    ...(starterAdventure && starterAdventure.state !== "no-character" ? { starterAdventure } : {}),
    ...(fight && fight.state !== "no-character" ? { fight } : {}),
    ...(problemQuest && problemQuest.state !== "no-character" ? { problemQuest: problemQuest.progress } : {}),
    ...(yeger && yeger.state !== "no-character" ? { yeger } : {}),
    ...(cellar && cellar.state !== "no-character" ? { cellar } : {}),
    ...(barrelBeerTutorial && barrelBeerTutorial.state !== "no-character" ? { barrelBeerTutorial } : {}),
    ...(dailyKorchmaRound && dailyKorchmaRound.state !== "no-character" ? { dailyKorchmaRound } : {}),
    ...(cellarGrownup && cellarGrownup.state !== "no-character" && cellarGrownup.state !== "too-young"
      ? { cellarGrownup }
      : {})
  };
}

function getCharacterLevel(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || !("character" in result)) {
    return undefined;
  }

  const character = (result as { character?: { level?: unknown } }).character;

  return typeof character?.level === "number" ? character.level : undefined;
}

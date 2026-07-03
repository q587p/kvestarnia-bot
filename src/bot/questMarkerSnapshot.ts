import type { BotServices } from "./botServices";
import type { QuestMarkerInput } from "./keyboards/questButtonMarkers";

export async function buildQuestMarkerSnapshotForTelegramUser(
  telegramUserId: bigint,
  services: Pick<
    BotServices,
    "adventure" | "cellarErrand" | "cellarGrownup" | "dailyKorchmaRound" | "fight" | "yeger"
  >
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

  const adventure = await services.adventure.getAdventureOfferForTelegramUser(telegramUserId);

  if (adventure.state === "no-character") {
    return null;
  }

  const [
    starterAdventure,
    fight,
    problemQuest,
    yeger,
    cellar,
    dailyKorchmaRound
  ] = await Promise.all([
    typeof services.adventure.getMimicShawarmaForTelegramUser === "function"
      ? services.adventure.getMimicShawarmaForTelegramUser(telegramUserId)
      : Promise.resolve(null),
    services.fight.getFightOverviewForTelegramUser(telegramUserId),
    services.fight.getProblemQuestProgressForTelegramUser(telegramUserId),
    services.yeger.getForTelegramUser(telegramUserId),
    services.cellarErrand.getForTelegramUser(telegramUserId),
    services.dailyKorchmaRound
      ? services.dailyKorchmaRound.getExistingForTelegramUser(telegramUserId)
      : Promise.resolve(null)
  ]);

  if (
    fight.state === "no-character" ||
    problemQuest.state === "no-character" ||
    yeger.state === "no-character" ||
    cellar.state === "no-character"
  ) {
    return null;
  }

  const cellarGrownup =
    services.cellarGrownup && cellar.state === "level-retired"
      ? await services.cellarGrownup.getForTelegramUser(telegramUserId)
      : null;

  return {
    characterLevel: fight.character.level,
    adventure,
    ...(starterAdventure && starterAdventure.state !== "no-character" ? { starterAdventure } : {}),
    fight,
    problemQuest: problemQuest.progress,
    yeger,
    cellar,
    ...(dailyKorchmaRound && dailyKorchmaRound.state !== "no-character" ? { dailyKorchmaRound } : {}),
    ...(cellarGrownup && cellarGrownup.state !== "no-character" && cellarGrownup.state !== "too-young"
      ? { cellarGrownup }
      : {})
  };
}

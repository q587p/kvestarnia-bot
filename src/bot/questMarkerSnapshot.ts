import type { BotServices } from "./botServices";
import type { QuestMarkerInput } from "./keyboards/questButtonMarkers";
import { safeOptionalUiLookup } from "./optionalUiLookup";
import {
  hotPathNow,
  startPerfSpan,
  type QuestMarkerPerformanceSource
} from "./performanceLogger";

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
  const attribution = createQuestMarkerDbAttribution();

  const [
    adventureMarkers,
    fightMarkers,
    firstKorchmaQuest,
    yeger,
    cellar,
    barrelBeerTutorial,
    dailyKorchmaRound,
    itemUpgrades
  ] = await perf.measureDb(() => Promise.all([
    attribution.measure(
      "adventure",
      () => resolveAdventureQuestMarkers(
        telegramUserId,
        services.adventure,
        (sourceCount) => attribution.addSources(sourceCount)
      ),
      typeof services.adventure.getQuestMarkerSnapshotForTelegramUser === "function"
        ? 1
        : getLegacyAdventureSourceWeight(services.adventure)
    ),
    attribution.measure(
      "fight",
      () => resolveFightQuestMarkers(
        telegramUserId,
        services.fight,
        (sourceCount) => attribution.addSources(sourceCount)
      ),
      typeof services.fight.getQuestMarkerSnapshotForTelegramUser === "function" ? 1 : 2
    ),
    typeof firstKorchmaQuestService?.getForTelegramUser === "function"
      ? attribution.measure(
          "first-korchma",
          () => optionalQuestMarkerLookup(
            "first Korchma quest",
            () => firstKorchmaQuestService.getForTelegramUser(telegramUserId)
          )
        )
      : Promise.resolve(null),
    (
      typeof services.yeger?.getQuestMarkerForTelegramUser === "function" ||
      typeof services.yeger?.getForTelegramUser === "function"
    )
      ? attribution.measure(
          "yeger",
          () => optionalQuestMarkerLookup(
            "yeger",
            () => services.yeger.getQuestMarkerForTelegramUser?.(telegramUserId)
              ?? services.yeger.getForTelegramUser(telegramUserId)
          )
        )
      : Promise.resolve(null),
    typeof services.cellarErrand?.getForTelegramUser === "function"
      ? attribution.measure(
          "cellar",
          () => optionalQuestMarkerLookup(
            "cellar",
            () => services.cellarErrand.getForTelegramUser(telegramUserId)
          )
        )
      : Promise.resolve(null),
    typeof barrelBeerTutorialService?.getForTelegramUser === "function"
      ? attribution.measure(
          "barrel-beer",
          () => optionalQuestMarkerLookup(
            "barrel beer tutorial",
            () => barrelBeerTutorialService.getForTelegramUser(telegramUserId)
          )
        )
      : Promise.resolve(null),
    services.dailyKorchmaRound
      ? attribution.measure(
          "daily-korchma",
          () => optionalQuestMarkerLookup(
            "daily korchma round",
            () => services.dailyKorchmaRound.getExistingForTelegramUser(telegramUserId)
          )
        )
      : Promise.resolve(null),
    (
      typeof itemUpgradesService?.getQuestMarkerForTelegramUser === "function" ||
      typeof itemUpgradesService?.getUnlockQuestForTelegramUser === "function"
    )
      ? attribution.measure(
          "item-upgrades",
          () => optionalQuestMarkerLookup(
            "item upgrades",
            () => itemUpgradesService.getQuestMarkerForTelegramUser?.(telegramUserId)
              ?? itemUpgradesService.getUnlockQuestForTelegramUser(telegramUserId)
          )
        )
      : Promise.resolve(null)
  ]));
  const { adventure, starterAdventure } = adventureMarkers;
  const { fight, problemQuest, fightingCornerQuest } = fightMarkers;

  const cellarGrownup =
    cellarGrownupService && cellar?.state === "level-retired"
      ? await perf.measureDb(() => attribution.measure(
          "cellar-grownup",
          () => optionalQuestMarkerLookup(
            "cellar grownup",
            () => cellarGrownupService.getForTelegramUser(telegramUserId)
          )
        ))
      : null;

  const characterLevel = [
    adventure,
    starterAdventure,
    fight,
    problemQuest,
    fightingCornerQuest,
    firstKorchmaQuest,
    yeger,
    cellar,
    barrelBeerTutorial,
    dailyKorchmaRound,
    itemUpgrades,
    cellarGrownup
  ].map(getCharacterLevel).find((level) => level !== undefined);

  if (characterLevel === undefined) {
    perf.end({ resultState: "empty", rowCount: 0, ...attribution.fields() });
    return null;
  }

  const snapshot = {
    characterLevel,
    ...(adventure && adventure.state !== "no-character" ? { adventure } : {}),
    ...(starterAdventure && starterAdventure.state !== "no-character" ? { starterAdventure } : {}),
    ...(fight && fight.state !== "no-character" ? { fight } : {}),
    ...(firstKorchmaQuest && firstKorchmaQuest.state !== "no-character" ? { firstKorchmaQuest } : {}),
    ...(problemQuest && problemQuest.state !== "no-character" ? { problemQuest: problemQuest.progress } : {}),
    ...(fightingCornerQuest &&
      fightingCornerQuest.state !== "no-character" &&
      fightingCornerQuest.state !== "disabled"
      ? { fightingCornerQuest }
      : {}),
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
    rowCount: Object.keys(snapshot).length - 1,
    ...attribution.fields()
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

async function resolveAdventureQuestMarkers(
  telegramUserId: bigint,
  service: BotServices["adventure"],
  addFallbackSources: (sourceCount: number) => void
) {
  if (typeof service.getQuestMarkerSnapshotForTelegramUser === "function") {
    const grouped = await optionalQuestMarkerLookup(
      "adventure snapshot",
      () => service.getQuestMarkerSnapshotForTelegramUser(telegramUserId)
    );

    if (!grouped) {
      const sourceWeight = getLegacyAdventureSourceWeight(service);
      addFallbackSources(sourceWeight);
      return resolveLegacyAdventureQuestMarkers(telegramUserId, service);
    }

    const [adventure, starterAdventure] = await Promise.all([
      resolveSettledQuestMarkerLookup("adventure offer", grouped.adventure),
      resolveSettledQuestMarkerLookup("starter adventure", grouped.starterAdventure)
    ]);

    return { adventure, starterAdventure };
  }

  return resolveLegacyAdventureQuestMarkers(telegramUserId, service);
}

async function resolveLegacyAdventureQuestMarkers(
  telegramUserId: bigint,
  service: BotServices["adventure"]
) {
  const [adventure, starterAdventure] = await Promise.all([
    optionalQuestMarkerLookup(
      "adventure offer",
      () => service.getAdventureOfferForTelegramUser(telegramUserId)
    ),
    typeof service.getMimicShawarmaForTelegramUser === "function"
      ? optionalQuestMarkerLookup(
          "starter adventure",
          () => service.getMimicShawarmaForTelegramUser(telegramUserId)
        )
      : Promise.resolve(null)
  ]);

  return { adventure, starterAdventure };
}

async function resolveFightQuestMarkers(
  telegramUserId: bigint,
  service: BotServices["fight"],
  addFallbackSources: (sourceCount: number) => void
) {
  if (typeof service.getQuestMarkerSnapshotForTelegramUser === "function") {
    const grouped = await optionalQuestMarkerLookup(
      "fight snapshot",
      () => service.getQuestMarkerSnapshotForTelegramUser(telegramUserId)
    );

    if (!grouped) {
      addFallbackSources(2);
      return resolveLegacyFightQuestMarkers(telegramUserId, service);
    }

    const [fight, problemQuest, fightingCornerQuest] = await Promise.all([
      resolveSettledQuestMarkerLookup("fight overview", grouped.fight),
      resolveSettledQuestMarkerLookup("problem quest", grouped.problemQuest),
      grouped.fightingCornerQuest
        ? resolveSettledQuestMarkerLookup("fighting corner quest", grouped.fightingCornerQuest)
        : Promise.resolve(null)
    ]);

    return { fight, problemQuest, fightingCornerQuest };
  }

  return resolveLegacyFightQuestMarkers(telegramUserId, service);
}

async function resolveLegacyFightQuestMarkers(
  telegramUserId: bigint,
  service: BotServices["fight"]
) {
  const [fight, problemQuest] = await Promise.all([
    optionalQuestMarkerLookup(
      "fight overview",
      () => service.getFightOverviewForTelegramUser(telegramUserId)
    ),
    optionalQuestMarkerLookup(
      "problem quest",
      () => service.getProblemQuestProgressForTelegramUser(telegramUserId)
    )
  ]);

  return { fight, problemQuest, fightingCornerQuest: null };
}

function getLegacyAdventureSourceWeight(service: BotServices["adventure"]): number {
  return 1 + (typeof service.getMimicShawarmaForTelegramUser === "function" ? 1 : 0);
}

function resolveSettledQuestMarkerLookup<T>(
  label: string,
  result: PromiseSettledResult<T>
): Promise<T | null> {
  if (result.status === "fulfilled") {
    return Promise.resolve(result.value);
  }

  const error = result.reason instanceof Error
    ? result.reason
    : new Error("Optional quest marker lookup failed with a non-Error reason.");

  return optionalQuestMarkerLookup(label, () => Promise.reject(error));
}

export function createQuestMarkerDbAttribution(now: () => number = hotPathNow) {
  let sourceCount = 0;
  let slowestSource: QuestMarkerPerformanceSource | null = null;
  let slowestSourceMs = 0;

  return {
    addSources(sourceWeight: number): void {
      sourceCount += sourceWeight;
    },
    async measure<T>(
      source: QuestMarkerPerformanceSource,
      lookup: () => Promise<T>,
      sourceWeight = 1
    ): Promise<T> {
      sourceCount += sourceWeight;
      const startedAt = now();

      try {
        return await lookup();
      } finally {
        const durationMs = now() - startedAt;
        if (durationMs > slowestSourceMs) {
          slowestSource = source;
          slowestSourceMs = durationMs;
        }
      }
    },
    fields() {
      return {
        questMarkerSourceCount: sourceCount,
        ...(slowestSource === null
          ? {}
          : {
              questMarkerSlowestSource: slowestSource,
              questMarkerSlowestSourceMs: slowestSourceMs
            })
      };
    }
  };
}

import { type Context } from "grammy";
import type {
PersistentFightDifficultyId
} from "../../services/fightService";
import {
PRESENCE_ADVENTURE_SOLO_FIGHT,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT
} from "../../services/presenceService";
import type { BotServices } from "../botServices";
import { type PlaceCallback } from "../callbacks/placeCallbackData";
import { sendFight } from "../commands/fightCommand";
import { playerFromContext } from "../context";
import {
buildPersistentFightPassagePreviewKeyboard,
buildPersistentFightPassageRestKeyboard
} from "../keyboards/fightKeyboard";
import {
buildBackToKorchmaHallKeyboard
} from "../keyboards/tavernKeyboard";
import {
presentFightNoCharacter,
presentFightMonsterRest,
presentPersistentFightPassagePreview
} from "../presenters/fightPresenter";
import {
presentKorchmaDeepLevelLocked
} from "../presenters/tavernPresenter";
import { getPassageSearchNodeKey } from "../../services/passageSearchService";
import { isPassageSearchAvailable } from "../passageSearchAvailability";
import { safeEditMessageText } from "../safeEditMessageText";

import { markScenePresence } from "./scenePresence";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function placeCallbackToPersistentFightPassage(action: PlaceCallback): {
  difficulty: PersistentFightDifficultyId;
  locationId: string;
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
} | null {
  if (action === "deep-left") {
    return {
      difficulty: "hard",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      passage: action
    };
  }

  if (action === "deep-straight") {
    return {
      difficulty: "normal",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
      passage: action
    };
  }

  if (action === "deep-right") {
    return {
      difficulty: "easy",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
      passage: action
    };
  }

  return null;
}

export async function sendPersistentFightPassagePreview(
  ctx: Context,
  services: BotServices,
  passageFight: {
    difficulty: PersistentFightDifficultyId;
    locationId: string;
    passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
  },
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeEditOrReply(ctx, mode, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (typeof services.fight.getPassageSearchRestWindowForTelegramUser === "function") {
    const restWindow = await services.fight.getPassageSearchRestWindowForTelegramUser(telegramUserId);
    if (restWindow.state === "monster-rest") {
      await markScenePresence(ctx, services.presence, {
        locationId: passageFight.locationId,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
      await safeEditOrReply(ctx, mode, presentFightMonsterRest(restWindow), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightPassageRestKeyboard({
          passage: passageFight.passage,
          searchAvailable: await isPassageSearchAvailable(
            services.passageSearch,
            telegramUserId,
            getPassageSearchNodeKey(passageFight.passage)
          )
        })
      });
      return;
    }
  }

  const preview = await services.fight.previewPersistentFightForTelegramUser(telegramUserId, {
    difficulty: passageFight.difficulty,
    originLocationId: passageFight.locationId
  });

  if ("character" in preview && preview.character.level < 3) {
    await safeEditOrReply(ctx, mode, presentKorchmaDeepLevelLocked(preview.character), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBackToKorchmaHallKeyboard()
    });
    return;
  }

  if (preview.state !== "persistent-preview") {
    if (preview.state === "monster-rest") {
      await markScenePresence(ctx, services.presence, {
        locationId: passageFight.locationId,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
      await safeEditOrReply(ctx, mode, presentFightMonsterRest(preview), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightPassageRestKeyboard({
          passage: passageFight.passage,
          searchAvailable: await isPassageSearchAvailable(
            services.passageSearch,
            telegramUserId,
            getPassageSearchNodeKey(passageFight.passage)
          )
        })
      });
      return;
    }

    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      passageSearch: services.passageSearch,
      requireKorchmaInterior: false
    });
    return;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: passageFight.locationId,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
  });
  await safeEditOrReply(ctx, mode, presentPersistentFightPassagePreview(preview), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPersistentFightPassagePreviewKeyboard({
      passage: passageFight.passage,
      encounterToken: preview.encounterToken,
      searchAvailable: await isPassageSearchAvailable(
        services.passageSearch,
        telegramUserId,
        getPassageSearchNodeKey(passageFight.passage)
      )
    })
  });
}

export async function safeEditOrReply(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  options?: Parameters<Context["editMessageText"]>[1]
): Promise<void> {
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

export function presenceLocationToPersistentFightPassage(locationId: string): {
  difficulty: PersistentFightDifficultyId;
  locationId: string;
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
} | null {
  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT) {
    return {
      difficulty: "hard",
      locationId,
      passage: "deep-left"
    };
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT) {
    return {
      difficulty: "normal",
      locationId,
      passage: "deep-straight"
    };
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT) {
    return {
      difficulty: "easy",
      locationId,
      passage: "deep-right"
    };
  }

  return null;
}

export function persistentFightDifficultyToPassageLocationId(
  difficulty: PersistentFightDifficultyId
): string {
  if (difficulty === "hard") {
    return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT;
  }

  if (difficulty === "easy") {
    return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT;
  }

  return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT;
}

import type { Bot, Context } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureService } from "../../services/adventureService";
import type { CellarErrandService } from "../../services/cellarErrandService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildAdventureKeyboard,
  buildAdventureResultKeyboard
} from "../keyboards/adventureKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentAdventureAlreadyCompleted,
  presentAdventureLevelRetired,
  presentAdventureNoCharacter,
  presentAdventureStart
} from "../presenters/adventurePresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendCellarErrand } from "./cellarCommand";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface AdventureCommandOptions {
  cellarErrand: CellarErrandService;
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerAdventureCommand(
  bot: Bot,
  adventureService: AdventureService,
  options: AdventureCommandOptions
): void {
  bot.command("adventure", async (ctx) => {
    await sendAdventure(ctx, adventureService, "reply", {
      ...options,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });
  });
}

export async function sendAdventure(
  ctx: Context,
  adventureService: AdventureService,
  mode: "reply" | "edit",
  options?: AdventureCommandOptions & {
    fallbackToCellar?: boolean;
    requireKorchmaInterior?: boolean;
  }
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options?.tavernRaid, mode)
  ) {
    return;
  }

  if (options?.requireKorchmaInterior === true) {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "ready" && !place.insideKorchma) {
      await sendText(ctx, mode, "Квести видають усередині.", "enter-korchma");
      return;
    }
  }

  const result = await adventureService.getMimicShawarmaForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentAdventureNoCharacter());
    return;
  }

  if (result.state === "level-retired") {
    await sendText(ctx, mode, presentAdventureLevelRetired(result));
    return;
  }

  if (options?.presence) {
    await markQuestTablePresence(ctx, options.presence);
  }

  if (result.state === "already-completed") {
    if (options?.fallbackToCellar === true && !result.fightAvailable) {
      await sendCellarErrand(ctx, options.cellarErrand, options.presence, mode);
      return;
    }

    await sendText(ctx, mode, presentAdventureAlreadyCompleted(result), "adventure-result");
    return;
  }

  await sendText(ctx, mode, presentAdventureStart(result.character), {
    type: "adventure",
    character: result.character
  });
}

async function markQuestTablePresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | "adventure-result"
    | "enter-korchma"
    | { type: "adventure"; character: CharacterSummary } = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "adventure-result"
            ? buildAdventureResultKeyboard("already-completed")
            : keyboard === "enter-korchma"
              ? buildKorchmaFrontKeyboard()
            : buildAdventureKeyboard(keyboard.character)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

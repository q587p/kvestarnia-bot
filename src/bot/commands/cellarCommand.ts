import type { Bot, Context } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { PresenceService } from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_LOCATION_KORCHMA_CELLAR
} from "../../services/presenceService";
import type { CellarErrandLookupResult, CellarErrandService } from "../../services/cellarErrandService";
import type { CellarGrownupQuestService } from "../../services/cellarGrownupQuestService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildCellarGrownupKeyboard, buildCellarResultKeyboard } from "../keyboards/cellarKeyboard";
import type { QuestMarkerInput } from "../keyboards/questButtonMarkers";
import {
  presentCellarGrownupQuest,
  presentCellarCooldown,
  presentCellarIntro,
  presentCellarLevelLocked,
  presentCellarLevelRetired,
  presentCellarNoCharacter,
  presentCellarStart
} from "../presenters/cellarPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { buildEnterKorchmaKeyboard } from "../keyboards/tavernKeyboard";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];
type CellarRouteOptions = {
  tavernRaid?: TavernRaidService;
  grownupQuest?: CellarGrownupQuestService;
  afterIntro?: () => Promise<void>;
  questMarkers?: QuestMarkerInput | null;
  requireKorchmaInterior?: boolean;
};

export function registerCellarCommand(
  bot: Bot,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService,
  tavernRaidService?: TavernRaidService,
  grownupQuestService?: CellarGrownupQuestService
): void {
  bot.command("cellar", async (ctx) => {
    await sendCellarErrandRouted(
      ctx,
      cellarErrandService,
      presenceService,
      "reply",
      {
        ...(tavernRaidService ? { tavernRaid: tavernRaidService } : {}),
        ...(grownupQuestService ? { grownupQuest: grownupQuestService } : {})
      }
    );
  });
}

export async function sendCellarErrandRouted(
  ctx: Context,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  options?: CellarRouteOptions
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options?.tavernRaid, mode)
  ) {
    return;
  }

  const place = await presenceService.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  if (options?.requireKorchmaInterior !== false && !place.insideKorchma) {
    await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
    return;
  }

  await sendCellarErrand(
    ctx,
    cellarErrandService,
    presenceService,
    mode,
    options
  );
}

export async function sendCellarErrand(
  ctx: Context,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService,
  mode: "reply" | "edit",
  options?: Pick<CellarRouteOptions, "grownupQuest" | "afterIntro" | "questMarkers">
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  const result = await cellarErrandService.getForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentCellarNoCharacter());
    return;
  }

  if (result.state === "level-locked") {
    await sendText(ctx, mode, presentCellarLevelLocked(result));
    return;
  }

  if (result.state === "level-retired") {
    if (options?.grownupQuest) {
      const grownup = await options.grownupQuest.getForTelegramUser(telegramUserId);

      if (grownup.state === "no-character") {
        await sendText(ctx, mode, presentCellarNoCharacter());
        return;
      }

      if (grownup.state === "too-young") {
        await sendText(ctx, mode, presentCellarLevelLocked({
          state: "level-locked",
          character: grownup.character,
          requiredLevel: grownup.requiredLevel
        }));
        return;
      }

      await markCellarPresence(ctx, presenceService);
      await sendText(ctx, mode, presentCellarGrownupQuest(grownup), {
        state: grownup.state,
        includeKeptBottle: grownup.state === "completed" && grownup.ending === "keep",
        ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
      });
      return;
    }

    await sendText(ctx, mode, presentCellarLevelRetired(result));
    return;
  }

  await markCellarPresence(ctx, presenceService);

  if (result.state === "on-cooldown") {
    await sendText(ctx, mode, presentCellarCooldown(result), {
      state: "on-cooldown",
      character: result.character,
      ...(options?.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
    });
    return;
  }

  await sendCellarReady(ctx, mode, result, options);
}

async function sendCellarReady(
  ctx: Context,
  mode: "reply" | "edit",
  result: Extract<CellarErrandLookupResult, { state: "ready" }>,
  options?: Pick<CellarRouteOptions, "afterIntro" | "questMarkers">
): Promise<void> {
  await sendText(ctx, mode, presentCellarIntro(result));
  await options?.afterIntro?.();
  await sendText(ctx, "reply", presentCellarStart(result), {
    state: "ready",
    character: result.character,
    ...(options?.questMarkers === undefined ? {} : { questMarkers: options.questMarkers })
  });
}

export async function markCellarPresence(
  ctx: Context,
  presenceService: PresenceService
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presenceService.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | "enter-korchma"
    | {
        state: "offered" | "has-seal" | "roleplay-cooldown" | "bottle-obtained" | "completed" | "insufficient";
        includeKeptBottle?: boolean;
        hideRoleplay?: boolean;
        questMarkers?: QuestMarkerInput | null;
      }
    | { state: "ready" | "on-cooldown"; character: CharacterSummary; questMarkers?: QuestMarkerInput | null } = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma"
            ? buildEnterKorchmaKeyboard()
            : isGrownupKeyboard(keyboard)
              ? buildCellarGrownupKeyboard(keyboard.state, {
                  includeKeptBottle: Boolean(keyboard.includeKeptBottle),
                  hideRoleplay: Boolean(keyboard.hideRoleplay),
                  ...(keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers })
                })
            : buildCellarResultKeyboard(
                keyboard.state,
                keyboard.character,
                keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }
              )
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function isGrownupKeyboard(
  keyboard:
    | "enter-korchma"
    | {
      state: "offered" | "has-seal" | "roleplay-cooldown" | "bottle-obtained" | "completed" | "insufficient";
      includeKeptBottle?: boolean;
      hideRoleplay?: boolean;
      questMarkers?: QuestMarkerInput | null;
    }
    | { state: "ready" | "on-cooldown"; character: CharacterSummary; questMarkers?: QuestMarkerInput | null }
): keyboard is {
  state: "offered" | "has-seal" | "roleplay-cooldown" | "bottle-obtained" | "completed" | "insufficient";
  includeKeptBottle?: boolean;
  hideRoleplay?: boolean;
  questMarkers?: QuestMarkerInput | null;
} {
  return typeof keyboard !== "string" && !("character" in keyboard);
}

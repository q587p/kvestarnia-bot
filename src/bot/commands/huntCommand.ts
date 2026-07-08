import type { Bot, Context } from "grammy";
import type { TavernRaidService } from "../../services/tavernRaidService";
import type { YegerQuestService } from "../../services/yegerQuestService";
import {
  PRESENCE_ADVENTURE_HUNT_BOARD,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import type { QuestMarkerInput } from "../keyboards/questButtonMarkers";
import {
  buildYegerCornerKeyboard,
  buildYegerHuntKeyboard,
  buildYegerKeyboard,
  type YegerNavigationOptions
} from "../keyboards/yegerKeyboard";
import { buildEnterKorchmaKeyboard } from "../keyboards/tavernKeyboard";
import {
  presentYegerCorner,
  presentYegerHuntOutside,
  presentYegerNoCharacter
} from "../presenters/yegerPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { safeOptionalUiLookup } from "../optionalUiLookup";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface HuntCommandOptions {
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
  questMarkers?: QuestMarkerInput | null;
  resolveQuestMarkers?: (telegramUserId: bigint) => Promise<QuestMarkerInput | null>;
  resolveFieldKitHelp?: (telegramUserId: bigint) => Promise<boolean>;
}

export function registerHuntCommand(
  bot: Bot,
  yegerQuestService: YegerQuestService,
  options: HuntCommandOptions
): void {
  bot.command("hunt", async (ctx) => {
    await sendHuntBoard(ctx, yegerQuestService, "reply", {
      ...options,
      requireKorchmaInterior: false
    });
  });
}

export async function sendHuntBoard(
  ctx: Context,
  yegerQuestService: YegerQuestService,
  mode: "reply" | "edit",
  options?: HuntCommandOptions & {
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

    if (place.state === "no-character") {
      await sendText(ctx, mode, presentYegerNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await yegerQuestService.getForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentYegerNoCharacter());
    return;
  }

  if (result.state !== "in-progress") {
    await markYegerCornerPresence(ctx, options?.presence);
    await sendText(ctx, mode, presentYegerCorner(result), {
      kind: "corner",
      result,
      ...(await resolveYegerNavigationOptions(telegramUserId, options))
    });
    return;
  }

  await markHuntPresence(ctx, options?.presence);
  await sendText(ctx, mode, presentYegerHuntOutside(result), {
    kind: "hunt",
    result
  });
}

export async function sendYegerCorner(
  ctx: Context,
  yegerQuestService: YegerQuestService,
  mode: "reply" | "edit",
  options?: HuntCommandOptions & {
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

    if (place.state === "no-character") {
      await sendText(ctx, mode, presentYegerNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await yegerQuestService.getForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentYegerNoCharacter());
    return;
  }

  await markYegerCornerPresence(ctx, options?.presence);
  await sendText(ctx, mode, presentYegerCorner(result), {
    kind: "corner",
    result,
    ...(await resolveYegerNavigationOptions(telegramUserId, options))
  });
}

export async function markHuntPresence(
  ctx: Context,
  presence: PresenceService | undefined
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player || !presence) {
    return;
  }

  await presence.markAction({
    user: player,
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
    });
}

export async function markYegerCornerPresence(
  ctx: Context,
  presence: PresenceService | undefined
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player || !presence) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_HUNT_BOARD
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | Parameters<typeof buildYegerKeyboard>[0]
    | ({ kind: "corner"; result: Parameters<typeof buildYegerCornerKeyboard>[0] } & YegerNavigationOptions)
    | { kind: "hunt"; result: Parameters<typeof buildYegerHuntKeyboard>[0] }
    | "enter-korchma"
    | false = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup: buildReplyMarkup(keyboard)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function buildReplyMarkup(
  keyboard:
    | Parameters<typeof buildYegerKeyboard>[0]
    | ({ kind: "corner"; result: Parameters<typeof buildYegerCornerKeyboard>[0] } & YegerNavigationOptions)
    | { kind: "hunt"; result: Parameters<typeof buildYegerHuntKeyboard>[0] }
    | "enter-korchma"
) {
  if (keyboard === "enter-korchma") {
    return buildEnterKorchmaKeyboard();
  }

  if ("kind" in keyboard) {
    if (keyboard.kind === "hunt") {
      return buildYegerHuntKeyboard(keyboard.result);
    }

    return buildYegerCornerKeyboard(
      keyboard.result,
      {
        ...(keyboard.questMarkers === undefined ? {} : { questMarkers: keyboard.questMarkers }),
        ...(keyboard.showFieldKitHelp ? { showFieldKitHelp: true } : {})
      }
    );
  }

  return buildYegerKeyboard(keyboard);
}

async function resolveYegerQuestMarkers(
  telegramUserId: bigint,
  options: HuntCommandOptions | undefined
): Promise<QuestMarkerInput | null> {
  if (options?.questMarkers !== undefined) {
    return options.questMarkers;
  }

  return options?.resolveQuestMarkers?.(telegramUserId) ?? null;
}

async function resolveYegerNavigationOptions(
  telegramUserId: bigint,
  options: HuntCommandOptions | undefined
): Promise<YegerNavigationOptions> {
  const [questMarkers, showFieldKitHelp] = await Promise.all([
    safeOptionalUiLookup(
      "yeger navigation markers",
      () => resolveYegerQuestMarkers(telegramUserId, options),
      null
    ),
    safeOptionalUiLookup(
      "yeger field-kit navigation",
      () => options?.resolveFieldKitHelp?.(telegramUserId) ?? Promise.resolve(false),
      false
    )
  ]);

  return {
    ...(questMarkers ? { questMarkers } : {}),
    ...(showFieldKitHelp ? { showFieldKitHelp: true } : {})
  };
}

import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import {
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_RAID_FRIDAY_BARREL
} from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../keyboards/tavernKeyboard";
import {
  presentKorchmaArrivalBoard,
  presentKorchmaFront,
  presentKorchmaHall,
  presentTavern,
  presentTavernAlreadyRaided,
  presentTavernNoCharacter,
  presentTavernRaidAuditBreak,
  presentTavernRaidPending,
  presentTavernRaidReadyToComplete
} from "../presenters/tavernPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

type ReplyOptions = Parameters<Context["reply"]>[1];

export function registerTavernCommand(
  bot: Bot,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService
): void {
  bot.command("tavern", async (ctx) => {
    await sendTavern(ctx, tavernRaidService, presenceService, "reply");
  });

  bot.command("raid", async (ctx) => {
    await sendTavernBarrel(ctx, tavernRaidService, presenceService, "reply");
  });
}

export async function sendTavern(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_HALL);
  const presence = await presenceService.getKorchmaInteriorPresence();

  await sendText(
    ctx,
    mode,
    presentKorchmaHall(result.character, presence, telegramUserId, {
      flavorSeed: `korchma-hall:${ctx.update?.update_id ?? "manual"}`
    }),
    "hall"
  );
}

export async function sendKorchmaFront(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FRONT);
  await sendText(ctx, mode, presentKorchmaFront(result.character), "front");
}

export async function sendKorchmaArrivalBoard(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_FRONT);
  const board = await presenceService.getKorchmaArrivalBoard();

  await sendText(ctx, mode, presentKorchmaArrivalBoard(result.character, board), "arrivals");
}

export async function sendTavernBarrel(
  ctx: Context,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTavernNoCharacter());
    return;
  }

  if (result.state === "already-completed") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernAlreadyRaided(result.character), "barrel-result");
    return;
  }

  if (result.state === "audit-break") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendText(ctx, mode, presentTavernRaidAuditBreak(result), "barrel-result");
    return;
  }

  if (result.state === "pending") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidPending(result), "barrel-pending");
    return;
  }

  if (result.state === "pending-complete") {
    await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL, true);
    await sendText(ctx, mode, presentTavernRaidReadyToComplete(result), "barrel-pending");
    return;
  }

  await markTavernPlace(ctx, presenceService, PRESENCE_LOCATION_KORCHMA_BARREL);
  await sendText(ctx, mode, presentTavern(result.character), true);
}

async function markTavernPlace(
  ctx: Context,
  presenceService: PresenceService,
  locationId: string,
  inPendingRaid = false
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presenceService.markAction({
    user: player,
    locationId,
    currentRaidId: inPendingRaid ? PRESENCE_RAID_FRIDAY_BARREL : null,
    currentAdventureId: null
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | boolean
    | "hall"
    | "front"
    | "arrivals"
    | "barrel-result"
    | "barrel-pending" = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "hall"
            ? buildKorchmaHallKeyboard()
            : keyboard === "front"
              ? buildKorchmaFrontKeyboard()
              : keyboard === "arrivals"
                ? buildKorchmaArrivalBoardKeyboard()
                : keyboard === "barrel-result"
                  ? buildTavernResultKeyboard("already-completed")
                  : keyboard === "barrel-pending"
                    ? buildTavernResultKeyboard("pending")
                    : buildTavernKeyboard()
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

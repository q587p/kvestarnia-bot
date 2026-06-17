import type { Bot, Context } from "grammy";
import type { TrainingDoppelgangerService } from "../../services/trainingDoppelgangerService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import {
  presentTrainingDoppelganger,
  presentTrainingDoppelgangerAnotherFight,
  presentTrainingDoppelgangerCooldown,
  presentTrainingDoppelgangerIntro,
  presentTrainingDoppelgangerLevelGate,
  presentTrainingDoppelgangerNeedsRest,
  presentTrainingDoppelgangerNoCharacter
} from "../presenters/trainingDoppelgangerPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface TrainingDoppelgangerCommandOptions {
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerTrainingDoppelgangerCommand(
  bot: Bot,
  service: TrainingDoppelgangerService,
  options: TrainingDoppelgangerCommandOptions
): void {
  bot.command("spar", async (ctx) => {
    await sendTrainingDoppelganger(ctx, service, "reply", {
      ...options,
      requireKorchmaInterior: true
    });
  });
}

export async function sendTrainingDoppelganger(
  ctx: Context,
  service: TrainingDoppelgangerService,
  mode: "reply" | "edit",
  options: TrainingDoppelgangerCommandOptions & {
    requireKorchmaInterior?: boolean;
  }
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  if (
    await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, mode)
  ) {
    return;
  }

  if (options.requireKorchmaInterior === true) {
    const place = await options.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await sendText(ctx, mode, presentTrainingDoppelgangerNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await service.getOrStartForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentTrainingDoppelgangerNoCharacter());
    return;
  }

  if (result.state === "level-gated") {
    await sendText(ctx, mode, presentTrainingDoppelgangerLevelGate(result), "training");
    return;
  }

  if (result.state === "needs-rest") {
    await sendText(ctx, mode, presentTrainingDoppelgangerNeedsRest(result), "training");
    return;
  }

  if (result.state === "on-cooldown") {
    await sendText(ctx, mode, presentTrainingDoppelgangerCooldown(result), "training");
    return;
  }

  if (result.state === "another-fight-active") {
    await sendText(ctx, mode, presentTrainingDoppelgangerAnotherFight(result), "training");
    return;
  }

  await markTrainingPresence(ctx, options.presence);
  if (result.state === "active") {
    await sendText(ctx, mode, presentTrainingDoppelgangerIntro(result));
    await sendText(ctx, "reply", presentTrainingDoppelganger(result), {
      session: result.session,
      character: result.character
    });
    return;
  }

  await sendText(ctx, mode, presentTrainingDoppelganger(result), {
    session: result.session,
    character: result.character
  });
}

async function markTrainingPresence(ctx: Context, presence: PresenceService): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | "enter-korchma"
    | "training"
    | {
        session: Parameters<typeof buildTrainingDoppelgangerKeyboard>[0];
        character: Parameters<typeof buildTrainingDoppelgangerKeyboard>[1];
      } = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma"
            ? buildKorchmaFrontKeyboard()
            : keyboard === "training"
              ? buildTrainingDoppelgangerKeyboard()
              : buildTrainingDoppelgangerKeyboard(keyboard.session, keyboard.character)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

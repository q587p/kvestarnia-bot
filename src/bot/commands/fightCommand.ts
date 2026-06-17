import type { Bot, Context } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { FightService } from "../../services/fightService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildFightKeyboard,
  buildPersistentFightReadyKeyboard,
  buildPersistentFightResultKeyboard
} from "../keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { buildKorchmaFrontKeyboard } from "../keyboards/tavernKeyboard";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  presentFightAlreadyCompleted,
  presentFightLevelRetired,
  presentFightNeedsRest,
  presentFightNoCharacter,
  presentFightStart,
  presentFightTrainingActive,
  presentPersistentFight
} from "../presenters/fightPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

type ReplyOptions = Parameters<Context["reply"]>[1];

export interface FightCommandOptions {
  presence: PresenceService;
  tavernRaid?: TavernRaidService;
}

export function registerFightCommand(
  bot: Bot,
  fightService: FightService,
  options: FightCommandOptions
): void {
  bot.command("fight", async (ctx) => {
    await sendFight(ctx, fightService, "reply", {
      ...options,
      requireKorchmaInterior: true
    });
  });
}

export async function sendFight(
  ctx: Context,
  fightService: FightService,
  mode: "reply" | "edit",
  options?: FightCommandOptions & {
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
      await sendText(ctx, mode, presentFightNoCharacter());
      return;
    }

    if (!place.insideKorchma) {
      await sendText(ctx, mode, presentKorchmaQuestGate(), "enter-korchma");
      return;
    }
  }

  const result = await fightService.getFightForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentFightNoCharacter());
    return;
  }

  if (result.state === "level-retired") {
    await sendText(ctx, mode, presentFightLevelRetired(result));
    return;
  }

  if (result.state === "needs-rest") {
    await sendText(ctx, mode, presentFightNeedsRest(result));
    return;
  }

  if (result.state === "training-active") {
    await sendText(ctx, mode, presentFightTrainingActive(result), {
      type: "training-active",
      character: result.character,
      session: result.session
    });
    return;
  }

  if (result.state === "persistent-not-issued") {
    await sendText(
      ctx,
      mode,
      [
        "📋 Бій ще не відкрито.",
        "",
        "Корчмар тримає папірець у Шинку. Спершу візьміть справу там, тоді проблеми почнуть рахуватися чесно."
      ].join("\n"),
      "problem-not-issued"
    );
    return;
  }

  if (options?.presence) {
    await markFightPresence(ctx, options.presence, {
      persistent: result.state === "persistent-active" || result.state === "persistent-terminal"
    });
  }

  if (result.state === "already-completed") {
    await sendText(ctx, mode, presentFightAlreadyCompleted(result));
    return;
  }

  if (result.state === "persistent-active" || result.state === "persistent-terminal") {
    await sendText(ctx, mode, presentPersistentFight(result), {
      type: "persistent-fight",
      character: result.character,
      session: result.session
    });
    return;
  }

  if (result.state === "persistent-ready") {
    await sendText(
      ctx,
      mode,
      [
        "⚔️ Бій не стартував.",
        "",
        "Корчмар загубив монстра між рядками, але лишив вам дорогу назад до справ."
      ].join("\n"),
      "persistent-ready"
    );
    return;
  }

  await sendText(ctx, mode, presentFightStart(result.character), {
    type: "fight",
    character: result.character
  });
}

async function markFightPresence(
  ctx: Context,
  presence: PresenceService,
  options?: { persistent?: boolean }
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presence.markAction({
    user: player,
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: options?.persistent
      ? PRESENCE_ADVENTURE_SOLO_FIGHT
      : PRESENCE_ADVENTURE_MIMIC_FIGHT
  });
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  keyboard:
    | false
    | "enter-korchma"
    | "persistent-ready"
    | "problem-not-issued"
    | {
        type: "training-active";
        character: CharacterSummary;
        session: Parameters<typeof buildTrainingDoppelgangerKeyboard>[0];
      }
    | { type: "fight"; character: CharacterSummary }
    | {
        type: "persistent-fight";
        character: CharacterSummary;
        session: Parameters<typeof buildPersistentFightResultKeyboard>[0];
      } = false
): Promise<void> {
  const options = keyboard
    ? {
        parse_mode: "HTML" as const,
        reply_markup:
          keyboard === "enter-korchma"
            ? buildKorchmaFrontKeyboard()
            : keyboard === "persistent-ready"
              ? buildPersistentFightReadyKeyboard()
              : keyboard === "problem-not-issued"
              ? {
                  inline_keyboard: [
                    [{ text: "🍻 До Шинку", callback_data: makePlaceCallbackData("bar") }],
                    [{ text: "📋 До справ", callback_data: makePlaceCallbackData("quest-table") }]
                  ]
                }
              : keyboard.type === "training-active"
              ? buildTrainingDoppelgangerKeyboard(keyboard.session, keyboard.character)
              : keyboard.type === "persistent-fight"
              ? buildPersistentFightResultKeyboard(keyboard.session, keyboard.character)
              : buildFightKeyboard(keyboard.character)
      }
    : ({ parse_mode: "HTML" as const } satisfies ReplyOptions);

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

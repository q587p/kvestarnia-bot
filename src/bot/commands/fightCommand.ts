import type { Bot, Context } from "grammy";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { FightService } from "../../services/fightService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import {
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  type PresenceService
} from "../../services/presenceService";
import { playerFromContext, telegramUserIdFromContext } from "../context";
import {
  buildFightKeyboard,
  buildPersistentFightDifficultyKeyboard,
  buildPersistentFightReadyKeyboard,
  buildPersistentFightResultKeyboard
} from "../keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "../keyboards/trainingDoppelgangerKeyboard";
import { buildEnterKorchmaKeyboard, buildKorchmaDeepKeyboard } from "../keyboards/tavernKeyboard";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  presentFightAlreadyCompleted,
  presentFightLevelRetired,
  presentFightMonsterRest,
  presentFightNeedsRest,
  presentFightNoCharacter,
  presentFightStart,
  presentFightTrainingActive,
  presentPersistentFightDifficultyChoice,
  presentPersistentFight
} from "../presenters/fightPresenter";
import { presentKorchmaDeepClosed } from "../presenters/tavernPresenter";
import {
  prefixResourceRecoveryNotice,
  presentResourceRecoveryNotice
} from "../presenters/resourceRecoveryPresenter";
import { presentKorchmaQuestGate } from "../presenters/questHubPresenter";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";
import type { PersistentFightDifficultyId } from "../../services/fightService";

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
    openDifficulty?: boolean;
    difficulty?: PersistentFightDifficultyId;
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

  const result = options?.difficulty
    ? await fightService.getOrStartPersistentFightForTelegramUser(telegramUserId, {
        difficulty: options.difficulty
      })
    : typeof fightService.getFightOverviewForTelegramUser === "function"
      ? await fightService.getFightOverviewForTelegramUser(telegramUserId)
      : await fightService.getFightForTelegramUser(telegramUserId);

  if (result.state === "no-character") {
    await sendText(ctx, mode, presentFightNoCharacter());
    return;
  }

  if (result.state === "level-retired") {
    await sendResultText(presentFightLevelRetired(result));
    return;
  }

  if (result.state === "needs-rest") {
    await sendResultText(presentFightNeedsRest(result));
    return;
  }

  if (result.state === "monster-rest") {
    await sendResultText(presentFightMonsterRest(result), "persistent-ready");
    return;
  }

  if (result.state === "training-active") {
    await sendResultText(presentFightTrainingActive(result), {
      type: "training-active",
      character: result.character,
      session: result.session
    });
    return;
  }

  if (result.state === "persistent-not-issued") {
    await sendResultText(
      [
        "📋 Бій ще не відкрито.",
        "",
        "Корчмар тримає папірець у шинку. Спершу візьміть справу там, тоді проблеми почнуть рахуватися чесно."
      ].join("\n"),
      "problem-not-issued"
    );
    return;
  }

  if (options?.presence) {
    await markFightPresence(ctx, options.presence, {
      persistent:
        result.state === "persistent-ready" ||
        result.state === "persistent-active" ||
        result.state === "persistent-terminal" ||
        result.state === "monster-rest"
    });
  }

  if (result.state === "already-completed") {
    await sendResultText(presentFightAlreadyCompleted(result));
    return;
  }

  if (result.state === "persistent-active") {
    await sendResultText(presentPersistentFight(result), {
      type: "persistent-fight",
      character: result.character,
      session: result.session
    });
    return;
  }

  if (result.state === "persistent-ready") {
    if (!options?.openDifficulty) {
      await sendResultText(presentKorchmaDeepClosed(result.character), "deep");
      return;
    }

    await sendResultText(
      presentPersistentFightDifficultyChoice(result),
      "persistent-difficulty"
    );
    return;
  }

  if (result.state === "persistent-terminal") {
    await sendResultText(presentKorchmaDeepClosed(result.character), "deep");
    return;
  }

  await sendResultText(presentFightStart(result.character), {
    type: "fight",
    character: result.character
  });

  async function sendResultText(
    text: string,
    keyboard: Parameters<typeof sendText>[3] = false
  ): Promise<void> {
    if (result.state !== "no-character" && result.recoveryNotice && mode === "reply") {
      await sendText(ctx, "reply", presentResourceRecoveryNotice(result.recoveryNotice));
    }

    await sendText(
      ctx,
      mode,
      result.state !== "no-character" && mode === "edit"
        ? prefixResourceRecoveryNotice(text, result.recoveryNotice)
        : text,
      keyboard
    );
  }
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
    locationId: options?.persistent ? PRESENCE_LOCATION_KORCHMA_DEEP : PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
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
    | "deep"
    | "persistent-difficulty"
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
            ? buildEnterKorchmaKeyboard()
            : keyboard === "deep"
              ? buildKorchmaDeepKeyboard()
            : keyboard === "persistent-difficulty"
              ? buildPersistentFightDifficultyKeyboard()
            : keyboard === "persistent-ready"
              ? buildPersistentFightReadyKeyboard()
              : keyboard === "problem-not-issued"
              ? {
                  inline_keyboard: [
                    [{ text: "🍻 До шинку", callback_data: makePlaceCallbackData("bar") }],
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

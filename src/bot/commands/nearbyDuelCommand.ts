import type { Context } from "grammy";
import type { NearbyDuelCallback } from "../callbacks/nearbyDuelCallbackData";
import type { DuelChallengeService } from "../../services/duelChallengeService";
import type { PartySessionService } from "../../services/partySessionService";
import type { PresencePerson, PresenceService } from "../../services/presenceService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { telegramUserIdFromContext } from "../context";
import { buildDuelChallengeKeyboard, buildDuelTargetedInviteKeyboard } from "../keyboards/duelKeyboard";
import {
  buildNearbyDuelCandidatesKeyboard,
  buildNearbyDuelModeKeyboard,
  buildNearbyDuelResourceWarningKeyboard
} from "../keyboards/nearbyDuelKeyboard";
import {
  presentNearbyDuelCandidates,
  presentNearbyDuelCreate,
  presentNearbyDuelMode,
  presentNearbyDuelTargetMissing,
  presentNearbyDuelTargetNotification
} from "../presenters/nearbyDuelPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { sendPendingRaidBlockIfNeeded } from "./pendingRaidGuard";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface NearbyDuelCommandOptions {
  presence: PresenceService;
  duel: DuelChallengeService;
  tavernRaid?: TavernRaidService;
  partySessions?: PartySessionService | undefined;
}

export async function handleNearbyDuelCallback(
  ctx: Context,
  callback: NearbyDuelCallback,
  options: NearbyDuelCommandOptions
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала мандрівника.", show_alert: true });
    return;
  }

  if (await sendPendingRaidBlockIfNeeded(ctx, telegramUserId, options.tavernRaid, "edit")) {
    return;
  }

  if (callback.type === "open") {
    await safeAnswerCallbackQuery(ctx);
    await editCandidates(ctx, options, telegramUserId, callback.page);
    return;
  }

  if (callback.type === "select") {
    const target = await findNearbyTarget(
      options.presence,
      telegramUserId,
      callback.targetTelegramUserId,
      callback.page
    );

    await safeAnswerCallbackQuery(ctx);

    if (!target) {
      await safeEditMessageText(ctx, presentNearbyDuelTargetMissing(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildNearbyDuelCandidatesKeyboard(
          await getReadyCandidates(options.presence, telegramUserId, callback.page),
          await getPartyInviteKeyboardOptions(options, telegramUserId)
        )
      });
      return;
    }

    await safeEditMessageText(ctx, presentNearbyDuelMode(target), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildNearbyDuelModeKeyboard(target.telegramUserId, callback.page)
    });
    return;
  }

  const target = await findNearbyTarget(
    options.presence,
    telegramUserId,
    callback.targetTelegramUserId,
    callback.page
  );

  await safeAnswerCallbackQuery(ctx);

  if (!target) {
    await safeEditMessageText(ctx, presentNearbyDuelTargetMissing(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildNearbyDuelCandidatesKeyboard(
        await getReadyCandidates(options.presence, telegramUserId, 0),
        await getPartyInviteKeyboardOptions(options, telegramUserId)
      )
    });
    return;
  }

  const result = await options.duel.createTargetedChallengeForTelegramUser(
    telegramUserId,
    callback.targetTelegramUserId,
    {
      contextChatId: ctx.chat?.id ? BigInt(ctx.chat.id) : null,
      mode: callback.mode,
      ignoreResourceWarning: callback.ignoreResourceWarning
    }
  );

  if (result.state === "resource-warning") {
    await safeEditMessageText(ctx, presentNearbyDuelCreate(result, {
      target,
      mode: callback.mode
    }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildNearbyDuelResourceWarningKeyboard(
        target.telegramUserId,
        callback.mode,
        result.warning,
        callback.page
      )
    });
    return;
  }

  if (result.state === "self-challenge" || result.state === "target-not-found") {
    await safeEditMessageText(ctx, presentNearbyDuelTargetMissing(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildNearbyDuelCandidatesKeyboard(
        await getReadyCandidates(options.presence, telegramUserId, 0)
      )
    });
    return;
  }

  await safeEditMessageText(ctx, presentNearbyDuelCreate(result, {
    target,
    mode: callback.mode
  }), {
    ...HTML_MESSAGE_OPTIONS,
    ...(result.state === "pending"
      ? { reply_markup: buildDuelChallengeKeyboard(result) }
      : {})
  });

  if (result.state === "pending") {
    await notifyNearbyDuelTarget(ctx, target.telegramUserId, result);
  }
}

async function editCandidates(
  ctx: Context,
  options: NearbyDuelCommandOptions,
  telegramUserId: bigint,
  page: number
): Promise<void> {
  const snapshot = await options.presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, page);
  await safeEditMessageText(ctx, presentNearbyDuelCandidates(snapshot), {
    ...HTML_MESSAGE_OPTIONS,
    ...(snapshot.state === "ready"
      ? {
          reply_markup: buildNearbyDuelCandidatesKeyboard(
            snapshot,
            await getPartyInviteKeyboardOptions(options, telegramUserId)
          )
        }
      : {})
  });
}

async function getPartyInviteKeyboardOptions(
  options: NearbyDuelCommandOptions,
  telegramUserId: bigint
): Promise<{ partyInviteEnabled?: boolean }> {
  const live = await options.partySessions?.getLiveRecruitingByTelegramUser(telegramUserId);
  return live ? { partyInviteEnabled: true } : {};
}

async function getReadyCandidates(
  presence: PresenceService,
  telegramUserId: bigint,
  page: number
): Promise<Extract<Awaited<ReturnType<PresenceService["getNearbyDuelCandidatesForTelegramUser"]>>, { state: "ready" }>> {
  const snapshot = await presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, page);

  if (snapshot.state === "ready") {
    return snapshot;
  }

  return {
    state: "ready",
    location: {
      id: "location.unknown",
      name: "Невідома місцина"
    },
    page: 0,
    pageSize: 5,
    total: 0,
    totalPages: 1,
    visible: []
  };
}

async function findNearbyTarget(
  presence: PresenceService,
  telegramUserId: bigint,
  targetTelegramUserId: bigint,
  page: number,
  pageSize = 5
): Promise<PresencePerson | null> {
  const snapshot = await presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, page, pageSize);

  if (snapshot.state !== "ready") {
    return null;
  }

  return snapshot.visible.find((candidate) => candidate.telegramUserId === targetTelegramUserId) ?? null;
}

async function notifyNearbyDuelTarget(
  ctx: Context,
  targetTelegramUserId: bigint,
  result: Extract<Awaited<ReturnType<DuelChallengeService["createTargetedChallengeForTelegramUser"]>>, { state: "pending" }>
): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(targetTelegramUserId), presentNearbyDuelTargetNotification(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildDuelTargetedInviteKeyboard(result)
    });
  } catch {
    // In-game invite delivery is best-effort; the pending challenge remains canonical.
  }
}

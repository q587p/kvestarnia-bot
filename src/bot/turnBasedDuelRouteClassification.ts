import type { Context } from "grammy";
import type { DuelCallback } from "./callbacks/duelCallbackData";
import type {
  DuelChallengeService,
  TurnBasedDuelRouteView
} from "../services/duelChallengeService";
import type { DuelCombatSessionRecord } from "../db/repositories/duelChallengeRepository";
import type { TurnBasedDuelParticipant } from "./turnBasedDuelCardDelivery";

interface TurnBasedDuelRouteClassificationBase {
  token: string;
  session: DuelCombatSessionRecord;
  participant: TurnBasedDuelParticipant;
  sourceIsCanonical: boolean;
}

export type TurnBasedDuelRouteClassification =
  | TurnBasedDuelRouteClassificationBase & {
      state: "active";
      view: Extract<TurnBasedDuelRouteView, { state: "active" }>["view"];
    }
  | TurnBasedDuelRouteClassificationBase & {
      state: "resolved";
      view: Extract<TurnBasedDuelRouteView, { state: "resolved" }>["view"];
    };

const observedClassifications = new WeakMap<Context, TurnBasedDuelRouteClassification>();

export function isTurnBasedDuelCardCallback(
  callback: DuelCallback
): callback is Extract<DuelCallback, { type: "turn" | "gear" | "view" }> {
  return callback.type === "turn" || callback.type === "gear" || callback.type === "view";
}

export async function classifyTurnBasedDuelRoute(
  ctx: Context,
  callback: DuelCallback,
  telegramUserId: bigint,
  service: DuelChallengeService
): Promise<TurnBasedDuelRouteClassification | null> {
  if (!("token" in callback) || typeof service.getTurnBasedRouteForTelegramUser !== "function") {
    return null;
  }

  const route = await service.getTurnBasedRouteForTelegramUser(telegramUserId, callback.token);
  if (route.state === "not-found") {
    return null;
  }

  const participant = getParticipant(route.view, telegramUserId);
  if (!participant) {
    return null;
  }

  const common = {
    token: callback.token,
    session: route.session,
    participant,
    sourceIsCanonical: isCallbackSourceCanonical(ctx, route.session, participant)
  };

  return route.state === "active"
    ? { ...common, state: "active", view: route.view }
    : { ...common, state: "resolved", view: route.view };
}

export function rememberTurnBasedDuelRouteClassification(
  ctx: Context,
  classification: TurnBasedDuelRouteClassification
): void {
  observedClassifications.set(ctx, classification);
}

export function getRememberedTurnBasedDuelRouteClassification(
  ctx: Context
): TurnBasedDuelRouteClassification | undefined {
  return observedClassifications.get(ctx);
}

function getParticipant(
  view: Exclude<TurnBasedDuelRouteView, { state: "not-found" }>["view"],
  telegramUserId: bigint
): TurnBasedDuelParticipant | null {
  if (view.challenge.challenger.telegramUserId === telegramUserId) {
    return "challenger";
  }

  return view.challenge.target?.telegramUserId === telegramUserId ? "target" : null;
}

function isCallbackSourceCanonical(
  ctx: Context,
  session: DuelCombatSessionRecord,
  participant: TurnBasedDuelParticipant
): boolean {
  const message = ctx.callbackQuery?.message;
  if (!message) {
    return false;
  }

  const chatId = BigInt(message.chat.id);
  const messageId = message.message_id;
  return participant === "challenger"
    ? session.challengerChatId === chatId && session.challengerMessageId === messageId
    : session.targetChatId === chatId && session.targetMessageId === messageId;
}

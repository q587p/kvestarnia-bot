import type { Bot } from "grammy";
import type { PartyRaidChatDeliveryRecord } from "../db/repositories/partyRaidChatRepository";
import type { PartyBossService } from "../services/partyBossService";
import { buildPartyInviteUrl, type PartySessionService } from "../services/partySessionService";
import type { PartyRaidChatService } from "../services/partyRaidChatService";
import { buildPartyRaidChatKeyboard, buildPartySessionKeyboard } from "./keyboards/partySessionKeyboard";
import { isPermanentPartyCardEditError } from "./partySessionDeliveryCoordinator";
import { partyRaidChatTelegramGate } from "./partyRaidChatTelegramGate";
import {
  appendPartyRaidChatWithinBudget,
  presentPartyRaidChatCard
} from "./presenters/partyRaidChatPresenter";
import { presentPartyView } from "./presenters/partySessionPresenter";

const HTML_OPTIONS = { parse_mode: "HTML" as const };
const POLL_MS = 1_100;
const PUBLICATION_PLACEHOLDER = "Картка рейду готується…";
const RETIRED_PLACEHOLDER = "Ця картка рейду більше не використовується.";

type PartyRaidChatDeliveryServices = {
  partyRaidChat: PartyRaidChatService;
  partySessions: PartySessionService;
  partyBoss?: PartyBossService | undefined;
};

export function createPartyRaidChatDeliveryScheduler(
  services: PartyRaidChatDeliveryServices,
  bot: Bot,
  options: { botUsername?: string | undefined } = {}
): { start(): void; stop(): void } {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await runPartyRaidChatDeliveryTick(services, bot, options);
    } catch (error) {
      console.error("Квестарня: відкладена доставка рейд-чату не завершилась.", {
        code: getSafeErrorCode(error)
      });
    } finally {
      running = false;
    }
  };

  return {
    start() {
      if (timer) {
        return;
      }
      void tick();
      timer = setInterval(() => void tick(), POLL_MS);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }
  };
}

export async function runPartyRaidChatDeliveryTick(
  services: PartyRaidChatDeliveryServices,
  bot: Bot,
  options: { botUsername?: string | undefined } = {},
  clock: () => Date = () => new Date()
): Promise<void> {
  await services.partyRaidChat.prepareDisabledRedactions();
  await services.partyRaidChat.cleanupExpired();
  const deliveries = await services.partyRaidChat.listDueDeliveries();
  for (const delivery of deliveries) {
    await deliverOne(services, bot, delivery, options).catch(async (error: unknown) => {
      const telegramError = unwrapDeliveryAttemptError(error);
      const retryAfter = getRetryAfterSeconds(telegramError);
      const backoffMs = retryAfter !== null
        ? retryAfter * 1_000
        : Math.min(93_000, 1_100 * (2 ** Math.min(delivery.attemptCount, 6)));
      await services.partyRaidChat.markDeliveryFailure(
        delivery.id,
        new Date(clock().getTime() + backoffMs),
        retryAfter !== null ? "telegram-429" : "telegram-retryable",
        deliveryAttemptVersion(error) ?? delivery.version
      );
    });
  }
}

async function deliverOne(
  services: PartyRaidChatDeliveryServices,
  bot: Bot,
  delivery: PartyRaidChatDeliveryRecord,
  options: { botUsername?: string | undefined }
): Promise<void> {
  if (delivery.redactionRequired || !services.partyRaidChat.isEnabled()) {
    await redact(services, bot, delivery, options);
    return;
  }
  const view = await services.partyRaidChat.getAuthorizedView(delivery.telegramUserId, delivery.inviteToken);
  if (!view) {
    await redact(services, bot, delivery, options);
    return;
  }

  if (delivery.surfaceMode === "recruiting_embed") {
    const party = await services.partySessions.getByToken(delivery.inviteToken);
    if (party.state !== "ready") {
      await services.partyRaidChat.markDeliveryFailure(
        delivery.id,
        new Date(Date.now() + POLL_MS),
        "canonical-transition",
        delivery.version
      );
      return;
    }
    const inviteUrl = buildPartyInviteUrl(options.botUsername, party.session.inviteToken);
    const base = presentPartyView({ state: "ready", session: party.session }, {
      inviteUrl,
      viewerCharacterId: delivery.participantCharacterId
    });
    await publish(delivery, bot, services, appendPartyRaidChatWithinBudget(base, view), {
      ...HTML_OPTIONS,
      reply_markup: buildPartySessionKeyboard(party.session, {
        viewerCharacterId: delivery.participantCharacterId,
        inviteUrl,
        includeBossStart: party.session.originLocationId === "barrel.big-brother",
        includeDevExpire: services.partySessions.areDevHelpersEnabled(),
        includeRaidChat: view.writable
      })
    }, view.chatRevision);
    return;
  }

  await publish(delivery, bot, services, presentPartyRaidChatCard(view), {
    ...HTML_OPTIONS,
    reply_markup: buildPartyRaidChatKeyboard({
      token: view.inviteToken,
      writable: view.writable,
      active: view.lifecycle === "active",
      terminal: view.lifecycle === "terminal"
    })
  }, view.chatRevision);
}

async function publish(
  delivery: PartyRaidChatDeliveryRecord,
  bot: Bot,
  services: { partyRaidChat: PartyRaidChatService; partySessions: PartySessionService },
  text: string,
  messageOptions: Parameters<Bot["api"]["editMessageText"]>[3],
  renderedRevision: number
): Promise<void> {
  let claimVersion = delivery.version;
  let reference = delivery.chatId && delivery.messageId
    ? { chatId: delivery.chatId, messageId: delivery.messageId }
    : null;
  if (reference) {
    try {
      const published = await partyRaidChatTelegramGate.enqueue(reference.chatId, async () => {
        if (!await services.partyRaidChat.isDeliveryClaimCurrent(delivery.id, claimVersion)) {
          return false;
        }
        await bot.api.editMessageText(Number(reference!.chatId), reference!.messageId, text, messageOptions);
        return true;
      });
      if (!published) {
        return;
      }
    } catch (error) {
      if (isTelegramMessageNotModified(error)) {
        // Telegram confirms that this exact card is already current.
      } else if (isPermanentPartyCardEditError(error)) {
        reference = null;
      } else if (isRetryableTelegramError(error)) {
        throw error;
      } else {
        await services.partyRaidChat.markDeliveryRedacted(
          delivery.id,
          "permanent-unavailable",
          redactionAck(delivery)
        );
        return;
      }
    }
  }
  if (!reference) {
    let sent: { chat: { id: number }; message_id: number };
    try {
      const result = await partyRaidChatTelegramGate.enqueue(delivery.telegramUserId, async () => {
        if (!await services.partyRaidChat.isDeliveryClaimCurrent(delivery.id, claimVersion)) {
          return null;
        }
        return bot.api.sendMessage(Number(delivery.telegramUserId), PUBLICATION_PLACEHOLDER);
      });
      if (!result) {
        return;
      }
      sent = result;
    } catch (error) {
      if (isRetryableTelegramError(error)) {
        throw error;
      }
      await services.partyRaidChat.markDeliveryRedacted(
        delivery.id,
        "permanent-unavailable",
        redactionAck(delivery)
      );
      return;
    }
    reference = { chatId: BigInt(sent.chat.id), messageId: sent.message_id };
    const recorded = await services.partyRaidChat.recordDeliveryReference(
      delivery.id,
      reference.chatId,
      reference.messageId,
      {
        version: claimVersion,
        chatId: delivery.chatId,
        messageId: delivery.messageId
      }
    );
    if (!recorded) {
      await retireUntrackedPlaceholder(bot, reference);
      return;
    }
    claimVersion += 1;

    try {
      const published = await partyRaidChatTelegramGate.enqueue(reference.chatId, async () => {
        if (!await services.partyRaidChat.isDeliveryClaimCurrent(delivery.id, claimVersion)) {
          return false;
        }
        await bot.api.editMessageText(Number(reference!.chatId), reference!.messageId, text, messageOptions);
        return true;
      });
      if (!published) {
        return;
      }
    } catch (error) {
      if (isTelegramMessageNotModified(error)) {
        // Telegram confirms that the adopted card already contains this exact view.
      } else if (isRetryableTelegramError(error) || isPermanentPartyCardEditError(error)) {
        throw new DeliveryAttemptError(error, claimVersion);
      } else {
        await services.partyRaidChat.markDeliveryRedacted(
          delivery.id,
          "permanent-unavailable",
          deliveryAck(delivery, claimVersion, reference)
        );
        return;
      }
    }
  }
  await services.partyRaidChat.markDeliveryRendered(delivery.id, renderedRevision, claimVersion);
}

async function retireUntrackedPlaceholder(
  bot: Bot,
  reference: { chatId: bigint; messageId: number }
): Promise<void> {
  try {
    await partyRaidChatTelegramGate.enqueue(reference.chatId, () => bot.api.editMessageText(
      Number(reference.chatId),
      reference.messageId,
      RETIRED_PLACEHOLDER
    ));
  } catch {
    // The losing publish contains no transcript or controls, so failed cleanup is privacy-safe.
  }
}

async function redact(
  services: { partyRaidChat: PartyRaidChatService; partySessions: PartySessionService },
  bot: Bot,
  delivery: PartyRaidChatDeliveryRecord,
  options: { botUsername?: string | undefined }
): Promise<void> {
  if (!delivery.chatId || !delivery.messageId) {
    await services.partyRaidChat.markDeliveryRedacted(delivery.id, "no-reference", redactionAck(delivery));
    return;
  }
  let text = "Рейд-чат більше недоступний.";
  let messageOptions: Parameters<Bot["api"]["editMessageText"]>[3] = {};
  if (delivery.surfaceMode === "recruiting_embed") {
    const party = await services.partySessions.getByToken(delivery.inviteToken);
    if (party.state === "ready") {
      const inviteUrl = buildPartyInviteUrl(options.botUsername, party.session.inviteToken);
      text = presentPartyView({ state: "ready", session: party.session }, {
        inviteUrl,
        viewerCharacterId: delivery.participantCharacterId
      });
      messageOptions = {
        ...HTML_OPTIONS,
        reply_markup: buildPartySessionKeyboard(party.session, {
          viewerCharacterId: delivery.participantCharacterId,
          inviteUrl,
          includeBossStart: party.session.originLocationId === "barrel.big-brother",
          includeDevExpire: services.partySessions.areDevHelpersEnabled()
        })
      };
    }
  }
  try {
    const published = await partyRaidChatTelegramGate.enqueue(delivery.chatId, async () => {
      if (!await services.partyRaidChat.isDeliveryClaimCurrent(delivery.id, delivery.version)) {
        return false;
      }
      await bot.api.editMessageText(Number(delivery.chatId!), delivery.messageId!, text, messageOptions);
      return true;
    });
    if (!published) {
      return;
    }
    await services.partyRaidChat.markDeliveryRedacted(delivery.id, "redacted", redactionAck(delivery));
  } catch (error) {
    if (isTelegramMessageNotModified(error)) {
      await services.partyRaidChat.markDeliveryRedacted(delivery.id, "redacted", redactionAck(delivery));
      return;
    }
    if (isRetryableTelegramError(error)) {
      throw error;
    }
    await services.partyRaidChat.markDeliveryRedacted(
      delivery.id,
      "permanent-unavailable",
      redactionAck(delivery)
    );
  }
}

function redactionAck(delivery: PartyRaidChatDeliveryRecord) {
  return deliveryAck(delivery, delivery.version, {
    chatId: delivery.chatId,
    messageId: delivery.messageId
  });
}

function deliveryAck(
  delivery: PartyRaidChatDeliveryRecord,
  version: number,
  reference: { chatId: bigint | null; messageId: number | null }
) {
  return {
    version,
    desiredRevision: delivery.desiredRevision,
    chatId: reference.chatId,
    messageId: reference.messageId
  };
}

class DeliveryAttemptError extends Error {
  constructor(readonly telegramError: unknown, readonly expectedVersion: number) {
    super("Raid chat delivery attempt failed after reference adoption.");
  }
}

function unwrapDeliveryAttemptError(error: unknown): unknown {
  return error instanceof DeliveryAttemptError ? error.telegramError : error;
}

function deliveryAttemptVersion(error: unknown): number | null {
  return error instanceof DeliveryAttemptError ? error.expectedVersion : null;
}

function isTelegramMessageNotModified(error: unknown): boolean {
  return telegramErrorText(error).includes("message is not modified");
}

function isRetryableTelegramError(error: unknown): boolean {
  const errorCode = telegramErrorCode(error);
  const text = telegramErrorText(error);
  return errorCode === 429 ||
    (errorCode !== null && errorCode >= 500) ||
    text.includes("econnreset") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("eai_again") ||
    text.includes("enetunreach") ||
    text.includes("fetch failed") ||
    text.includes("network error") ||
    text.includes("socket hang up");
}

function telegramErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  if ("error_code" in error && typeof error.error_code === "number") {
    return error.error_code;
  }
  const match = telegramErrorText(error).match(/(?:^|\s)(\d{3})(?::|\s|$)/);
  return match ? Number(match[1]) : null;
}

function telegramErrorText(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }
  const parts = [
    error instanceof Error ? error.message : null,
    "description" in error && typeof error.description === "string" ? error.description : null
  ];
  return parts.filter((part): part is string => part !== null).join(" ").toLowerCase();
}

function getRetryAfterSeconds(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const parameters = "parameters" in error ? error.parameters : null;
  if (!parameters || typeof parameters !== "object" || !("retry_after" in parameters)) {
    return null;
  }
  return typeof parameters.retry_after === "number" ? parameters.retry_after : null;
}

function getSafeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown";
}

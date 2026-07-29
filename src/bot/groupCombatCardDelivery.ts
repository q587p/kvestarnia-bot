import type { Api } from "grammy";
import { randomUUID } from "node:crypto";
import type {
  GroupCombatParticipantRecord,
  GroupCombatSessionRecord,
  GroupCombatSettlementNotice
} from "../db/repositories/groupCombatRepository";
import {
  GROUP_COMBAT_PRODUCTION_RULES_VERSION
} from "../domain/groupCombat/groupCombat";
import type { GroupCombatService } from "../services/groupCombatService";
import {
  buildGroupCombatKeyboard,
  buildGroupCombatReplyKeyboard
} from "./keyboards/groupCombatKeyboard";
import { buildMainMenuKeyboard } from "./keyboards/mainMenuKeyboard";
import {
  presentGroupCombat,
  presentGroupCombatIntro
} from "./presenters/groupCombatPresenter";
import {
  isMessageNotModifiedError,
  isMessageUnavailableForEditError
} from "./safeEditMessageText";
import { presentLevelUpCelebration } from "./presenters/levelGrowthPresenter";
import { presentAchievementUnlockNotification } from "./presenters/achievementPresenter";

const HTML_MESSAGE_OPTIONS = { parse_mode: "HTML" as const };
const MAX_CONVERGENCE_EDITS = 4;
const FLEE_EXIT_DELIVERY_CLAIM_MS = 23_000;
const UI_PUBLICATION_CLAIM_MS = 23_000;
const TELEGRAM_PUBLICATION_IO_TIMEOUT_MS = 13_000;
const FLEE_EXIT_ACK_ATTEMPTS = 3;
const deliveryTails = new Map<string, Promise<void>>();

type GroupCombatMessageReference = { chatId: bigint; messageId: number };
type MessageOptions = NonNullable<Parameters<Api["editMessageText"]>[3]>;
type ReplyKeyboardOptions = NonNullable<Parameters<Api["sendMessage"]>[2]>;

export interface GroupCombatDeliveryTransport {
  editMessage(
    reference: GroupCombatMessageReference,
    text: string,
    options: MessageOptions,
    signal?: AbortSignal
  ): Promise<void>;
  sendInertMessage(
    chatId: bigint,
    text: string,
    options: ReplyKeyboardOptions,
    signal?: AbortSignal
  ): Promise<number | null>;
  deleteMessage(
    reference: GroupCombatMessageReference,
    signal?: AbortSignal
  ): Promise<void>;
}

export type GroupCombatParticipantDeliveryResult =
  | { state: "edited" | "unchanged" | "activated"; reference: GroupCombatMessageReference }
  | { state: "candidate-lost" | "retryable-edit-failure"; reference: GroupCombatMessageReference | null }
  | { state: "missing-participant" | "send-failed" | "activation-failed"; reference: null };

export async function deliverGroupCombatStartIntro(
  api: Api,
  service: GroupCombatService,
  session: GroupCombatSessionRecord
): Promise<number> {
  if (
    session.state.rulesVersion !== GROUP_COMBAT_PRODUCTION_RULES_VERSION ||
    session.state.status !== "active" ||
    session.state.turn !== 1 ||
    session.state.recap.length !== 0
  ) {
    return 0;
  }
  const text = presentGroupCombatIntro(session);
  const results = await Promise.allSettled(session.participants.map(async (participant) => {
    const reference = privateReference(participant);
    if (!reference) {
      await api.sendMessage(Number(participant.telegramUserId), text, HTML_MESSAGE_OPTIONS);
      return true;
    }
    try {
      await api.editMessageText(Number(reference.chatId), reference.messageId, text, {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      if (!isMessageUnavailableForEditError(error)) {
        return false;
      }
      const releasedUnavailable = await service.releaseParticipantCard({
        sessionId: session.id,
        telegramUserId: participant.telegramUserId,
        expectedReferenceVersion: participant.referenceVersion,
        chatId: reference.chatId,
        messageId: reference.messageId
      });
      if (!releasedUnavailable) {
        return false;
      }
      await api.sendMessage(Number(participant.telegramUserId), text, HTML_MESSAGE_OPTIONS);
      return true;
    }
    return service.releaseParticipantCard({
      sessionId: session.id,
      telegramUserId: participant.telegramUserId,
      expectedReferenceVersion: participant.referenceVersion,
      chatId: reference.chatId,
      messageId: reference.messageId
    });
  }));
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}

export async function deliverGroupCombatCards(
  api: Api,
  service: GroupCombatService,
  session: GroupCombatSessionRecord,
  options: {
    forceReplacementCharacterId?: string;
  } = {}
): Promise<number> {
  const authoritative = await loadAuthoritativeSession(service, session.id) ?? session;
  const transport = apiTransport(api);
  const results = await Promise.allSettled(authoritative.participants.map(async (participant) => {
    const actor = authoritative.state.participants.find(
      (candidate) => candidate.characterId === participant.characterId
    );
    const participantFledThisTurn = Boolean(
      actor?.fledAtTurn !== undefined &&
      (
        (authoritative.status === "active" &&
          authoritative.state.turn === actor.fledAtTurn + 1) ||
        (authoritative.status !== "active" &&
          authoritative.state.turn === actor.fledAtTurn)
      )
    );
    if (exitDeliveryStateOf(participant) !== "none") {
      return deliverParticipantExitNavigation({
        api,
        service,
        sessionId: authoritative.id,
        participantCharacterId: participant.characterId,
        transport
      });
    } else if (
      authoritative.state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
      authoritative.status !== "active" &&
      participant.settlementStatus !== "completed"
    ) {
      return false;
    }
    if (
      authoritative.state.rulesVersion !== GROUP_COMBAT_PRODUCTION_RULES_VERSION &&
      (authoritative.status !== "active" || participantFledThisTurn) &&
      participant.deliveredRevision < authoritative.deliveryRevision
    ) {
      await api.sendMessage(
        Number(participant.telegramUserId),
        participantFledThisTurn
          ? "🏃 Ви відступили з бою. Головне меню знову на місці."
          : "🏁 Бій завершено. Головне меню знову на місці.",
        {
          reply_markup: buildMainMenuKeyboard({
            ...(authoritative.state.production?.locationId
              ? { locationId: authoritative.state.production.locationId }
              : {})
          })
        }
      );
    }
    return deliverCanonicalGroupCombatParticipantCard({
      service,
      sessionId: authoritative.id,
      participantCharacterId: participant.characterId,
      transport,
      now: () => serviceTime(service),
      ...((authoritative.status === "active" &&
        participant.deliveredRevision === 0) ||
        options.forceReplacementCharacterId === participant.characterId ||
        (authoritative.status === "active" && participantFledThisTurn) ||
        (authoritative.status !== "active" &&
          participant.deliveredRevision < authoritative.deliveryRevision)
        ? { forceReplacement: true }
        : {}),
      ...(participantFledThisTurn ? { publishReplyKeyboard: false } : {})
    });
  }));
  const latest = await loadAuthoritativeSession(service, authoritative.id);
  if (latest) {
    await service.finalizeDeliveryAttempt(latest.id, latest.deliveryRevision).catch(() => false);
  }
  return results.filter((result) =>
    result.status === "fulfilled" &&
    (typeof result.value === "boolean"
      ? result.value
      : isDelivered(result.value))
  ).length;
}

async function deliverParticipantExitNavigation(input: {
  api: Api;
  service: GroupCombatService;
  sessionId: string;
  participantCharacterId: string;
  transport: GroupCombatDeliveryTransport;
}): Promise<boolean> {
  return withParticipantDeliveryLock(
    input.participantCharacterId,
    async () => {
      let current = await loadAuthoritativeSession(input.service, input.sessionId);
      let participant = findParticipant(current, input.participantCharacterId);
      if (!current || !participant || exitDeliveryStateOf(participant) === "none") {
        return false;
      }
      if (isCompletedExitDelivery(participant.exitDeliveryState)) {
        return true;
      }
      if (
        participant.exitDeliveryState === "pending" ||
        participant.exitDeliveryState === "claimed"
      ) {
        const now = serviceTime(input.service);
        const claimToken = randomUUID();
        const navigation = await input.service.claimParticipantFleeExitDelivery({
          sessionId: current.id,
          telegramUserId: participant.telegramUserId,
          claimToken,
          claimedAt: now,
          staleBefore: new Date(now.getTime() - FLEE_EXIT_DELIVERY_CLAIM_MS)
        });
        if (navigation.state === "superseded") {
          return true;
        }
        if (navigation.state === "not-found" || navigation.state === "busy") {
          const latest = await loadAuthoritativeSession(input.service, input.sessionId);
          const latestParticipant = findParticipant(latest, input.participantCharacterId);
          return latestParticipant
            ? isCompletedExitDelivery(latestParticipant.exitDeliveryState)
            : false;
        }
        if (navigation.state !== "claimed") {
          return false;
        }
        let exitMessageId: number;
        try {
          const fled = current.state.participants.some(
            (actor) =>
              actor.characterId === participant!.characterId &&
              actor.fledAtTurn !== undefined
          );
          const renewed =
            await input.service.renewParticipantFleeExitDeliveryClaim({
              sessionId: current.id,
              telegramUserId: participant.telegramUserId,
              claimToken,
              claimedAt: serviceTime(input.service)
            });
          if (!renewed) {
            return false;
          }
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            TELEGRAM_PUBLICATION_IO_TIMEOUT_MS
          );
          let sent: Awaited<ReturnType<Api["sendMessage"]>>;
          try {
            sent = await input.api.sendMessage(
              Number(participant.telegramUserId),
              fled
                ? "🏃 Ви відступили з бою. Головне меню знову на місці."
                : "🏁 Бій завершено. Головне меню знову на місці.",
              {
                reply_markup: buildMainMenuKeyboard({
                  ...(navigation.locationId
                    ? { locationId: navigation.locationId }
                    : {}),
                  ...(navigation.questMarkers
                    ? {
                        questMarkers: navigation.questMarkers
                      }
                    : {})
                })
              },
              controller.signal as Parameters<Api["sendMessage"]>[3]
            );
          } finally {
            clearTimeout(timeout);
          }
          exitMessageId = sent.message_id;
        } catch (error) {
          await input.service.releaseParticipantFleeExitDeliveryClaim({
            sessionId: current.id,
            telegramUserId: participant.telegramUserId,
            claimToken
          }).catch(() => false);
          throw error;
        }
        let acknowledged = false;
        for (
          let attempt = 0;
          attempt < FLEE_EXIT_ACK_ATTEMPTS && !acknowledged;
          attempt += 1
        ) {
          try {
            acknowledged =
              await input.service.markParticipantFleeExitMenuDelivered({
                sessionId: current.id,
                telegramUserId: participant.telegramUserId,
                claimToken,
                messageId: exitMessageId
              });
          } catch {
            // Keep the live claim and retry acknowledgement without resending.
          }
        }
        if (!acknowledged) {
          current = await loadAuthoritativeSession(input.service, input.sessionId);
          participant = findParticipant(current, input.participantCharacterId);
          if (
            !participant ||
            (
              participant.exitDeliveryState !== "menu-delivered" &&
              participant.exitDeliveryState !== "completed"
            )
          ) {
            return false;
          }
        }
      }
      current = await loadAuthoritativeSession(input.service, input.sessionId);
      participant = findParticipant(current, input.participantCharacterId);
      if (!current || !participant) {
        return false;
      }
      if (isCompletedExitDelivery(participant.exitDeliveryState)) {
        return true;
      }
      if (participant.exitDeliveryState !== "menu-delivered") {
        return false;
      }
      const reference = privateReference(participant);
      if (reference) {
        const card = buildCard(
          current,
          participant.characterId,
          serviceTime(input.service)
        );
        try {
          await input.transport.editMessage(reference, card.text, {
            ...card.options,
            reply_markup: { inline_keyboard: [] }
          });
        } catch (error) {
          if (
            !isMessageNotModifiedError(error) &&
            !isMessageUnavailableForEditError(error)
          ) {
            return false;
          }
        }
      }
      const actor = current.state.participants.find(
        (candidate) => candidate.characterId === participant.characterId
      );
      const shouldPublishTerminalCard =
        current.status !== "active" &&
        actor?.fledAtTurn === undefined;
      let terminalCardReference: GroupCombatMessageReference | null = null;
      if (shouldPublishTerminalCard) {
        const card = buildCard(
          current,
          participant.characterId,
          serviceTime(input.service)
        );
        const messageId = await input.transport.sendInertMessage(
          participant.telegramUserId,
          card.text,
          card.options
        );
        if (messageId === null) {
          return false;
        }
        terminalCardReference = {
          chatId: participant.telegramUserId,
          messageId
        };
      }
      let completed = false;
      try {
        completed =
          await input.service.completeParticipantFleeExitDelivery({
            sessionId: current.id,
            telegramUserId: participant.telegramUserId,
            expectedReferenceVersion: participant.referenceVersion,
            chatId: reference?.chatId ?? null,
            messageId: reference?.messageId ?? null,
            ...(terminalCardReference
              ? {
                  terminalCard: {
                    chatId: terminalCardReference.chatId,
                    messageId: terminalCardReference.messageId,
                    deliveryRevision: current.deliveryRevision
                  }
                }
              : {})
          });
      } catch {
        const latest = await loadAuthoritativeSession(input.service, input.sessionId);
        const latestParticipant = findParticipant(latest, input.participantCharacterId);
        if (latestParticipant?.exitDeliveryState === "completed") {
          if (
            terminalCardReference &&
            (
              latestParticipant.chatId !== terminalCardReference.chatId ||
              latestParticipant.messageId !== terminalCardReference.messageId
            )
          ) {
            await input.transport.deleteMessage(terminalCardReference).catch(() => undefined);
          }
          return true;
        }
        if (terminalCardReference && latestParticipant) {
          await input.transport.deleteMessage(terminalCardReference).catch(() => undefined);
        }
        return false;
      }
      if (completed) {
        return true;
      }
      const latest = await loadAuthoritativeSession(input.service, input.sessionId);
      const latestParticipant = findParticipant(
        latest,
        input.participantCharacterId
      );
      const completedElsewhere = latestParticipant?.exitDeliveryState === "completed";
      if (
        terminalCardReference &&
        (
          !completedElsewhere ||
          latestParticipant.chatId !== terminalCardReference.chatId ||
          latestParticipant.messageId !== terminalCardReference.messageId
        )
      ) {
        await input.transport.deleteMessage(terminalCardReference).catch(() => undefined);
      }
      return completedElsewhere;
    }
  );
}

function isCompletedExitDelivery(
  state: GroupCombatParticipantRecord["exitDeliveryState"]
): boolean {
  return state === "completed" || state === "superseded";
}

function replyKeyboardFingerprint(
  session: GroupCombatSessionRecord,
  participantCharacterId: string
): string {
  return JSON.stringify(
    buildGroupCombatReplyKeyboard(session, participantCharacterId).keyboard
  );
}

export async function deliverGroupCombatSettlementNotifications(
  api: Api,
  notices: readonly GroupCombatSettlementNotice[]
): Promise<number> {
  const results = await Promise.allSettled(notices.map(async (notice) => {
    const levelText = notice.levelChange
      ? presentLevelUpCelebration(notice.levelChange, notice.classId, { raceId: notice.raceId })
      : null;
    const achievementText = presentAchievementUnlockNotification(notice.achievementUnlocks);
    for (const text of [levelText, achievementText]) {
      if (text) {
        await api.sendMessage(Number(notice.telegramUserId), text, HTML_MESSAGE_OPTIONS);
      }
    }
    return Boolean(levelText || achievementText);
  }));
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}

export function deliverGroupCombatParticipantCard(
  api: Api,
  service: GroupCombatService,
  sessionId: string,
  participantCharacterId: string,
  options: {
    forceRefresh?: boolean;
    forceReplacement?: boolean;
    publishReplyKeyboard?: boolean;
  } = {}
): Promise<GroupCombatParticipantDeliveryResult> {
  return deliverCanonicalGroupCombatParticipantCard({
    service,
    sessionId,
    participantCharacterId,
    transport: apiTransport(api),
    now: () => serviceTime(service),
    ...(options.forceRefresh === undefined ? {} : { forceRefresh: options.forceRefresh }),
    ...(options.forceReplacement === undefined ? {} : { forceReplacement: options.forceReplacement }),
    ...(options.publishReplyKeyboard === undefined
      ? {}
      : { publishReplyKeyboard: options.publishReplyKeyboard })
  });
}

export async function deliverCanonicalGroupCombatParticipantCard(input: {
  service: GroupCombatService;
  sessionId: string;
  participantCharacterId: string;
  transport: GroupCombatDeliveryTransport;
  forceRefresh?: boolean;
  forceReplacement?: boolean;
  publishReplyKeyboard?: boolean;
  now?: () => Date;
}): Promise<GroupCombatParticipantDeliveryResult> {
  return withParticipantDeliveryLock(input.participantCharacterId, () => (
    deliverCanonicalGroupCombatParticipantStateLocked(input)
  ));
}

async function deliverCanonicalGroupCombatParticipantStateLocked(input: {
  service: GroupCombatService;
  sessionId: string;
  participantCharacterId: string;
  transport: GroupCombatDeliveryTransport;
  forceRefresh?: boolean;
  forceReplacement?: boolean;
  publishReplyKeyboard?: boolean;
  now?: () => Date;
}): Promise<GroupCombatParticipantDeliveryResult> {
  const claimUi = (
    input.service as Partial<GroupCombatService>
  ).claimParticipantUiPublication;
  const acknowledgeUi = (
    input.service as Partial<GroupCombatService>
  ).acknowledgeParticipantUiPublication;
  const releaseUi = (
    input.service as Partial<GroupCombatService>
  ).releaseParticipantUiPublicationClaim;
  const renewUi = (
    input.service as Partial<GroupCombatService>
  ).renewParticipantUiPublicationClaim;
  if (!claimUi || !acknowledgeUi || !renewUi || !releaseUi) {
    const current = await loadAuthoritativeSession(input.service, input.sessionId);
    const participant = findParticipant(current, input.participantCharacterId);
    if (!current || !participant || current.status !== "active") {
      return deliverCanonicalGroupCombatParticipantCardLocked(input);
    }
    const fingerprint = replyKeyboardFingerprint(
      current,
      participant.characterId
    );
    const publishReplyKeyboard =
      input.publishReplyKeyboard !== false &&
      participant.replyKeyboardFingerprint !== fingerprint;
    const result = await deliverCanonicalGroupCombatParticipantCardLocked({
      ...input,
      forceReplacement:
        input.forceReplacement === true || publishReplyKeyboard,
      ...(publishReplyKeyboard
        ? {
            replyKeyboard: buildGroupCombatReplyKeyboard(
              current,
              participant.characterId
            )
          }
        : {})
    });
    if (isDelivered(result)) {
      participant.replyKeyboardFingerprint = fingerprint;
      participant.replyKeyboardGeneration =
        (participant.replyKeyboardGeneration ?? 0) +
        (publishReplyKeyboard ? 1 : 0);
    }
    return result;
  }

  const claimToken = randomUUID();
  let ownsClaim = false;
  for (let attempt = 0; attempt < MAX_CONVERGENCE_EDITS; attempt += 1) {
    const current = await loadAuthoritativeSession(input.service, input.sessionId);
    const participant = findParticipant(current, input.participantCharacterId);
    if (
      !current ||
      !participant ||
      exitDeliveryStateOf(participant) !== "none"
    ) {
      return { state: "missing-participant", reference: null };
    }
    const keyboardFingerprint = replyKeyboardFingerprint(
      current,
      participant.characterId
    );
    const now = input.now?.() ?? new Date();
    const claim = await claimUi.call(input.service, {
      sessionId: current.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: current.deliveryRevision,
      keyboardFingerprint,
      claimToken,
      claimedAt: now,
      staleBefore: new Date(now.getTime() - UI_PUBLICATION_CLAIM_MS)
    });
    if (claim.state === "stale") {
      continue;
    }
    if (claim.state === "not-found" || claim.state === "superseded") {
      return { state: "missing-participant", reference: null };
    }
    if (claim.state === "busy") {
      return {
        state: "retryable-edit-failure",
        reference: privateReference(participant)
      };
    }
    if (claim.state !== "claimed") {
      return { state: "retryable-edit-failure", reference: null };
    }
    ownsClaim = true;
    const publishReplyKeyboard =
      input.publishReplyKeyboard !== false && claim.publishReplyKeyboard;
    const ownedTransport = uiPublicationOwnedTransport({
      service: input.service,
      transport: input.transport,
      sessionId: current.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: current.deliveryRevision,
      claimToken,
      ...(input.now ? { now: input.now } : {})
    });
    let result: GroupCombatParticipantDeliveryResult;
    try {
      result = await deliverCanonicalGroupCombatParticipantCardLocked({
        ...input,
        transport: ownedTransport,
        forceRefresh: input.forceRefresh === true || attempt > 0,
        forceReplacement:
          input.forceReplacement === true || publishReplyKeyboard,
        ...(publishReplyKeyboard
          ? {
              replyKeyboard: buildGroupCombatReplyKeyboard(
                current,
                participant.characterId
              )
            }
          : {})
      });
    } catch (error) {
      await releaseUi.call(input.service, {
        sessionId: current.id,
        telegramUserId: participant.telegramUserId,
        claimToken
      }).catch(() => false);
      ownsClaim = false;
      throw error;
    }
    if (
      result.state === "send-failed" ||
      result.state === "activation-failed" ||
      result.state === "retryable-edit-failure"
    ) {
      await releaseUi.call(input.service, {
        sessionId: current.id,
        telegramUserId: participant.telegramUserId,
        claimToken
      }).catch(() => false);
      ownsClaim = false;
      return result;
    }
    const acknowledged = await acknowledgeUi.call(input.service, {
      sessionId: current.id,
      telegramUserId: participant.telegramUserId,
      expectedDeliveryRevision: current.deliveryRevision,
      publishedKeyboardFingerprint: publishReplyKeyboard
        ? keyboardFingerprint
        : null,
      claimToken
    });
    if (acknowledged === "acknowledged") {
      ownsClaim = false;
      return result;
    }
    if (acknowledged === "not-owner") {
      ownsClaim = false;
      return {
        state: "candidate-lost",
        reference: result.reference
      };
    }
  }
  if (ownsClaim) {
    const latest = await loadAuthoritativeSession(input.service, input.sessionId);
    const participant = findParticipant(latest, input.participantCharacterId);
    if (participant) {
      await releaseUi.call(input.service, {
        sessionId: input.sessionId,
        telegramUserId: participant.telegramUserId,
        claimToken
      }).catch(() => false);
    }
  }
  return { state: "retryable-edit-failure", reference: null };
}

async function deliverCanonicalGroupCombatParticipantCardLocked(input: {
  service: GroupCombatService;
  sessionId: string;
  participantCharacterId: string;
  transport: GroupCombatDeliveryTransport;
  forceRefresh?: boolean;
  forceReplacement?: boolean;
  publishReplyKeyboard?: boolean;
  replyKeyboard?: ReturnType<typeof buildGroupCombatReplyKeyboard>;
  now?: () => Date;
}): Promise<GroupCombatParticipantDeliveryResult> {
  let current = await loadAuthoritativeSession(input.service, input.sessionId);
  let participant = findParticipant(current, input.participantCharacterId);
  if (
    !current ||
    !participant ||
    exitDeliveryStateOf(participant) !== "none"
  ) {
    return { state: "missing-participant", reference: null };
  }

  let reference = privateReference(participant);
  const replacedReference = input.forceReplacement === true ? reference : null;
  if (
    reference &&
    input.forceReplacement === true &&
    typeof (input.service as Partial<GroupCombatService>).compareAndSetParticipantCard !== "function"
  ) {
    const edited = await editExistingReferenceUntilCurrent(input, reference, current, true);
    return edited.state === "missing"
      ? { state: "activation-failed", reference: null }
      : edited;
  }
  if (reference && input.forceReplacement !== true) {
    const edited = await editExistingReferenceUntilCurrent(input, reference, current, input.forceRefresh === true);
    if (edited.state !== "missing") {
      return edited;
    }
    current = edited.current;
    participant = findParticipant(current, input.participantCharacterId);
    if (!participant) {
      return { state: "missing-participant", reference: null };
    }
    reference = privateReference(participant);
    if (reference) {
      const converged = await editExistingReferenceUntilCurrent(input, reference, current, input.forceRefresh === true);
      if (converged.state !== "missing") {
        return converged;
      }
      current = converged.current;
      participant = findParticipant(current, input.participantCharacterId);
      if (!participant) {
        return { state: "missing-participant", reference: null };
      }
    }
  }

  const candidateCard = buildCard(current, participant.characterId, input.now?.() ?? new Date());
  const candidateMessageId = await input.transport.sendInertMessage(
    participant.telegramUserId,
    candidateCard.text,
    input.replyKeyboard
      ? {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: input.replyKeyboard
        }
      : { ...candidateCard.options, reply_markup: { inline_keyboard: [] } }
  );
  if (!candidateMessageId) {
    return { state: "send-failed", reference: null };
  }
  const candidate = { chatId: participant.telegramUserId, messageId: candidateMessageId };
  const claimed = await input.service.compareAndSetParticipantCard({
    sessionId: current.id,
    telegramUserId: participant.telegramUserId,
    expectedReferenceVersion: participant.referenceVersion,
    chatId: candidate.chatId,
    messageId: candidate.messageId
  });
  if (!claimed) {
    await input.transport.deleteMessage(candidate).catch(() => undefined);
    const winner = await loadAuthoritativeSession(input.service, input.sessionId);
    const winnerParticipant = findParticipant(winner, input.participantCharacterId);
    const winnerReference = winnerParticipant ? privateReference(winnerParticipant) : null;
    if (winner && winnerReference) {
      const converged = await editExistingReferenceUntilCurrent(input, winnerReference, winner, true);
      if (converged.state !== "missing") {
        return converged;
      }
    }
    return { state: "candidate-lost", reference: winnerReference };
  }

  const fresh = await loadAuthoritativeSession(input.service, input.sessionId);
  const freshParticipant = findParticipant(fresh, input.participantCharacterId);
  if (!fresh || !freshParticipant) {
    return { state: "activation-failed", reference: null };
  }
  const canonicalReference = privateReference(freshParticipant);
  if (!canonicalReference || !sameReference(canonicalReference, candidate)) {
    return { state: "candidate-lost", reference: canonicalReference };
  }
  const previousState = replacedReference && !sameReference(replacedReference, candidate)
    ? await makePreviousReferenceInert(input.transport, replacedReference, candidateCard)
    : "missing";
  if (previousState === "failed" && replacedReference) {
    return restorePreviousReference(input, freshParticipant, candidate, replacedReference);
  }
  const activated = await editExistingReferenceUntilCurrent(input, candidate, fresh, true);
  if (activated.state === "edited" || activated.state === "unchanged") {
    if (replacedReference && previousState === "inert") {
      await input.transport.deleteMessage(replacedReference).catch(() => undefined);
    }
    return activated.state === "edited"
      ? { state: "activated", reference: activated.reference }
      : activated;
  }
  if (activated.state === "retryable-edit-failure") {
    return activated;
  }
  if (replacedReference && previousState === "inert") {
    return restorePreviousReference(input, freshParticipant, candidate, replacedReference);
  }
  await input.service.releaseParticipantCard({
    sessionId: input.sessionId,
    telegramUserId: freshParticipant.telegramUserId,
    expectedReferenceVersion: freshParticipant.referenceVersion,
    chatId: candidate.chatId,
    messageId: candidate.messageId
  });
  return { state: "activation-failed", reference: null };
}

function exitDeliveryStateOf(
  participant: Pick<GroupCombatParticipantRecord, "exitDeliveryState">
): GroupCombatParticipantRecord["exitDeliveryState"] {
  return participant.exitDeliveryState ?? "none";
}

async function makePreviousReferenceInert(
  transport: GroupCombatDeliveryTransport,
  reference: GroupCombatMessageReference,
  card: ReturnType<typeof buildCard>
): Promise<"inert" | "missing" | "failed"> {
  try {
    await transport.editMessage(reference, card.text, {
      ...card.options,
      reply_markup: { inline_keyboard: [] }
    });
    return "inert";
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return "inert";
    }
    return isMessageUnavailableForEditError(error) ? "missing" : "failed";
  }
}

async function restorePreviousReference(
  input: {
    service: GroupCombatService;
    sessionId: string;
    participantCharacterId: string;
    transport: GroupCombatDeliveryTransport;
    now?: () => Date;
  },
  claimedParticipant: GroupCombatSessionRecord["participants"][number],
  candidate: GroupCombatMessageReference,
  previous: GroupCombatMessageReference
): Promise<GroupCombatParticipantDeliveryResult> {
  const restored = await input.service.compareAndSetParticipantCard({
    sessionId: input.sessionId,
    telegramUserId: claimedParticipant.telegramUserId,
    expectedReferenceVersion: claimedParticipant.referenceVersion,
    chatId: previous.chatId,
    messageId: previous.messageId
  });
  if (!restored) {
    return { state: "retryable-edit-failure", reference: candidate };
  }
  await input.transport.deleteMessage(candidate).catch(() => undefined);
  const current = await loadAuthoritativeSession(input.service, input.sessionId);
  const participant = findParticipant(current, input.participantCharacterId);
  const reference = participant ? privateReference(participant) : null;
  if (!current || !participant || !reference || !sameReference(reference, previous)) {
    return { state: "retryable-edit-failure", reference: previous };
  }
  const converged = await editExistingReferenceUntilCurrent(input, previous, current, true);
  return converged.state === "missing"
    ? { state: "retryable-edit-failure", reference: previous }
    : converged;
}

type ExistingEditResult =
  | { state: "edited" | "unchanged"; reference: GroupCombatMessageReference }
  | { state: "retryable-edit-failure"; reference: GroupCombatMessageReference }
  | { state: "missing"; current: GroupCombatSessionRecord };

async function editExistingReferenceUntilCurrent(
  input: {
    service: GroupCombatService;
    sessionId: string;
    participantCharacterId: string;
    transport: GroupCombatDeliveryTransport;
    now?: () => Date;
  },
  reference: GroupCombatMessageReference,
  initial: GroupCombatSessionRecord,
  forceRefresh: boolean
): Promise<ExistingEditResult> {
  let current = initial;
  for (let attempt = 0; attempt < MAX_CONVERGENCE_EDITS; attempt += 1) {
    const participant = findParticipant(current, input.participantCharacterId);
    const canonicalReference = participant ? privateReference(participant) : null;
    if (!participant || !canonicalReference || !sameReference(canonicalReference, reference)) {
      return { state: "missing", current };
    }
    if (!forceRefresh && participant.deliveredRevision >= current.deliveryRevision) {
      return { state: "unchanged", reference };
    }
    const card = buildCard(current, participant.characterId, input.now?.() ?? new Date());
    let lastState: "edited" | "unchanged";
    try {
      await input.transport.editMessage(reference, card.text, card.options);
      lastState = "edited";
    } catch (error) {
      if (isMessageNotModifiedError(error)) {
        lastState = "unchanged";
      } else if (isMessageUnavailableForEditError(error)) {
        return { state: "missing", current };
      } else {
        return { state: "retryable-edit-failure", reference };
      }
    }
    const latest = await loadAuthoritativeSession(input.service, input.sessionId);
    if (!latest) {
      return { state: "missing", current };
    }
    const latestParticipant = findParticipant(latest, input.participantCharacterId);
    const latestReference = latestParticipant ? privateReference(latestParticipant) : null;
    if (!latestParticipant || !latestReference || !sameReference(latestReference, reference)) {
      return { state: "missing", current: latest };
    }
    if (latest.deliveryRevision !== current.deliveryRevision) {
      current = latest;
      forceRefresh = false;
      continue;
    }
    if (latestParticipant.deliveredRevision >= latest.deliveryRevision) {
      return { state: lastState, reference };
    }
    const marked = await input.service.markParticipantCardDelivered({
      sessionId: latest.id,
      telegramUserId: latestParticipant.telegramUserId,
      expectedDeliveryRevision: latest.deliveryRevision,
      expectedReferenceVersion: latestParticipant.referenceVersion,
      chatId: reference.chatId,
      messageId: reference.messageId
    });
    if (marked) {
      return { state: lastState, reference };
    }
    const reloaded = await loadAuthoritativeSession(input.service, input.sessionId);
    if (!reloaded) {
      return { state: "missing", current };
    }
    current = reloaded;
    forceRefresh = false;
  }
  return { state: "retryable-edit-failure", reference };
}

async function loadAuthoritativeSession(
  service: GroupCombatService,
  sessionId: string
): Promise<GroupCombatSessionRecord | null> {
  try {
    return await service.findById(sessionId);
  } catch {
    return null;
  }
}

function findParticipant(session: GroupCombatSessionRecord | null, characterId: string) {
  return session?.participants.find((participant) => participant.characterId === characterId) ?? null;
}

function privateReference(participant: GroupCombatSessionRecord["participants"][number]): GroupCombatMessageReference | null {
  return participant.chatId === participant.telegramUserId && participant.messageId !== null
    ? { chatId: participant.chatId, messageId: participant.messageId }
    : null;
}

function sameReference(left: GroupCombatMessageReference, right: GroupCombatMessageReference): boolean {
  return left.chatId === right.chatId && left.messageId === right.messageId;
}

function buildCard(session: GroupCombatSessionRecord, participantCharacterId: string, now: Date) {
  return {
    text: presentGroupCombat(session, participantCharacterId, now),
    options: {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildGroupCombatKeyboard(session, participantCharacterId)
    }
  };
}

function apiTransport(api: Api): GroupCombatDeliveryTransport {
  return {
    editMessage: async (reference, text, options, signal) => {
      if (signal) {
        await api.editMessageText(
          Number(reference.chatId),
          reference.messageId,
          text,
          options,
          signal as Parameters<Api["editMessageText"]>[4]
        );
      } else {
        await api.editMessageText(
          Number(reference.chatId),
          reference.messageId,
          text,
          options
        );
      }
    },
    sendInertMessage: async (chatId, text, options, signal) => {
      const sent = signal
        ? await api.sendMessage(
            Number(chatId),
            text,
            options,
            signal as Parameters<Api["sendMessage"]>[3]
          )
        : await api.sendMessage(Number(chatId), text, options);
      return sent.message_id ?? null;
    },
    deleteMessage: async (reference, signal) => {
      if (signal) {
        await api.deleteMessage(
          Number(reference.chatId),
          reference.messageId,
          signal as Parameters<Api["deleteMessage"]>[2]
        );
      } else {
        await api.deleteMessage(Number(reference.chatId), reference.messageId);
      }
    }
  };
}

function uiPublicationOwnedTransport(input: {
  service: GroupCombatService;
  transport: GroupCombatDeliveryTransport;
  sessionId: string;
  telegramUserId: bigint;
  expectedDeliveryRevision: number;
  claimToken: string;
  now?: () => Date;
}): GroupCombatDeliveryTransport {
  const runOwned = async <T>(
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<T> => {
    const claimedAt = input.now?.() ?? new Date();
    const renewed = await input.service.renewParticipantUiPublicationClaim({
      sessionId: input.sessionId,
      telegramUserId: input.telegramUserId,
      expectedDeliveryRevision: input.expectedDeliveryRevision,
      claimToken: input.claimToken,
      claimedAt
    });
    if (!renewed) {
      throw new GroupCombatUiPublicationOwnershipLost();
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TELEGRAM_PUBLICATION_IO_TIMEOUT_MS
    );
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    editMessage: (reference, text, options) =>
      runOwned((signal) =>
        input.transport.editMessage(reference, text, options, signal)
      ),
    sendInertMessage: (chatId, text, options) =>
      runOwned((signal) =>
        input.transport.sendInertMessage(chatId, text, options, signal)
      ),
    deleteMessage: (reference) =>
      runOwned((signal) => input.transport.deleteMessage(reference, signal))
  };
}

class GroupCombatUiPublicationOwnershipLost extends Error {
  constructor() {
    super("Group-combat UI publication ownership was lost.");
    this.name = "GroupCombatUiPublicationOwnershipLost";
  }
}

function isDelivered(result: GroupCombatParticipantDeliveryResult): boolean {
  return result.state !== "missing-participant" && result.state !== "send-failed" && result.state !== "activation-failed";
}

function serviceTime(service: GroupCombatService): Date {
  return typeof service.currentTime === "function" ? service.currentTime() : new Date();
}

async function withParticipantDeliveryLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = deliveryTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  deliveryTails.set(key, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (deliveryTails.get(key) === tail) {
      deliveryTails.delete(key);
    }
  }
}

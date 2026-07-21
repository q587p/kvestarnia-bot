import type {
  PartyRaidChatAcceptResult,
  PartyRaidChatAuthorizedView,
  PartyRaidChatBeginComposeResult,
  PartyRaidChatBindComposeResult,
  PartyRaidChatBoundIntentRecord,
  PartyRaidChatDeliveryRecord,
  PartyRaidChatRepository
} from "../db/repositories/partyRaidChatRepository";
import { validatePartyRaidChatText } from "../domain/partyRaidChat/partyRaidChatText";

const FORBIDDEN_ENTITY_TYPES = new Set([
  "url",
  "text_link",
  "email",
  "phone_number",
  "mention",
  "text_mention"
]);

export type PartyRaidChatSubmitResult =
  | PartyRaidChatAcceptResult
  | { state: "disabled" }
  | { state: "invalid"; reason: "empty" | "too-long" | "entity" | "attachment" };

export class PartyRaidChatService {
  constructor(
    private readonly repository: PartyRaidChatRepository,
    private readonly options: { enabled: boolean; devHelpersEnabled: boolean },
    private readonly clock: () => Date = () => new Date()
  ) {}

  isEnabled(): boolean {
    return this.options.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.options.enabled && this.options.devHelpersEnabled;
  }

  beginCompose(
    telegramUserId: bigint,
    inviteToken: string,
    privateChatId: bigint
  ): Promise<PartyRaidChatBeginComposeResult | { state: "disabled" }> {
    if (!this.isEnabled()) {
      return Promise.resolve({ state: "disabled" });
    }
    return this.repository.beginCompose(telegramUserId, inviteToken, privateChatId, this.clock());
  }

  bindComposePrompt(
    intentId: string,
    expectedVersion: number,
    promptMessageId: number
  ): Promise<PartyRaidChatBindComposeResult> {
    if (!this.isEnabled()) {
      return Promise.resolve({ state: "stale" });
    }
    return this.repository.bindComposePrompt(intentId, expectedVersion, promptMessageId, this.clock());
  }

  findBoundIntent(
    telegramUserId: bigint,
    privateChatId: bigint,
    promptMessageId: number
  ): Promise<PartyRaidChatBoundIntentRecord | null> {
    if (!this.isEnabled()) {
      return Promise.resolve(null);
    }
    return this.repository.findBoundIntent(telegramUserId, privateChatId, promptMessageId, this.clock());
  }

  cancelCompose(telegramUserId: bigint): Promise<boolean> {
    if (!this.isEnabled()) {
      return Promise.resolve(false);
    }
    return this.repository.cancelCompose(telegramUserId, this.clock());
  }

  submitInput(input: {
    telegramUserId: bigint;
    privateChatId: bigint;
    promptMessageId: number;
    sourceMessageId: number;
    text?: string | undefined;
    entityTypes?: readonly string[] | undefined;
    hasAttachment?: boolean | undefined;
    isForwarded?: boolean | undefined;
  }): Promise<PartyRaidChatSubmitResult> {
    if (!this.isEnabled()) {
      return Promise.resolve({ state: "disabled" });
    }
    if (input.hasAttachment || input.isForwarded || input.text === undefined) {
      return Promise.resolve({ state: "invalid", reason: "attachment" });
    }
    if (input.entityTypes?.some((type) => FORBIDDEN_ENTITY_TYPES.has(type))) {
      return Promise.resolve({ state: "invalid", reason: "entity" });
    }
    const validated = validatePartyRaidChatText(input.text);
    if (!validated.ok) {
      return Promise.resolve({ state: "invalid", reason: validated.reason });
    }
    return this.repository.acceptReply({
      telegramUserId: input.telegramUserId,
      privateChatId: input.privateChatId,
      promptMessageId: input.promptMessageId,
      sourceMessageId: input.sourceMessageId,
      normalizedBody: validated.text,
      now: this.clock()
    });
  }

  getAuthorizedView(
    telegramUserId: bigint,
    inviteToken: string
  ): Promise<PartyRaidChatAuthorizedView | null> {
    if (!this.isEnabled()) {
      return Promise.resolve(null);
    }
    return this.repository.getAuthorizedView(telegramUserId, inviteToken, this.clock());
  }

  requestRecruitingRefresh(telegramUserId: bigint, inviteToken: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return Promise.resolve(false);
    }
    return this.repository.requestRecruitingRefresh(telegramUserId, inviteToken, this.clock());
  }

  listDueDeliveries(
    limit = 23,
    options: { parkCleanDue?: boolean } = {}
  ): Promise<PartyRaidChatDeliveryRecord[]> {
    return this.repository.listDueDeliveries(this.clock(), limit, options);
  }

  isDeliveryClaimCurrent(deliveryId: string, version: number): Promise<boolean> {
    return this.repository.isDeliveryClaimCurrent(deliveryId, version);
  }

  recordDeliveryReference(
    deliveryId: string,
    chatId: bigint,
    messageId: number,
    expected: { version: number; chatId: bigint | null; messageId: number | null }
  ): Promise<boolean> {
    return this.repository.recordDeliveryReference(deliveryId, chatId, messageId, expected, this.clock());
  }

  markDeliveryRendered(deliveryId: string, revision: number, expectedVersion: number): Promise<boolean> {
    return this.repository.markDeliveryRendered(deliveryId, revision, expectedVersion, this.clock());
  }

  markDeliveryFailure(
    deliveryId: string,
    nextAttemptAt: Date,
    deliveryClass: string,
    expectedVersion: number
  ): Promise<void> {
    return this.repository.markDeliveryFailure(
      deliveryId,
      nextAttemptAt,
      deliveryClass,
      expectedVersion,
      this.clock()
    );
  }

  markDeliveryRedacted(
    deliveryId: string,
    deliveryClass: string,
    expected: { version: number; desiredRevision: number; chatId: bigint | null; messageId: number | null }
  ): Promise<void> {
    return this.repository.markDeliveryRedacted(deliveryId, deliveryClass, expected, this.clock());
  }

  async prepareDisabledRedactions(limit = 23): Promise<number> {
    if (this.isEnabled()) {
      return 0;
    }
    const now = this.clock();
    const [cancelled, redactions] = await Promise.all([
      this.repository.cancelDisabledComposeIntents(now),
      this.repository.markDisabledReferencesForRedaction(now, limit)
    ]);
    return cancelled + redactions;
  }

  cleanupExpired(limit = 23): Promise<number> {
    return this.repository.cleanupExpired(this.clock(), limit);
  }

  async devFill(telegramUserId: bigint, count: number): Promise<number> {
    if (!this.areDevHelpersEnabled()) {
      return 0;
    }
    return this.repository.devFillForTelegramUser(telegramUserId, count, this.clock());
  }

  async devClear(telegramUserId: bigint): Promise<boolean> {
    if (!this.areDevHelpersEnabled()) {
      return false;
    }
    return this.repository.devClearForTelegramUser(telegramUserId, this.clock());
  }

  async devExpire(telegramUserId: bigint, target: "composer" | "retention"): Promise<boolean> {
    if (!this.areDevHelpersEnabled()) {
      return false;
    }
    return this.repository.devExpireForTelegramUser(telegramUserId, target, this.clock());
  }
}

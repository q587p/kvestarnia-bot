import { randomBytes, randomUUID } from "node:crypto";
import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type {
  ItemTransferCreateResult,
  ItemTransferRecord,
  ItemTransferRepository,
  ItemTransferRespondResult,
  ItemPostalConfirmResult,
  ItemPostalDraftResult,
  ItemPostalRecipientsResult
} from "../db/repositories/itemTransferRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  buildItemGiftEligibleStacks,
  createItemGiftSelectionGuard,
  ITEM_GIFT_PAGE_SIZE,
  ITEM_POSTAL_DRAFT_TTL_MS,
  ITEM_POSTAL_MAX_DISTINCT_TYPES,
  ITEM_POSTAL_MAX_UNITS_PER_TYPE,
  ITEM_POSTAL_PAGE_SIZE,
  ITEM_POSTAL_TTL_MS,
  calculatePostalDeliveryFee,
  packageLineFromEligibleStack,
  validatePostalPackageLines,
  type ItemGiftEligibleStack,
  type ItemPostalPackageLine
} from "../domain/itemTransfers";
import type { NearbyDuelCandidatesSnapshot, PresencePerson, PresenceService } from "./presenceService";

export type ItemGiftCandidatesResult = NearbyDuelCandidatesSnapshot;
export type ItemPostalRecipientsListResult = ItemPostalRecipientsResult;

export type ItemGiftSelectionResult =
  | { state: "no-character" }
  | { state: "target-not-found" }
  | { state: "no-items"; target: PresencePerson; character: CharacterSummary }
  | {
      state: "selection";
      target: PresencePerson;
      character: CharacterSummary;
      items: PresentedGiftItem[];
      page: number;
      pageCount: number;
    };

export type ItemGiftCreateResult =
  | { state: "no-character" }
  | { state: "target-not-found" }
  | { state: "no-items" }
  | { state: "stale-selection" }
  | { state: "self-gift" }
  | { state: "combat-locked" }
  | { state: "location-mismatch" }
  | { state: "created"; transfer: ItemTransferRecord; sender: CharacterSummary; receiver: CharacterSummary };

export type ItemGiftRespondResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "not-recipient" }
  | { state: "not-sender" }
  | { state: "combat-locked"; transfer: ItemTransferRecord }
  | { state: "location-mismatch"; transfer: ItemTransferRecord }
  | { state: "stale-selection"; transfer: ItemTransferRecord }
  | { state: "insufficient-gold"; transfer: ItemTransferRecord }
  | { state: "expired"; transfer: ItemTransferRecord; transitioned?: boolean }
  | { state: "declined"; transfer: ItemTransferRecord; transitioned?: boolean }
  | { state: "cancelled"; transfer: ItemTransferRecord; transitioned?: boolean }
  | { state: "completed"; transfer: ItemTransferRecord; sender: CharacterSummary; receiver: CharacterSummary }
  | { state: "replayed"; transfer: ItemTransferRecord; sender: CharacterSummary | null; receiver: CharacterSummary | null };

export type ItemPostalDraftViewResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "not-sender" }
  | { state: "target-not-found" }
  | { state: "stale-selection"; transfer?: ItemTransferRecord }
  | {
      state: "draft";
      transfer: ItemTransferRecord;
      sender: CharacterSummary;
      receiver: CharacterSummary;
      items: PresentedGiftItem[];
      page: number;
      pageCount: number;
      packageLines: ItemPostalPackageLine[];
      deliveryFeeGold: number;
    };

export type ItemPostalCreateDraftResult =
  | Exclude<ItemPostalDraftResult, { state: "created" }>
  | { state: "invalid-token" }
  | { state: "not-sender" }
  | { state: "stale-selection"; transfer?: ItemTransferRecord }
  | Extract<ItemPostalDraftViewResult, { state: "draft" }>;

export type ItemPostalEditResult =
  | { state: "invalid-quantity"; transfer: ItemTransferRecord }
  | { state: "package-full"; transfer: ItemTransferRecord }
  | { state: "duplicate-item"; transfer: ItemTransferRecord }
  | { state: "stale-selection"; transfer?: ItemTransferRecord }
  | { state: "invalid-token" }
  | { state: "not-sender" }
  | { state: "no-character" }
  | { state: "target-not-found" }
  | Extract<ItemPostalDraftViewResult, { state: "draft" }>;

export type ItemPostalConfirmServiceResult =
  | Exclude<ItemPostalConfirmResult, { state: "created" }>
  | { state: "created"; transfer: ItemTransferRecord; sender: CharacterSummary; receiver: CharacterSummary };

export interface PresentedGiftItem {
  index: number;
  itemId: string;
  quantity: number;
  content: ItemContent;
  selectionGuard: string;
}

export const ITEM_GIFT_TTL_MS = 23 * 60 * 1000;

export class ItemTransferService {
  constructor(
    private readonly transfers: ItemTransferRepository,
    private readonly presence: PresenceService,
    private readonly clock: () => Date = () => new Date()
  ) {}

  getCandidatesForTelegramUser(telegramUserId: bigint, page = 0): Promise<ItemGiftCandidatesResult> {
    return this.presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, page);
  }

  getPostalRecipientsForTelegramUser(telegramUserId: bigint, page = 0): Promise<ItemPostalRecipientsListResult> {
    return this.transfers.getPostalRecipientsForTelegramUser(telegramUserId, page, ITEM_POSTAL_PAGE_SIZE);
  }

  async createPostalDraftForTelegramUser(
    telegramUserId: bigint,
    receiverTelegramUserId: bigint,
    page = 0
  ): Promise<ItemPostalCreateDraftResult> {
    const now = this.clock();
    const result = await this.transfers.createPostalDraftForTelegramUser(telegramUserId, {
      token: createPostalToken(),
      receiverTelegramUserId,
      now,
      expiresAt: new Date(now.getTime() + ITEM_POSTAL_DRAFT_TTL_MS)
    });
    if (result.state !== "created") {
      return result;
    }

    return this.getPostalDraftForTelegramUser(telegramUserId, result.transfer.token, page);
  }

  async getPostalDraftForTelegramUser(
    telegramUserId: bigint,
    token: string,
    page = 0
  ): Promise<ItemPostalDraftViewResult> {
    const transfer = await this.transfers.findPostalTransferForTelegramUser(telegramUserId, token);
    if (!transfer) {
      return { state: "invalid-token" };
    }
    if (transfer.senderTelegramUserId !== telegramUserId) {
      return { state: "not-sender" };
    }
    if (transfer.status !== "draft" || transfer.expiresAt <= this.clock()) {
      return { state: "stale-selection", transfer };
    }

    return this.buildPostalDraftView(telegramUserId, transfer, page);
  }

  async addPostalDraftLineForTelegramUser(
    telegramUserId: bigint,
    token: string,
    index: number,
    selectionGuard: string,
    page = 0
  ): Promise<ItemPostalEditResult> {
    const view = await this.getPostalDraftForTelegramUser(telegramUserId, token, page);
    if (view.state !== "draft") {
      return view;
    }
    if (view.packageLines.length >= ITEM_POSTAL_MAX_DISTINCT_TYPES) {
      return { state: "package-full", transfer: view.transfer };
    }

    const eligible = await this.getPostalEligibleStacks(telegramUserId);
    const selected = selectGiftStackByGuard(eligible, selectionGuard);
    void index;
    if (!selected) {
      return { state: "stale-selection", transfer: view.transfer };
    }
    if (view.packageLines.some((line) => line.itemId === selected.itemId)) {
      return { state: "duplicate-item", transfer: view.transfer };
    }

    return this.updatePostalDraft(telegramUserId, view.transfer, [
      ...view.packageLines,
      packageLineFromEligibleStack(selected, 1)
    ], page);
  }

  async changePostalDraftLineQuantityForTelegramUser(
    telegramUserId: bigint,
    token: string,
    lineIndex: number,
    quantity: number,
    page = 0
  ): Promise<ItemPostalEditResult> {
    const view = await this.getPostalDraftForTelegramUser(telegramUserId, token, page);
    if (view.state !== "draft") {
      return view;
    }
    const safeIndex = Math.trunc(lineIndex);
    const safeQuantity = Math.trunc(quantity);
    if (
      !Number.isInteger(safeIndex) ||
      safeIndex < 0 ||
      safeIndex >= view.packageLines.length ||
      !Number.isInteger(safeQuantity) ||
      safeQuantity < 1 ||
      safeQuantity > ITEM_POSTAL_MAX_UNITS_PER_TYPE
    ) {
      return { state: "invalid-quantity", transfer: view.transfer };
    }

    const eligible = await this.getPostalEligibleStacks(telegramUserId);
    const byId = new Map(eligible.map((stack) => [stack.itemId, stack]));
    const current = byId.get(view.packageLines[safeIndex]!.itemId);
    if (!current || current.quantity < safeQuantity) {
      return { state: "stale-selection", transfer: view.transfer };
    }

    const nextLines = view.packageLines.map((line, index) =>
      index === safeIndex ? packageLineFromEligibleStack(current, safeQuantity) : line
    );

    return this.updatePostalDraft(telegramUserId, view.transfer, nextLines, page);
  }

  async removePostalDraftLineForTelegramUser(
    telegramUserId: bigint,
    token: string,
    lineIndex: number,
    page = 0
  ): Promise<ItemPostalEditResult> {
    const view = await this.getPostalDraftForTelegramUser(telegramUserId, token, page);
    if (view.state !== "draft") {
      return view;
    }
    const safeIndex = Math.trunc(lineIndex);
    if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= view.packageLines.length) {
      return { state: "invalid-quantity", transfer: view.transfer };
    }

    return this.updatePostalDraft(
      telegramUserId,
      view.transfer,
      view.packageLines.filter((_line, index) => index !== safeIndex),
      page
    );
  }

  async confirmPostalDraftForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ItemPostalConfirmServiceResult> {
    const transfer = await this.transfers.findPostalTransferForTelegramUser(telegramUserId, token);
    if (!transfer) {
      return { state: "invalid-token" };
    }
    if (!validatePostalPackageLines(transfer.packageLines)) {
      return { state: "stale-selection", transfer };
    }

    const now = this.clock();
    const result = await this.transfers.confirmPostalDraftForTelegramUser(telegramUserId, {
      token,
      itemContents: items,
      now,
      expiresAt: new Date(now.getTime() + ITEM_POSTAL_TTL_MS),
      result: buildPostalTransferResult("pending", transfer)
    });

    return mapPostalConfirmResult(result);
  }

  async acceptPostalForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    const transfer = await this.transfers.findPostalTransferForTelegramUser(telegramUserId, token);
    return mapRespondResult(await this.transfers.acceptPostalForTelegramUser(telegramUserId, {
      token,
      itemContents: items,
      now: this.clock(),
      result: buildPostalTransferResult("completed", transfer)
    }));
  }

  async declinePostalForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    return mapRespondResult(await this.transfers.declinePostalForTelegramUser(telegramUserId, token, this.clock()));
  }

  async cancelPostalForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    return mapRespondResult(await this.transfers.cancelPostalForTelegramUser(telegramUserId, token, this.clock()));
  }

  async getSelectionForTelegramUser(
    telegramUserId: bigint,
    targetTelegramUserId: bigint,
    page = 0
  ): Promise<ItemGiftSelectionResult> {
    const target = await this.findTarget(telegramUserId, targetTelegramUserId, page);
    if (!target) {
      return { state: "target-not-found" };
    }

    const snapshot = await this.transfers.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }

    const eligible = sortEligible(buildItemGiftEligibleStacks({
      stacks: snapshot.items,
      equippedItemIds: new Set(snapshot.equippedItemIds),
      reservedItemIds: new Set(snapshot.reservedItemIds),
      itemContents: items
    }));

    if (eligible.length === 0) {
      return {
        state: "no-items",
        target,
        character: summarizeCharacter(snapshot.character)
      };
    }

    const pageCount = Math.max(1, Math.ceil(eligible.length / ITEM_GIFT_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(Math.trunc(page), pageCount - 1));
    const visible = eligible.slice(safePage * ITEM_GIFT_PAGE_SIZE, (safePage + 1) * ITEM_GIFT_PAGE_SIZE);

    return {
      state: "selection",
      target,
      character: summarizeCharacter(snapshot.character),
      items: visible.map((item, offset) => presentGiftItem(item, safePage * ITEM_GIFT_PAGE_SIZE + offset)),
      page: safePage,
      pageCount
    };
  }

  async createGiftForTelegramUser(
    telegramUserId: bigint,
    targetTelegramUserId: bigint,
    index: number,
    selectionGuard: string,
    page = 0
  ): Promise<ItemGiftCreateResult> {
    if (!(await this.presence.isNearbyDuelTargetAvailable(telegramUserId, targetTelegramUserId))) {
      return { state: "target-not-found" };
    }

    const now = this.clock();
    const snapshot = await this.transfers.getSnapshotForTelegramUser(telegramUserId, now);
    if (!snapshot) {
      return { state: "no-character" };
    }

    const eligible = sortEligible(buildItemGiftEligibleStacks({
      stacks: snapshot.items,
      equippedItemIds: new Set(snapshot.equippedItemIds),
      reservedItemIds: new Set(snapshot.reservedItemIds),
      itemContents: items
    }));
    const selected = selectGiftStackByGuard(eligible, selectionGuard);

    if (!selected) {
      return { state: "stale-selection" };
    }

    void index;
    void page;
    const result = await this.transfers.createGiftForTelegramUser(telegramUserId, {
      token: randomUUID(),
      receiverTelegramUserId: targetTelegramUserId,
      item: selected.content,
      itemFingerprint: selected.fingerprint,
      now,
      expiresAt: new Date(now.getTime() + ITEM_GIFT_TTL_MS)
    });

    return mapCreateResult(result);
  }

  async acceptGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    const transfer = await this.transfers.findGiftForTelegramUser(telegramUserId, token);
    const now = this.clock();
    if (
      transfer?.status === "pending" &&
      transfer.expiresAt > now &&
      !(await this.presence.isNearbyDuelTargetAvailable(telegramUserId, transfer.senderTelegramUserId))
    ) {
      return { state: "location-mismatch", transfer };
    }

    return mapRespondResult(await this.transfers.acceptGiftForTelegramUser(telegramUserId, {
      token,
      itemContents: items,
      now,
      result: buildTransferResult("completed", transfer)
    }));
  }

  async declineGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    return mapRespondResult(await this.transfers.declineGiftForTelegramUser(telegramUserId, token, this.clock()));
  }

  async cancelGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    return mapRespondResult(await this.transfers.cancelGiftForTelegramUser(telegramUserId, token, this.clock()));
  }

  async getGiftForTelegramUser(telegramUserId: bigint, token: string): Promise<ItemGiftRespondResult> {
    const transfer = await this.transfers.findGiftForTelegramUser(telegramUserId, token);
    if (!transfer) {
      return { state: "invalid-token" };
    }

    if (transfer.status === "completed") {
      return mapRespondResult(await this.transfers.acceptGiftForTelegramUser(telegramUserId, {
        token,
        itemContents: items,
        now: this.clock(),
        result: buildTransferResult("completed", transfer)
      }));
    }

    if (transfer.status === "declined" || transfer.status === "expired" || transfer.status === "cancelled") {
      return { state: transfer.status, transfer };
    }

    return { state: "stale-selection", transfer };
  }

  private async buildPostalDraftView(
    telegramUserId: bigint,
    transfer: ItemTransferRecord,
    page: number
  ): Promise<ItemPostalDraftViewResult> {
    const snapshot = await this.transfers.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return { state: "no-character" };
    }
    const eligible = sortEligible(buildItemGiftEligibleStacks({
      stacks: snapshot.items,
      equippedItemIds: new Set(snapshot.equippedItemIds),
      reservedItemIds: new Set(snapshot.reservedItemIds),
      itemContents: items
    }));
    const pageCount = Math.max(1, Math.ceil(eligible.length / ITEM_POSTAL_PAGE_SIZE));
    const safePage = Math.max(0, Math.min(Math.trunc(page), pageCount - 1));
    const receiver = {
      ...snapshot.character,
      id: transfer.receiverCharacterId,
      name: transfer.receiverName
    };

    return {
      state: "draft",
      transfer,
      sender: summarizeCharacter(snapshot.character),
      receiver: summarizeCharacter(receiver),
      items: eligible
        .slice(safePage * ITEM_POSTAL_PAGE_SIZE, (safePage + 1) * ITEM_POSTAL_PAGE_SIZE)
        .map((item, offset) => presentGiftItem(item, safePage * ITEM_POSTAL_PAGE_SIZE + offset)),
      page: safePage,
      pageCount,
      packageLines: transfer.packageLines,
      deliveryFeeGold: calculatePostalDeliveryFee(transfer.packageLines)
    };
  }

  private async getPostalEligibleStacks(telegramUserId: bigint): Promise<ItemGiftEligibleStack[]> {
    const snapshot = await this.transfers.getSnapshotForTelegramUser(telegramUserId, this.clock());
    if (!snapshot) {
      return [];
    }

    return sortEligible(buildItemGiftEligibleStacks({
      stacks: snapshot.items,
      equippedItemIds: new Set(snapshot.equippedItemIds),
      reservedItemIds: new Set(snapshot.reservedItemIds),
      itemContents: items
    }));
  }

  private async updatePostalDraft(
    telegramUserId: bigint,
    transfer: ItemTransferRecord,
    packageLines: ItemPostalPackageLine[],
    page: number
  ): Promise<ItemPostalEditResult> {
    const updated = await this.transfers.updatePostalDraftForTelegramUser(telegramUserId, {
      token: transfer.token,
      packageLines,
      deliveryFeeGold: calculatePostalDeliveryFee(packageLines),
      now: this.clock()
    });
    if (updated.state !== "updated") {
      return updated;
    }

    return this.getPostalDraftForTelegramUser(telegramUserId, updated.transfer.token, page);
  }

  private async findTarget(
    telegramUserId: bigint,
    targetTelegramUserId: bigint,
    page: number
  ): Promise<PresencePerson | null> {
    const snapshot = await this.presence.getNearbyDuelCandidatesForTelegramUser(telegramUserId, page);
    if (snapshot.state !== "ready") {
      return null;
    }

    return snapshot.visible.find((candidate) => candidate.telegramUserId === targetTelegramUserId) ?? null;
  }
}

function sortEligible(stacks: ItemGiftEligibleStack[]): ItemGiftEligibleStack[] {
  return stacks.sort((left, right) =>
    left.content.name.localeCompare(right.content.name, "uk") ||
    left.itemId.localeCompare(right.itemId)
  );
}

function presentGiftItem(item: ItemGiftEligibleStack, index: number): PresentedGiftItem {
  return {
    index,
    itemId: item.itemId,
    quantity: item.quantity,
    content: item.content,
    selectionGuard: createItemGiftSelectionGuard({
      itemId: item.itemId,
      fingerprint: item.fingerprint
    })
  };
}

function selectGiftStackByGuard(
  stacks: readonly ItemGiftEligibleStack[],
  selectionGuard: string
): ItemGiftEligibleStack | null {
  const matches = stacks.filter((stack) =>
    createItemGiftSelectionGuard({
      itemId: stack.itemId,
      fingerprint: stack.fingerprint
    }) === selectionGuard
  );

  return matches.length === 1 ? matches[0]! : null;
}

function mapCreateResult(result: ItemTransferCreateResult): ItemGiftCreateResult {
  if (result.state !== "created") {
    return result;
  }

  return {
    state: "created",
    transfer: result.transfer,
    sender: summarizeCharacter(result.sender),
    receiver: summarizeCharacter(result.receiver)
  };
}

function mapRespondResult(result: ItemTransferRespondResult): ItemGiftRespondResult {
  if (result.state === "completed") {
    return {
      state: "completed",
      transfer: result.transfer,
      sender: summarizeCharacter(result.sender),
      receiver: summarizeCharacter(result.receiver)
    };
  }

  if (result.state === "replayed") {
    return {
      state: "replayed",
      transfer: result.transfer,
      sender: result.sender ? summarizeCharacter(result.sender) : null,
      receiver: result.receiver ? summarizeCharacter(result.receiver) : null
    };
  }

  return result;
}

function mapPostalConfirmResult(result: ItemPostalConfirmResult): ItemPostalConfirmServiceResult {
  if (result.state !== "created") {
    return result;
  }

  return {
    state: "created",
    transfer: result.transfer,
    sender: summarizeCharacter(result.sender),
    receiver: summarizeCharacter(result.receiver)
  };
}

function buildTransferResult(status: string, transfer: ItemTransferRecord | null) {
  return {
    kind: "item-gift",
    status,
    itemId: transfer?.itemId ?? null,
    itemName: transfer?.itemName ?? null,
    quantity: transfer?.quantity ?? 1,
    senderTelegramUserId: transfer?.senderTelegramUserId?.toString() ?? null,
    receiverTelegramUserId: transfer?.receiverTelegramUserId?.toString() ?? null
  };
}

function buildPostalTransferResult(status: string, transfer: ItemTransferRecord | null) {
  return {
    kind: "postal-delivery",
    status,
    packageLines: transfer?.packageLines.map((line) => ({
      itemId: line.itemId,
      itemName: line.itemName,
      quantity: line.quantity,
      itemFingerprint: line.itemFingerprint,
      observedQuantity: line.observedQuantity,
      tags: line.tags
    })) ?? [],
    deliveryFeeGold: transfer?.deliveryFeeGold ?? 0,
    senderTelegramUserId: transfer?.senderTelegramUserId?.toString() ?? null,
    receiverTelegramUserId: transfer?.receiverTelegramUserId?.toString() ?? null
  };
}

function createPostalToken(): string {
  return randomBytes(16).toString("base64url");
}

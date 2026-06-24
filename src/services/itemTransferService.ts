import { randomUUID } from "node:crypto";
import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type {
  ItemTransferCreateResult,
  ItemTransferRecord,
  ItemTransferRepository,
  ItemTransferRespondResult
} from "../db/repositories/itemTransferRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  buildItemGiftEligibleStacks,
  createItemGiftSelectionGuard,
  ITEM_GIFT_PAGE_SIZE,
  type ItemGiftEligibleStack
} from "../domain/itemTransfers";
import type { NearbyDuelCandidatesSnapshot, PresencePerson, PresenceService } from "./presenceService";

export type ItemGiftCandidatesResult = NearbyDuelCandidatesSnapshot;

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
  | { state: "expired"; transfer: ItemTransferRecord }
  | { state: "declined"; transfer: ItemTransferRecord }
  | { state: "cancelled"; transfer: ItemTransferRecord }
  | { state: "completed"; transfer: ItemTransferRecord; sender: CharacterSummary; receiver: CharacterSummary }
  | { state: "replayed"; transfer: ItemTransferRecord; sender: CharacterSummary | null; receiver: CharacterSummary | null };

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

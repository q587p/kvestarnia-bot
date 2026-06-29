import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import type { ItemContent } from "../../src/content/schema";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  ItemTransferCreateInput,
  ItemTransferCreateResult,
  ItemTransferRecord,
  ItemTransferRepository,
  ItemTransferSnapshot
} from "../../src/db/repositories/itemTransferRepository";
import {
  buildItemGiftEligibleStacks,
  createItemGiftSelectionGuard
} from "../../src/domain/itemTransfers";
import { ItemTransferService } from "../../src/services/itemTransferService";
import type {
  NearbyDuelCandidatesSnapshot,
  PresenceService
} from "../../src/services/presenceService";

const fixedNow = new Date("2026-06-24T12:00:00.000Z");
const [earlierItem, selectedItem, shiftedItem] = pickOrderedEligibleItems();
const bandage = items.find((item) => item.id === "item.responsible-panic-bandage");

if (!bandage) {
  throw new Error("Expected responsible panic bandage content.");
}

describe("ItemTransferService gift selection guards", () => {
  it("uses the guarded item when an earlier-sorting item is inserted before tap", async () => {
    const repository = new FakeItemTransferRepository([
      stack(selectedItem),
      stack(shiftedItem)
    ]);
    const service = makeService(repository);
    const selection = await service.getSelectionForTelegramUser(1n, 2n);
    expect(selection.state).toBe("selection");
    const selected = selection.state === "selection"
      ? selection.items.find((item) => item.itemId === selectedItem.id)
      : null;
    expect(selected).toBeTruthy();

    repository.items = [
      stack(earlierItem),
      stack(selectedItem),
      stack(shiftedItem)
    ];
    const result = await service.createGiftForTelegramUser(
      1n,
      2n,
      selected!.index,
      selected!.selectionGuard,
      0
    );

    expect(result.state).toBe("created");
    expect(repository.createdInputs).toHaveLength(1);
    expect(repository.createdInputs[0].item.id).toBe(selectedItem.id);
  });

  it("does not gift a shifted item when an earlier item is removed before tap", async () => {
    const repository = new FakeItemTransferRepository([
      stack(earlierItem),
      stack(selectedItem),
      stack(shiftedItem)
    ]);
    const service = makeService(repository);
    const selection = await service.getSelectionForTelegramUser(1n, 2n);
    expect(selection.state).toBe("selection");
    const selected = selection.state === "selection"
      ? selection.items.find((item) => item.itemId === selectedItem.id)
      : null;
    expect(selected).toBeTruthy();

    repository.items = [
      stack(selectedItem),
      stack(shiftedItem)
    ];
    const result = await service.createGiftForTelegramUser(
      1n,
      2n,
      selected!.index,
      selected!.selectionGuard,
      0
    );

    expect(result.state).toBe("created");
    expect(repository.createdInputs[0].item.id).toBe(selectedItem.id);
  });

  it("fails stale when the selected item became reserved before create", async () => {
    const repository = new FakeItemTransferRepository([stack(selectedItem)]);
    const service = makeService(repository);
    const selection = await service.getSelectionForTelegramUser(1n, 2n);
    expect(selection.state).toBe("selection");
    const selected = selection.state === "selection" ? selection.items[0] : null;
    expect(selected).toBeTruthy();

    repository.reservedItemIds = [selectedItem.id];
    const result = await service.createGiftForTelegramUser(
      1n,
      2n,
      selected!.index,
      selected!.selectionGuard,
      0
    );

    expect(result).toEqual({ state: "stale-selection" });
    expect(repository.createdInputs).toHaveLength(0);
  });

  it("fails stale when the selected item became equipped before create", async () => {
    const repository = new FakeItemTransferRepository([stack(selectedItem)]);
    const service = makeService(repository);
    const selection = await service.getSelectionForTelegramUser(1n, 2n);
    expect(selection.state).toBe("selection");
    const selected = selection.state === "selection" ? selection.items[0] : null;
    expect(selected).toBeTruthy();

    repository.equippedItemIds = [selectedItem.id];
    const result = await service.createGiftForTelegramUser(
      1n,
      2n,
      selected!.index,
      selected!.selectionGuard,
      0
    );

    expect(result).toEqual({ state: "stale-selection" });
    expect(repository.createdInputs).toHaveLength(0);
  });

  it("fails stale when the selected item disappeared before create", async () => {
    const repository = new FakeItemTransferRepository([stack(selectedItem), stack(shiftedItem)]);
    const service = makeService(repository);
    const selection = await service.getSelectionForTelegramUser(1n, 2n);
    expect(selection.state).toBe("selection");
    const selected = selection.state === "selection"
      ? selection.items.find((item) => item.itemId === selectedItem.id)
      : null;
    expect(selected).toBeTruthy();

    repository.items = [stack(shiftedItem)];
    const result = await service.createGiftForTelegramUser(
      1n,
      2n,
      selected!.index,
      selected!.selectionGuard,
      0
    );

    expect(result).toEqual({ state: "stale-selection" });
    expect(repository.createdInputs).toHaveLength(0);
  });

  it("fails stale when the selected item fingerprint changed before create", async () => {
    const repository = new FakeItemTransferRepository([stack(selectedItem), stack(shiftedItem)]);
    const service = makeService(repository);
    const staleGuard = createItemGiftSelectionGuard({
      itemId: selectedItem.id,
      fingerprint: "ffffffffffffffffffffffff"
    });

    const result = await service.createGiftForTelegramUser(1n, 2n, 0, staleGuard, 0);

    expect(result).toEqual({ state: "stale-selection" });
    expect(repository.createdInputs).toHaveLength(0);
  });

  it("fails stale for a forged or unknown selection guard", async () => {
    const repository = new FakeItemTransferRepository([stack(selectedItem), stack(shiftedItem)]);
    const service = makeService(repository);
    const forgedGuard = createItemGiftSelectionGuard({
      itemId: "item.unknown",
      fingerprint: "000000000000000000000000"
    });

    const result = await service.createGiftForTelegramUser(1n, 2n, 0, forgedGuard, 0);

    expect(result).toEqual({ state: "stale-selection" });
    expect(repository.createdInputs).toHaveLength(0);
  });

  it("keeps trade-blocked bandages out of Safe Gifting selection while postal can list them", async () => {
    const repository = new FakeItemTransferRepository([
      stack(selectedItem),
      stack(bandage)
    ]);
    const service = makeService(repository);

    const giftSelection = await service.getSelectionForTelegramUser(1n, 2n);
    expect(giftSelection.state).toBe("selection");
    expect(giftSelection.state === "selection"
      ? giftSelection.items.map((item) => item.itemId)
      : []
    ).toContain(selectedItem.id);
    expect(giftSelection.state === "selection"
      ? giftSelection.items.map((item) => item.itemId)
      : []
    ).not.toContain(bandage.id);

    repository.postalTransfer = postalDraftRecord();
    const postalDraft = await service.getPostalDraftForTelegramUser(1n, "postal-token", 0);

    expect(postalDraft.state).toBe("draft");
    expect(postalDraft.state === "draft"
      ? postalDraft.items.map((item) => item.itemId)
      : []
    ).toContain(bandage.id);
  });
});

function makeService(repository: FakeItemTransferRepository): ItemTransferService {
  return new ItemTransferService(
    repository,
    {
      getNearbyDuelCandidatesForTelegramUser: () => Promise.resolve(candidateSnapshot()),
      isNearbyDuelTargetAvailable: () => Promise.resolve(true)
    } as unknown as PresenceService,
    () => fixedNow
  );
}

function candidateSnapshot(): NearbyDuelCandidatesSnapshot {
  return {
    state: "ready",
    location: { id: "location.korchma.bar", name: "Korchma" },
    page: 0,
    pageSize: 5,
    total: 1,
    totalPages: 1,
    visible: [{ telegramUserId: 2n, name: "Receiver", status: "active" }]
  };
}

function pickOrderedEligibleItems(): [ItemContent, ItemContent, ItemContent] {
  const eligible = buildItemGiftEligibleStacks({
    stacks: items.map((item) => ({ itemId: item.id, quantity: 1 })),
    itemContents: items
  });
  const ordered = eligible
    .map((item) => item.content)
    .sort((left, right) =>
      left.name.localeCompare(right.name, "uk") ||
      left.id.localeCompare(right.id)
    );

  return [ordered[0], ordered[1], ordered[2]];
}

function stack(content: ItemContent) {
  return {
    id: `row-${content.id}`,
    characterId: "sender",
    itemId: content.id,
    quantity: 1,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
}

const senderCharacter: CharacterRecord = {
  id: "sender",
  userId: "user-sender",
  currentLocationId: "location.korchma.bar",
  name: "Sender",
  pronoun: "they",
  path: "boundary",
  raceId: "race.human",
  classId: "class.ranger",
  level: 4,
  xp: 0,
  gold: 0,
  hpCurrent: 25,
  hpMax: 25,
  manaCurrent: 10,
  manaMax: 10,
  statsJson: {}
};

const receiverCharacter: CharacterRecord = {
  ...senderCharacter,
  id: "receiver",
  userId: "user-receiver",
  name: "Receiver"
};

class FakeItemTransferRepository implements ItemTransferRepository {
  items: ItemTransferSnapshot["items"];
  equippedItemIds: string[] = [];
  reservedItemIds: string[] = [];
  postalTransfer: ItemTransferRecord | null = null;
  readonly createdInputs: ItemTransferCreateInput[] = [];

  constructor(itemsSnapshot: ItemTransferSnapshot["items"]) {
    this.items = itemsSnapshot;
  }

  getSnapshotForTelegramUser(): Promise<ItemTransferSnapshot | null> {
    return Promise.resolve({
      character: senderCharacter,
      items: this.items,
      equippedItemIds: this.equippedItemIds,
      reservedItemIds: this.reservedItemIds
    });
  }

  createGiftForTelegramUser(
    _senderTelegramUserId: bigint,
    input: ItemTransferCreateInput
  ): Promise<ItemTransferCreateResult> {
    this.createdInputs.push(input);

    return Promise.resolve({
      state: "created",
      transfer: transferFromInput(input),
      sender: senderCharacter,
      receiver: receiverCharacter
    });
  }

  findGiftForTelegramUser(): Promise<ItemTransferRecord | null> {
    throw new Error("Not used in these tests.");
  }

  getPostalRecipientsForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  createPostalDraftForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  updatePostalDraftForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  findPostalTransferForTelegramUser(): Promise<ItemTransferRecord | null> {
    return Promise.resolve(this.postalTransfer);
  }

  confirmPostalDraftForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  cancelPostalForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  declinePostalForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  acceptPostalForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  cancelGiftForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  declineGiftForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }

  acceptGiftForTelegramUser(): Promise<never> {
    throw new Error("Not used in these tests.");
  }
}

function transferFromInput(input: ItemTransferCreateInput): ItemTransferRecord {
  return {
    id: "transfer-1",
    token: input.token,
    senderCharacterId: "sender",
    receiverCharacterId: "receiver",
    senderTelegramUserId: 1n,
    receiverTelegramUserId: input.receiverTelegramUserId,
    senderName: "Sender",
    receiverName: "Receiver",
    senderRemortCount: 0,
    receiverRemortCount: 0,
    locationId: "location.korchma.bar",
    transferKind: "gift",
    itemId: input.item.id,
    itemName: input.item.name,
    itemFingerprint: input.itemFingerprint,
    quantity: 1,
    packageLines: [],
    deliveryFeeGold: 0,
    status: "pending",
    result: null,
    expiresAt: input.expiresAt,
    completedAt: null,
    respondedAt: null,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function postalDraftRecord(): ItemTransferRecord {
  return {
    id: "postal-transfer-1",
    token: "postal-token",
    senderCharacterId: "sender",
    receiverCharacterId: "receiver",
    senderTelegramUserId: 1n,
    receiverTelegramUserId: 2n,
    senderName: "Sender",
    receiverName: "Receiver",
    senderRemortCount: 0,
    receiverRemortCount: 0,
    locationId: null,
    transferKind: "postal",
    itemId: "postal-package",
    itemName: "Postal package",
    itemFingerprint: "postal-package",
    quantity: 0,
    packageLines: [],
    deliveryFeeGold: 0,
    status: "draft",
    result: null,
    expiresAt: new Date(fixedNow.getTime() + 60_000),
    completedAt: null,
    respondedAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
}

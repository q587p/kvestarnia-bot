import { randomUUID } from "node:crypto";
import { items } from "../content";
import type { ItemContent } from "../content/schema";
import {
  buildMantokChestEligibleStacks,
  calculateMantokChestAverageScore,
  calculateMantokChestItemScore,
  calculateMinimumMantokChestOutputScore,
  countMantokChestEligibleUnits,
  expandMantokChestStacks,
  MANTOK_CHEST_BATCH_SIZE,
  selectCheapestMantokChestUnits,
  selectMantokChestOutputItem,
  summarizeMantokChestUnits
} from "../domain/mantokChest";
import type {
  MantokChestRepository,
  MantokChestRunItem,
  MantokChestRunRecord,
  MantokChestSnapshot
} from "../db/repositories/mantokChestRepository";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import type { ActivityEventService } from "./activityEventService";
import { trackRewardAchievementsSafely } from "./achievementTracking";

export type MantokChestOverviewResult =
  | { state: "no-character" }
  | { state: "ready"; eligibleCount: number };

export type MantokChestPreviewResult =
  | { state: "no-character" }
  | { state: "not-enough-items"; eligibleCount: number }
  | { state: "selection-incomplete"; selectedCount: number }
  | {
      state: "preview-created";
      run: MantokChestRunRecord;
      inputItems: MantokChestPresentedItem[];
      averageInputScore: number;
      minimumOutputScore: number;
    };

export type MantokChestManualSelectionResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | {
      state: "selection";
      run: MantokChestRunRecord;
      items: MantokChestSelectableItem[];
      selectedCount: number;
      requiredCount: number;
      eligibleCount: number;
      page: number;
      pageCount: number;
    };

export type MantokChestRecycleResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "cancelled"; run: MantokChestRunRecord }
  | { state: "expired"; run: MantokChestRunRecord }
  | { state: "stale-inputs"; run: MantokChestRunRecord }
  | { state: "no-output-candidate"; run: MantokChestRunRecord }
  | { state: "recycled"; run: MantokChestRunRecord; outputItem: MantokChestPresentedItem; achievementUnlocks?: AchievementUnlock[] }
  | { state: "replayed"; run: MantokChestRunRecord; outputItem: MantokChestPresentedItem | null };

export type MantokChestCancelResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "cancelled"; run: MantokChestRunRecord };

export interface MantokChestPresentedItem {
  itemId: string;
  quantity: number;
  content: ItemContent;
  score: number;
  manualOnly: boolean;
}

export interface MantokChestSelectableItem extends MantokChestPresentedItem {
  index: number;
  selectedQuantity: number;
  availableQuantity: number;
}

export const MANTOK_CHEST_MANUAL_PAGE_SIZE = 5;
export const MANTOK_CHEST_PENDING_TTL_MS = 60 * 60 * 1000;

export class MantokChestService {
  constructor(
    private readonly repository: MantokChestRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService,
    private readonly activityEvents?: ActivityEventService
  ) {}

  async getOverviewForTelegramUser(telegramUserId: bigint): Promise<MantokChestOverviewResult> {
    await this.cleanupExpiredPendingRuns();
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());

    if (!snapshot) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      eligibleCount: countMantokChestEligibleUnits(getEligibleStacks(snapshot))
    };
  }

  async startManualSelectionForTelegramUser(
    telegramUserId: bigint,
    page = 0
  ): Promise<MantokChestManualSelectionResult> {
    await this.cleanupExpiredPendingRuns();
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());

    if (!snapshot) {
      return { state: "no-character" };
    }

    const run = await this.repository.createPendingRunForTelegramUser(telegramUserId, {
      token: randomUUID(),
      inputItems: [],
      averageInputScore: 0,
      minimumOutputScore: 0,
      now: this.clock()
    });

    if (!run) {
      return { state: "no-character" };
    }

    return buildManualSelectionResult(snapshot, run, page);
  }

  async getManualSelectionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    page = 0
  ): Promise<MantokChestManualSelectionResult> {
    await this.cleanupExpiredPendingRuns();
    const [snapshot, run] = await Promise.all([
      this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock()),
      this.repository.findRunForTelegramUser(telegramUserId, token)
    ]);

    if (!snapshot) {
      return { state: "no-character" };
    }

    if (!run || run.status !== "pending") {
      return { state: "invalid-token" };
    }

    return buildManualSelectionResult(snapshot, run, page);
  }

  async addManualSelectionUnitForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      page: number;
      index: number;
    }
  ): Promise<MantokChestManualSelectionResult> {
    return this.updateManualSelectionUnit(telegramUserId, input, "add");
  }

  async removeManualSelectionUnitForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      page: number;
      index: number;
    }
  ): Promise<MantokChestManualSelectionResult> {
    return this.updateManualSelectionUnit(telegramUserId, input, "remove");
  }

  async getManualPreviewForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<MantokChestPreviewResult> {
    await this.cleanupExpiredPendingRuns();
    const [snapshot, run] = await Promise.all([
      this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock()),
      this.repository.findRunForTelegramUser(telegramUserId, token)
    ]);

    if (!snapshot) {
      return { state: "no-character" };
    }

    if (!run || run.status !== "pending") {
      return { state: "not-enough-items", eligibleCount: 0 };
    }

    const selectedCount = run.inputItems.reduce((sum, item) => sum + item.quantity, 0);

    if (selectedCount !== MANTOK_CHEST_BATCH_SIZE) {
      return {
        state: "selection-incomplete",
        selectedCount
      };
    }

    return {
      state: "preview-created",
      run,
      inputItems: presentRunItems(run.inputItems, getManualEligibleStacks(snapshot)),
      averageInputScore: run.averageInputScore,
      minimumOutputScore: run.minimumOutputScore
    };
  }

  async createAutoPickPreviewForTelegramUser(
    telegramUserId: bigint
  ): Promise<MantokChestPreviewResult> {
    await this.cleanupExpiredPendingRuns();
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock());

    if (!snapshot) {
      return { state: "no-character" };
    }

    const eligibleStacks = getEligibleStacks(snapshot);
    const eligibleCount = countMantokChestEligibleUnits(eligibleStacks);
    const selection = selectCheapestMantokChestUnits(eligibleStacks);

    if (!selection) {
      return {
        state: "not-enough-items",
        eligibleCount
      };
    }

    const run = await this.repository.createPendingRunForTelegramUser(telegramUserId, {
      token: randomUUID(),
      inputItems: selection.items,
      averageInputScore: selection.averageInputScore,
      minimumOutputScore: selection.minimumOutputScore,
      now: this.clock()
    });

    if (!run) {
      return { state: "no-character" };
    }

    return {
      state: "preview-created",
      run,
      inputItems: presentRunItems(run.inputItems, eligibleStacks),
      averageInputScore: selection.averageInputScore,
      minimumOutputScore: selection.minimumOutputScore
    };
  }

  async confirmRecycleForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<MantokChestRecycleResult> {
    await this.cleanupExpiredPendingRuns();
    const result = await this.repository.confirmRunForTelegramUser(telegramUserId, {
      token,
      now: this.clock(),
      selectOutput: (snapshot, run) => this.selectOutputForRun(snapshot, run)
    });

    if (result.state === "recycled") {
      const outputItems = presentRunItems(result.run.outputItems);
      const achievementUnlocks = await trackRewardAchievementsSafely(this.achievements, {
        characterId: result.run.characterId,
        actorDisplayName: result.characterDisplayName,
        sourceId: result.run.id,
        sourceType: "mantok-chest",
        occurredAt: result.run.completedAt ?? result.run.updatedAt,
        itemGrants: result.run.outputItems,
        events: ["mantok.chest.completed"],
        activityEvents: this.activityEvents
      });

      return {
        ...result,
        outputItem: outputItems[0] ?? unknownOutputItem(),
        achievementUnlocks
      };
    }

    if (result.state === "replayed") {
      return {
        ...result,
        outputItem: presentRunItems(result.run.outputItems)[0] ?? null
      };
    }

    return result;
  }

  async cancelRecycleForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<MantokChestCancelResult> {
    await this.cleanupExpiredPendingRuns();
    const run = await this.repository.cancelRunForTelegramUser(telegramUserId, token, this.clock());

    if (!run) {
      return { state: "invalid-token" };
    }

    if (run.status !== "cancelled") {
      return { state: "invalid-token" };
    }

    return {
      state: "cancelled",
      run
    };
  }

  async cleanupExpiredPendingRuns(): Promise<number> {
    const now = this.clock();
    const cutoff = new Date(now.getTime() - MANTOK_CHEST_PENDING_TTL_MS);

    return this.repository.expirePendingRunsOlderThan(cutoff, now);
  }

  private async updateManualSelectionUnit(
    telegramUserId: bigint,
    input: {
      token: string;
      page: number;
      index: number;
    },
    action: "add" | "remove"
  ): Promise<MantokChestManualSelectionResult> {
    await this.cleanupExpiredPendingRuns();
    const [snapshot, run] = await Promise.all([
      this.repository.getSnapshotForTelegramUser(telegramUserId, this.clock()),
      this.repository.findRunForTelegramUser(telegramUserId, input.token)
    ]);

    if (!snapshot) {
      return { state: "no-character" };
    }

    if (!run || run.status !== "pending") {
      return { state: "invalid-token" };
    }

    const eligibleStacks = sortEligibleStacks(getManualEligibleStacks(snapshot));
    const stack = eligibleStacks[input.index];

    if (!stack) {
      return buildManualSelectionResult(snapshot, run, input.page);
    }

    const selectedUnits = expandStoredRunItems(run.inputItems, eligibleStacks);
    const selectedCount = selectedUnits.length;
    const selectedInStack = run.inputItems.find((item) => item.itemId === stack.itemId)?.quantity ?? 0;

    const nextUnits =
      action === "add"
        ? selectedCount < MANTOK_CHEST_BATCH_SIZE && selectedInStack < stack.quantity
          ? [...selectedUnits, { itemId: stack.itemId, content: stack.content, score: stack.score }]
          : selectedUnits
        : removeOneUnit(selectedUnits, stack.itemId);
    const averageInputScore = calculateMantokChestAverageScore(nextUnits);
    const minimumOutputScore =
      nextUnits.length === 0 ? 0 : calculateMinimumMantokChestOutputScore(averageInputScore);
    const updated = await this.repository.updatePendingRunInputItemsForTelegramUser(telegramUserId, {
      token: input.token,
      inputItems: summarizeMantokChestUnits(nextUnits),
      averageInputScore,
      minimumOutputScore,
      now: this.clock()
    });

    if (!updated) {
      return { state: "invalid-token" };
    }

    return buildManualSelectionResult(snapshot, updated, input.page);
  }

  private selectOutputForRun(
    snapshot: MantokChestSnapshot,
    run: MantokChestRunRecord
  ): { state: "ok"; itemId: string; score: number } | { state: "stale-inputs" } | { state: "no-output-candidate" } {
    const eligibleStacks = getManualEligibleStacks(snapshot);
    const selectedUnits = expandStoredRunItems(run.inputItems, eligibleStacks);

    if (selectedUnits.length !== MANTOK_CHEST_BATCH_SIZE) {
      return { state: "stale-inputs" };
    }

    const averageInputScore = calculateMantokChestAverageScore(selectedUnits);
    const minimumOutputScore = calculateMinimumMantokChestOutputScore(averageInputScore);

    if (minimumOutputScore !== run.minimumOutputScore) {
      return { state: "stale-inputs" };
    }

    const output = selectMantokChestOutputItem({
      items,
      averageInputScore,
      inputItemIds: new Set(run.inputItems.map((item) => item.itemId)),
      rng: this.rng
    });

    if (!output) {
      return { state: "no-output-candidate" };
    }

    return {
      state: "ok",
      itemId: output.id,
      score: calculateMantokChestItemScore(output)
    };
  }
}

function getEligibleStacks(snapshot: MantokChestSnapshot) {
  return buildMantokChestEligibleStacks({
    stacks: snapshot.items,
    equippedItemIds: new Set(snapshot.equippedItemIds),
    reservedItemIds: new Set(snapshot.reservedItemIds ?? []),
    itemContents: items,
    mode: "auto"
  });
}

function getManualEligibleStacks(snapshot: MantokChestSnapshot) {
  return buildMantokChestEligibleStacks({
    stacks: snapshot.items,
    equippedItemIds: new Set(snapshot.equippedItemIds),
    reservedItemIds: new Set(snapshot.reservedItemIds ?? []),
    itemContents: items,
    mode: "manual"
  });
}

function buildManualSelectionResult(
  snapshot: MantokChestSnapshot,
  run: MantokChestRunRecord,
  requestedPage: number
): MantokChestManualSelectionResult {
  const stacks = sortEligibleStacks(getManualEligibleStacks(snapshot));
  const selectedById = new Map(run.inputItems.map((item) => [item.itemId, item.quantity]));
  const eligibleCount = countMantokChestEligibleUnits(stacks);
  const selectedCount = run.inputItems.reduce((sum, item) => sum + item.quantity, 0);
  const pageCount = Math.max(1, Math.ceil(stacks.length / MANTOK_CHEST_MANUAL_PAGE_SIZE));
  const page = clampPage(requestedPage, pageCount);
  const start = page * MANTOK_CHEST_MANUAL_PAGE_SIZE;
  const items = stacks
    .slice(start, start + MANTOK_CHEST_MANUAL_PAGE_SIZE)
    .map((stack, offset) => ({
      itemId: stack.itemId,
      quantity: stack.quantity,
      content: stack.content,
      score: stack.score,
      manualOnly: stack.manualOnly,
      index: start + offset,
      selectedQuantity: selectedById.get(stack.itemId) ?? 0,
      availableQuantity: stack.quantity
    }));

  return {
    state: "selection",
    run,
    items,
    selectedCount,
    requiredCount: MANTOK_CHEST_BATCH_SIZE,
    eligibleCount,
    page,
    pageCount
  };
}

function sortEligibleStacks(stacks: ReturnType<typeof getEligibleStacks>) {
  return [...stacks].sort((left, right) => left.score - right.score || left.itemId.localeCompare(right.itemId));
}

function expandStoredRunItems(
  runItems: readonly MantokChestRunItem[],
  eligibleStacks: ReturnType<typeof getEligibleStacks>
) {
  const eligibleById = new Map(eligibleStacks.map((stack) => [stack.itemId, stack]));

  return runItems.flatMap((item) => {
    const stack = eligibleById.get(item.itemId);

    if (!stack || stack.quantity < item.quantity) {
      return [];
    }

    return Array.from({ length: item.quantity }, () => ({
      itemId: stack.itemId,
      content: stack.content,
      score: stack.score,
      manualOnly: stack.manualOnly
    }));
  });
}

function removeOneUnit(
  units: ReturnType<typeof expandMantokChestStacks>,
  itemId: string
): ReturnType<typeof expandMantokChestStacks> {
  let removed = false;

  return units.filter((unit) => {
    if (!removed && unit.itemId === itemId) {
      removed = true;
      return false;
    }

    return true;
  });
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isInteger(page) || page < 0) {
    return 0;
  }

  return Math.min(page, pageCount - 1);
}

function presentRunItems(
  runItems: readonly MantokChestRunItem[],
  eligibleStacks: readonly ReturnType<typeof getEligibleStacks>[number][] = []
): MantokChestPresentedItem[] {
  const eligibleById = new Map(eligibleStacks.map((stack) => [stack.itemId, stack]));

  return runItems.map((item) => {
    const eligible = eligibleById.get(item.itemId);
    const content = eligible?.content ?? items.find((candidate) => candidate.id === item.itemId) ?? {
      id: item.itemId,
      name: "Невідома манатка",
      description: "Скриня щось виплюнула, але ярлик пішов окремо.",
      rarity: "common",
      slot: "junk",
      priceless: true
    } satisfies ItemContent;

    return {
      itemId: item.itemId,
      quantity: item.quantity,
      content,
      score: eligible?.score ?? calculateMantokChestItemScore(content),
      manualOnly: eligible?.manualOnly ?? false
    };
  });
}

function unknownOutputItem(): MantokChestPresentedItem {
  const content = {
    id: "item.unknown-mantok-chest-output",
    name: "Невідома манатка",
    description: "Скриня виплюнула щось із характером, але журнал не встиг підписати.",
    rarity: "common",
    slot: "junk",
    priceless: true
  } satisfies ItemContent;

  return {
    itemId: content.id,
    quantity: 1,
    content,
    score: calculateMantokChestItemScore(content),
    manualOnly: false
  };
}

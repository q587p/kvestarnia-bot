import { randomUUID } from "node:crypto";
import { items } from "../content";
import type { ItemContent } from "../content/schema";
import {
  buildMantokChestEligibleStacks,
  calculateMantokChestAverageScore,
  calculateMantokChestItemScore,
  calculateMinimumMantokChestOutputScore,
  countMantokChestEligibleUnits,
  MANTOK_CHEST_BATCH_SIZE,
  selectCheapestMantokChestUnits,
  selectMantokChestOutputItem
} from "../domain/mantokChest";
import type {
  MantokChestRepository,
  MantokChestRunItem,
  MantokChestRunRecord,
  MantokChestSnapshot
} from "../db/repositories/mantokChestRepository";
import { CryptoRandomSource, type RandomSource } from "../shared/random";

export type MantokChestOverviewResult =
  | { state: "no-character" }
  | { state: "ready"; eligibleCount: number };

export type MantokChestPreviewResult =
  | { state: "no-character" }
  | { state: "not-enough-items"; eligibleCount: number }
  | {
      state: "preview-created";
      run: MantokChestRunRecord;
      inputItems: MantokChestPresentedItem[];
      averageInputScore: number;
      minimumOutputScore: number;
    };

export type MantokChestRecycleResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "cancelled"; run: MantokChestRunRecord }
  | { state: "stale-inputs"; run: MantokChestRunRecord }
  | { state: "no-output-candidate"; run: MantokChestRunRecord }
  | { state: "recycled"; run: MantokChestRunRecord; outputItem: MantokChestPresentedItem }
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
}

export class MantokChestService {
  constructor(
    private readonly repository: MantokChestRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  async getOverviewForTelegramUser(telegramUserId: bigint): Promise<MantokChestOverviewResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId);

    if (!snapshot) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      eligibleCount: countMantokChestEligibleUnits(getEligibleStacks(snapshot))
    };
  }

  async createAutoPickPreviewForTelegramUser(
    telegramUserId: bigint
  ): Promise<MantokChestPreviewResult> {
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId);

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
      inputItems: presentRunItems(run.inputItems),
      averageInputScore: selection.averageInputScore,
      minimumOutputScore: selection.minimumOutputScore
    };
  }

  async confirmRecycleForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<MantokChestRecycleResult> {
    const result = await this.repository.confirmRunForTelegramUser(telegramUserId, {
      token,
      now: this.clock(),
      selectOutput: (snapshot, run) => this.selectOutputForRun(snapshot, run)
    });

    if (result.state === "recycled") {
      return {
        ...result,
        outputItem: presentRunItems(result.run.outputItems)[0] ?? unknownOutputItem()
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

  private selectOutputForRun(
    snapshot: MantokChestSnapshot,
    run: MantokChestRunRecord
  ): { state: "ok"; itemId: string; score: number } | { state: "stale-inputs" } | { state: "no-output-candidate" } {
    const eligibleStacks = getEligibleStacks(snapshot);
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
    itemContents: items
  });
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
      score: stack.score
    }));
  });
}

function presentRunItems(runItems: readonly MantokChestRunItem[]): MantokChestPresentedItem[] {
  return runItems.map((item) => {
    const content = items.find((candidate) => candidate.id === item.itemId) ?? {
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
      score: calculateMantokChestItemScore(content)
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
    score: calculateMantokChestItemScore(content)
  };
}

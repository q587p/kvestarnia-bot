import { describe, expect, it } from "vitest";
import type { CharacterItemRecord } from "../../src/db/repositories/inventoryRepository";
import type {
  MantokChestConfirmResult,
  MantokChestRepository,
  MantokChestRunItem,
  MantokChestRunRecord,
  MantokChestSnapshot
} from "../../src/db/repositories/mantokChestRepository";
import { MantokChestService } from "../../src/services/mantokChestService";
import { FakeRandomSource } from "../../src/shared/random";

const telegramUserId = 42n;
const otherTelegramUserId = 99n;
const fixedNow = new Date("2026-06-15T07:30:00.000Z");

describe("MantokChestService", () => {
  it("returns no-character without a character", async () => {
    const service = new MantokChestService(new FakeMantokChestRepository(null), () => fixedNow);

    await expect(service.getOverviewForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
    await expect(service.createAutoPickPreviewForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
  });

  it("counts eligible units, not stack rows", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.suspicious-shawarma-wrapper", 4),
      item("item.cheese-of-procedural-doubt", 2),
      item("item.wet-hero-ticket", 99)
    ]));
    const service = new MantokChestService(repository, () => fixedNow);

    await expect(service.getOverviewForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "ready",
      eligibleCount: 6
    });
  });

  it("creates an auto-pick preview without mutating inventory", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.suspicious-shawarma-wrapper", 4),
      item("item.cheese-of-procedural-doubt", 2)
    ]));
    const service = new MantokChestService(repository, () => fixedNow);

    const preview = await service.createAutoPickPreviewForTelegramUser(telegramUserId);

    expect(preview.state).toBe("preview-created");
    if (preview.state === "preview-created") {
      expect(preview.inputItems.map(({ itemId, quantity }) => ({ itemId, quantity }))).toEqual([
        { itemId: "item.cheese-of-procedural-doubt", quantity: 1 },
        { itemId: "item.suspicious-shawarma-wrapper", quantity: 4 }
      ]);
      expect(repository.getQuantities()).toEqual({
        "item.suspicious-shawarma-wrapper": 4,
        "item.cheese-of-procedural-doubt": 2
      });
    }
  });

  it("consumes five units and upserts one output on confirm", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.suspicious-shawarma-wrapper", 4),
      item("item.cheese-of-procedural-doubt", 2)
    ]));
    const service = new MantokChestService(repository, () => fixedNow, new FakeRandomSource([0]));
    const preview = await service.createAutoPickPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview-created");
    if (preview.state !== "preview-created") {
      return;
    }

    const result = await service.confirmRecycleForTelegramUser(telegramUserId, preview.run.token);

    expect(result.state).toBe("recycled");
    if (result.state === "recycled") {
      expect(result.outputItem.quantity).toBe(1);
      expect(result.outputItem.score).toBeGreaterThan(preview.averageInputScore);
    }
    expect(repository.getTotalQuantity()).toBe(2);
    expect(repository.getQuantities()["item.suspicious-shawarma-wrapper"]).toBeUndefined();
    expect(repository.getQuantities()["item.cheese-of-procedural-doubt"]).toBe(1);
  });

  it("replays repeated confirm callbacks without another output", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.suspicious-shawarma-wrapper", 5)
    ]));
    const service = new MantokChestService(repository, () => fixedNow, new FakeRandomSource([0]));
    const preview = await service.createAutoPickPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview-created");
    if (preview.state !== "preview-created") {
      return;
    }

    const first = await service.confirmRecycleForTelegramUser(telegramUserId, preview.run.token);
    const second = await service.confirmRecycleForTelegramUser(telegramUserId, preview.run.token);

    expect(first.state).toBe("recycled");
    expect(second.state).toBe("replayed");
    expect(repository.completedCount).toBe(1);
  });

  it("does not consume equipped, protected, priceless, or stale items", async () => {
    const repository = new FakeMantokChestRepository(snapshot(
      [
        item("item.pan-of-persuasion", 5),
        item("item.badge-of-thirteen-small-problems", 5),
        item("item.wet-hero-ticket", 5),
        item("item.suspicious-shawarma-wrapper", 4)
      ],
      ["item.pan-of-persuasion"]
    ));
    const service = new MantokChestService(repository, () => fixedNow);

    await expect(service.getOverviewForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "ready",
      eligibleCount: 4
    });
    await expect(service.createAutoPickPreviewForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "not-enough-items",
      eligibleCount: 4
    });
  });

  it("returns stale-inputs when previewed items disappear before confirm", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.suspicious-shawarma-wrapper", 5)
    ]));
    const service = new MantokChestService(repository, () => fixedNow);
    const preview = await service.createAutoPickPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview-created");
    if (preview.state !== "preview-created") {
      return;
    }
    repository.setQuantity("item.suspicious-shawarma-wrapper", 4);

    const result = await service.confirmRecycleForTelegramUser(telegramUserId, preview.run.token);

    expect(result.state).toBe("stale-inputs");
    expect(repository.getQuantities()["item.suspicious-shawarma-wrapper"]).toBe(4);
  });

  it("leaves inputs untouched when there is no output candidate", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.loot-v1-x025-plus-5", 5)
    ]));
    const service = new MantokChestService(repository, () => fixedNow);
    const preview = await service.createAutoPickPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview-created");
    if (preview.state !== "preview-created") {
      return;
    }

    const result = await service.confirmRecycleForTelegramUser(telegramUserId, preview.run.token);

    expect(result.state).toBe("no-output-candidate");
    expect(repository.getQuantities()).toEqual({
      "item.loot-v1-x025-plus-5": 5
    });
  });

  it("does not let another character confirm a foreign token", async () => {
    const repository = new FakeMantokChestRepository(snapshot([
      item("item.suspicious-shawarma-wrapper", 5)
    ]));
    const service = new MantokChestService(repository, () => fixedNow);
    const preview = await service.createAutoPickPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview-created");
    if (preview.state !== "preview-created") {
      return;
    }

    await expect(service.confirmRecycleForTelegramUser(otherTelegramUserId, preview.run.token)).resolves.toEqual({
      state: "invalid-token"
    });
  });
});

function snapshot(items: CharacterItemRecord[], equippedItemIds: string[] = []): MantokChestSnapshot {
  return {
    characterId: "character-42",
    items,
    equippedItemIds
  };
}

function item(itemId: string, quantity: number): CharacterItemRecord {
  return {
    id: `row-${itemId}`,
    characterId: "character-42",
    itemId,
    quantity,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
}

class FakeMantokChestRepository implements MantokChestRepository {
  private readonly runs = new Map<string, MantokChestRunRecord>();
  completedCount = 0;

  constructor(private currentSnapshot: MantokChestSnapshot | null) {}

  getSnapshotForTelegramUser(telegramUserId: bigint): Promise<MantokChestSnapshot | null> {
    if (telegramUserId !== 42n) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.cloneSnapshot());
  }

  createPendingRunForTelegramUser(
    telegramUserId: bigint,
    input: {
      token: string;
      inputItems: MantokChestRunItem[];
      averageInputScore: number;
      minimumOutputScore: number;
      now: Date;
    }
  ): Promise<MantokChestRunRecord | null> {
    const snapshot = this.currentSnapshot;

    if (!snapshot || telegramUserId === otherTelegramUserId) {
      return Promise.resolve(null);
    }

    const run: MantokChestRunRecord = {
      id: `run-${this.runs.size + 1}`,
      characterId: snapshot.characterId,
      token: input.token,
      status: "pending",
      inputItems: input.inputItems,
      outputItems: [],
      averageInputScore: Math.floor(input.averageInputScore),
      minimumOutputScore: input.minimumOutputScore,
      outputScore: null,
      completedAt: null,
      createdAt: input.now,
      updatedAt: input.now
    };
    this.runs.set(input.token, run);

    return Promise.resolve(structuredCloneRun(run));
  }

  cancelRunForTelegramUser(): Promise<MantokChestRunRecord | null> {
    return Promise.resolve(null);
  }

  confirmRunForTelegramUser(
    telegramUserId: bigint,
    input: Parameters<MantokChestRepository["confirmRunForTelegramUser"]>[1]
  ): Promise<MantokChestConfirmResult> {
    const snapshot = this.currentSnapshot;

    if (!snapshot) {
      return Promise.resolve({ state: "no-character" });
    }

    const run = this.runs.get(input.token);

    if (!run || telegramUserId === otherTelegramUserId) {
      return Promise.resolve({ state: "invalid-token" });
    }

    if (run.status === "completed") {
      return Promise.resolve({ state: "replayed", run: structuredCloneRun(run) });
    }

    const selected = input.selectOutput(snapshot, run);

    if (selected.state !== "ok") {
      return Promise.resolve({ state: selected.state, run: structuredCloneRun(run) });
    }

    const nextItems = snapshot.items.map((row) => ({ ...row }));

    for (const inputItem of run.inputItems) {
      const row = nextItems.find((candidate) => candidate.itemId === inputItem.itemId);

      if (!row || row.quantity < inputItem.quantity) {
        return Promise.resolve({ state: "stale-inputs", run: structuredCloneRun(run) });
      }

      row.quantity -= inputItem.quantity;
    }

    const outputRow = nextItems.find((row) => row.itemId === selected.itemId);

    if (outputRow) {
      outputRow.quantity += 1;
    } else {
      nextItems.push(item(selected.itemId, 1));
    }

    this.currentSnapshot = {
      ...snapshot,
      items: nextItems.filter((row) => row.quantity > 0)
    };
    const completed = {
      ...run,
      status: "completed" as const,
      outputItems: [{ itemId: selected.itemId, quantity: 1 }],
      outputScore: selected.score,
      completedAt: fixedNow,
      updatedAt: fixedNow
    };
    this.runs.set(input.token, completed);
    this.completedCount += 1;

    return Promise.resolve({ state: "recycled", run: structuredCloneRun(completed) });
  }

  setQuantity(itemId: string, quantity: number): void {
    const snapshot = this.currentSnapshot;

    if (!snapshot) {
      return;
    }

    this.currentSnapshot = {
      ...snapshot,
      items: snapshot.items.map((row) => row.itemId === itemId ? { ...row, quantity } : row)
    };
  }

  getTotalQuantity(): number {
    return Object.values(this.getQuantities()).reduce((sum, quantity) => sum + quantity, 0);
  }

  getQuantities(): Record<string, number> {
    return Object.fromEntries(
      (this.currentSnapshot?.items ?? []).map((row) => [row.itemId, row.quantity])
    );
  }

  private cloneSnapshot(): MantokChestSnapshot | null {
    if (!this.currentSnapshot) {
      return null;
    }

    return {
      ...this.currentSnapshot,
      items: this.currentSnapshot.items.map((row) => ({ ...row })),
      equippedItemIds: [...this.currentSnapshot.equippedItemIds]
    };
  }
}

function structuredCloneRun(run: MantokChestRunRecord): MantokChestRunRecord {
  return {
    ...run,
    inputItems: run.inputItems.map((item) => ({ ...item })),
    outputItems: run.outputItems.map((item) => ({ ...item }))
  };
}

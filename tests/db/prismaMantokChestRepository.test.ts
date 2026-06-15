import { describe, expect, it } from "vitest";
import { PrismaMantokChestRepository } from "../../src/db/repositories/prismaMantokChestRepository";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-15T07:30:00.000Z");

describe("PrismaMantokChestRepository", () => {
  it("guards the same token so concurrent confirms consume and output only once", async () => {
    const prisma = new FakeMantokChestPrisma();
    const repository = new PrismaMantokChestRepository(prisma.client);

    const input = {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput: (): { state: "ok"; itemId: string; score: number } => ({
        state: "ok",
        itemId: "item.mantok-result",
        score: 19
      })
    };

    const [first, second] = await Promise.all([
      repository.confirmRunForTelegramUser(telegramUserId, input),
      repository.confirmRunForTelegramUser(telegramUserId, input)
    ]);

    const states = [first.state, second.state].sort();

    expect(states).toEqual(["recycled", "replayed"]);
    expect(prisma.itemQuantity("item.suspicious-shawarma-wrapper")).toBe(5);
    expect(prisma.itemQuantity("item.mantok-result")).toBe(1);
    expect(prisma.run("mantok-token-1")).toMatchObject({
      status: "completed",
      outputItemsJson: [{ itemId: "item.mantok-result", quantity: 1 }],
      outputScore: 19
    });
  });
});

class FakeMantokChestPrisma {
  private readonly shared = {
    character: {
      id: "character-1",
      telegramUserId
    },
    items: [
      {
        id: "item-row-1",
        characterId: "character-1",
        itemId: "item.suspicious-shawarma-wrapper",
        quantity: 10,
        createdAt: fixedNow,
        updatedAt: fixedNow
      }
    ],
    equipment: [] as Array<{ characterId: string; itemId: string }>,
    run: {
      id: "mantok-run-1",
      characterId: "character-1",
      token: "mantok-token-1",
      status: "pending",
      inputItemsJson: [{ itemId: "item.suspicious-shawarma-wrapper", quantity: 5 }],
      outputItemsJson: null,
      averageInputScore: 7,
      minimumOutputScore: 8,
      outputScore: null,
      completedAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    }
  };
  private characterFindFirstCount = 0;
  private releaseCharacterFindFirst: (() => void) | null = null;

  readonly client = {
    $transaction: async <T>(callback: (tx: FakeMantokChestTx) => Promise<T>) =>
      callback(this.createTx())
  } as unknown as ConstructorParameters<typeof PrismaMantokChestRepository>[0];

  run(token: string) {
    return this.shared.run.token === token ? cloneRun(this.shared.run) : null;
  }

  itemQuantity(itemId: string): number {
    return this.shared.items.find((row) => row.itemId === itemId)?.quantity ?? 0;
  }

  private createTx(): FakeMantokChestTx {
    const runView = cloneRun(this.shared.run);
    const itemsView = this.shared.items.map(cloneItem);
    const equipmentView = this.shared.equipment.map((row) => ({ ...row }));

    return {
      character: {
        findFirst: async (input: { where: { user: { telegramUserId: bigint } } }) => {
          this.characterFindFirstCount += 1;

          if (this.characterFindFirstCount === 1) {
            await new Promise<void>((resolve) => {
              this.releaseCharacterFindFirst = resolve;
            });
          } else if (this.characterFindFirstCount === 2) {
            this.releaseCharacterFindFirst?.();
            this.releaseCharacterFindFirst = null;
          }

          return input.where.user.telegramUserId === this.shared.character.telegramUserId
            ? { id: this.shared.character.id }
            : null;
        }
      },
      mantokChestRun: {
        findFirst: async (input: { where: { id?: string; characterId?: string; token?: string } }) => {
          await Promise.resolve();

          const sharedRun = this.shared.run;

          if (
            input.where.id !== undefined &&
            input.where.id === sharedRun.id
          ) {
            return sharedRun.status === "pending" && runView ? cloneRun(runView) : cloneRun(sharedRun);
          }

          if (
            input.where.token !== undefined &&
            input.where.token === sharedRun.token
          ) {
            return sharedRun.status === "pending" && runView ? cloneRun(runView) : cloneRun(sharedRun);
          }

          if (
            input.where.characterId !== undefined &&
            input.where.characterId === sharedRun.characterId
          ) {
            return sharedRun.status === "pending" && runView ? cloneRun(runView) : cloneRun(sharedRun);
          }

          return null;
        },
        updateMany: async (input: {
          where: { id: string; status: string };
          data: {
            status: string;
            outputItemsJson: unknown;
            outputScore: number;
            completedAt: Date;
            updatedAt: Date;
          };
        }) => {
          await Promise.resolve();

          if (!runView || runView.id !== input.where.id || this.shared.run.status !== input.where.status) {
            return { count: 0 };
          }

          this.shared.run = {
            ...this.shared.run,
            ...input.data
          };
          Object.assign(runView, input.data);

          return { count: 1 };
        }
      },
      characterItem: {
        findMany: async (input: { where: { characterId: string } }) => {
          await Promise.resolve();

          return input.where.characterId === this.shared.character.id
            ? itemsView.map(cloneItem)
            : [];
        },
        updateMany: (input: {
          where: {
            characterId: string;
            itemId: string;
            quantity: { gte: number };
          };
          data: { quantity: { decrement: number } };
        }) => {
          return Promise.resolve().then(() => {
            const row = this.shared.items.find(
              (candidate) =>
                candidate.characterId === input.where.characterId &&
                candidate.itemId === input.where.itemId
            );

            if (!row || row.quantity < input.where.quantity.gte) {
              return { count: 0 };
            }

            row.quantity -= input.data.quantity.decrement;

            const viewRow = itemsView.find((candidate) => candidate.itemId === row.itemId);
            if (viewRow) {
              viewRow.quantity = row.quantity;
            }

            return { count: 1 };
          });
        },
        deleteMany: async (input: { where: { characterId: string; quantity: { lte: number } } }) => {
          await Promise.resolve();

          const before = this.shared.items.length;
          this.shared.items = this.shared.items.filter(
            (candidate) =>
              !(candidate.characterId === input.where.characterId && candidate.quantity <= input.where.quantity.lte)
          );

          for (let index = itemsView.length - 1; index >= 0; index -= 1) {
            if (itemsView[index].quantity <= input.where.quantity.lte) {
              itemsView.splice(index, 1);
            }
          }

          return { count: before - this.shared.items.length };
        },
        upsert: async (input: {
          where: { characterId_itemId: { characterId: string; itemId: string } };
          create: { characterId: string; itemId: string; quantity: number };
          update: { quantity: { increment: number } };
        }) => {
          await Promise.resolve();

          const row = this.shared.items.find(
            (candidate) =>
              candidate.characterId === input.where.characterId_itemId.characterId &&
              candidate.itemId === input.where.characterId_itemId.itemId
          );

          if (row) {
            row.quantity += input.update.quantity.increment;
            const viewRow = itemsView.find((candidate) => candidate.itemId === row.itemId);
            if (viewRow) {
              viewRow.quantity = row.quantity;
            }

            return { ...row };
          }

          const created = {
            id: `item-row-${this.shared.items.length + 1}`,
            ...input.create,
            createdAt: fixedNow,
            updatedAt: fixedNow
          };
          this.shared.items.push(created);
          itemsView.push(cloneItem(created));

          return { ...created };
        }
      },
      characterEquipment: {
        findMany: async (input: { where: { characterId: string } }) => {
          await Promise.resolve();

          return input.where.characterId === this.shared.character.id ? equipmentView.map((row) => ({ ...row })) : [];
        }
      }
    };
  }
}

interface FakeMantokChestTx {
  character: {
    findFirst: (input: { where: { user: { telegramUserId: bigint } } }) => Promise<{ id: string } | null>;
  };
  mantokChestRun: {
    findFirst: (input: { where: { id?: string; characterId?: string; token?: string } }) => Promise<FakeMantokChestRun | null>;
    updateMany: (input: {
      where: { id: string; status: string };
      data: {
        status: string;
        outputItemsJson: unknown;
        outputScore: number;
        completedAt: Date;
        updatedAt: Date;
      };
    }) => Promise<{ count: number }>;
  };
  characterItem: {
    findMany: (input: { where: { characterId: string } }) => Promise<FakeMantokChestItem[]>;
    updateMany: (input: {
      where: { characterId: string; itemId: string; quantity: { gte: number } };
      data: { quantity: { decrement: number } };
    }) => Promise<{ count: number }>;
    deleteMany: (input: { where: { characterId: string; quantity: { lte: number } } }) => Promise<{ count: number }>;
    upsert: (input: {
      where: { characterId_itemId: { characterId: string; itemId: string } };
      create: { characterId: string; itemId: string; quantity: number };
      update: { quantity: { increment: number } };
    }) => Promise<FakeMantokChestItem>;
  };
  characterEquipment: {
    findMany: (input: { where: { characterId: string } }) => Promise<Array<{ characterId: string; itemId: string }>>;
  };
}

interface FakeMantokChestRun {
  id: string;
  characterId: string;
  token: string;
  status: string;
  inputItemsJson: unknown;
  outputItemsJson: unknown;
  averageInputScore: number;
  minimumOutputScore: number;
  outputScore: number | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMantokChestItem {
  id: string;
  characterId: string;
  itemId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

function cloneRun(run: FakeMantokChestRun): FakeMantokChestRun {
  return {
    ...run,
    inputItemsJson: Array.isArray(run.inputItemsJson)
      ? run.inputItemsJson.map((entry) => ({ ...(entry as Record<string, unknown>) }))
      : run.inputItemsJson,
    outputItemsJson: Array.isArray(run.outputItemsJson)
      ? run.outputItemsJson.map((entry) => ({ ...(entry as Record<string, unknown>) }))
      : run.outputItemsJson
  };
}

function cloneItem(item: FakeMantokChestItem): FakeMantokChestItem {
  return { ...item };
}

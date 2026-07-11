import { describe, expect, it } from "vitest";
import { PrismaMantokChestRepository } from "../../src/db/repositories/prismaMantokChestRepository";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-15T07:30:00.000Z");

describe("PrismaMantokChestRepository", () => {
  it("captures the current player luck in the chest snapshot", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    const repository = new PrismaMantokChestRepository(prisma.client);

    const snapshot = await repository.getSnapshotForTelegramUser(telegramUserId, fixedNow);

    expect(snapshot?.playerLuck).toBe(13);
  });

  it("uses exact current attunement lookup after more than 13 historical rows", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    prisma.setLuck(4);
    const luckItemId = "item.mantok.coverage.universal.scarf-of-forehead-duty";
    prisma.equip(luckItemId, "head");
    prisma.setAttunement(luckItemId, "head", new Date(fixedNow.getTime() + 60_000));
    prisma.addHistoricalAttunements(20);
    const repository = new PrismaMantokChestRepository(prisma.client);
    const observedLuck: number[] = [];
    const selectOutput = (snapshot: { playerLuck?: number }) => {
      observedLuck.push(snapshot.playerLuck ?? -1);
      return { state: "no-output-candidate" as const };
    };

    await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput
    });
    await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: new Date(fixedNow.getTime() + 2 * 60_000),
      selectOutput
    });

    expect(observedLuck).toEqual([5, 6]);
  });

  it("includes only an active Priest LUCK blessing in confirmation-time effective luck", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    prisma.setLuck(4);
    const repository = new PrismaMantokChestRepository(prisma.client);
    const observedLuck: number[] = [];
    const selectOutput = (snapshot: { playerLuck?: number }) => {
      observedLuck.push(snapshot.playerLuck ?? -1);
      return { state: "no-output-candidate" as const };
    };

    prisma.setPriestBlessing("luck", 3, new Date(fixedNow.getTime() + 60_000));
    await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput
    });
    prisma.setPriestBlessing("luck", 3, new Date(fixedNow.getTime() - 1));
    await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput
    });
    prisma.setPriestBlessing("intelligence", 3, new Date(fixedNow.getTime() + 60_000));
    await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput
    });

    expect(observedLuck).toEqual([8, 5, 5]);
  });

  it("ignores expired untouched pending gift reservations in snapshots", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    prisma.transferReservations = [{
      itemId: "item.suspicious-shawarma-wrapper",
      status: "pending",
      expiresAt: new Date("2026-06-15T07:29:59.000Z")
    }];
    const repository = new PrismaMantokChestRepository(prisma.client);

    const snapshot = await repository.getSnapshotForTelegramUser(telegramUserId, fixedNow);

    expect(snapshot?.reservedItemIds).not.toContain("item.suspicious-shawarma-wrapper");
  });

  it("keeps processing gift reservations in Mantok Chest snapshots", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    prisma.transferReservations = [{
      itemId: "item.suspicious-shawarma-wrapper",
      status: "processing",
      expiresAt: new Date("2026-06-15T07:29:59.000Z")
    }];
    const repository = new PrismaMantokChestRepository(prisma.client);

    const snapshot = await repository.getSnapshotForTelegramUser(telegramUserId, fixedNow);

    expect(snapshot?.reservedItemIds).toContain("item.suspicious-shawarma-wrapper");
  });

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

  it("confirms from only the selected input item rows", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    prisma.addInventoryItem("item.cheese-of-procedural-doubt", 42);
    const repository = new PrismaMantokChestRepository(prisma.client);

    const result = await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput: (): { state: "ok"; itemId: string; score: number } => ({
        state: "ok",
        itemId: "item.mantok-result",
        score: 19
      })
    });

    expect(result.state).toBe("recycled");
    expect(prisma.characterItemFindManyInputs.at(-1)).toMatchObject({
      where: {
        characterId: "character-1",
        itemId: {
          in: ["item.suspicious-shawarma-wrapper"]
        }
      }
    });
  });

  it("treats selected equipped items as stale on confirm without spending them", async () => {
    const prisma = new FakeMantokChestPrisma();
    prisma.disableConcurrencyGate = true;
    prisma.equip("item.suspicious-shawarma-wrapper");
    const repository = new PrismaMantokChestRepository(prisma.client);

    const result = await repository.confirmRunForTelegramUser(telegramUserId, {
      token: "mantok-token-1",
      now: fixedNow,
      selectOutput: (snapshot, run) =>
        snapshot.equippedItemIds.includes(run.inputItems[0].itemId)
          ? { state: "stale-inputs" }
          : { state: "ok", itemId: "item.mantok-result", score: 19 }
    });

    expect(result.state).toBe("stale-inputs");
    expect(prisma.itemQuantity("item.suspicious-shawarma-wrapper")).toBe(10);
    expect(prisma.itemQuantity("item.mantok-result")).toBe(0);
  });
});

class FakeMantokChestPrisma {
  transferReservations: FakeTransferReservation[] = [];
  disableConcurrencyGate = false;
  characterItemFindManyInputs: CharacterItemFindManyInput[] = [];

  private readonly shared = {
    character: {
      id: "character-1",
      name: "Пані Скриня",
      telegramUserId,
      pronoun: "they",
      path: "boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: 25,
      hpMax: 25,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: { luck: 13 }
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
    equipment: [] as Array<{
      id: string;
      characterId: string;
      slot: string;
      itemId: string;
      updatedAt: Date;
    }>,
    dailyActions: [] as Array<{ localDate: string; resultJson: unknown }>,
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
      expiredAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    }
  };
  private characterFindFirstCount = 0;
  private releaseCharacterFindFirst: (() => void) | null = null;
  private activePriestBlessing: FakePriestBlessing | null = null;

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

  addInventoryItem(itemId: string, quantity: number): void {
    this.shared.items.push({
      id: `item-row-${this.shared.items.length + 1}`,
      characterId: this.shared.character.id,
      itemId,
      quantity,
      createdAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  setLuck(luck: number): void {
    this.shared.character.statsJson = { luck };
  }

  equip(itemId: string, slot = "head"): void {
    this.shared.equipment.push({
      id: `${slot}-equipment`,
      characterId: this.shared.character.id,
      slot,
      itemId,
      updatedAt: fixedNow
    });
  }

  setAttunement(itemId: string, slot: string, readyAt: Date): void {
    const equipment = this.shared.equipment.find((row) => row.itemId === itemId && row.slot === slot);
    if (!equipment) {
      throw new Error("Equipment row must exist before attunement is seeded.");
    }
    this.shared.dailyActions = [{
      localDate: `${slot}:${equipment.id}:${equipment.updatedAt.getTime()}`,
      resultJson: {
        version: 1,
        status: "tuning",
        slot,
        itemId,
        itemName: itemId,
        equipmentUpdatedAt: fixedNow.toISOString(),
        strength: "weak",
        startedAt: fixedNow.toISOString(),
        readyAt: readyAt.toISOString()
      }
    }];
  }

  addHistoricalAttunements(count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.shared.dailyActions.push({
        localDate: `historical:${index}`,
        resultJson: { version: 1, status: "cancelled" }
      });
    }
  }

  setPriestBlessing(bonusStat: string, bonusAmount: number, expiresAt: Date): void {
    this.activePriestBlessing = {
      targetCharacterId: this.shared.character.id,
      status: "active",
      bonusStat,
      bonusAmount,
      startedAt: fixedNow,
      expiresAt
    };
  }

  private createTx(): FakeMantokChestTx {
    const runView = cloneRun(this.shared.run);
    const itemsView = this.shared.items.map(cloneItem);
    const equipmentView = this.shared.equipment.map((row) => ({ ...row }));

    return {
      character: {
        findFirst: async (input: { where: { user: { telegramUserId: bigint } } }) => {
          this.characterFindFirstCount += 1;

          if (!this.disableConcurrencyGate && this.characterFindFirstCount === 1) {
            await new Promise<void>((resolve) => {
              this.releaseCharacterFindFirst = resolve;
            });
          } else if (!this.disableConcurrencyGate && this.characterFindFirstCount === 2) {
            this.releaseCharacterFindFirst?.();
            this.releaseCharacterFindFirst = null;
          }

          return input.where.user.telegramUserId === this.shared.character.telegramUserId
            ? {
                id: this.shared.character.id,
                name: this.shared.character.name,
                pronoun: this.shared.character.pronoun,
                path: this.shared.character.path,
                raceId: this.shared.character.raceId,
                classId: this.shared.character.classId,
                level: this.shared.character.level,
                xp: this.shared.character.xp,
                gold: this.shared.character.gold,
                hpCurrent: this.shared.character.hpCurrent,
                hpMax: this.shared.character.hpMax,
                manaCurrent: this.shared.character.manaCurrent,
                manaMax: this.shared.character.manaMax,
                statsJson: this.shared.character.statsJson,
                equipment: equipmentView.map((row) => ({ ...row })),
                _count: { remorts: 0 }
              }
            : null;
        }
      },
      dailyAction: {
        findMany: (input: { where: { characterId: string; localDate: { in: string[] } } }) =>
          Promise.resolve(input.where.characterId === this.shared.character.id
            ? this.shared.dailyActions
              .filter((row) => input.where.localDate.in.includes(row.localDate))
              .map((row) => ({ resultJson: row.resultJson }))
            : [])
      },
      noncombatPriestBlessing: {
        findFirst: (input: FakePriestBlessingFindFirstInput) => {
          const blessing = this.activePriestBlessing;
          return Promise.resolve(
            blessing &&
              input.where.targetCharacterId === blessing.targetCharacterId &&
              input.where.status === blessing.status &&
              blessing.expiresAt > input.where.expiresAt.gt
              ? {
                  bonusStat: blessing.bonusStat,
                  bonusAmount: blessing.bonusAmount,
                  expiresAt: blessing.expiresAt
                }
              : null
          );
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
        findMany: async (input: CharacterItemFindManyInput) => {
          await Promise.resolve();
          this.characterItemFindManyInputs.push(structuredCloneFindManyInput(input));

          return input.where.characterId === this.shared.character.id
            ? itemsView
              .filter((row) => !input.where.itemId || input.where.itemId.in.includes(row.itemId))
              .map(cloneItem)
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
        findMany: async (input: CharacterEquipmentFindManyInput) => {
          await Promise.resolve();

          return input.where.characterId === this.shared.character.id
            ? equipmentView
              .filter((row) => !input.where.itemId || input.where.itemId.in.includes(row.itemId))
              .map((row) => ({ ...row }))
            : [];
        }
      },
      itemTransfer: {
        findMany: (input: FakeTransferReservationFindManyInput) =>
          Promise.resolve(this.transferReservations
            .filter((row) => isReservedByInput(row, input))
            .map((row) => ({ itemId: row.itemId })))
      }
    };
  }
}

interface FakeMantokChestTx {
  character: {
    findFirst: (input: { where: { user: { telegramUserId: bigint } } }) => Promise<{ id: string; name: string } | null>;
  };
  dailyAction: {
    findMany: (input: { where: { characterId: string; localDate: { in: string[] } } }) => Promise<Array<{ resultJson: unknown }>>;
  };
  noncombatPriestBlessing: {
    findFirst: (input: FakePriestBlessingFindFirstInput) => Promise<{
      bonusStat: string;
      bonusAmount: number;
      expiresAt: Date;
    } | null>;
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
    findMany: (input: CharacterItemFindManyInput) => Promise<FakeMantokChestItem[]>;
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
    findMany: (input: CharacterEquipmentFindManyInput) => Promise<Array<{ characterId: string; itemId: string }>>;
  };
  itemTransfer?: {
    findMany: (input: FakeTransferReservationFindManyInput) => Promise<Array<{ itemId: string }>>;
  };
}

interface FakeTransferReservation {
  itemId: string;
  status: string;
  expiresAt: Date;
}

interface FakePriestBlessing {
  targetCharacterId: string;
  status: "active";
  bonusStat: string;
  bonusAmount: number;
  startedAt: Date;
  expiresAt: Date;
}

interface FakePriestBlessingFindFirstInput {
  where: {
    targetCharacterId: string;
    status: string;
    expiresAt: { gt: Date };
  };
  orderBy: { startedAt: "desc" };
}

interface CharacterItemFindManyInput {
  where: {
    characterId: string;
    itemId?: {
      in: string[];
    };
  };
}

interface CharacterEquipmentFindManyInput {
  where: {
    characterId: string;
    itemId?: {
      in: string[];
    };
  };
}

interface FakeTransferReservationFindManyInput {
  where: {
    senderCharacterId: string;
    OR: Array<{ status: string; expiresAt?: { gt: Date } }>;
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
  expiredAt: Date | null;
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

function structuredCloneFindManyInput(input: CharacterItemFindManyInput): CharacterItemFindManyInput {
  return {
    where: {
      characterId: input.where.characterId,
      ...(input.where.itemId ? { itemId: { in: [...input.where.itemId.in] } } : {})
    }
  };
}

function isReservedByInput(
  row: FakeTransferReservation,
  input: FakeTransferReservationFindManyInput
): boolean {
  void input;

  return row.status === "processing" ||
    (row.status === "pending" && row.expiresAt > fixedNow);
}

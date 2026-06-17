import { describe, expect, it } from "vitest";
import { PrismaBarrelRaidNotificationRepository } from "../../src/db/repositories/prismaBarrelRaidNotificationRepository";

const telegramUserId = 42n;
const periodId = "2026-06-13T10:23";
const dueAt = new Date("2026-06-13T10:30:00.000Z");
const now = new Date("2026-06-13T10:31:00.000Z");
const staleBefore = new Date("2026-06-13T10:20:00.000Z");

describe("PrismaBarrelRaidNotificationRepository", () => {
  it("lists pending and stale processing rows, but not fresh processing rows", async () => {
    const prisma = new FakeBarrelNotificationPrisma([
      fakeNotification({ id: "pending", status: "pending" }),
      fakeNotification({
        id: "stale-processing",
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:10:00.000Z")
      }),
      fakeNotification({
        id: "fresh-processing",
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:29:00.000Z")
      }),
      fakeNotification({ id: "sent", status: "sent" })
    ]);
    const repository = new PrismaBarrelRaidNotificationRepository(prisma.client);

    await expect(repository.listResumable({
      now,
      processingStaleBefore: staleBefore
    })).resolves.toEqual([
      expect.objectContaining({ id: "pending" }),
      expect.objectContaining({ id: "stale-processing" })
    ]);
  });

  it("atomically claims only due pending or stale processing rows", async () => {
    const prisma = new FakeBarrelNotificationPrisma([
      fakeNotification({ id: "future", status: "pending", availableAt: new Date("2026-06-13T10:40:00.000Z") }),
      fakeNotification({ id: "due", status: "pending" }),
      fakeNotification({
        id: "fresh-processing",
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:29:00.000Z")
      }),
      fakeNotification({
        id: "stale-processing",
        status: "processing",
        processingStartedAt: new Date("2026-06-13T10:10:00.000Z")
      })
    ]);
    const repository = new PrismaBarrelRaidNotificationRepository(prisma.client);
    const claimInput = { now, processingStaleBefore: staleBefore };

    await expect(repository.claimForProcessing("future", claimInput)).resolves.toBeNull();
    await expect(repository.claimForProcessing("fresh-processing", claimInput)).resolves.toBeNull();
    await expect(repository.claimForProcessing("due", claimInput)).resolves.toMatchObject({
      id: "due",
      status: "processing",
      processingStartedAt: now
    });
    await expect(repository.claimForProcessing("stale-processing", claimInput)).resolves.toMatchObject({
      id: "stale-processing",
      status: "processing",
      processingStartedAt: now
    });
  });

  it("keeps reward-claimed marker when send failure returns a row to pending", async () => {
    const prisma = new FakeBarrelNotificationPrisma([
      fakeNotification({ id: "notification-1", status: "pending" })
    ]);
    const repository = new PrismaBarrelRaidNotificationRepository(prisma.client);
    const claimInput = { now, processingStaleBefore: staleBefore };

    await expect(repository.claimForProcessing("notification-1", claimInput)).resolves.toMatchObject({
      status: "processing"
    });
    await expect(repository.markRewardClaimed("notification-1", now)).resolves.toMatchObject({
      rewardClaimedAt: now
    });
    await expect(
      repository.markPendingAfterFailure("notification-1", new Date("2026-06-13T10:32:00.000Z"), "telegram down")
    ).resolves.toMatchObject({
      status: "pending",
      rewardClaimedAt: now,
      lastError: "telegram down"
    });
  });
});

class FakeBarrelNotificationPrisma {
  private readonly character = {
    id: "character-1"
  };
  private records: FakeBarrelNotificationRecord[];

  constructor(records: FakeBarrelNotificationRecord[] = []) {
    this.records = records.map(cloneRecord);
  }

  readonly client = {
    character: {
      findFirst: () => Promise.resolve(this.character)
    },
    barrelRaidNotification: {
      findMany: (input: { where: FakeWhere }) =>
        Promise.resolve(
          this.records
            .filter((record) => matchesWhere(record, input.where))
            .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime())
            .map(cloneRecord)
        ),
      findFirst: (input: { where: { id: string } }) =>
        Promise.resolve(cloneRecord(this.records.find((record) => record.id === input.where.id) ?? null)),
      findUnique: (input: { where: { telegramUserId_periodId: { telegramUserId: bigint; periodId: string } } }) =>
        Promise.resolve(
          cloneRecord(
            this.records.find(
              (record) =>
                record.telegramUserId === input.where.telegramUserId_periodId.telegramUserId &&
                record.periodId === input.where.telegramUserId_periodId.periodId
            ) ?? null
          )
        ),
      upsert: (input: {
        create: FakeBarrelNotificationRecord;
        update: Partial<FakeBarrelNotificationRecord>;
        where: { telegramUserId_periodId: { telegramUserId: bigint; periodId: string } };
      }) => {
        const existing = this.records.find(
          (record) =>
            record.telegramUserId === input.where.telegramUserId_periodId.telegramUserId &&
            record.periodId === input.where.telegramUserId_periodId.periodId
        );

        if (existing) {
          Object.assign(existing, input.update);

          return Promise.resolve(cloneRecord(existing));
        }

        this.records.push(cloneRecord(input.create));

        return Promise.resolve(cloneRecord(input.create));
      },
      updateMany: (input: { where: FakeWhere; data: Partial<FakeBarrelNotificationRecord> }) => {
        const matches = this.records.filter((record) => matchesWhere(record, input.where));

        for (const record of matches) {
          Object.assign(record, input.data);
        }

        return Promise.resolve({ count: matches.length });
      }
    }
  } as unknown as ConstructorParameters<typeof PrismaBarrelRaidNotificationRepository>[0];
}

interface FakeBarrelNotificationRecord {
  id: string;
  characterId: string;
  telegramUserId: bigint;
  chatId: bigint;
  periodId: string;
  availableAt: Date;
  status: string;
  processingStartedAt: Date | null;
  rewardClaimedAt: Date | null;
  sentAt: Date | null;
  skippedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type FakeWhere = Partial<{
  id: string;
  status: string | { in: string[] };
  availableAt: { lte: Date };
  processingStartedAt: { lte: Date };
  OR: FakeWhere[];
}>;

function fakeNotification(
  overrides: Partial<FakeBarrelNotificationRecord> = {}
): FakeBarrelNotificationRecord {
  return {
    id: "notification-1",
    characterId: "character-1",
    telegramUserId,
    chatId: 42n,
    periodId,
    availableAt: dueAt,
    status: "pending",
    processingStartedAt: null,
    rewardClaimedAt: null,
    sentAt: null,
    skippedAt: null,
    lastError: null,
    createdAt: dueAt,
    updatedAt: dueAt,
    ...overrides
  };
}

function cloneRecord(record: FakeBarrelNotificationRecord): FakeBarrelNotificationRecord;
function cloneRecord(record: null): null;
function cloneRecord(record: FakeBarrelNotificationRecord | null): FakeBarrelNotificationRecord | null {
  return record ? { ...record } : null;
}

function matchesWhere(record: FakeBarrelNotificationRecord, where: FakeWhere): boolean {
  if (where.id !== undefined && record.id !== where.id) {
    return false;
  }

  if (where.status !== undefined) {
    if (typeof where.status === "string" && record.status !== where.status) {
      return false;
    }

    if (typeof where.status !== "string" && !where.status.in.includes(record.status)) {
      return false;
    }
  }

  if (where.availableAt?.lte && record.availableAt > where.availableAt.lte) {
    return false;
  }

  if (where.processingStartedAt?.lte) {
    if (!record.processingStartedAt || record.processingStartedAt > where.processingStartedAt.lte) {
      return false;
    }
  }

  if (where.OR) {
    return where.OR.some((candidate) => matchesWhere(record, candidate));
  }

  return true;
}

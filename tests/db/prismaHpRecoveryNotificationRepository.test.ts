import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { PrismaHpRecoveryNotificationRepository } from "../../src/db/repositories/prismaHpRecoveryNotificationRepository";

describe("PrismaHpRecoveryNotificationRepository query shape", () => {
  it("an idle tick performs one bounded due lookup and no fan-out", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn();
    const repository = new PrismaHpRecoveryNotificationRepository({
      $queryRawUnsafe: queryRawUnsafe,
      hpRecoveryNotification: { updateMany }
    } as unknown as PrismaClient, new HpRecoveryNotificationProducer(true));

    expect(await repository.claimDue(new Date("2026-07-13T10:00:00.000Z"), { limit: 13 })).toEqual([]);
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain("LIMIT ?");
    expect(queryRawUnsafe.mock.calls[0]).toHaveLength(10);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("loads one bulk character snapshot call as the batch grows", async () => {
    const findMany = vi.fn<(
      input: {
        where: { id: { in: string[] } };
        select: { dailyActions: { where: { createdAt: { gte: Date } } } };
      }
    ) => Promise<never[]>>().mockResolvedValue([]);
    const repository = new PrismaHpRecoveryNotificationRepository({
      character: { findMany }
    } as unknown as PrismaClient, new HpRecoveryNotificationProducer(true));

    await repository.loadSnapshots(
      Array.from({ length: 13 }, (_, index) => `character-${index}`),
      new Date("2026-07-13T10:00:00.000Z")
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where.id.in).toEqual(
      expect.arrayContaining(["character-0", "character-12"])
    );
    expect(findMany.mock.calls[0]?.[0].select.dailyActions.where.createdAt.gte).toBeInstanceOf(Date);
  });
});

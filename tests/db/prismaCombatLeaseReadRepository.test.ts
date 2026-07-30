import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaCombatLeaseReadRepository } from "../../src/db/repositories/prismaCombatLeaseReadRepository";

describe("PrismaCombatLeaseReadRepository", () => {
  it("reads the one authoritative lease by Telegram user", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      characterId: "character-42",
      kind: "group-combat",
      referenceId: "group-session-13"
    });
    const repository = new PrismaCombatLeaseReadRepository({
      activeCombatLease: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findActiveByTelegramUserId(42n)).resolves.toEqual({
      characterId: "character-42",
      kind: "group-combat",
      referenceId: "group-session-13"
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        character: {
          user: {
            telegramUserId: 42n
          }
        }
      },
      select: {
        characterId: true,
        kind: true,
        referenceId: true
      }
    });
  });

  it("returns no owner without a lease and fails closed for an unknown owner", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        characterId: "character-42",
        kind: "future-combat",
        referenceId: "future-13"
      });
    const repository = new PrismaCombatLeaseReadRepository({
      activeCombatLease: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findActiveByTelegramUserId(42n)).resolves.toBeNull();
    await expect(repository.findActiveByTelegramUserId(42n))
      .rejects.toThrow("Unsupported active combat lease kind: future-combat");
  });
});

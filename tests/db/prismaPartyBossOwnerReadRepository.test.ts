import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PrismaPartyBossRepository } from "../../src/db/repositories/prismaPartyBossRepository";

describe("PrismaPartyBossRepository owner read", () => {
  it("loads an active boss only by the lease party and joined participant", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new PrismaPartyBossRepository({
      partyBossSession: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findActiveByPartySessionIdForCharacterId(
      "party-session-13",
      "character-42"
    )).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        partySessionId: "party-session-13",
        status: "active",
        partySession: {
          participants: {
            some: {
              characterId: "character-42",
              status: "joined"
            }
          }
        }
      }
    }));
  });
});

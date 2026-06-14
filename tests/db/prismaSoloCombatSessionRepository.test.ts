import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PrismaSoloCombatSessionRepository } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import type { CombatState } from "../../src/domain/combat";

describe("PrismaSoloCombatSessionRepository", () => {
  it("returns null when updating a disappeared solo fight row", async () => {
    const repository = new PrismaSoloCombatSessionRepository(
      fakePrismaThatCannotFindSoloCombatRows()
    );

    await expect(
      repository.updateById("missing-session", {
        state: activeCombatState,
        status: "active"
      })
    ).resolves.toBeNull();
  });

  it("returns null when marking a disappeared solo fight row", async () => {
    const repository = new PrismaSoloCombatSessionRepository(
      fakePrismaThatCannotFindSoloCombatRows()
    );

    await expect(repository.markStatusById("missing-session", "expired")).resolves.toBeNull();
  });
});

function fakePrismaThatCannotFindSoloCombatRows(): ConstructorParameters<
  typeof PrismaSoloCombatSessionRepository
>[0] {
  return {
    soloCombatSession: {
      update: () => Promise.reject(prismaNotFoundError())
    }
  } as unknown as ConstructorParameters<typeof PrismaSoloCombatSessionRepository>[0];
}

function prismaNotFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "test"
  });
}

const activeCombatState: CombatState = {
  id: "missing-session",
  turn: 1,
  status: "active",
  hero: {
    hp: 20,
    hpMax: 20,
    mana: 10,
    manaMax: 10
  },
  monster: {
    id: "monster.deadline-spider",
    hp: 18,
    hpMax: 18
  }
};

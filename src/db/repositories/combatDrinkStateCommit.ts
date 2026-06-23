import { Prisma } from "@prisma/client";
import type { CombatState } from "../../domain/combat";
import { isShynokDrinkKey } from "../../domain/shynokDrinks";
import type { CombatDrinkStateCommit } from "./soloCombatSessionRepository";

type TxClient = Prisma.TransactionClient;

export async function applyCombatDrinkStateCommit(
  tx: TxClient,
  characterId: string,
  state: CombatState,
  commit: CombatDrinkStateCommit | undefined
): Promise<CombatState> {
  if (!commit || !state.drinkModifiers || state.drinkModifiers.sourceId !== commit.expectedStateId) {
    return state;
  }

  const current = await tx.characterDrinkState.findUnique({
    where: { characterId }
  });

  if (
    !current ||
    current.id !== commit.expectedStateId ||
    current.drinkKey !== commit.drinkKey ||
    current.phase !== commit.phase ||
    current.expiresAt <= commit.now ||
    !isShynokDrinkKey(current.drinkKey)
  ) {
    return withoutDrinkModifiers(state);
  }

  if (commit.phase === "queued") {
    const deleted = await tx.characterDrinkState.deleteMany({
      where: {
        id: commit.expectedStateId,
        characterId,
        drinkKey: commit.drinkKey,
        phase: "queued",
        expiresAt: { gt: commit.now }
      }
    });

    if (deleted.count !== 1) {
      return withoutDrinkModifiers(state);
    }
  }

  return state;
}

function withoutDrinkModifiers(state: CombatState): CombatState {
  const next: CombatState = { ...state };
  delete next.drinkModifiers;
  return next;
}

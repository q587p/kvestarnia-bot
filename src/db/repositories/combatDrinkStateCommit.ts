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
  if (state.drinkModifiers.activationId !== commit.expectedActivationId) {
    return withoutDrinkModifiers(state);
  }

  const current = await tx.characterDrinkState.findUnique({
    where: { characterId }
  });

  if (
    !current ||
    current.id !== commit.expectedStateId ||
    current.activationId !== commit.expectedActivationId ||
    current.drinkKey !== commit.drinkKey ||
    current.phase !== commit.phase ||
    current.startedAt.getTime() !== commit.expectedStartedAt.getTime() ||
    current.expiresAt.getTime() !== commit.expectedExpiresAt.getTime() ||
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
        activationId: commit.expectedActivationId,
        drinkKey: commit.drinkKey,
        phase: "queued",
        expiresAt: { gt: commit.now }
      }
    });

    if (deleted.count !== 1) {
      return withoutDrinkModifiers(state);
    }
    await tx.shynokDrinkActivationAudit.upsert({
      where: { activationId: commit.expectedActivationId },
      create: {
        characterId,
        activationId: commit.expectedActivationId,
        drinkKey: commit.drinkKey,
        sourceType: current.sourceType,
        sourceId: current.sourceId,
        outcome: "consumed",
        combatSessionId: state.id ?? null,
        occurredAt: commit.now,
        metadataJson: {
          kind: "vodka-consumed",
          combatSessionId: state.id ?? null,
          ...(commit.metadata && typeof commit.metadata === "object" && !Array.isArray(commit.metadata)
            ? commit.metadata
            : {})
        }
      },
      update: {}
    });
  }

  return state;
}

function withoutDrinkModifiers(state: CombatState): CombatState {
  const next: CombatState = { ...state };
  delete next.drinkModifiers;
  return next;
}

import type { CharacterSummary } from "../characters/characterSummary";
import type { RandomSource } from "../../shared/random";
import {
  INSTANT_DUEL_BALANCE_VERSION,
  prepareBalancedDuelists,
  scorePreparedDuelist,
  type DuelistBalanceAudit
} from "./duelBalance";

export type DuelOutcomeSide = "challenger" | "target" | "draw";

export interface DuelResolveInput {
  challenger: DuelistSummary;
  target: DuelistSummary;
  rng: RandomSource;
}

export interface DuelistSummary extends CharacterSummary {
  id: string;
}

export interface DuelResolveResult {
  outcome: DuelOutcomeSide;
  winnerCharacterId: string | null;
  loserCharacterId: string | null;
  challengerScore: number;
  targetScore: number;
  swing: number;
  flavorKey: DuelFlavorKey;
  balanceVersion: string;
  audit: {
    challenger: DuelistBalanceAudit;
    target: DuelistBalanceAudit;
  };
}

export type DuelFlavorKey =
  | "direct-hit"
  | "clever-trick"
  | "lucky-upset"
  | "paperwork-stall"
  | "dramatic-draw";

const DRAW_MARGIN = 3;

export function resolveQuickDuel(input: DuelResolveInput): DuelResolveResult {
  const prepared = prepareBalancedDuelists({
    challenger: input.challenger,
    target: input.target
  });
  const challengerBase = scorePreparedDuelist(prepared.challenger);
  const targetBase = scorePreparedDuelist(prepared.target);
  const swing = input.rng.nextInt(-12, 12);
  const challengerScore = challengerBase + swing;
  const targetScore = targetBase - swing;
  const delta = challengerScore - targetScore;

  if (Math.abs(delta) <= DRAW_MARGIN) {
    return {
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      challengerScore,
      targetScore,
      swing,
      flavorKey: "dramatic-draw",
      balanceVersion: INSTANT_DUEL_BALANCE_VERSION,
      audit: {
        challenger: {
          ...prepared.challenger.balanceAudit,
          preparedScore: challengerBase
        },
        target: {
          ...prepared.target.balanceAudit,
          preparedScore: targetBase
        }
      }
    };
  }

  const challengerWins = delta > 0;
  const winner = challengerWins ? prepared.challenger : prepared.target;
  const loser = challengerWins ? prepared.target : prepared.challenger;

  return {
    outcome: challengerWins ? "challenger" : "target",
    winnerCharacterId: winner.id,
    loserCharacterId: loser.id,
    challengerScore,
    targetScore,
    swing,
    flavorKey: pickFlavorKey(winner, loser, Math.abs(swing)),
    balanceVersion: INSTANT_DUEL_BALANCE_VERSION,
    audit: {
      challenger: {
        ...prepared.challenger.balanceAudit,
        preparedScore: challengerBase
      },
      target: {
        ...prepared.target.balanceAudit,
        preparedScore: targetBase
      }
    }
  };
}

function pickFlavorKey(
  winner: DuelistSummary,
  loser: DuelistSummary,
  swing: number
): DuelFlavorKey {
  if (swing >= 9 && winner.level <= loser.level) {
    return "lucky-upset";
  }

  if (winner.classId === "class.bureaucramancer" || winner.stats.intelligence >= winner.stats.strength + 3) {
    return "paperwork-stall";
  }

  if (winner.stats.charisma >= winner.stats.strength + 3 || winner.classId === "class.bard") {
    return "clever-trick";
  }

  return "direct-hit";
}

import type { CharacterRecord } from "./characterRepository";

export type KorchmaRoundTier = "simple" | "fine";

export interface KorchmaRoundPurchaseInput {
  telegramUserId: bigint;
  tier: KorchmaRoundTier;
  spentGold: number;
  localDate: string;
}

export type KorchmaRoundPurchaseResult =
  | { state: "spent"; character: CharacterRecord }
  | { state: "insufficient"; character: CharacterRecord }
  | null;

export interface KorchmaRoundLeaderboardEntry {
  characterId: string;
  name: string;
  roundCount: number;
  spentGold: number;
}

export interface KorchmaRoundLeaderboard {
  day: KorchmaRoundLeaderboardEntry[];
  week: KorchmaRoundLeaderboardEntry[];
  month: KorchmaRoundLeaderboardEntry[];
}

export interface KorchmaRoundPurchaseRepository {
  spendGoldAndCreate(input: KorchmaRoundPurchaseInput): Promise<KorchmaRoundPurchaseResult>;
  getLeaderboard(localDate: string): Promise<KorchmaRoundLeaderboard>;
}

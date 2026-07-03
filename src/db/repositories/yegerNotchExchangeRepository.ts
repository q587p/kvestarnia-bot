import type { CharacterRecord } from "./characterRepository";

export type YegerNotchExchangeKind = "dense-bandage" | "field-kit";

export interface YegerNotchExchangeOptionRecord {
  kind: YegerNotchExchangeKind;
  requiredNotches: number;
  outputItemId: string;
  outputQuantity: 1;
}

export interface YegerNotchExchangeSummaryRecord {
  availableNotches: number;
  options: YegerNotchExchangeOptionRecord[];
}

export type YegerNotchExchangeLookupRepositoryResult =
  | { state: "no-character" }
  | { state: "locked" }
  | { state: "ready"; summary: YegerNotchExchangeSummaryRecord };

export type YegerNotchExchangeRepositoryResult =
  | { state: "no-character" }
  | { state: "locked"; character: CharacterRecord }
  | { state: "not-enough"; character: CharacterRecord; summary: YegerNotchExchangeSummaryRecord }
  | {
      state: "stale";
      character: CharacterRecord;
      expectedNotches: number;
      currentNotches: number;
      summary: YegerNotchExchangeSummaryRecord;
    }
  | {
      state: "exchanged";
      character: CharacterRecord;
      actionId: string;
      spentNotches: number;
      itemGrants: Array<{ itemId: string; quantity: number }>;
      summary: YegerNotchExchangeSummaryRecord;
    };

export interface YegerNotchExchangeRepository {
  getForTelegramUser(telegramUserId: bigint): Promise<YegerNotchExchangeLookupRepositoryResult>;

  exchangeForTelegramUser(
    telegramUserId: bigint,
    input: {
      kind: YegerNotchExchangeKind;
      expectedNotches: number;
      now: Date;
    }
  ): Promise<YegerNotchExchangeRepositoryResult>;
}

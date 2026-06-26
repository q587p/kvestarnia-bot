export interface PlayerHintReceiptRecord {
  id: string;
  telegramUserId: bigint;
  key: string;
  shownAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ClaimPlayerHintReceiptResult =
  | { state: "claimed"; receipt: PlayerHintReceiptRecord }
  | { state: "already-claimed"; receipt: PlayerHintReceiptRecord };

export interface PlayerHintReceiptRepository {
  claimForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; shownAt: Date }
  ): Promise<ClaimPlayerHintReceiptResult>;
}

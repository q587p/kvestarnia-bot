import type { PlayerHintReceiptRepository } from "../db/repositories/playerHintReceiptRepository";
import { systemClock, type Clock } from "../shared/time";

export const KORCHMA_FRONT_ENTRY_HINT_KEY = "korchma.front.entry-hint";

export class PlayerHintService {
  constructor(
    private readonly receipts: PlayerHintReceiptRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async claimKorchmaFrontEntryHint(telegramUserId: bigint): Promise<{ shouldShow: boolean }> {
    const receipt = await this.receipts.claimForTelegramUser(telegramUserId, {
      key: KORCHMA_FRONT_ENTRY_HINT_KEY,
      shownAt: this.clock()
    });

    return { shouldShow: receipt.state === "claimed" };
  }
}

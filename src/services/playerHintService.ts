import type { PlayerHintReceiptRepository } from "../db/repositories/playerHintReceiptRepository";
import { systemClock, type Clock } from "../shared/time";

export const KORCHMA_FRONT_ENTRY_HINT_KEY = "korchma.front.entry-hint";
export const KORCHMA_HALL_YEGER_COUNT_HINT_KEY = "korchma.hall.yeger-count-hint";

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

  async claimKorchmaHallYegerCountHint(
    telegramUserId: bigint,
    options: { remortCount?: number | undefined } = {}
  ): Promise<{ shouldShow: boolean }> {
    const receipt = await this.receipts.claimForTelegramUser(telegramUserId, {
      key: buildKorchmaHallYegerCountHintKey(options.remortCount),
      shownAt: this.clock()
    });

    return { shouldShow: receipt.state === "claimed" };
  }
}

function buildKorchmaHallYegerCountHintKey(remortCount: number | undefined): string {
  return `${KORCHMA_HALL_YEGER_COUNT_HINT_KEY}:r${Math.max(0, Math.floor(remortCount ?? 0))}`;
}

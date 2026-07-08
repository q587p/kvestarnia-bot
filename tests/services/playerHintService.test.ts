import { describe, expect, it } from "vitest";
import type {
  ClaimPlayerHintReceiptResult,
  PlayerHintReceiptRepository
} from "../../src/db/repositories/playerHintReceiptRepository";
import {
  KORCHMA_HALL_YEGER_COUNT_HINT_KEY,
  PlayerHintService
} from "../../src/services/playerHintService";

describe("PlayerHintService", () => {
  it("claims the hall Yeger count hint once per remort life", async () => {
    const receipts = new FakePlayerHintReceiptRepository();
    const service = new PlayerHintService(receipts, () => new Date("2026-07-08T09:00:00.000Z"));

    await expect(service.claimKorchmaHallYegerCountHint(42n, { remortCount: 0 })).resolves.toEqual({
      shouldShow: true
    });
    await expect(service.claimKorchmaHallYegerCountHint(42n, { remortCount: 0 })).resolves.toEqual({
      shouldShow: false
    });
    await expect(service.claimKorchmaHallYegerCountHint(42n, { remortCount: 1 })).resolves.toEqual({
      shouldShow: true
    });

    expect(receipts.keys).toEqual([
      `${KORCHMA_HALL_YEGER_COUNT_HINT_KEY}:r0`,
      `${KORCHMA_HALL_YEGER_COUNT_HINT_KEY}:r0`,
      `${KORCHMA_HALL_YEGER_COUNT_HINT_KEY}:r1`
    ]);
  });
});

class FakePlayerHintReceiptRepository implements PlayerHintReceiptRepository {
  private readonly claimed = new Set<string>();
  readonly keys: string[] = [];

  claimForTelegramUser(
    telegramUserId: bigint,
    input: { key: string; shownAt: Date }
  ): Promise<ClaimPlayerHintReceiptResult> {
    const key = `${telegramUserId}:${input.key}`;
    this.keys.push(input.key);
    const receipt = {
      id: key,
      telegramUserId,
      key: input.key,
      shownAt: input.shownAt,
      createdAt: input.shownAt,
      updatedAt: input.shownAt
    };

    if (this.claimed.has(key)) {
      return Promise.resolve({ state: "already-claimed", receipt });
    }

    this.claimed.add(key);
    return Promise.resolve({ state: "claimed", receipt });
  }
}

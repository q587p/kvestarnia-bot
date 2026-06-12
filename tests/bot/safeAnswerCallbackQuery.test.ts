import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import {
  isExpiredCallbackQueryError,
  safeAnswerCallbackQuery
} from "../../src/bot/safeAnswerCallbackQuery";

describe("safeAnswerCallbackQuery", () => {
  it("treats expired Telegram callback queries as expired", async () => {
    const ctx = {
      answerCallbackQuery: () =>
        Promise.reject(
          new Error(
            "Call to 'answerCallbackQuery' failed! (400: Bad Request: query is too old and response timeout expired or query ID is invalid)"
          )
        )
    } as unknown as Pick<Context, "answerCallbackQuery">;

    await expect(safeAnswerCallbackQuery(ctx)).resolves.toBe("expired");
  });

  it("rethrows other callback answer errors", async () => {
    const ctx = {
      answerCallbackQuery: () => Promise.reject(new Error("Telegram is having a moment"))
    } as unknown as Pick<Context, "answerCallbackQuery">;

    await expect(safeAnswerCallbackQuery(ctx)).rejects.toThrow("Telegram");
  });

  it("recognizes expired callback query errors by message", () => {
    expect(
      isExpiredCallbackQueryError(
        new Error("Call to 'answerCallbackQuery' failed! query ID is invalid")
      )
    ).toBe(true);
    expect(isExpiredCallbackQueryError(new Error("message is not modified"))).toBe(false);
  });
});

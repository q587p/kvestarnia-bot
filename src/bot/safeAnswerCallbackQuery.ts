import type { Context } from "grammy";

type AnswerCallbackQueryOptions = Parameters<Context["answerCallbackQuery"]>[0];

export async function safeAnswerCallbackQuery(
  ctx: Pick<Context, "answerCallbackQuery">,
  options?: AnswerCallbackQueryOptions
): Promise<"answered" | "expired"> {
  try {
    await ctx.answerCallbackQuery(options);
    return "answered";
  } catch (error) {
    if (isExpiredCallbackQueryError(error)) {
      return "expired";
    }

    throw error;
  }
}

export function isExpiredCallbackQueryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("answerCallbackQuery") &&
    (error.message.includes("query is too old") ||
      error.message.includes("response timeout expired") ||
      error.message.includes("query ID is invalid"))
  );
}

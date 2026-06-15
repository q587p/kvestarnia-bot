import type { Context } from "grammy";
import { getCallbackMessageFreshness } from "./messageFreshness";

type EditMessageTextOptions = Parameters<Context["editMessageText"]>[1];
type SafeEditContext = Pick<Context, "editMessageText"> &
  Partial<Pick<Context, "reply" | "callbackQuery">>;

export async function safeEditMessageText(
  ctx: SafeEditContext,
  text: string,
  options?: EditMessageTextOptions
): Promise<"edited" | "sent" | "unchanged"> {
  if (ctx.reply && getCallbackMessageFreshness(ctx) === "stale") {
    await ctx.reply(text, options);
    return "sent";
  }

  try {
    await ctx.editMessageText(text, options);
    return "edited";
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      return "unchanged";
    }

    throw error;
  }
}

export function isMessageNotModifiedError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("message is not modified")
  );
}

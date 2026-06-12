import type { Context } from "grammy";

type EditMessageTextOptions = Parameters<Context["editMessageText"]>[1];

export async function safeEditMessageText(
  ctx: Pick<Context, "editMessageText">,
  text: string,
  options?: EditMessageTextOptions
): Promise<"edited" | "unchanged"> {
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

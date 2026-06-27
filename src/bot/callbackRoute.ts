import type { Bot, Context } from "grammy";
import { presentInvalidCallback } from "./presenters/onboardingPresenter";
import { safeAnswerCallbackQuery } from "./safeAnswerCallbackQuery";

export type CallbackParseResult<TCallback> =
  | { ok: true; value: TCallback }
  | { ok: false };

export function registerParsedCallbackRoute<TCallback>(
  bot: Bot,
  trigger: RegExp,
  parse: (data: string) => CallbackParseResult<TCallback>,
  handle: (ctx: Context, callback: TCallback) => Promise<void>
): void {
  bot.callbackQuery(trigger, async (ctx) => {
    const parsed = parse(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await answerInvalidCallback(ctx);
      return;
    }

    await handle(ctx, parsed.value);
  });
}

export async function answerInvalidCallback(ctx: Context): Promise<void> {
  await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
}

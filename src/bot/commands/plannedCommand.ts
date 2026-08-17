import type { Bot, Context } from "grammy";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import {
  presentPlannedCommand,
  type PlannedCommand
} from "../presenters/plannedCommandPresenter";

const plannedCommands = ["guild"] as const satisfies readonly PlannedCommand[];

export function registerPlannedCommands(
  bot: Bot,
  options: { guildEnabled?: boolean } = {}
): void {
  for (const command of plannedCommands) {
    if (command === "guild" && options.guildEnabled) {
      continue;
    }

    bot.command(command, async (ctx) => {
      await sendPlannedCommand(ctx, command);
    });
  }
}

export async function sendPlannedCommand(ctx: Context, command: PlannedCommand): Promise<void> {
  await ctx.reply(presentPlannedCommand(command), {
    reply_markup: buildMainMenuKeyboard()
  });
}

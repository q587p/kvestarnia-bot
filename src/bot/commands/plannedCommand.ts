import type { Bot } from "grammy";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import {
  presentPlannedCommand,
  type PlannedCommand
} from "../presenters/plannedCommandPresenter";

const plannedCommands = ["quest", "hunt", "inventory", "guild"] as const satisfies readonly PlannedCommand[];

export function registerPlannedCommands(bot: Bot): void {
  for (const command of plannedCommands) {
    bot.command(command, async (ctx) => {
      await ctx.reply(presentPlannedCommand(command), {
        reply_markup: buildMainMenuKeyboard()
      });
    });
  }
}

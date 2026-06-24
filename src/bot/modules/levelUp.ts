import { type Context } from "grammy";
import type { CharacterPath } from "../../domain/characters/path";
import { presentLevelUpCelebration } from "../presenters/levelGrowthPresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function sendLevelUpCelebration(
  ctx: Context,
  result: {
    levelChange: Parameters<typeof presentLevelUpCelebration>[0];
    character: { classId: string; raceId?: string; path?: CharacterPath };
  }
): Promise<void> {
  const identity = {
    ...(result.character.raceId ? { raceId: result.character.raceId } : {}),
    ...(result.character.path ? { path: result.character.path } : {})
  };
  const text = presentLevelUpCelebration(result.levelChange, result.character.classId, identity);

  if (!text) {
    return;
  }

  await ctx.reply(text, HTML_MESSAGE_OPTIONS);
}

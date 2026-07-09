import type { FirstKorchmaQuestCompletionResult } from "../../services/firstKorchmaQuestService";
import { FIRST_KORCHMA_QUEST_TITLE } from "../../services/firstKorchmaQuestService";
import { escapeHtml } from "./telegramHtml";

export function presentFirstKorchmaQuestCompletion(
  result: FirstKorchmaQuestCompletionResult
): string | null {
  if (result.state !== "completed") {
    return null;
  }

  return [
    `📋 <b>Справу закрито: ${escapeHtml(FIRST_KORCHMA_QUEST_TITLE)}</b>`,
    "",
    "Ви зайшли до Корчми, дійшли до Столу зі справами, і журнал урочисто зрозумів, що ви вмієте ходити.",
    "",
    "Отримано:",
    `+${result.reward.xp} XP`
  ].join("\n");
}

import type { FirstKorchmaQuestCompletionResult } from "../../services/firstKorchmaQuestService";
import { FIRST_KORCHMA_QUEST_TITLE } from "../../services/firstKorchmaQuestService";
import { escapeHtml } from "./telegramHtml";

export function presentFirstKorchmaQuestCompletion(
  result: FirstKorchmaQuestCompletionResult
): string | null {
  if (result.state !== "completed") {
    return null;
  }

  const lines = [
    `📋 <b>Справу закрито: ${escapeHtml(FIRST_KORCHMA_QUEST_TITLE)}</b>`,
    "",
    "Ви зайшли до Корчми, дійшли до Столу зі справами, і журнал урочисто зрозумів, що ви вмієте ходити.",
    "",
    "Отримано:",
    `+${result.reward.xp} XP`
  ];

  if (result.character.level < 3) {
    lines.push(
      "",
      "На столі для вас розгорнулися ще дві справи:",
      "🌯 <b>Підозріла шаурма</b> — новачкова підозра чекає на столі.",
      "⚔️ <b>Новачкова сутичка</b> — підозріла шаурма ще не дала свідчень."
    );
  }

  return lines.join("\n");
}

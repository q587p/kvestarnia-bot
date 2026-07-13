import { InlineKeyboard } from "grammy";
import type {
  FightingCornerQuestAcceptResult,
  FightingCornerQuestClaimResult,
  FightingCornerQuestLookupResult
} from "../../services/fightingCornerQuestService";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

type QuestResult = FightingCornerQuestLookupResult | FightingCornerQuestAcceptResult | FightingCornerQuestClaimResult;

export function buildFightingCornerQuestKeyboard(result: QuestResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "available" || result.state === "not-started") {
    keyboard.text("✍️ Прийняти справу", makeQuestCallbackData("fighting-corner-onboarding-accept")).row();
  } else if (result.state === "turn-in-ready") {
    keyboard.text("🎁 Забрати нагороду", makeQuestCallbackData("fighting-corner-onboarding-claim")).row();
  } else if (result.state === "in-progress" || result.state === "accepted" || result.state === "already-accepted" || result.state === "missing-progress") {
    keyboard.text("🥊 До Бійцівського кутка", makePlaceCallbackData("fighting-corner")).row();
  }

  if (result.state === "completed" || result.state === "already-completed") {
    keyboard.text("📦 Архів", makeQuestCallbackData("archive")).row();
  }

  return keyboard.text("📋 До справ", makeQuestCallbackData("list"));
}

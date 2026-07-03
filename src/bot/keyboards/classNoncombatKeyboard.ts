import { InlineKeyboard } from "grammy";
import type { ClassNoncombatOpenResult } from "../../services/classNoncombatService";
import {
  makeClassNoncombatOpenCallbackData,
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeRoguePickpocketCallbackData
} from "../callbacks/classNoncombatCallbackData";

export function buildClassNoncombatKeyboard(result: ClassNoncombatOpenResult, page = 0): InlineKeyboard | undefined {
  if (result.state !== "ready") {
    return undefined;
  }

  const keyboard = new InlineKeyboard();
  const actorRemortCount = result.character.remortCount ?? 0;

  if (result.mode === "priest") {
    keyboard
      .text("🩹 Полікувати себе", makePriestHealCallbackData({
        targetTelegramUserId: null,
        actorRemortCount,
        targetRemortCount: actorRemortCount,
        page
      }))
      .row()
      .text("✨ Благословити себе", makePriestBlessCallbackData({
        targetTelegramUserId: null,
        actorRemortCount,
        targetRemortCount: actorRemortCount,
        page
      }))
      .row();

    for (const target of result.targets) {
      keyboard
        .text(`🩹 ${formatName(target.name)}`, makePriestHealCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page
        }))
        .text("✨", makePriestBlessCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page
        }))
        .row();
    }
  } else {
    for (const target of result.targets.filter((candidate) => candidate.canRoguePickpocket)) {
      keyboard
        .text(`🗡️ ${formatName(target.name)}`, makeRoguePickpocketCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page
        }))
        .row();
    }
  }

  keyboard.text("🔄 Оновити", makeClassNoncombatOpenCallbackData(result.mode, page)).row();

  return keyboard;
}

function formatName(name: string): string {
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

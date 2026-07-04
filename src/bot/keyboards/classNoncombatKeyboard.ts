import { InlineKeyboard } from "grammy";
import type { ClassNoncombatOpenResult } from "../../services/classNoncombatService";
import {
  makeClassNoncombatOpenCallbackData,
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeRoguePickpocketCallbackData
} from "../callbacks/classNoncombatCallbackData";
import { addPaginationControls } from "./pagination";

export function buildClassNoncombatKeyboard(result: ClassNoncombatOpenResult): InlineKeyboard | undefined {
  if (result.state !== "ready") {
    return undefined;
  }

  const keyboard = new InlineKeyboard();
  const actorRemortCount = result.character.remortCount ?? 0;
  const currentPage = result.targetPage;

  if (result.actorBlocked) {
    keyboard.text("🔄 Оновити", makeClassNoncombatOpenCallbackData(result.mode, currentPage)).row();
    return keyboard;
  }

  if (result.mode === "priest") {
    if (canHeal(result.character)) {
      keyboard
        .text("⚕️ Полікувати себе", makePriestHealCallbackData({
          targetTelegramUserId: null,
          actorRemortCount,
          targetRemortCount: actorRemortCount,
          page: currentPage
        }))
        .row();
    }

    keyboard
      .text("✨ Благословити себе", makePriestBlessCallbackData({
        targetTelegramUserId: null,
        actorRemortCount,
        targetRemortCount: actorRemortCount,
        page: currentPage
      }))
      .row();

    for (const target of result.targets) {
      const canHealTarget = canHeal(target);
      if (canHealTarget) {
        keyboard.text(`⚕️ ${formatName(target.name)}`, makePriestHealCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page: currentPage
        }));
      }

      keyboard
        .text(canHealTarget ? "✨" : `✨ ${formatName(target.name)}`, makePriestBlessCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page: currentPage
        }))
        .row();
    }

    addPaginationControls(keyboard, {
      page: result.targetPage,
      totalPages: result.targetTotalPages,
      makeCallbackData: (targetPage) => makeClassNoncombatOpenCallbackData(result.mode, targetPage)
    });
  } else {
    for (const target of result.targets.filter((candidate) => candidate.level >= 3)) {
      if (target.canRoguePickpocket) {
        keyboard.text(`🗡️ ${formatName(target.name)}`, makeRoguePickpocketCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page: currentPage
        }));
      } else if (target.rogueAttemptedToday) {
        keyboard.text(`🗓️ ${formatName(target.name)} завтра`, makeClassNoncombatOpenCallbackData(result.mode, currentPage));
      } else if (result.roguePickpocketCooldownAvailableAt) {
        keyboard.text(`🕯️ ${formatName(target.name)} пізніше`, makeClassNoncombatOpenCallbackData(result.mode, currentPage));
      }
      keyboard.row();
    }

    addPaginationControls(keyboard, {
      page: result.targetPage,
      totalPages: result.targetTotalPages,
      makeCallbackData: (targetPage) => makeClassNoncombatOpenCallbackData(result.mode, targetPage)
    });
  }

  keyboard.text("🔄 Оновити", makeClassNoncombatOpenCallbackData(result.mode, currentPage)).row();

  return keyboard;
}

function formatName(name: string): string {
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

function canHeal(character: { hpCurrent: number; hpMax: number }): boolean {
  return character.hpCurrent < character.hpMax;
}

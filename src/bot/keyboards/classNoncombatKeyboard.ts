import { InlineKeyboard } from "grammy";
import type { ClassNoncombatOpenResult } from "../../services/classNoncombatService";
import {
  makeClassNoncombatOpenCallbackData,
  makePriestBlessCallbackData,
  makePriestHealCallbackData,
  makeRoguePickpocketCallbackData,
  makeVarenykFeedPreviewCallbackData
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

    if (!result.priestSelfBlessAvailableAt) {
      keyboard
        .text("✨ Благословити себе", makePriestBlessCallbackData({
          targetTelegramUserId: null,
          actorRemortCount,
          targetRemortCount: actorRemortCount,
          page: currentPage
        }))
        .row();
    }

    for (const target of result.targets) {
      const canHealTarget = canHeal(target);
      if (canHealTarget) {
        keyboard.text(`⚕️ ${formatTarget(target)}`, makePriestHealCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page: currentPage
        }));
      }

      keyboard
        .text(canHealTarget ? "✨" : `✨ ${formatTarget(target)}`, makePriestBlessCallbackData({
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
  } else if (result.mode === "rogue") {
    for (const target of result.targets.filter((candidate) => candidate.level >= 3)) {
      if (target.canRoguePickpocket) {
        keyboard.text(`🗡️ ${formatTarget(target)}`, makeRoguePickpocketCallbackData({
          targetTelegramUserId: target.telegramUserId,
          actorRemortCount,
          targetRemortCount: target.remortCount,
          page: currentPage
        }));
      } else if (target.rogueAttemptedToday) {
        keyboard.text(`🗓️ ${formatTarget(target)} завтра`, makeClassNoncombatOpenCallbackData(result.mode, currentPage));
      } else if (result.roguePickpocketCooldownAvailableAt) {
        keyboard.text(`🕯️ ${formatTarget(target)} пізніше`, makeClassNoncombatOpenCallbackData(result.mode, currentPage));
      }
      keyboard.row();
    }

    addPaginationControls(keyboard, {
      page: result.targetPage,
      totalPages: result.targetTotalPages,
      makeCallbackData: (targetPage) => makeClassNoncombatOpenCallbackData(result.mode, targetPage)
    });
  } else {
    if (!result.varenykSatedSelfAvailableAt && result.varenykPlan) {
      keyboard.text(
        result.varenykSatedSelf ? "🍽️ Нагодувати себе — оновити стан" : "🍽️ Нагодувати себе",
        makeVarenykFeedPreviewCallbackData({
          targetTelegramUserId: null,
          actorRemortCount,
          targetRemortCount: actorRemortCount,
          page: currentPage
        })
      ).row();
    }
    for (const target of result.targets) {
      if (target.canVarenykFeed && result.varenykPlan) {
        keyboard.text(
          target.varenykSated
            ? `🍽️ ${formatTarget(target)} — оновити стан`
            : `🍽️ ${formatTarget(target)}`,
          makeVarenykFeedPreviewCallbackData({
            targetTelegramUserId: target.telegramUserId,
            actorRemortCount,
            targetRemortCount: target.remortCount,
            page: currentPage
          })
        ).row();
      } else if (target.varenykSated) {
        keyboard.text(`😋 ${formatTarget(target)} — Ситий`, makeClassNoncombatOpenCallbackData(result.mode, currentPage)).row();
      } else if (target.varenykSatedAvailableAt) {
        keyboard.text(`🍽️ ${formatTarget(target)} — пауза`, makeClassNoncombatOpenCallbackData(result.mode, currentPage)).row();
      }
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

function formatTarget(target: { name: string; character: { guildCrest?: string } }): string {
  return formatName(`${target.character?.guildCrest ? `${target.character.guildCrest} ` : ""}${target.name}`);
}

function canHeal(character: { hpCurrent: number; hpMax: number }): boolean {
  return character.hpCurrent < character.hpMax;
}

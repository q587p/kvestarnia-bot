import { InlineKeyboard } from "grammy";
import type { ReferralDashboardResult } from "../../services/referralService";
import type { ReferralInviteePage } from "../../db/repositories/referralRepository";
import {
  makeReferralAcceptCallbackData,
  makeReferralCreateCallbackData,
  makeReferralDeclineCallbackData,
  makeReferralListCallbackData,
  makeReferralRefreshCallbackData
} from "../callbacks/referralCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildReferralConsentKeyboard(acceptEnabled = true): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (acceptEnabled) {
    keyboard.text("✅ Прийняти поклик", makeReferralAcceptCallbackData()).row();
  }
  return keyboard.text("Продовжити без поклику", makeReferralDeclineCallbackData());
}

export function buildReferralDashboardKeyboard(result: ReferralDashboardResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (result.state === "ready") {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(result.inviteUrl)}&text=${encodeURIComponent(result.shareText)}`;
    keyboard.url("📣 Поділитися покликом", shareUrl).row();
    keyboard.text("👥 Мої покликані", makeReferralListCallbackData(0)).row();
    if (!result.hasCharacter) {
      keyboard.text("🪶 Створити персонажа", makeReferralCreateCallbackData()).row();
    }
    keyboard.text("🔄 Оновити", makeReferralRefreshCallbackData()).row();
  } else if (result.state === "no-character") {
    keyboard.text("🪶 Створити персонажа", makeReferralCreateCallbackData()).row();
  }
  return keyboard.text("↩️ До Дошки", makePlaceCallbackData("news-corner"));
}

export function buildReferralInviteeListKeyboard(page: ReferralInviteePage): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (page.totalPages > 1) {
    if (page.page > 0) keyboard.text("⬅️", makeReferralListCallbackData(page.page - 1));
    if (page.page + 1 < page.totalPages) keyboard.text("➡️", makeReferralListCallbackData(page.page + 1));
    keyboard.row();
  }
  return keyboard.text("🔄 Оновити", makeReferralListCallbackData(page.page)).row()
    .text("↩️ До поклику", makeReferralRefreshCallbackData());
}

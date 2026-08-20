import { InlineKeyboard } from "grammy";
import type { ReferralDashboardResult } from "../../services/referralService";
import type { ReferralInviteePage } from "../../db/repositories/referralRepository";
import {
  REFERRAL_INVITE_SHARE_TEXT_COUNT,
  normalizeReferralInviteShareTextIndex
} from "../../content/referralInviteCopy";
import {
  makeReferralCreateCallbackData,
  makeReferralListCallbackData,
  makeReferralRefreshCallbackData,
  makeReferralShareCallbackData
} from "../callbacks/referralCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildReferralDashboardKeyboard(result: ReferralDashboardResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (result.state === "ready") {
    keyboard.text("📝 Згенерувати запрошення", makeReferralShareCallbackData(0)).row();
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

export function buildReferralShareKeyboard(
  variant: number
): InlineKeyboard {
  const normalized = normalizeReferralInviteShareTextIndex(variant);
  return new InlineKeyboard().text(
    "🎲 Інший текст",
    makeReferralShareCallbackData((normalized + 1) % REFERRAL_INVITE_SHARE_TEXT_COUNT)
  );
}

export function buildReferralCaptureRetryKeyboard(inviteUrl: string): InlineKeyboard {
  return new InlineKeyboard().url("🔄 Спробувати ще раз", inviteUrl);
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

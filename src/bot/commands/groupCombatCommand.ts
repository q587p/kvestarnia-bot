import type { Bot, Context } from "grammy";
import type { GroupCombatCallback } from "../callbacks/groupCombatCallbackData";
import type { GroupCombatService } from "../../services/groupCombatService";
import { deliverGroupCombatCards } from "../groupCombatCardDelivery";
import { telegramUserIdFromContext } from "../context";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

export function registerGroupCombatDevCommand(bot: Bot, service: GroupCombatService): void {
  bot.command("dev_group_combat", async (ctx) => {
    if (!service.areDevHelpersEnabled()) {
      return;
    }
    const telegramUserId = telegramUserIdFromContext(ctx.from);
    const token = readCommandToken(ctx.message?.text);
    if (!telegramUserId || !token) {
      await ctx.reply("Вкажіть код живої ватаги: /dev_group_combat КОД");
      return;
    }
    const result = await service.startProof(telegramUserId, token);
    if ("session" in result) {
      await deliverGroupCombatCards(ctx.api, service, result.session);
      return;
    }
    await ctx.reply(presentStartFailure(result.state));
  });
}

export async function handleGroupCombatCallback(
  ctx: Context,
  callback: GroupCombatCallback,
  service: GroupCombatService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала пригодника.", show_alert: true });
    return;
  }
  if (ctx.chat?.type !== "private") {
    await safeAnswerCallbackQuery(ctx, {
      text: "Бойові кнопки ватаги працюють лише в особистій розмові з Квестарнею.",
      show_alert: true
    });
    return;
  }
  let session = await service.findByToken(callback.token);
  if (!session) {
    await safeAnswerCallbackQuery(ctx, { text: "Ця сутичка вже загубила слід.", show_alert: true });
    return;
  }
  if (callback.type === "action") {
    const viewer = session.participants.find((participant) => participant.telegramUserId === telegramUserId);
    if (!viewer) {
      await safeAnswerCallbackQuery(ctx, { text: "Вас немає в цій ватазі.", show_alert: true });
      return;
    }
    const target = resolveTarget(session, viewer.characterId, callback.action, callback.targetIndex);
    if (!target) {
      await safeAnswerCallbackQuery(ctx, { text: "Ціль уже не годиться. Оновлюю картку.", show_alert: true });
      await deliverGroupCombatCards(ctx.api, service, session);
      return;
    }
    const result = await service.submitAction({
      telegramUserId,
      partyInviteToken: callback.token,
      turn: callback.turn,
      action: callback.action,
      targetKind: target.kind,
      targetId: target.id
    });
    if ("session" in result) {
      session = result.session;
    } else {
      session = await service.findByToken(callback.token) ?? session;
    }
    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "invalid-target" || result.state === "stale"
        ? "Хід уже змінився. Показую правду."
        : "Вибір записано."
    });
  } else {
    await safeAnswerCallbackQuery(ctx);
  }
  await deliverGroupCombatCards(ctx.api, service, session);
}

function resolveTarget(
  session: NonNullable<Awaited<ReturnType<GroupCombatService["findByToken"]>>>,
  viewerCharacterId: string,
  action: "attack" | "guard" | "aid",
  targetIndex: number
): { kind: "enemy" | "self" | "ally"; id: string } | null {
  if (action === "attack") {
    const target = session.state.enemies[targetIndex];
    return target?.hp ? { kind: "enemy", id: target.id } : null;
  }
  if (action === "guard") {
    const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
    return viewer?.hp ? { kind: "self", id: viewer.characterId } : null;
  }
  const target = session.state.participants[targetIndex];
  return target?.hp && target.characterId !== viewerCharacterId ? { kind: "ally", id: target.characterId } : null;
}

function readCommandToken(text: string | undefined): string | null {
  const token = text?.trim().split(/\s+/)[1] ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function presentStartFailure(state: string): string {
  switch (state) {
    case "invalid-size":
      return "Для доказової сутички треба рівно 2–3 пригодники у ватазі.";
    case "not-leader":
      return "Запустити доказову сутичку може лише ватажок.";
    case "invalid-life":
      return "Склад ватаги належить іншому життю. Зберіть її заново.";
    case "blocked":
      return "Хтось із ватаги вже тримає інший бій за рукав.";
    case "not-recruiting":
      return "Ватага вже не збирається.";
    case "disabled":
      return "Доказовий гуртовий бій тут вимкнений.";
    default:
      return "Не вдалося запустити доказову сутичку з цієї ватаги.";
  }
}

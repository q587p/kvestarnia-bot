import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import { GROUP_COMBAT_TURN_MS } from "../../services/groupCombatService";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentGroupCombat(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): string {
  const state = session.state;
  const viewer = state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const status = state.status === "active"
    ? `🧪 <b>Бій: ${state.turn} хід</b>`
    : state.status === "won"
      ? "✅ Доказову сутичку виграно"
      : state.status === "lost"
        ? "🪦 Доказову сутичку програно"
        : "🧯 Доказову сутичку безпечно зупинено";
  const enemies = state.enemies.map((enemy) => presentBattleCombatantResourceLine({
    icon: enemy.hp > 0 ? "👹" : "☠️",
    name: enemy.name,
    hp: enemy.hp,
    hpMax: enemy.hpMax,
    showHpLabel: true
  }));
  const party = state.participants.map((participant) => presentBattleCombatantResourceLine({
    icon: participant.hp > 0
      ? participant.characterId === viewerCharacterId ? "❤️" : "🫶"
      : "☠️",
    name: participant.name,
    hp: participant.hp,
    hpMax: participant.hpMax,
    mana: participant.mana,
    manaMax: participant.manaMax
  }));
  const queued = Boolean(
    viewer && session.queuedActions.some((action) => action.actorCharacterId === viewer.characterId)
  );
  const recap = state.recap[state.recap.length - 1];
  const recapText = recap
    ? `\n\n<b>Останні дії:</b>\n${recap.lines.map((line) => escapeHtml(line)).join("\n")}`
    : "";
  const ending = state.status === "active"
    ? queued
      ? `\n\n✅ <b>${escapeHtml(viewer?.name ?? "Пригодник")}</b>, ваш вибір записано. Чекаємо на решту ватаги.`
      : [
          "",
          `<b>${escapeHtml(viewer?.name ?? "Пригодник")}</b>, що робимо? Оберіть точну ціль.`,
          `⏳ На хід є ${formatSecondsLong(GROUP_COMBAT_TURN_MS)}. Потім Корчма поставить мовчунів у захист.`
        ].join("\n")
    : "\n\nЦе лише перевірка рушія: досвіду, золота й манаток немає.";

  return [status, "", ...enemies, ...party].join("\n") + recapText + ending;
}

function formatSecondsLong(milliseconds: number): string {
  return `${Math.ceil(milliseconds / 1_000)} секунди`;
}

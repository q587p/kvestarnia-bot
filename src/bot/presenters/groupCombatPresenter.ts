import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import { escapeHtml } from "./telegramHtml";

export function presentGroupCombat(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  options: { now?: Date } = {}
): string {
  const state = session.state;
  const viewer = state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const status = state.status === "active"
    ? `⚔️ Доказова сутичка · хід ${state.turn}`
    : state.status === "won"
      ? "✅ Доказову сутичку виграно"
      : state.status === "lost"
        ? "🪦 Доказову сутичку програно"
        : "🧯 Доказову сутичку безпечно зупинено";
  const enemies = state.enemies.map((enemy) =>
    `${enemy.hp > 0 ? "👹" : "☠️"} ${escapeHtml(enemy.name)}: HP ${enemy.hp}/${enemy.hpMax}`
  );
  const party = state.participants.map((participant) =>
    `${participant.hp > 0 ? (participant.characterId === viewerCharacterId ? "❤️" : "🫶") : "☠️"} ${escapeHtml(participant.name)}: HP ${participant.hp}/${participant.hpMax} · мана ${participant.mana}/${participant.manaMax}`
  );
  const queued = viewer && session.queuedActions.some((action) => action.actorCharacterId === viewer.characterId)
    ? "\n\n✅ Ваш вибір записано. Чекаємо на решту ватаги."
    : "";
  const recap = state.recap[state.recap.length - 1];
  const recapText = recap
    ? `\n\nОстанній хід:\n${recap.lines.map((line) => escapeHtml(line)).join("\n")}`
    : "";
  const ending = state.status === "active"
    ? `\n\nОберіть дію й точну ціль. До захисту мовчунів — ${formatRemainingSeconds(
      session.turnExpiresAt,
      options.now ?? new Date()
    )}.`
    : "\n\nЦе лише перевірка рушія: досвіду, золота й манаток немає.";

  return [status, "", ...enemies, "", ...party].join("\n") + recapText + queued + ending;
}

function formatRemainingSeconds(expiresAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000));
  return `${seconds} ${pluralizeUk(seconds, "секунда", "секунди", "секунд")}`;
}

function pluralizeUk(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return many;
  }
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
}

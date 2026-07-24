import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  getGroupCombatActionProfile,
  GROUP_COMBAT_CARD_BYTE_LIMIT
} from "../../domain/groupCombat/groupCombat";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { presentBattleJournalPage } from "./battleJournalPresenter";
import { escapeHtml } from "./telegramHtml";
import { items } from "../../content";

export function presentGroupCombat(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  now: Date = new Date()
): string {
  const state = session.state;
  const viewer = state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const production = state.rulesVersion === "group-combat.v3";
  const status = state.status === "active"
    ? `🧪 <b>Бій: ${state.turn} хід</b>`
    : state.status === "won"
      ? production ? "✅ Ватага втримала лівий прохід" : "✅ Доказову сутичку виграно"
      : state.status === "lost"
        ? production ? "🪦 Лівий прохід відбив атаку" : "🪦 Доказову сутичку програно"
        : production ? "🧯 Сутичку безпечно зупинено" : "🧯 Доказову сутичку безпечно зупинено";
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
  const queuedAction = viewer
    ? session.queuedActions.find((action) => action.actorCharacterId === viewer.characterId)
    : null;
  const recap = state.recap[state.recap.length - 1];
  const recapText = recap
    ? `\n\n<b>Останні дії:</b>\n${recap.lines.map((line) => escapeHtml(line)).join("\n")}`
    : "";
  const contributionText = state.status === "active"
    ? ""
    : `\n\n<b>Внесок:</b>\n⚔️ шкода ворогам · ❤️ лікування · 🛡️ відвернена шкода\n` +
      `🌀 послаблена відповідь · 💥 отримана шкода · ✅ дії\n${state.participants.map((participant) => {
        const contribution = state.contributions.find((row) => row.characterId === participant.characterId);
        return contribution
          ? `${escapeHtml(participant.name)}: ⚔️ ${contribution.damage}, ❤️ ${contribution.healing}, 🛡️ ${contribution.guardPrevented}, 🌀 ${contribution.control}, 💥 ${contribution.damageTaken}, ✅ ${contribution.committedActions}`
          : `${escapeHtml(participant.name)}: запис не знайдено`;
      }).join("\n")}`;
  const remaining = formatRemainingTurn(session.turnExpiresAt, now);
  const settlement = session.settlementPlan?.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  const ending = state.status === "active"
    ? queued
      ? `\n\n✅ <b>${escapeHtml(viewer?.name ?? "Пригодник")}</b>, вибір записано: ${presentQueuedAction(
          session,
          queuedAction
        )}. Можна змінити до розіграшу ходу.\n⏳ До захисту мовчунів — ${remaining}.`
      : [
          "",
          "",
          `<b>${escapeHtml(viewer?.name ?? "Пригодник")}</b>, що робимо? Оберіть точну ціль.`,
          `⏳ До захисту мовчунів — ${remaining}.`
        ].join("\n")
    : production && settlement
      ? `\n\n${presentProductionSettlement(settlement.rewards)}`
      : "\n\nЦе лише перевірка рушія: досвіду, золота й манаток немає.";

  const base = [status, "", ...enemies, ...party].join("\n");
  const text = base + recapText + contributionText + ending;
  return Buffer.byteLength(text, "utf8") <= GROUP_COMBAT_CARD_BYTE_LIMIT
    ? text
    : base + contributionText + ending;
}

function presentProductionSettlement(
  rewards: NonNullable<GroupCombatSessionRecord["settlementPlan"]>["participants"][number]["rewards"]
): string {
  const lines = [
    "<b>Ваш підсумок:</b>",
    `✨ Досвід: +${rewards.xp}`,
    `🪙 Золото: +${rewards.gold}`
  ];
  for (const reward of rewards.items) {
    const item = items.find((candidate) => candidate.id === reward.itemId);
    lines.push(`🎒 ${escapeHtml(item?.name ?? reward.itemId)}: +${reward.quantity}`);
  }
  if (rewards.xp === 0 && rewards.gold === 0 && rewards.items.length === 0) {
    lines.push("⏳ Цього разу зараховано лише присутність: змістовної дії не було.");
  }
  return lines.join("\n");
}

function formatRemainingTurn(expiresAt: Date, now: Date): string {
  return `${Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000))} с`;
}

export function presentGroupCombatJournal(
  session: GroupCombatSessionRecord,
  requestedPage: number
): string {
  const total = session.state.recap.length;
  if (total === 0) {
    return presentBattleJournalPage({
      title: session.state.rulesVersion === "group-combat.v3"
        ? "📜 <b>Журнал атаки в лівому проході</b>"
        : "📜 <b>Журнал доказової сутички</b>",
      emptyText: "Записів ходів ще немає."
    });
  }
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), total - 1);
  const recap = session.state.recap[page]!;
  return presentBattleJournalPage({
    title: session.state.rulesVersion === "group-combat.v3"
      ? "📜 <b>Журнал атаки в лівому проході</b>"
      : "📜 <b>Журнал доказової сутички</b>",
    headerLines: ["", `Збережено останні ${total} ходів цієї сутички.`],
    turn: recap.turn,
    page,
    totalPages: total,
    actionLines: recap.lines.map((line) => escapeHtml(line))
  });
}

function presentQueuedAction(
  session: GroupCombatSessionRecord,
  action: GroupCombatSessionRecord["queuedActions"][number] | null | undefined
): string {
  if (!action) {
    return "дію";
  }
  if (action.action === "guard") {
    return "захиститися";
  }
  if (action.action === "attack") {
    const enemy = session.state.enemies.find((candidate) => candidate.id === action.targetId);
    return enemy ? `вдарити ${escapeHtml(enemy.name)}` : "вдарити ворога";
  }
  if (action.action === "item") {
    return "скористатися бойовим запасом";
  }
  if (action.action === "class" || action.action === "race" || action.action === "gear") {
    const actor = session.state.participants.find((candidate) => candidate.characterId === action.actorCharacterId);
    const profile = actor ? getGroupCombatActionProfile(actor, action.action, action.payloadKey) : null;
    return profile ? `застосувати ${escapeHtml(profile.ability.label ?? "здібність")}` : "застосувати здібність";
  }
  return "дію";
}

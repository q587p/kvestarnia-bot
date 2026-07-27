import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  getGroupCombatActionProfile,
  GROUP_COMBAT_CARD_BYTE_LIMIT
} from "../../domain/groupCombat/groupCombat";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { presentBattleJournalPage } from "./battleJournalPresenter";
import { escapeHtml } from "./telegramHtml";
import { items } from "../../content";
import { getCombatSkillDisplay } from "../../services/fightService";
import { getMonsterAbilityLabel } from "../../domain/combat/monsterAbilityRuntime";

export function presentGroupCombat(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  now: Date = new Date()
): string {
  const state = session.state;
  const viewer = state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const production = state.rulesVersion === "group-combat.v3";
  const status = state.status === "active"
    ? `${production ? "⚔️" : "🧪"} <b>Бій: ${state.turn} хід</b>`
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
  const recapRows = state.recap ?? [];
  const recap = recapRows[recapRows.length - 1];
  const recapText = recap
    ? `\n\n<b>Останні дії:</b>\n${recap.lines.map((line) => escapeHtml(line)).join("\n")}`
    : "";
  const participantContributionText = state.status === "active"
    ? ""
    : `\n\n<b>Внесок:</b>\n⚔️ шкода ворогам · ❤️ лікування · 🛡️ відвернена шкода\n` +
      `🌀 послаблена відповідь · 💥 отримана шкода · ✅ дії\n${state.participants.map((participant) => {
        const contribution = state.contributions.find((row) => row.characterId === participant.characterId);
        return contribution
          ? `${escapeHtml(participant.name)}: ⚔️ ${contribution.damage}, ❤️ ${contribution.healing}, 🛡️ ${contribution.guardPrevented}, 🌀 ${contribution.control}, 💥 ${contribution.damageTaken}, ✅ ${contribution.committedActions}`
          : `${escapeHtml(participant.name)}: запис не знайдено`;
      }).join("\n")}`;
  const enemyContributionText = state.status === "active" || !state.enemyContributions
    ? ""
    : `\n\n<b>Внесок ворогів:</b>\n💥 шкода ватазі · 🎯 дії · ✨ спецатаки\n${state.enemies.map((enemy) => {
        const contribution = state.enemyContributions?.find((row) => row.enemyId === enemy.id);
        return contribution
          ? `${escapeHtml(enemy.name)}: 💥 ${contribution.damage}, 🎯 ${contribution.actions}, ✨ ${contribution.specialActions}`
          : `${escapeHtml(enemy.name)}: запис не знайдено`;
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

  const tacticalState = state.status === "active"
    ? presentGroupCombatTacticalState(session, viewerCharacterId)
    : [];
  const base = [status, "", ...enemies, ...party, ...tacticalState].join("\n");
  const text = base + recapText + participantContributionText + enemyContributionText + ending;
  return Buffer.byteLength(text, "utf8") <= GROUP_COMBAT_CARD_BYTE_LIMIT
    ? text
    : base + participantContributionText + enemyContributionText + ending;
}

export function presentGroupCombatIntro(session: GroupCombatSessionRecord): string {
  return presentGroupCombatOpening(session).join("\n");
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
    headerLines: [
      "",
      `Збережено весь бій: ${formatTurns(total)}.`,
      ...presentGroupCombatRecapSnapshot(session, recap)
    ],
    turn: recap.turn,
    page,
    totalPages: total,
    actionLines: recap.lines.map((line) => escapeHtml(line))
  });
}

function presentGroupCombatOpening(session: GroupCombatSessionRecord): string[] {
  const state = session.state;
  const party = state.participants.map((participant) =>
    `🧑 ${escapeHtml(participant.name)} · рівень ${participant.level}`
  );
  const enemies = state.enemies.map((enemy) =>
    `👹 ${escapeHtml(enemy.name)} · рівень ${enemy.level ?? "невідомий"}`
  );
  const tips = [
    "Домовляйтеся про цілі: поранений ворог б’є так само сердито, доки не впаде.",
    "Сильніша ватага привертає більше ворогів, зате має більше рук для рішень.",
    "Кулдауни рахуються вашими діями, а мовчання Корчма перетворює на захист."
  ] as const;
  const tip = tips[Math.abs(state.deterministicSeed) % tips.length]!;
  return [
    "<b>Хто проти кого:</b>",
    `<b>Ватага (${party.length}):</b>`,
    ...party,
    `<b>Вороги (${enemies.length}):</b>`,
    ...enemies,
    "",
    `<i>Порада дня: ${escapeHtml(tip)}</i>`
  ];
}

function presentGroupCombatTacticalState(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): string[] {
  const state = session.state;
  const viewer = state.participants.find((participant) => participant.characterId === viewerCharacterId);
  if (!viewer) {
    return [];
  }
  const cooldowns = [
    ...(viewer.cooldowns?.skill ? [viewer.cooldowns.skill] : []),
    ...Object.values(viewer.cooldowns?.abilities ?? {})
  ];
  const uniqueCooldowns = [...new Map(
    cooldowns
      .filter((cooldown) => cooldown.remainingTurns > 0)
      .map((cooldown) => [cooldown.id, cooldown])
  ).values()];
  const lines = uniqueCooldowns.map((cooldown) => {
    const skill = getCombatSkillDisplay(cooldown.id);
    return `🫁 ${skill.icon} ${escapeHtml(skill.name)}: ще ${formatTurns(cooldown.remainingTurns)}.`;
  });
  for (const cooldown of Object.values(viewer.combatItems?.cooldowns ?? {})) {
    if (cooldown.remainingTurns <= 0) {
      continue;
    }
    const item = items.find((candidate) => candidate.id === cooldown.itemId);
    lines.push(`🧻 ${escapeHtml(item?.name ?? cooldown.itemId)}: ще ${formatTurns(cooldown.remainingTurns)}.`);
  }
  for (const enemy of state.enemies) {
    for (const cooldown of Object.values(enemy.abilityCooldowns ?? {})) {
      if (cooldown.remainingTurns > 0) {
        lines.push(
          `👹 ${escapeHtml(enemy.name)} · ${escapeHtml(getMonsterAbilityLabel(cooldown.id) ?? cooldown.id)}: ще ${formatTurns(cooldown.remainingTurns)}.`
        );
      }
    }
  }
  lines.push(...presentEffectLines(session, (state.statuses ?? []).map((status) => ({
    kind: status.kind,
    targetKind: status.targetKind,
    targetId: status.targetId,
    remainingTurns: status.remainingTurns
  }))));
  return lines.length > 0 ? ["", "<b>Кулдауни й ефекти:</b>", ...lines] : [];
}

function presentGroupCombatRecapSnapshot(
  session: GroupCombatSessionRecord,
  recap: GroupCombatSessionRecord["state"]["recap"][number]
): string[] {
  const snapshot = recap.snapshot;
  if (!snapshot) {
    return [];
  }
  const lines = ["", "<b>Стан після ходу:</b>"];
  for (const [index, row] of snapshot.enemies.entries()) {
    const enemy = session.state.enemies[index];
    if (!enemy) {
      continue;
    }
    lines.push(`👹 ${escapeHtml(enemy.name)} · рівень ${enemy.level ?? "невідомий"} — ❤️ життя ${row.hp}/${enemy.hpMax}`);
    for (const cooldown of row.cooldowns ?? []) {
      lines.push(
        `  🫁 ${escapeHtml(getMonsterAbilityLabel(cooldown.id) ?? cooldown.id)}: ще ${formatTurns(cooldown.remainingTurns)}.`
      );
    }
  }
  for (const [index, row] of snapshot.participants.entries()) {
    const participant = session.state.participants[index];
    if (!participant) {
      continue;
    }
    lines.push(
      `🧑 ${escapeHtml(participant.name)} · рівень ${participant.level} — ❤️ життя ${row.hp}/${participant.hpMax} · 🔷 мана ${row.mana}/${participant.manaMax}`
    );
    for (const cooldown of row.cooldowns ?? []) {
      const skill = getCombatSkillDisplay(cooldown.id);
      lines.push(`  🫁 ${skill.icon} ${escapeHtml(skill.name)}: ще ${formatTurns(cooldown.remainingTurns)}.`);
    }
    for (const cooldown of row.itemCooldowns ?? []) {
      const item = items.find((candidate) => candidate.id === cooldown.itemId);
      lines.push(
        `  🧻 ${escapeHtml(item?.name ?? cooldown.itemId)}: ще ${formatTurns(cooldown.remainingTurns)}.`
      );
    }
  }
  lines.push(...presentEffectLines(session, snapshot.effects ?? []));
  return lines;
}

function presentEffectLines(
  session: GroupCombatSessionRecord,
  effects: Array<{
    kind: "guard" | "response-mitigation" | "counter" | "bleed";
    targetKind: "participant" | "enemy";
    targetId: string;
    remainingTurns: number;
  }>
): string[] {
  return effects.map((effect) => {
    const target = effect.targetKind === "participant"
      ? session.state.participants.find((candidate) => candidate.characterId === effect.targetId)?.name
      : session.state.enemies.find((candidate) => candidate.id === effect.targetId)?.name;
    const label = effect.kind === "guard"
      ? "🛡️ захист"
      : effect.kind === "response-mitigation"
        ? "🌀 послаблення відповіді"
        : effect.kind === "counter"
          ? "↩️ контрудар"
          : "🩸 кровотеча";
    return `${label} · ${escapeHtml(target ?? effect.targetId)}: ще ${formatTurns(effect.remainingTurns)}.`;
  });
}

function formatTurns(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "хід"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "ходи"
      : "ходів";
  return `${count} ${word}`;
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

import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  deriveGroupCombatPresentedEffectPolarity,
  expandGroupCombatRecapSnapshot,
  getGroupCombatActionProfile,
  getGroupCombatEnemyFocusTarget,
  GROUP_COMBAT_CARD_BYTE_LIMIT,
  isActiveGroupCombatParticipant,
  listGroupCombatVisibleEffects,
  type GroupCombatPresentedEffectKind
} from "../../domain/groupCombat/groupCombat";
import { presentBattleCombatantResourceLine } from "./battleCombatantPresenter";
import { presentBattleJournalPage } from "./battleJournalPresenter";
import { escapeHtml } from "./telegramHtml";
import { items } from "../../content";
import { getCombatSkillDisplay } from "../../services/fightService";
import { getMonsterAbilityLabel } from "../../domain/combat/monsterAbilityRuntime";
import { findMonsterBark } from "../../content/monsterBarks";
import { presentMonsterBarkBlockquote } from "./monsterBarkPresenter";
import {
  presentBattleContributionLegend,
  presentBattleContributionLine
} from "./battleContributionPresenter";
import { presentRewardBlock } from "./rewardPresenter";
import { getDistinctShortMonsterNames } from "./monsterNamePresenter";
import { presentBattleObserverNotice } from "./battleObserverPresenter";

function groupCombatParticipantDisplayName(
  participant: Pick<GroupCombatSessionRecord["state"]["participants"][number], "name" | "guildCrest">
): string {
  return participant.guildCrest
    ? `${participant.guildCrest} ${participant.name}`
    : participant.name;
}

export function presentGroupCombat(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  now: Date = new Date(),
  notice?: string
): string {
  const state = session.state;
  const viewer = state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const production = state.rulesVersion === "group-combat.v3";
  const status = state.status === "active"
    ? `${production ? "⚔️" : "🧪"} <b>Бій</b>: ${state.turn} хід`
    : state.status === "won"
      ? production ? "✅ Ватага втримала лівий прохід" : "✅ Доказову сутичку виграно"
      : state.status === "lost"
        ? production ? "🪦 Лівий прохід відбив атаку" : "🪦 Доказову сутичку програно"
        : production ? "🧯 Сутичку безпечно зупинено" : "🧯 Доказову сутичку безпечно зупинено";
  const shortEnemyNames = getDistinctShortMonsterNames(state.enemies);
  const enemyFocusCharacterId = state.status === "active"
    ? getGroupCombatEnemyFocusTarget(state)?.characterId ?? null
    : null;
  const enemies = state.enemies.map((enemy) => presentBattleCombatantResourceLine({
    icon: enemy.hp > 0 ? "👹" : "☠️",
    name: shortEnemyNames.get(enemy.order) ?? "Монстр",
    hp: enemy.hp,
    hpMax: enemy.hpMax,
    showHpLabel: true
  }));
  const party = state.participants.map((participant) => presentBattleCombatantResourceLine({
    icon: participant.fledAtTurn !== undefined
      ? "🏃"
      : participant.hp > 0
      ? participant.characterId === viewerCharacterId ? "❤️" : "🫶"
      : "☠️",
    name: participant.name,
    guildCrest: participant.guildCrest,
    hp: participant.hp,
    hpMax: participant.hpMax,
    mana: participant.mana,
    manaMax: participant.manaMax,
    targetLabel: participant.characterId === enemyFocusCharacterId
      ? "🎯 ціль ворогів"
      : undefined
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
    ? `\n\n${presentGroupCombatRecapActions(recap, session, true).join("\n")}`
    : "";
  const remaining = formatRemainingTurn(session.turnExpiresAt, now);
  const settlement = session.settlementPlan?.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  const ending = state.status === "active"
    ? viewer?.fledAtTurn !== undefined
      ? "\n\n🏃 Ви відступили. Ватага продовжує бій без вас."
      : viewer && !isActiveGroupCombatParticipant(viewer)
        ? `\n\n${presentBattleObserverNotice(production ? "бою" : "тестового бою")}`
      : queued
      ? `\n\n✅ <b>${escapeHtml(viewer?.name ?? "Пригодник")}</b>, вибір записано: ${presentQueuedAction(
          session,
          queuedAction
        )}. Можна змінити до розіграшу ходу.\n⏳ На хід є ${remaining}. Потім Корчма поставить вас у захист.`
      : [
          "",
          "",
          `<b>${escapeHtml(viewer?.name ?? "Пригодник")}</b>, що робимо?${state.enemies.filter((enemy) => enemy.hp > 0).length > 1 ? " Оберіть точну ціль." : ""}`,
          `⏳ На хід є ${remaining}. Потім Корчма поставить вас у захист.`
        ].join("\n")
    : production && settlement
      ? `\n\n${presentProductionSettlement(session, viewerCharacterId)}`
      : "\n\nЦе лише перевірка рушія: досвіду, золота й манаток немає.";

  const tacticalState = state.status === "active" &&
    viewer &&
    isActiveGroupCombatParticipant(viewer)
    ? presentGroupCombatTacticalState(session, viewerCharacterId)
    : [];
  const base = [status, "", ...party, ...enemies, ...tacticalState].join("\n");
  const noticeText = notice ? `\n\n${notice}` : "";
  const text = base + recapText + noticeText + ending;
  return Buffer.byteLength(text, "utf8") <= GROUP_COMBAT_CARD_BYTE_LIMIT
    ? text
    : base + noticeText + ending;
}

export function presentGroupCombatItems(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  hasAvailableItems: boolean,
  now: Date = new Date()
): string {
  return presentGroupCombat(
    session,
    viewerCharacterId,
    now,
    hasAvailableItems
      ? "🎒 Одноразові манатки: оберіть, що піде в цей хід. Новий вибір замінить попередній."
      : "🎒 Одноразові манатки: зараз немає корисних предметів."
  );
}

export function presentGroupCombatStatistics(session: GroupCombatSessionRecord): string {
  const participantRows = session.state.participants.map((participant) => {
    const contribution = session.state.contributions.find(
      (row) => row.characterId === participant.characterId
    );
    return contribution
      ? presentBattleContributionLine(groupCombatParticipantDisplayName(participant), {
          damage: contribution.damage,
          healing: contribution.healing,
          guardPrevented: contribution.guardPrevented,
          control: contribution.control,
          damageTaken: contribution.damageTaken,
          actions: contribution.committedActions,
          specialActions: contribution.specialActions ?? 0,
          guardedTurns: contribution.guardedTurns
        })
      : `${escapeHtml(groupCombatParticipantDisplayName(participant))}: запис не знайдено`;
  });
  const enemyRows = session.state.enemies.map((enemy) => {
    const contribution = session.state.enemyContributions?.find(
      (row) => row.enemyId === enemy.id
    );
    return contribution
      ? presentBattleContributionLine(enemy.name, {
          damage: contribution.damage,
          healing: contribution.healing ?? 0,
          guardPrevented: contribution.guardPrevented ?? 0,
          control: contribution.control ?? 0,
          damageTaken: contribution.damageTaken ?? 0,
          actions: contribution.actions,
          specialActions: contribution.specialActions,
          guardedTurns: contribution.guardedTurns ?? 0
        })
      : `${escapeHtml(enemy.name)}: запис не знайдено`;
  });

  return [
    "📊 <b>Статистика бою</b>",
    "",
    "<b>Легенда:</b>",
    ...presentBattleContributionLegend(),
    "",
    "<b>Пригодники:</b>",
    ...participantRows,
    "",
    "<b>Монстри:</b>",
    ...enemyRows
  ].join("\n");
}

export function presentGroupCombatIntro(session: GroupCombatSessionRecord): string {
  return presentGroupCombatOpening(session).join("\n");
}

function presentProductionSettlement(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): string {
  const settlement = session.settlementPlan?.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  if (!settlement) {
    return "Бойова відомість не знайшла вашого рядка.";
  }
  const rewards = settlement.rewards;
  const participant = session.participants.find(
    (candidate) => candidate.characterId === viewerCharacterId
  );
  const frozen = session.state.participants.find(
    (candidate) => candidate.characterId === viewerCharacterId
  );
  const lines = [
    session.state.status === "won"
      ? "🎉 Ватага перемогла. Лівий прохід утримано, журнал задоволено хрумтить сторінкою."
      : "🪦 Ватага відступила. Лівий прохід лишив за собою останнє слово.",
  ];
  if (rewards.xp === 0 && rewards.gold === 0 && rewards.items.length === 0) {
    const manualParticipation = settlement.manualParticipation ??
      settlement.contribution.committedActions > 0;
    lines.push(
      "",
      manualParticipation
        ? "🧾 Ручну участь записано, але після нейтрального поділу цього разу ваш рядок — 0 XP."
        : "⏳ Винагороди немає: цього разу ви не обрали жодної дії вручну."
    );
  } else {
    lines.push("", presentRewardBlock({
      xp: rewards.xp,
      gold: rewards.gold,
      label: "Винагорода за бій",
      itemGrants: rewards.items.map((reward) => ({
        name: escapeHtml(items.find((candidate) => candidate.id === reward.itemId)?.name ?? reward.itemId),
        quantity: reward.quantity
      }))
    }));
    if (session.state.status === "won" && rewards.items.length === 0) {
      lines.push("", "🎒 Манатки цього разу не випали.");
    }
  }
  if (
    participant?.currentLevel !== undefined &&
    frozen &&
    participant.currentLevel > frozen.level
  ) {
    lines.push("", `🎉 Рівень підріс: <b>${frozen.level} → ${participant.currentLevel}</b>.`);
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
        ? "📜 <b>Журнал бою</b>"
        : "📜 <b>Журнал доказової сутички</b>",
      emptyText: "Записів ходів ще немає."
    });
  }
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), total - 1);
  const recap = session.state.recap[page]!;
  const firstRecordedTurn = session.state.recap[0]?.turn ?? 1;
  const lastRecordedTurn = session.state.recap.at(-1)?.turn ?? total;
  const journalCoverage = firstRecordedTurn === 1
    ? `Збережено весь бій: ${formatTurns(total)}.`
    : `Збережено останні ${formatTurns(total)}: ходи ${firstRecordedTurn}–${lastRecordedTurn}.`;
  return presentBattleJournalPage({
    title: session.state.rulesVersion === "group-combat.v3"
      ? "📜 <b>Журнал бою</b>"
      : "📜 <b>Журнал доказової сутички</b>",
    headerLines: [
      "",
      session.state.participants
        .map((participant) => escapeHtml(groupCombatParticipantDisplayName(participant)))
        .join(" · "),
      "",
      journalCoverage
    ],
    turn: recap.turn,
    page,
    totalPages: total,
    ...presentGroupCombatRecapSnapshot(session, recap),
    actionLines: presentGroupCombatRecapActions(recap)
  });
}

function presentGroupCombatOpening(session: GroupCombatSessionRecord): string[] {
  const state = session.state;
  const party = state.participants.map((participant) =>
    [
      `<b>${escapeHtml(groupCombatParticipantDisplayName(participant))}</b>`,
      participant.activeCosmeticTitle
        ? `<i>${escapeHtml(participant.activeCosmeticTitle)}</i>`
        : `рівень ${participant.level}`
    ].join(" · ")
  );
  const enemies = state.enemies.map((enemy) =>
    `<b>${escapeHtml(enemy.name)}</b> · рівень ${enemy.level ?? "невідомий"}`
  );
  const tips = [
    "Домовляйтеся про цілі: поранений ворог б’є так само сердито, доки не впаде.",
    "Сильніша ватага привертає більше ворогів, зате має більше рук для рішень.",
    "Кулдауни рахуються вашими діями, а мовчання Корчма перетворює на захист."
  ] as const;
  const tip = tips[Math.abs(state.deterministicSeed) % tips.length]!;
  const difficultyNotes = presentGroupCombatDifficultyNotes(session);
  return [
    "⚔️ <b>Бій</b>",
    ...party,
    "",
    "Бій починається. Корчма відкриває журнал ходів і робить вигляд, що це звичайний облік.",
    "",
    "Проти вас:",
    ...enemies,
    ...(difficultyNotes.length > 0 ? ["", ...difficultyNotes] : []),
    "",
    `<i>Порада дня: ${escapeHtml(tip)}</i>`
  ];
}

function presentGroupCombatDifficultyNotes(session: GroupCombatSessionRecord): string[] {
  const production = session.state.production;
  if (!production) {
    return [];
  }
  const lines: string[] = [];
  if (production.remort.sourceRemortCount > 0) {
    lines.push("🧿 <i>Відплата за минулі пригоди:</i> ремортна памʼять покликала ворогам підмогу.");
  }
  if (production.threat.escalated) {
    lines.push(
      production.threat.appliedSecondEnemyLevelBonus > 0
        ? `📈 <i>Натиск Низу:</i> перша підмога отримала +${production.threat.appliedSecondEnemyLevelBonus} ${formatLevelPoints(production.threat.appliedSecondEnemyLevelBonus)}.`
        : `📈 <i>Натиск Низу:</i> перша підмога вперлася в межу ${production.threat.levelCap}.`
    );
  }
  return lines;
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
    return `🫁 ${skill.icon} ${escapeHtml(skill.name)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`;
  });
  const shortEnemyNames = getDistinctShortMonsterNames(state.enemies);
  for (const cooldown of Object.values(viewer.combatItems?.cooldowns ?? {})) {
    if (cooldown.remainingTurns <= 0) {
      continue;
    }
    const item = items.find((candidate) => candidate.id === cooldown.itemId);
    lines.push(`🧻 ${escapeHtml(item?.name ?? cooldown.itemId)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`);
  }
  for (const enemy of state.enemies) {
    if (enemy.shield?.points) {
      lines.push(
        `🫧 ${escapeHtml(shortEnemyNames.get(enemy.order) ?? "Монстр")} · щит: ${enemy.shield.points}.`
      );
    }
    for (const cooldown of Object.values(enemy.abilityCooldowns ?? {})) {
      if (cooldown.remainingTurns > 0) {
        lines.push(
          `👹 ${escapeHtml(shortEnemyNames.get(enemy.order) ?? "Монстр")} · ${escapeHtml(getMonsterAbilityLabel(cooldown.id) ?? cooldown.id)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`
        );
      }
    }
  }
  lines.push(...presentEffectLines(session, listGroupCombatVisibleEffects(state)));
  return lines.length > 0 ? ["", ...lines] : [];
}

function presentGroupCombatRecapSnapshot(
  session: GroupCombatSessionRecord,
  recap: GroupCombatSessionRecord["state"]["recap"][number]
): {
  opponentRows: string[];
  actorRows: string[];
  noticeLines: string[];
} {
  const snapshot = expandGroupCombatRecapSnapshot(recap.snapshot, session.state);
  if (!snapshot) {
    return { opponentRows: [], actorRows: [], noticeLines: [] };
  }
  const opponentRows: string[] = [];
  const actorRows: string[] = [];
  const noticeLines: string[] = [];
  for (const [index, row] of snapshot.enemies.entries()) {
    const enemy = session.state.enemies[index];
    if (!enemy) {
      continue;
    }
    opponentRows.push(`👹 ${escapeHtml(enemy.name)} · рівень ${enemy.level ?? "невідомий"} — ❤️ життя ${row.hp}/${enemy.hpMax}`);
    if (row.shieldPoints) {
      noticeLines.push(`🫧 ${escapeHtml(enemy.name)} · щит: ${row.shieldPoints}.`);
    }
    for (const cooldown of row.cooldowns ?? []) {
      noticeLines.push(
        `🫁 ${escapeHtml(getMonsterAbilityLabel(cooldown.id) ?? cooldown.id)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`
      );
    }
  }
  for (const [index, row] of snapshot.participants.entries()) {
    const participant = session.state.participants[index];
    if (!participant) {
      continue;
    }
    actorRows.push(
      `❤️ ${escapeHtml(groupCombatParticipantDisplayName(participant))} · рівень ${participant.level} — ${row.hp}/${participant.hpMax} · 🔮 мана ${row.mana}/${participant.manaMax}${
        snapshot.enemyFocusCharacterId === participant.characterId
          ? " ← 🎯 ціль ворогів"
          : ""
      }`
    );
    for (const cooldown of row.cooldowns ?? []) {
      const skill = getCombatSkillDisplay(cooldown.id);
      noticeLines.push(`🫁 ${skill.icon} ${escapeHtml(skill.name)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`);
    }
    for (const cooldown of row.itemCooldowns ?? []) {
      const item = items.find((candidate) => candidate.id === cooldown.itemId);
      noticeLines.push(
        `🧻 ${escapeHtml(item?.name ?? cooldown.itemId)} відсапується: ще ${formatTurns(cooldown.remainingTurns)}.`
      );
    }
  }
  noticeLines.push(...presentEffectLines(session, snapshot.effects ?? []));
  return { opponentRows, actorRows, noticeLines };
}

function presentGroupCombatRecapActions(
  recap: GroupCombatSessionRecord["state"]["recap"][number],
  session?: GroupCombatSessionRecord,
  compactEnemyNames = false
): string[] {
  const barks = (recap.monsterBarkIds ?? [])
    .map((barkId) => findMonsterBark(barkId))
    .filter((bark) => bark !== null)
    .map((bark) => presentMonsterBarkBlockquote(bark.text));
  const actionLines: string[] = [];
  const defeatedEnemyLines: string[] = [];
  for (const line of recap.lines) {
    const visibleLine = compactEnemyNames && session && !line.startsWith("🧾 Знешкоджено:")
      ? compactGroupCombatEnemyNames(line, session)
      : line;
    const escaped = escapeHtml(visibleLine);
    if (line.startsWith("🧾 Знешкоджено:")) {
      defeatedEnemyLines.push(escaped);
    } else {
      actionLines.push(escaped);
    }
  }
  const lines = [
    ...actionLines,
    ...(actionLines.length > 0 && defeatedEnemyLines.length > 0 ? [""] : []),
    ...defeatedEnemyLines.flatMap((line, index) => index > 0 ? ["", line] : [line])
  ];
  return barks.length > 0 && lines.length > 0
    ? [...barks, "", ...lines]
    : [...barks, ...lines];
}

function compactGroupCombatEnemyNames(
  line: string,
  session: GroupCombatSessionRecord
): string {
  const shortNames = getDistinctShortMonsterNames(session.state.enemies);
  return [...session.state.enemies]
    .sort((left, right) => right.name.length - left.name.length)
    .reduce(
      (result, enemy) =>
        result.split(enemy.name).join(shortNames.get(enemy.order) ?? "Монстр"),
      line
    );
}

function formatLevelPoints(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  return mod10 === 1 && mod100 !== 11
    ? "рівень"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "рівні"
      : "рівнів";
}

function presentEffectLines(
  session: GroupCombatSessionRecord,
  effects: Array<{
    kind: GroupCombatPresentedEffectKind;
    targetKind: "participant" | "enemy";
    targetId: string;
    remainingTurns: number;
  }>
): string[] {
  const shortEnemyNames = getDistinctShortMonsterNames(session.state.enemies);
  return effects.map((effect) => {
    const targetEnemy = effect.targetKind === "enemy"
      ? session.state.enemies.find((candidate) => candidate.id === effect.targetId)
      : undefined;
    const target = effect.targetKind === "participant"
      ? session.state.participants.find((candidate) => candidate.characterId === effect.targetId)?.name
      : targetEnemy
        ? shortEnemyNames.get(targetEnemy.order)
        : undefined;
    const label = presentGroupCombatEffectLabel(effect.kind, effect.targetKind);
    return `${label} · ${escapeHtml(target ?? effect.targetId)}: ще ${formatTurns(effect.remainingTurns)}.`;
  });
}

function presentGroupCombatEffectLabel(
  kind: GroupCombatPresentedEffectKind,
  targetKind: "participant" | "enemy"
): string {
  const polarity = deriveGroupCombatPresentedEffectPolarity(kind, targetKind);
  if (kind === "accuracy") {
    return polarity === "beneficial" ? "🎯 підвищена влучність" : "🌫️ знижена влучність";
  }
  if (kind === "evasion") {
    return polarity === "beneficial" ? "🪽 підвищене ухилення" : "🪨 знижене ухилення";
  }
  if (kind === "outgoing-damage") {
    return polarity === "beneficial" ? "📈 посилена шкода" : "📉 знижена шкода";
  }
  if (kind === "incoming-damage") {
    return polarity === "beneficial" ? "🧱 зменшена вхідна шкода" : "📒 збільшена вхідна шкода";
  }
  if (kind === "crit") {
    return polarity === "beneficial" ? "💢 посилений критичний удар" : "📉 слабший критичний удар";
  }
  if (kind === "status-resistance") {
    return polarity === "beneficial" ? "🧿 підвищена стійкість до станів" : "🫧 знижена стійкість до станів";
  }
  if (kind === "next-attack-bonus") {
    return polarity === "beneficial" ? "⏭️ посилена наступна атака" : "⏭️ ослаблена наступна атака";
  }
  return GROUP_COMBAT_EFFECT_LABELS[kind];
}

const GROUP_COMBAT_EFFECT_LABELS: Record<GroupCombatPresentedEffectKind, string> = {
  guard: "🛡️ захист",
  "response-mitigation": "🌀 послаблення відповіді",
  counter: "↩️ контрудар",
  bleed: "🩸 кровотеча",
  "monster-accuracy-penalty": "🌫️ збита влучність",
  "monster-burn": "🔥 горіння",
  "monster-incoming-damage": "📒 звірено шкоду",
  "monster-damage-reduction": "🧱 укріплення",
  "monster-evasion": "🪽 ухилення",
  "monster-outgoing-damage": "📈 посилена шкода",
  accuracy: "🎯 влучність",
  evasion: "🪽 ухилення",
  "outgoing-damage": "📈 посилена шкода",
  "incoming-damage": "📒 змінена вхідна шкода",
  mark: "🔖 мітка",
  burn: "🔥 горіння",
  "ability-lock": "🔒 заблоковане вміння",
  "mana-cost-pressure": "🔮 дорожча мана",
  reflect: "🪞 відбиття шкоди",
  "status-resistance": "🧿 стійкість до станів",
  flee: "🚧 ускладнений відступ",
  crit: "💢 змінений критичний удар",
  slow: "🐌 сповільнення",
  confusion: "🌀 сплутані цілі",
  "cooldown-pressure": "🫁 довший відсап",
  "next-attack-bonus": "⏭️ посилена наступна атака",
  "repeat-penalty": "🔁 штраф за повтор"
};

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
  if (action.action === "flee") {
    return "спробувати відступити самому";
  }
  if (action.action === "attack") {
    const enemy = session.state.enemies.find((candidate) => candidate.id === action.targetId);
    const shortName = enemy
      ? getDistinctShortMonsterNames(session.state.enemies).get(enemy.order)
      : undefined;
    return shortName ? `вдарити ${escapeHtml(shortName)}` : "вдарити ворога";
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

import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { CharacterEquipmentAbilityActionSummary } from "../../domain/characters/characterSummary";
import {
  buildLevelGrowthBonus,
  createEmptyEquipmentEffectSummary
} from "../../domain/progression/effectiveStats";
import type {
  HeroActiveDrink,
  HeroActivePriestBlessing,
  HeroActiveVarenykSated
} from "../../services/heroService";
import type { ResourceRecoveryNotice } from "../../services/characterResourceService";
import { getLocationName } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";
import { presentLevelBonus } from "./levelGrowthPresenter";
import { presentHeroEquipmentEffectLines } from "./itemEffectPresenter";
import { presentActiveBardInspirationBuff } from "./bardInspirationPresenter";
import { presentTimedStatusLine } from "./timedStatusPresenter";
import { presentActiveVarenykSatedBuff } from "./varenykSatedPresenter";

export function presentShortHero(summary: CharacterSummary): string {
  return [
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}`,
    `Титул: <i>${escapeHtml(summary.title)}</i>`,
    `Рівень <b>${summary.level}</b> · ❤️ ${summary.hpCurrent}/${summary.hpMax} · 🔮 ${summary.manaCurrent}/${summary.manaMax}`,
    `Сила ${summary.stats.strength} · Спритність ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`
  ].join("\n");
}

export function presentHeroRecoveryNotice(notice: ResourceRecoveryNotice): string {
  return [
    `❤️ <b>Здоров’я знову повне: ${notice.hpCurrent}/${notice.hpMax}</b>.`,
    "Корчмар мовчки підсунув кухоль води й записав це як сервіс."
  ].join("\n");
}

export function presentHero(
  summary: CharacterSummary,
  options: {
    activeDrink?: HeroActiveDrink | null;
    activePriestBlessing?: HeroActivePriestBlessing | null;
    activeVarenykSated?: HeroActiveVarenykSated | null;
    activeBardInspiration?: { accuracyBonusPp: number; expiresAt: Date } | null;
    varenykSatedAvailableAt?: Date | null;
    recoveryNotice?: ResourceRecoveryNotice;
    activeCosmeticTitle?: string | null;
    guild?: { crest: string; displayName: string } | null;
    inventoryGoldValue?: number;
  } = {}
): string {
  const progressLine =
    summary.nextLevelXp === null
      ? `Рівень <b>${summary.level}</b> · XP ${summary.xp} · ви дійшли до краю поточної гри`
      : `Рівень <b>${summary.level}</b> · XP ${summary.xp} · до наступного: ${summary.xpToNextLevel} XP`;
  const nextLevelGrowthLine =
    summary.nextLevelXp === null
      ? null
      : presentLevelBonus(
          buildLevelGrowthBonus(
            summary.level,
            summary.level + 1,
            summary.classId,
            summary.raceId,
            summary.path
          )
        );
  const inventoryGoldValue = options.inventoryGoldValue;
  const goldLine =
    inventoryGoldValue === undefined
      ? `👛 Золото: <b>${summary.gold}</b>`
      : `👛 Золото: <b>${summary.gold}</b> <i>${presentWealthAside(summary.gold, inventoryGoldValue)}</i>`;
  const starterHint =
    summary.level < 3
      ? [
          "",
          summary.hpCurrent <= 0
            ? "<i>Далі: перепочити, а тоді вже знову шукати справу чи сутичку.</i>"
            : "<i>Далі: /tavern, /quest або /fight.</i>"
        ]
      : [];
  const equipmentLines = presentHeroEquipmentEffectLines(
    summary.equipmentEffects ?? createEmptyEquipmentEffectSummary()
  );
  const equipmentActionLine = presentHeroEquipmentActionLine(summary.equipmentAbilityActions ?? []);
  const equipmentSummaryLines = [
    ...equipmentLines,
    ...(equipmentActionLine ? [equipmentActionLine] : [])
  ];
  const resourceRecoveryLines = presentResourceRecovery(summary);
  const activeVarenykSated = options.activeVarenykSated &&
    options.activeVarenykSated.expiresAt.getTime() > Date.now()
    ? options.activeVarenykSated
    : null;
  const activeBardInspiration = options.activeBardInspiration &&
    options.activeBardInspiration.expiresAt.getTime() > Date.now()
    ? options.activeBardInspiration
    : null;
  const equipmentAttunements = summary.equipmentAttunements ?? [];
  const activeTimedStatusCount = [
    options.activeDrink,
    options.activePriestBlessing,
    activeVarenykSated,
    activeBardInspiration,
    ...equipmentAttunements
  ].filter(Boolean).length;
  const showIndividualStatusLabels = activeTimedStatusCount <= 1;
  const activeDrinkLine = presentActiveDrink(
    options.activeDrink ?? null,
    showIndividualStatusLabels
  );
  const activePriestBlessingLine = presentActivePriestBlessing(
    options.activePriestBlessing ?? null,
    showIndividualStatusLabels
  );
  const activeVarenykSatedLine = presentActiveVarenykSated(
    activeVarenykSated,
    showIndividualStatusLabels
  );
  const varenykSatedWaitLine = !activeVarenykSated && options.varenykSatedAvailableAt
    ? `🍽️ Нагодувати знову через <b>${formatRemainingMinutes(options.varenykSatedAvailableAt)}</b>.`
    : null;
  const activeBardInspirationLine = activeBardInspiration
    ? presentActiveBardInspirationBuff(
        activeBardInspiration,
        new Date(),
        { showLabel: showIndividualStatusLabels }
      )
    : null;
  const activeTimedStatusLines = [
    activeDrinkLine,
    activePriestBlessingLine,
    activeVarenykSatedLine,
    activeBardInspirationLine,
    ...presentEquipmentAttunementLines(equipmentAttunements, showIndividualStatusLabels)
  ]
    .filter((line): line is string => Boolean(line));
  const activeStatusLines = [
    ...(activeTimedStatusLines.length > 1 ? ["<b>Стани:</b>"] : []),
    ...activeTimedStatusLines,
    ...(varenykSatedWaitLine ? [varenykSatedWaitLine] : [])
  ];

  return [
    ...(options.recoveryNotice
      ? [
          presentHeroRecoveryNotice(options.recoveryNotice),
          ""
        ]
      : []),
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Титул: <i>${escapeHtml(summary.title)}</i>`,
    ...(options.guild
      ? [`Ґільдія: ${escapeHtml(options.guild.crest)} <b>${escapeHtml(options.guild.displayName)}</b>`]
      : []),
    ...(options.activeCosmeticTitle
      ? [`🏷️ Косметичний титул: <i>${escapeHtml(options.activeCosmeticTitle)}</i>`]
      : []),
    ...presentRemortLines(summary),
    "",
    progressLine,
    ...(nextLevelGrowthLine ? [`Зміна: ${nextLevelGrowthLine}`] : []),
    "",
    `❤️ HP ${summary.hpCurrent}/${summary.hpMax} · 🔮 мана ${summary.manaCurrent}/${summary.manaMax}`,
    ...resourceRecoveryLines,
    ...(activeStatusLines.length > 0 ? ["", ...activeStatusLines] : []),
    ...(resourceRecoveryLines.length > 0 || activeStatusLines.length > 0 ? [""] : []),
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    ...(equipmentSummaryLines.length > 0 ? ["", ...equipmentSummaryLines] : []),
    "",
    goldLine,
    "",
    `Зараз пригодник тут: <b>${escapeHtml(getLocationName(summary.currentLocationId ?? ""))}</b>.`,
    ...starterHint
  ].join("\n");
}

function presentHeroEquipmentActionLine(
  actions: readonly CharacterEquipmentAbilityActionSummary[]
): string | null {
  if (actions.length === 0) {
    return null;
  }

  return `✨ Дія спорядження: ${actions.map((action) => `<b>${escapeHtml(action.label)}</b>`).join(" · ")}`;
}

function presentRemortLines(summary: CharacterSummary): string[] {
  const count = summary.remortCount ?? 0;
  const memoryRank = summary.remortMemoryRank ?? 0;

  if (count <= 0 && memoryRank <= 0) {
    return [];
  }

  return [
    "",
    `🕯️ Памʼять минулих пригод: <b>${count}</b>`
  ];
}

export function presentHeroMissing(): string {
  return "Пригодника ще немає. Напишіть /start, і Квестарня знайде вам куток біля каміна.";
}

function presentResourceRecovery(summary: CharacterSummary): string[] {
  const recovery = summary.resourceRecovery;

  if (!recovery) {
    return [];
  }

  const parts = [
    recovery.hpSecondsToFull > 0 ? `HP за ~${presentDuration(recovery.hpSecondsToFull)}` : null,
    recovery.manaSecondsToFull > 0 ? `мана за ~${presentDuration(recovery.manaSecondsToFull)}` : null
  ].filter((part): part is string => part !== null);
  const lines = parts.length > 0 ? [`Відновлення: ${parts.join(" · ")}`] : [];

  if (summary.hpCurrent <= 0) {
    lines.push("Стан: HP 0 — спершу відпочиньте; бій дочекається хоча б 1 HP.");
  }

  return lines;
}

function presentActivePriestBlessing(
  blessing: HeroActivePriestBlessing | null,
  showLabel = true
): string | null {
  if (!blessing) {
    return null;
  }

  return presentTimedStatusLine({
    emoji: "✨",
    name: "Жрецьке благословення",
    remaining: formatRemainingMinutes(blessing.expiresAt),
    ...(showLabel ? {} : { label: null }),
    tailHtml: ` — дає <b>+${blessing.bonusAmount} ${presentStatBonusLabel(blessing.bonusStat)}</b>`
  });
}

function presentActiveVarenykSated(
  sated: HeroActiveVarenykSated | null,
  showLabel = true
): string | null {
  return sated
    ? presentActiveVarenykSatedBuff(
        sated.expiresAt,
        sated.rank,
        new Date(),
        showLabel ? "Стан: <b>Ситий</b>" : "<b>Ситий</b>"
      )
    : null;
}

function presentActiveDrink(drink: HeroActiveDrink | null, showLabel = true): string | null {
  if (!drink) {
    return null;
  }

  const effects = presentActiveDrinkEffects(drink);
  const effectText = effects.length > 0 ? ` — ${effects.join(", ")}` : "";

  return presentTimedStatusLine({
    emoji: drink.emoji,
    label: showLabel ? "Баф" : null,
    name: drink.name,
    remaining: formatRemainingMinutes(drink.expiresAt),
    tailHtml: effectText
  });
}

function presentEquipmentAttunementLines(
  attunements: NonNullable<CharacterSummary["equipmentAttunements"]>,
  showLabel = true
): string[] {
  return attunements.map((attunement) => presentTimedStatusLine({
    emoji: "✨",
    name: `Налаштування на ${attunement.itemName}`,
    remaining: formatRemainingMinutes(attunement.readyAt),
    ...(showLabel ? {} : { label: null })
  }));
}

function presentActiveDrinkEffects(drink: HeroActiveDrink): string[] {
  if (drink.phase === "queued") {
    return ["чекає бою з монстром", "завдана й отримана шкода <b>+13%</b>"];
  }

  const effects: string[] = [];

  if (drink.recoveryMultiplierBp && drink.recoveryMultiplierBp !== 10000) {
    effects.push(`відновлення швидше на <b>${formatRecoveryBonusPercent(drink.recoveryMultiplierBp)}%</b>`);
  }

  if (drink.accuracyPenaltyPp) {
    effects.push(`точність <b>−${drink.accuracyPenaltyPp}</b>`);
  }

  return effects;
}

function presentStatBonusLabel(stat: HeroActivePriestBlessing["bonusStat"]): string {
  switch (stat) {
    case "strength":
      return "Сили";
    case "dexterity":
      return "Спритності";
    case "intelligence":
      return "Розуму";
    case "charisma":
      return "Харизми";
    case "luck":
      return "Вдачі";
  }
}

function formatRecoveryBonusPercent(multiplierBp: number): number {
  return Math.round((multiplierBp - 10_000) / 100);
}

function formatRemainingMinutes(expiresAt: Date): string {
  const remainingMinutes = Math.ceil((expiresAt.getTime() - Date.now()) / 60_000);

  if (remainingMinutes <= 0) {
    return "менше 1 хв";
  }

  return `${remainingMinutes} хв`;
}

function presentDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.ceil(safeSeconds / 60);

  if (minutes <= 1) {
    return "1 хв";
  }

  return `${minutes} хв`;
}

function presentWealthAside(gold: number, inventoryGoldValue: number): string {
  if (gold <= 0 && inventoryGoldValue <= 0) {
    return "(і в манатках ще 0; корчмар поставив риску в графі «надії»)";
  }

  if (gold <= 0) {
    return `(золота 0, зате в манатках ще ${inventoryGoldValue}; корчмар примружився на майбутню бухгалтерію)`;
  }

  if (inventoryGoldValue <= 0) {
    return "(а в манатках ще 0; торба чесна, аж нудно)";
  }

  return `(а в манатках ще ${inventoryGoldValue}; корчмар уже примружився)`;
}

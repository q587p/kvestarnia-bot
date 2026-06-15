import type { ItemEffectContent } from "../../content/schema";
import type { EquipmentEffectSummary } from "../../domain/progression/effectiveStats";

export function presentItemEffect(effect?: ItemEffectContent): string | null {
  if (!effect) {
    return null;
  }

  const parts = [
    effect.hpMax ? `+${effect.hpMax} HP` : null,
    effect.manaMax ? `+${effect.manaMax} мани` : null,
    effect.strength ? `+${effect.strength} Сили` : null,
    effect.dexterity ? `+${effect.dexterity} Спритности` : null,
    effect.intelligence ? `+${effect.intelligence} Розуму` : null,
    effect.charisma ? `+${effect.charisma} Харизми` : null,
    effect.luck ? `+${effect.luck} Вдачі` : null,
    effect.armor ? `+${effect.armor} до захисту` : null,
    effect.resist ? `+${effect.resist} до опору` : null,
    effect.weaponDamage ? `+${effect.weaponDamage} до удару` : null,
    effect.spellPower ? `+${effect.spellPower} до заклять` : null
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function presentHeroEquipmentEffectLines(summary: EquipmentEffectSummary): string[] {
  const lines: string[] = [];
  const statParts = [
    summary.hpMax ? `+${summary.hpMax} HP` : null,
    summary.manaMax ? `+${summary.manaMax} мани` : null,
    summary.stats.strength ? `+${summary.stats.strength} Сили` : null,
    summary.stats.dexterity ? `+${summary.stats.dexterity} Спритності` : null,
    summary.stats.intelligence ? `+${summary.stats.intelligence} Розуму` : null,
    summary.stats.charisma ? `+${summary.stats.charisma} Харизми` : null,
    summary.stats.luck ? `+${summary.stats.luck} Вдачі` : null
  ].filter((part): part is string => Boolean(part));

  if (statParts.length > 0) {
    lines.push(`🎒 Манатки: ${statParts.join(" · ")}`);
  }

  if (summary.armor > 0 || summary.resist > 0) {
    const defense = [
      summary.armor ? `+${summary.armor} до захисту` : null,
      summary.resist ? `+${summary.resist} до опору` : null
    ].filter((part): part is string => Boolean(part));
    lines.push(`🛡️ Захист спорядження: ${defense.join(" · ")}`);
  }

  if (summary.weaponDamage > 0) {
    lines.push(`🗡️ Зброя: +${summary.weaponDamage} до удару`);
  }

  if (summary.spellPower > 0) {
    lines.push(`🔮 Фокус: +${summary.spellPower} до заклять`);
  }

  return lines;
}

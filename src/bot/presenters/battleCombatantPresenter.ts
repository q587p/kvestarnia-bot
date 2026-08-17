import { escapeHtml } from "./telegramHtml";

type BattleResourceValue = number | string;

export interface BattleCombatantResourceLineInput {
  icon?: string;
  guildCrest?: string | null | undefined;
  name: string;
  hp: BattleResourceValue;
  hpMax: BattleResourceValue;
  mana?: BattleResourceValue;
  manaMax?: BattleResourceValue;
  afterTurn?: boolean;
  knockedOut?: boolean;
  targetLabel?: string | undefined;
  escapeName?: boolean;
  showHpLabel?: boolean;
}

export function presentBattleCombatantResourceLine(input: BattleCombatantResourceLineInput): string {
  const name = input.escapeName === false ? input.name : escapeHtml(input.name);
  const prefix = input.icon ? `${input.icon} ` : "";
  const guildCrest = input.guildCrest ? `${escapeHtml(input.guildCrest)} ` : "";
  const turnSuffix = input.afterTurn ? " після ходу" : "";
  const hp = `${input.showHpLabel ? "HP " : ""}${input.hp}/${input.hpMax}`;
  const mana = input.mana !== undefined || input.manaMax !== undefined
    ? ` · мана ${input.mana ?? "?"}/${input.manaMax ?? "?"}`
    : "";
  const knockedOut = input.knockedOut ? " · вибито" : "";
  const target = input.targetLabel ? ` ← ${input.targetLabel}` : "";

  return `${prefix}${guildCrest}${name}${turnSuffix}: ${hp}${mana}${knockedOut}${target}`;
}

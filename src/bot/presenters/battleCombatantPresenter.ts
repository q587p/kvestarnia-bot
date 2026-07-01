import { escapeHtml } from "./telegramHtml";

type BattleResourceValue = number | string;

export interface BattleCombatantResourceLineInput {
  icon: string;
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
  const turnSuffix = input.afterTurn ? " після ходу" : "";
  const hp = `${input.showHpLabel ? "HP " : ""}${input.hp}/${input.hpMax}`;
  const mana = input.mana !== undefined || input.manaMax !== undefined
    ? ` · мана ${input.mana ?? "?"}/${input.manaMax ?? "?"}`
    : "";
  const knockedOut = input.knockedOut ? " · вибито" : "";
  const target = input.targetLabel ? ` ← ${input.targetLabel}` : "";

  return `${input.icon} ${name}${turnSuffix}: ${hp}${mana}${knockedOut}${target}`;
}

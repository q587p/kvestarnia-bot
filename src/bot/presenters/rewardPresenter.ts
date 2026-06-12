import { presentItemNameWithQuantity } from "./itemStackPresenter";

export interface RewardAmountInput {
  xp: number;
  gold: number;
  label?: string;
}

export function presentRewardAmount(input: RewardAmountInput): string {
  const amount = input.gold <= 0 ? `+${input.xp} XP` : `+${input.xp} XP · +${input.gold} золота`;

  if (!input.label) {
    return `<b>${amount}</b>`;
  }

  return `${input.label}: <b>${amount}</b>`;
}

export function presentRewardItemGrant(input: { name: string; quantity: number }): string {
  return `Здобуто: <i>${presentItemNameWithQuantity(input)}</i>`;
}

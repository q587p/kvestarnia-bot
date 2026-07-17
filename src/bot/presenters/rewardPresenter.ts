import { presentItemNameWithQuantity } from "./itemStackPresenter";

export interface RewardAmountInput {
  xp: number;
  gold: number;
  label?: string;
}

export function presentRewardAmount(input: RewardAmountInput): string {
  const amount = input.gold <= 0 ? `+${input.xp} XP` : `+${input.xp} XP\n+${input.gold} золота`;

  if (!input.label) {
    return `<b>${amount}</b>`;
  }

  return `${input.label}:\n<b>${amount}</b>`;
}

export function presentQuestRewardAmount(input: Pick<RewardAmountInput, "xp" | "gold">): string {
  return ["<i>Отримано:</i>", ...presentQuestRewardLines(input)].join("\n");
}

export function presentRewardItemGrant(input: { name: string; quantity: number }): string {
  return `Здобуто: <i>${presentItemNameWithQuantity(input)}</i>`;
}

export function presentQuestRewardBlock(input: Pick<RewardAmountInput, "xp" | "gold"> & {
  itemGrants: ReadonlyArray<{ name: string; quantity: number }>;
}): string {
  const itemGrantLines = input.itemGrants.map(presentRewardItemGrant);

  return [
    presentQuestRewardAmount(input),
    ...(itemGrantLines.length > 0 ? ["", ...itemGrantLines] : [])
  ].join("\n");
}

function presentQuestRewardLines(input: Pick<RewardAmountInput, "xp" | "gold">): string[] {
  if (input.xp <= 0 && input.gold <= 0) {
    return ["0 XP", "0 золота"];
  }

  return [
    input.xp > 0 ? `+${input.xp} XP` : null,
    input.gold > 0 ? `+${input.gold} золота` : null
  ].filter((line): line is string => Boolean(line));
}

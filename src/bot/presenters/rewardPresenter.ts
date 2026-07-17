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

export function presentRewardItemGrant(
  input: { name: string; quantity: number },
  options: { label?: string } = {}
): string {
  return `${options.label ?? "Здобуто"}: <i>${presentItemNameWithQuantity(input)}</i>`;
}

export function presentRewardItemBlock(
  itemGrants: ReadonlyArray<{ name: string; quantity: number }>,
  options: { label?: string } = {}
): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return [
    "",
    ...itemGrants.map((grant) => presentRewardItemGrant(grant, options))
  ];
}

export function presentRewardBlock(input: RewardAmountInput & {
  itemGrants: ReadonlyArray<{ name: string; quantity: number }>;
  itemLabel?: string;
}): string {
  return [
    presentRewardAmount(input),
    ...presentRewardItemBlock(
      input.itemGrants,
      input.itemLabel === undefined ? {} : { label: input.itemLabel }
    )
  ].join("\n");
}

export function presentQuestRewardBlock(input: Pick<RewardAmountInput, "xp" | "gold"> & {
  itemGrants: ReadonlyArray<{ name: string; quantity: number }>;
}): string {
  return [
    presentQuestRewardAmount(input),
    ...presentRewardItemBlock(input.itemGrants)
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

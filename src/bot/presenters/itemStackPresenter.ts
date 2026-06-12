export interface ItemStackLineInput {
  name: string;
  quantity: number;
}

export function presentItemStackLine(input: ItemStackLineInput): string {
  return `• ${presentItemNameWithQuantity(input)}`;
}

export function presentItemNameWithQuantity(input: ItemStackLineInput): string {
  const quantity = Math.max(1, Math.floor(input.quantity));

  if (quantity === 1) {
    return input.name;
  }

  return `${input.name} ×${quantity}`;
}

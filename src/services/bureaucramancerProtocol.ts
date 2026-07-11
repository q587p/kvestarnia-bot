export const BUREAUCRAMANCER_PROTOCOL_KIND = "bureaucramancer-personal-protocol-13b";
export const BUREAUCRAMANCER_PROTOCOL_CLASS_ID = "class.bureaucramancer";
export const BUREAUCRAMANCER_PROTOCOL_MIN_LEVEL = 3;
export const BUREAUCRAMANCER_PROTOCOL_BASE_MANA_COST = 8;
export const BUREAUCRAMANCER_PROTOCOL_MAX_MANA_DISCOUNT = 3;
export const BUREAUCRAMANCER_PROTOCOL_COOLDOWN_MINUTES = 93;
export const BUREAUCRAMANCER_PROTOCOL_COOLDOWN_KEY = "class.bureaucramancer.personal-protocol-13b.cooldown";

export function calculateBureaucramancerProtocolManaCost(input: {
  level: number;
  intelligence: number;
}): number {
  const paperworkScore = Math.max(0, Math.floor(input.level)) + Math.max(0, Math.floor(input.intelligence));
  const discount = Math.min(BUREAUCRAMANCER_PROTOCOL_MAX_MANA_DISCOUNT, Math.floor(paperworkScore / 8));

  return BUREAUCRAMANCER_PROTOCOL_BASE_MANA_COST - discount;
}

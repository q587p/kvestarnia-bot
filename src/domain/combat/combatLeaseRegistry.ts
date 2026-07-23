export const SOLO_COMBAT_LEASE_KIND = "solo-combat";
export const TURN_BASED_DUEL_LEASE_KIND = "turn-based-duel";
export const PARTY_BOSS_LEASE_KIND = "party-boss";
export const GROUP_COMBAT_LEASE_KIND = "group-combat";

export const COMBAT_LEASE_KINDS = [
  SOLO_COMBAT_LEASE_KIND,
  TURN_BASED_DUEL_LEASE_KIND,
  PARTY_BOSS_LEASE_KIND,
  GROUP_COMBAT_LEASE_KIND
] as const;

export type CombatLeaseKind = (typeof COMBAT_LEASE_KINDS)[number];

export interface CombatLeaseOwnerDescriptor {
  kind: CombatLeaseKind;
  owner: "solo-session" | "turn-based-duel" | "party-boss" | "group-combat";
  repairOwner: "solo-session" | "turn-based-duel" | "party-boss" | "group-combat";
  remortPolicy: "expire-and-release" | "block";
}

export const COMBAT_LEASE_OWNER_REGISTRY: Readonly<Record<CombatLeaseKind, CombatLeaseOwnerDescriptor>> = {
  [SOLO_COMBAT_LEASE_KIND]: {
    kind: SOLO_COMBAT_LEASE_KIND,
    owner: "solo-session",
    repairOwner: "solo-session",
    remortPolicy: "expire-and-release"
  },
  [TURN_BASED_DUEL_LEASE_KIND]: {
    kind: TURN_BASED_DUEL_LEASE_KIND,
    owner: "turn-based-duel",
    repairOwner: "turn-based-duel",
    remortPolicy: "block"
  },
  [PARTY_BOSS_LEASE_KIND]: {
    kind: PARTY_BOSS_LEASE_KIND,
    owner: "party-boss",
    repairOwner: "party-boss",
    remortPolicy: "block"
  },
  [GROUP_COMBAT_LEASE_KIND]: {
    kind: GROUP_COMBAT_LEASE_KIND,
    owner: "group-combat",
    repairOwner: "group-combat",
    remortPolicy: "block"
  }
};

export function isCombatLeaseKind(value: string): value is CombatLeaseKind {
  return Object.prototype.hasOwnProperty.call(COMBAT_LEASE_OWNER_REGISTRY, value);
}

export function getCombatLeaseOwnerDescriptor(value: string): CombatLeaseOwnerDescriptor | null {
  return isCombatLeaseKind(value) ? COMBAT_LEASE_OWNER_REGISTRY[value] : null;
}

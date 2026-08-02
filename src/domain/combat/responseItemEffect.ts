export interface CombatResponseItemEffect {
  kind: "guard" | "evade";
  percent: number;
}

export interface CombatResponseActualEffect {
  damage: number;
  harmfulOnHitConsequenceCount: number;
}

export interface CombatResponseItemDelta {
  eligible: boolean;
  damageBefore: number;
  damageAfter: number;
  preventedDamage: number;
  preventedHarmfulOnHitConsequenceCount: number;
  suppressHarmfulOnHitConsequences: boolean;
}

export function resolveCombatResponseItemDelta(
  actualEffect: CombatResponseActualEffect,
  effect: CombatResponseItemEffect | undefined
): CombatResponseItemDelta {
  const damageBefore = Math.max(0, Math.floor(actualEffect.damage));
  const harmfulOnHitConsequenceCount = Math.max(
    0,
    Math.floor(actualEffect.harmfulOnHitConsequenceCount)
  );
  if (!effect) {
    return {
      eligible: false,
      damageBefore,
      damageAfter: damageBefore,
      preventedDamage: 0,
      preventedHarmfulOnHitConsequenceCount: 0,
      suppressHarmfulOnHitConsequences: false
    };
  }

  const preventedDamage = effect.kind === "evade"
    ? damageBefore
    : Math.min(
        damageBefore,
        Math.floor(damageBefore * Math.max(0, Math.min(100, Math.floor(effect.percent))) / 100)
      );
  const preventedHarmfulOnHitConsequenceCount = effect.kind === "evade"
    ? harmfulOnHitConsequenceCount
    : 0;
  const eligible = preventedDamage > 0 || preventedHarmfulOnHitConsequenceCount > 0;

  return {
    eligible,
    damageBefore,
    damageAfter: eligible ? damageBefore - preventedDamage : damageBefore,
    preventedDamage: eligible ? preventedDamage : 0,
    preventedHarmfulOnHitConsequenceCount: eligible
      ? preventedHarmfulOnHitConsequenceCount
      : 0,
    suppressHarmfulOnHitConsequences: eligible && effect.kind === "evade"
  };
}

export interface CombatResponseItemEffect {
  kind: "guard" | "evade";
  percent: number;
}

export interface CombatResponseItemDelta {
  eligible: boolean;
  damageBefore: number;
  damageAfter: number;
  preventedDamage: number;
  suppressHarmfulOnHitConsequences: boolean;
}

export function resolveCombatResponseItemDelta(
  damage: number,
  effect: CombatResponseItemEffect | undefined,
  hasHarmfulOnHitConsequence = false
): CombatResponseItemDelta {
  const damageBefore = Math.max(0, Math.floor(damage));
  if (!effect) {
    return {
      eligible: false,
      damageBefore,
      damageAfter: damageBefore,
      preventedDamage: 0,
      suppressHarmfulOnHitConsequences: false
    };
  }

  const preventedDamage = effect.kind === "evade"
    ? damageBefore
    : Math.min(
        damageBefore,
        Math.floor(damageBefore * Math.max(0, Math.min(100, Math.floor(effect.percent))) / 100)
      );
  const eligible = preventedDamage > 0 || (effect.kind === "evade" && hasHarmfulOnHitConsequence);

  return {
    eligible,
    damageBefore,
    damageAfter: eligible ? damageBefore - preventedDamage : damageBefore,
    preventedDamage: eligible ? preventedDamage : 0,
    suppressHarmfulOnHitConsequences: eligible && effect.kind === "evade"
  };
}

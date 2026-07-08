import type { StatKey } from "../domain/characters/starterStats";
import type {
  CombatDamageKind,
  CombatSkillProfile,
  CombatTargetScope
} from "../domain/combat";
import { getBaseItemIdForUpgradeVariant } from "../domain/itemUpgrades";
import type { ItemContent } from "./schema";

type WeightedMonsterLootEntry = string | { itemId: string; weight?: number };

export type MantokAbilityGrantKind = "combat-action" | "service-perk";
export type MantokCombatAbilityKind =
  | "reinforced-defend"
  | "bleeding-strike"
  | "borrowed-player-ability";
export type MantokServicePerkKind = "ordinary-bandage-convenience";

export interface MantokAbilityGrantDefinition {
  id: string;
  key: string;
  itemId: string;
  minLevel: number;
  kind: MantokAbilityGrantKind;
  label: string;
  buttonLabel?: string;
  description: string;
  borrowedFrom?: string;
  combat?: MantokCombatAbilityGrant;
  perk?: MantokServicePerkGrant;
}

export interface MantokCombatAbilityGrant {
  kind: MantokCombatAbilityKind;
  profile: CombatSkillProfile;
  bleed?: {
    damagePerActivation: number;
    remainingHeroActivations: number;
  };
}

export interface MantokServicePerkGrant {
  kind: MantokServicePerkKind;
  note: string;
}

export const mantokAbilityGrantItemContents = [
  {
    id: "item.ability.last-page-rapier",
    name: "Рапіра останньої сторінки",
    description:
      "Ставить фінальну крапку там, де монстр ще планував довгу службову відповідь.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 158,
    tags: ["soulbound"],
    equipmentRequirements: {
      minLevel: 13
    },
    effect: {
      weaponDamage: 4,
      charisma: 1,
      luck: 1
    }
  }
] as const satisfies readonly ItemContent[];

export const mantokAbilityGrantDefinitions = [
  {
    id: "mantok-ability.barrel-counter-shield",
    key: "bcshield",
    itemId: "item.set.barrel-brother.shield",
    minLevel: 9,
    kind: "combat-action",
    label: "🛡 Бочковий контраргумент",
    buttonLabel: "🛡 Контраргумент",
    description: "Посилений захист: хід іде в оборону, відповідь монстра слабшає сильніше.",
    combat: {
      kind: "reinforced-defend",
      profile: gearProfile({
        id: "gear.barrel-counter-shield",
        label: "🛡 Бочковий контраргумент",
        description: "Манатка вчить щит сперечатися замість вас.",
        primaryTargetScope: "self",
        manaCost: 0,
        cooldownOwnActions: 3,
        damageKind: "physical",
        stat: "strength",
        baseDamage: 0,
        multiplier: 0,
        monsterDamageReduction: 4,
        guardReduction: 2,
        recipe: ["ally-guard", "response-mitigation"],
        tags: ["equipment", "defense", "guard"]
      })
    }
  },
  {
    id: "mantok-ability.red-line-dagger",
    key: "rldagr",
    itemId: "item.set.red-line.left-dagger",
    minLevel: 10,
    kind: "combat-action",
    label: "🩸 Червоний рядок",
    buttonLabel: "🩸 Червоний рядок",
    description: "Точний удар лишає малий видимий кровоточивий рядок.",
    combat: {
      kind: "bleeding-strike",
      profile: gearProfile({
        id: "gear.red-line-dagger",
        label: "🩸 Червоний рядок",
        description: "Кинджал редагує проблему з коротким післясмаком.",
        primaryTargetScope: "single-enemy",
        manaCost: 1,
        cooldownOwnActions: 3,
        damageKind: "physical",
        stat: "dexterity",
        baseDamage: 2,
        multiplier: 0.58,
        accuracyBonus: 0.05,
        critBonus: 0.02,
        recipe: ["direct-damage"],
        tags: ["equipment", "direct", "bleed"]
      }),
      bleed: {
        damagePerActivation: 1,
        remainingHeroActivations: 3
      }
    }
  },
  {
    id: "mantok-ability.last-page-rapier",
    key: "lprapr",
    itemId: "item.ability.last-page-rapier",
    minLevel: 13,
    kind: "combat-action",
    label: "🖋 Остання сторінка",
    buttonLabel: "🖋 Остання сторінка",
    description: "Соціяльний укол з малою кровотечею для фінальної бюрократії.",
    combat: {
      kind: "bleeding-strike",
      profile: gearProfile({
        id: "gear.last-page-rapier",
        label: "🖋 Остання сторінка",
        description: "Рапіра натякає, що протокол уже майже закритий.",
        primaryTargetScope: "single-enemy",
        manaCost: 2,
        cooldownOwnActions: 3,
        damageKind: "social",
        stat: "charisma",
        baseDamage: 1,
        multiplier: 0.52,
        accuracyBonus: 0.06,
        critBonus: 0.02,
        recipe: ["direct-damage"],
        tags: ["equipment", "direct", "bleed", "social"]
      }),
      bleed: {
        damagePerActivation: 1,
        remainingHeroActivations: 3
      }
    }
  },
  {
    id: "mantok-ability.unscheduled-harp",
    key: "harpcp",
    itemId: "item.set.couplet.harp",
    minLevel: 10,
    kind: "combat-action",
    label: "🎶 Незамовлений куплет",
    buttonLabel: "🎶 Куплет",
    borrowedFrom: "Бард",
    description: "Позичена бардівська дія: слабший соціяльний удар по всіх ворогах.",
    combat: {
      kind: "borrowed-player-ability",
      profile: gearProfile({
        id: "gear.unscheduled-harp-couplet",
        label: "🎶 Незамовлений куплет",
        description: "Манатка грає куплет без бардівської ліцензії.",
        primaryTargetScope: "all-enemies",
        secondaryTargetScope: "all-allies-including-self",
        manaCost: 5,
        cooldownOwnActions: 4,
        damageKind: "social",
        stat: "charisma",
        baseDamage: 1,
        multiplier: 0.52,
        accuracyBonus: 0.06,
        critBonus: 0.01,
        monsterDamageReduction: 1,
        guardReduction: 1,
        recipe: ["all-enemies-damage", "ally-guard"],
        tags: ["equipment", "borrowed", "bard", "aoe", "support"]
      })
    }
  },
  {
    id: "mantok-ability.asclepius-staff",
    key: "ascstf",
    itemId: "item.set.asclepius.staff",
    minLevel: 11,
    kind: "combat-action",
    label: "⚕️ Інструкція Асклепія",
    buttonLabel: "⚕️ Інструкція",
    borrowedFrom: "Жрець",
    description: "Позичене жрецьке лікування: слабше, дорожче і без благословень.",
    combat: {
      kind: "borrowed-player-ability",
      profile: gearProfile({
        id: "gear.asclepius-instruction",
        label: "⚕️ Інструкція Асклепія",
        description: "Посох лікує за інструкцією і дуже боїться гарантій.",
        primaryTargetScope: "lowest-hp-ally",
        secondaryTargetScope: "all-allies-including-self",
        manaCost: 5,
        cooldownOwnActions: 4,
        damageKind: "spell",
        stat: "charisma",
        baseDamage: 1,
        multiplier: 0.38,
        accuracyBonus: 0.04,
        healAmount: 4,
        guardReduction: 1,
        monsterDamageReduction: 1,
        recipe: ["direct-damage", "ally-heal", "ally-guard", "response-mitigation"],
        tags: ["equipment", "borrowed", "priest", "heal", "support"]
      })
    }
  },
  {
    id: "mantok-ability.form-13-bis-seal",
    key: "f13bis",
    itemId: "item.set.form13bis.seal",
    minLevel: 11,
    kind: "combat-action",
    label: "📄 Форма 13-біс",
    buttonLabel: "📄 13-біс",
    borrowedFrom: "Бюрокромант",
    description: "Позичений контроль: менше шкоди і менше службового пом'якшення.",
    combat: {
      kind: "borrowed-player-ability",
      profile: gearProfile({
        id: "gear.form-13-bis",
        label: "📄 Форма 13-біс",
        description: "Печатка пояснює ворогам, що шкода поки на розгляді.",
        primaryTargetScope: "all-enemies",
        manaCost: 5,
        cooldownOwnActions: 4,
        damageKind: "social",
        stat: "intelligence",
        baseDamage: 1,
        multiplier: 0.56,
        accuracyBonus: 0.06,
        monsterDamageReduction: 1,
        recipe: ["all-enemies-damage", "response-mitigation"],
        tags: ["equipment", "borrowed", "bureaucramancer", "control"]
      })
    }
  },
  {
    id: "mantok-ability.siege-filling-ladle",
    key: "ladle",
    itemId: "item.set.siege-filling.ladle",
    minLevel: 12,
    kind: "combat-action",
    label: "🥟 Облога начинки",
    buttonLabel: "🥟 Облога",
    borrowedFrom: "Вареникознавець",
    description: "Позичена начинка: менша пара, скромніше лікування, той самий хід.",
    combat: {
      kind: "borrowed-player-ability",
      profile: gearProfile({
        id: "gear.siege-filling",
        label: "🥟 Облога начинки",
        description: "Ополоник розносить пару, але не видає диплома вареникознавця.",
        primaryTargetScope: "all-enemies",
        secondaryTargetScope: "single-ally-or-self",
        manaCost: 5,
        cooldownOwnActions: 4,
        damageKind: "spell",
        stat: "intelligence",
        baseDamage: 1,
        multiplier: 0.58,
        accuracyBonus: 0.04,
        healAmount: 2,
        recipe: ["all-enemies-damage", "self-heal"],
        tags: ["equipment", "borrowed", "varenyk", "aoe", "self-heal"]
      })
    }
  },
  {
    id: "mantok-ability.foreign-border-compass",
    key: "border",
    itemId: "item.set.border-map.compass",
    minLevel: 12,
    kind: "combat-action",
    label: "🌀 Чужа Межа",
    buttonLabel: "🌀 Межа",
    borrowedFrom: "Дрантогор",
    description: "Позичений межовий крок: малий трюк і крихітне пом'якшення відповіді.",
    combat: {
      kind: "borrowed-player-ability",
      profile: gearProfile({
        id: "gear.foreign-border-step",
        label: "🌀 Чужа Межа",
        description: "Компас показує коротший шлях до незручности ворога.",
        primaryTargetScope: "single-enemy",
        manaCost: 2,
        cooldownOwnActions: 5,
        damageKind: "trick",
        stat: "luck",
        baseDamage: 2,
        multiplier: 0.58,
        accuracyBonus: 0.04,
        critBonus: 0.02,
        monsterDamageReduction: 1,
        recipe: ["direct-damage", "response-mitigation"],
        tags: ["equipment", "borrowed", "drantohor", "direct"]
      })
    }
  },
  {
    id: "mantok-ability.fog-amulet-pin",
    key: "fogpin",
    itemId: "item.set.fog-knot.amulet",
    minLevel: 11,
    kind: "combat-action",
    label: "🧿 Туманна шпилька",
    buttonLabel: "🧿 Шпилька",
    borrowedFrom: "Мольфарська душа",
    description: "Позичений оберіг: менший захист і менший контрудар.",
    combat: {
      kind: "borrowed-player-ability",
      profile: gearProfile({
        id: "gear.fog-amulet-pin",
        label: "🧿 Туманна шпилька",
        description: "Шпилька ставить туман, але не замінює душу.",
        primaryTargetScope: "all-allies-including-self",
        manaCost: 2,
        cooldownOwnActions: 5,
        damageKind: "trick",
        stat: "luck",
        baseDamage: 0,
        multiplier: 0,
        monsterDamageReduction: 1,
        guardReduction: 1,
        counterDamage: 1,
        recipe: ["ally-guard", "response-mitigation", "counter"],
        tags: ["equipment", "borrowed", "molfar", "guard", "counter"]
      })
    }
  },
  {
    id: "mantok-ability.yeger-disguise-cloak",
    key: "ycloak",
    itemId: "item.set.yeger-shadow.cloak",
    minLevel: 12,
    kind: "service-perk",
    label: "🧥 Чужа єгерська справа",
    description:
      "Вузька службова позначка: майбутній комфорт для звичайних бинтів, без щільних бинтів, аптечок чи дощечок.",
    perk: {
      kind: "ordinary-bandage-convenience",
      note: "Перк задокументовано у фонді; runtime-сервіс відкладено, щоб не розширювати Yeger gates."
    }
  }
] as const satisfies readonly MantokAbilityGrantDefinition[];

export const mantokAbilityGrantLootAdditions = {
  "monster.three-signature-chimera": [{ itemId: "item.set.barrel-brother.shield", weight: 0.035 }],
  "monster.deep-estimate-sawfish": [{ itemId: "item.set.red-line.left-dagger", weight: 0.035 }],
  "monster.quiet-catastrophe-clerk": [{ itemId: "item.ability.last-page-rapier", weight: 0.035 }],
  "monster.promo-perelesnyk": [{ itemId: "item.set.couplet.harp", weight: 0.035 }],
  "monster.tide-accountant-vodyanyk": [{ itemId: "item.set.asclepius.staff", weight: 0.035 }],
  "monster.inventory-prophet": [{ itemId: "item.set.form13bis.seal", weight: 0.035 }],
  "monster.siege-iron-varenyk": [{ itemId: "item.set.siege-filling.ladle", weight: 0.035 }],
  "monster.thirteen-address-dragon-courier": [{ itemId: "item.set.border-map.compass", weight: 0.035 }],
  "monster.calendar-hydra": [{ itemId: "item.set.fog-knot.amulet", weight: 0.035 }],
  "monster.service-path-lisovyk": [{ itemId: "item.set.yeger-shadow.cloak", weight: 0.035 }]
} as const satisfies Readonly<Record<string, readonly WeightedMonsterLootEntry[]>>;

export function findMantokAbilityGrantByKey(key: string): MantokAbilityGrantDefinition | null {
  return mantokAbilityGrantDefinitions.find((grant) => grant.key === key) ?? null;
}

export function findMantokAbilityGrantByItemId(itemId: string): MantokAbilityGrantDefinition | null {
  const baseItemId = getBaseItemIdForUpgradeVariant(itemId);

  return mantokAbilityGrantDefinitions.find((grant) => grant.itemId === baseItemId) ?? null;
}

export function getCombatMantokAbilityGrantsForEquippedItems(input: {
  itemIds: readonly string[];
  characterLevel: number;
  frozenGrantIds?: readonly string[];
}): MantokAbilityGrantDefinition[] {
  const equipped = new Set(input.itemIds.map(getBaseItemIdForUpgradeVariant));
  const frozen = input.frozenGrantIds ? new Set(input.frozenGrantIds) : null;
  const level = Math.max(1, Math.floor(input.characterLevel));

  return mantokAbilityGrantDefinitions.filter((grant) =>
    grant.kind === "combat-action" &&
    grant.combat &&
    equipped.has(grant.itemId) &&
    level >= grant.minLevel &&
    (!frozen || frozen.has(grant.id))
  );
}

export function getCombatMantokAbilityGrantsByIds(input: {
  grantIds: readonly string[];
  characterLevel?: number;
}): MantokAbilityGrantDefinition[] {
  const ids = new Set(input.grantIds);
  const level = input.characterLevel === undefined ? null : Math.max(1, Math.floor(input.characterLevel));

  return mantokAbilityGrantDefinitions.filter((grant) =>
    ids.has(grant.id) &&
    grant.kind === "combat-action" &&
    grant.combat &&
    (level === null || level >= grant.minLevel)
  );
}

function gearProfile(input: {
  id: string;
  label: string;
  description: string;
  primaryTargetScope: CombatTargetScope;
  secondaryTargetScope?: CombatTargetScope;
  damageKind: CombatDamageKind;
  stat: StatKey;
  manaCost: number;
  cooldownOwnActions: number;
  baseDamage: number;
  multiplier: number;
  accuracyBonus?: number;
  critBonus?: number;
  monsterDamageReduction?: number;
  healAmount?: number;
  guardReduction?: number;
  counterDamage?: number;
  recipe: NonNullable<CombatSkillProfile["recipe"]>;
  tags: readonly string[];
}): CombatSkillProfile {
  return {
    ...input,
    source: "equipment",
    action: "gear",
    accuracyBonus: input.accuracyBonus ?? 0,
    critBonus: input.critBonus ?? 0,
    monsterDamageReduction: input.monsterDamageReduction ?? 0,
    criticalFumbleLine:
      "Позичена манаткова дія перечепилася через власну легенду. Пригодник отримує службовий докір.",
    secondaryMultiplier: 0
  };
}

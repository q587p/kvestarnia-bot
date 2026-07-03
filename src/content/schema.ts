import { z } from "zod";

export const contentIdSchema = z.string().regex(/^[a-z]+(\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/);

export const statBlockSchema = z.object({
  strength: z.number().int().min(0),
  dexterity: z.number().int().min(0),
  intelligence: z.number().int().min(0),
  charisma: z.number().int().min(0),
  luck: z.number().int().min(0)
});

export const pronounSchema = z.enum(["he", "she", "they"]);

export const raceSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  statBonus: statBlockSchema.partial(),
  allowedPronouns: z.array(pronounSchema).optional(),
  allowedClasses: z.array(contentIdSchema).optional(),
  blockedClasses: z.array(contentIdSchema).optional(),
  availableInOnboarding: z.boolean().optional(),
  unavailableReasons: z.record(z.string().min(1), z.string().min(1)).optional()
});

export const classSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  primaryStat: z.enum(["strength", "dexterity", "intelligence", "charisma", "luck"]),
  allowedPronouns: z.array(pronounSchema).optional(),
  allowedRaces: z.array(contentIdSchema).optional(),
  blockedRaces: z.array(contentIdSchema).optional(),
  unavailableReasons: z.record(z.string().min(1), z.string().min(1)).optional()
});

export const monsterSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  level: z.number().int().min(1),
  tags: z.array(z.string().min(1)).default([])
});

export const itemRaritySchema = z.enum(["common", "uncommon", "rare", "epic"]);

export const itemTagSchema = z.enum([
  "consumable",
  "one-use",
  "tradeable",
  "trade-blocked",
  "duel-blocked",
  "raid-blocked",
  "story",
  "memory",
  "sentimental",
  "soulbound"
]);

export const itemEffectSchema = z.object({
  hpMax: z.number().int().min(0).max(20).optional(),
  manaMax: z.number().int().min(0).max(20).optional(),
  strength: z.number().int().min(0).max(10).optional(),
  dexterity: z.number().int().min(0).max(10).optional(),
  intelligence: z.number().int().min(0).max(10).optional(),
  charisma: z.number().int().min(0).max(10).optional(),
  luck: z.number().int().min(0).max(10).optional(),
  armor: z.number().int().min(0).max(10).optional(),
  resist: z.number().int().min(0).max(10).optional(),
  weaponDamage: z.number().int().min(0).max(10).optional(),
  spellPower: z.number().int().min(0).max(10).optional()
}).strict().refine((effect) => Object.values(effect).some((value) => value !== undefined), {
  message: "Item effect must contain at least one supported bonus."
});

export const itemUseEffectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("heal-hp"),
    amount: z.number().int().min(1).max(42)
  }).strict(),
  z.object({
    kind: z.literal("heal-hp-to-min-percent"),
    percent: z.number().int().min(1).max(100)
  }).strict()
]);

export const itemSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  rarity: itemRaritySchema,
  slot: z.enum(["weapon", "armor", "accessory", "consumable", "cosmetic", "junk"]),
  goldValue: z.number().int().min(0).optional(),
  priceless: z.boolean().optional(),
  effect: itemEffectSchema.optional(),
  tags: z.array(itemTagSchema).optional(),
  useEffect: itemUseEffectSchema.optional()
}).superRefine((item, ctx) => {
  const hasGoldValue = item.goldValue !== undefined;
  const isPriceless = item.priceless === true;
  const tags = item.tags ?? [];
  const uniqueTags = new Set(tags);

  if (hasGoldValue && isPriceless) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Item cannot have both goldValue and priceless."
    });
  }

  if (!hasGoldValue && !isPriceless) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Item must have goldValue or priceless."
    });
  }

  if (item.effect && !["weapon", "armor", "accessory"].includes(item.slot)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only equippable items can have item effects."
    });
  }

  if (uniqueTags.size !== tags.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Item tags must be unique."
    });
  }

  if (uniqueTags.has("tradeable") && uniqueTags.has("trade-blocked")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Item cannot be both tradeable and trade-blocked."
    });
  }

  if (uniqueTags.has("tradeable") && uniqueTags.has("soulbound")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Item cannot be both tradeable and soulbound."
    });
  }

  if (uniqueTags.has("one-use") && !uniqueTags.has("consumable")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "one-use items must also have the consumable tag."
    });
  }

  if (item.useEffect) {
    if (item.slot !== "consumable") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only consumable items can have use effects."
      });
    }

    if (!uniqueTags.has("consumable") || !uniqueTags.has("one-use")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use effects require consumable and one-use tags."
      });
    }
  }
});

export type RaceContent = z.infer<typeof raceSchema>;
export type ClassContent = z.infer<typeof classSchema>;
export type Pronoun = z.infer<typeof pronounSchema>;
export type MonsterContent = z.infer<typeof monsterSchema>;
export type ItemEffectContent = z.infer<typeof itemEffectSchema>;
export type ItemTagContent = z.infer<typeof itemTagSchema>;
export type ItemUseEffectContent = z.infer<typeof itemUseEffectSchema>;
export type ItemContent = z.infer<typeof itemSchema>;

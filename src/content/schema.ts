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

export const itemSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  rarity: itemRaritySchema,
  slot: z.enum(["weapon", "armor", "accessory", "consumable", "cosmetic", "junk"]),
  goldValue: z.number().int().min(0).optional(),
  priceless: z.boolean().optional()
}).superRefine((item, ctx) => {
  const hasGoldValue = item.goldValue !== undefined;
  const isPriceless = item.priceless === true;

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
});

export type RaceContent = z.infer<typeof raceSchema>;
export type ClassContent = z.infer<typeof classSchema>;
export type Pronoun = z.infer<typeof pronounSchema>;
export type MonsterContent = z.infer<typeof monsterSchema>;
export type ItemContent = z.infer<typeof itemSchema>;

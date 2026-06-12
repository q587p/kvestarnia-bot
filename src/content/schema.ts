import { z } from "zod";

export const contentIdSchema = z.string().regex(/^[a-z]+(\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/);

export const statBlockSchema = z.object({
  strength: z.number().int().min(0),
  dexterity: z.number().int().min(0),
  intelligence: z.number().int().min(0),
  charisma: z.number().int().min(0),
  luck: z.number().int().min(0)
});

export const raceSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  statBonus: statBlockSchema.partial()
});

export const classSchema = z.object({
  id: contentIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  primaryStat: z.enum(["strength", "dexterity", "intelligence", "charisma", "luck"])
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
  slot: z.enum(["weapon", "armor", "accessory", "consumable", "cosmetic", "junk"])
});

export type RaceContent = z.infer<typeof raceSchema>;
export type ClassContent = z.infer<typeof classSchema>;
export type MonsterContent = z.infer<typeof monsterSchema>;
export type ItemContent = z.infer<typeof itemSchema>;

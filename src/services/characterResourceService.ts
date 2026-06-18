import type { ItemContent } from "../content/schema";
import type {
  CharacterRecord,
  CharacterRepository
} from "../db/repositories/characterRepository";
import {
  summarizeCharacter,
  type CharacterSummary
} from "../domain/characters/characterSummary";
import {
  applyPassiveResourceRegeneration,
  type ResourceRegenerationResult
} from "../domain/resources/resourceRegeneration";

export interface CharacterResourceSyncResult {
  character: CharacterSummary;
  regeneration: ResourceRegenerationResult;
  recoveryNotice?: ResourceRecoveryNotice;
}

export interface ResourceRecoveryNotice {
  type: "hp-full";
  hpCurrent: number;
  hpMax: number;
}

export async function summarizeAndSyncCharacterResources(input: {
  characters: CharacterRepository;
  telegramUserId: bigint;
  character: CharacterRecord;
  equippedItems?: ItemContent[];
  remortCount?: number;
  now: Date;
  persist?: boolean;
}): Promise<CharacterResourceSyncResult> {
  const baseSummary = summarizeCharacter(input.character, {
    equippedItems: input.equippedItems ?? [],
    ...(input.remortCount !== undefined ? { remortCount: input.remortCount } : {})
  });
  const regeneration = applyPassiveResourceRegeneration({
    resources: {
      hpCurrent: baseSummary.hpCurrent,
      hpMax: baseSummary.hpMax,
      manaCurrent: baseSummary.manaCurrent,
      manaMax: baseSummary.manaMax,
      ...(input.character.hpRegenAt === undefined ? {} : { hpRegenAt: input.character.hpRegenAt }),
      ...(input.character.manaRegenAt === undefined
        ? {}
        : { manaRegenAt: input.character.manaRegenAt })
    },
    profile: {
      raceId: baseSummary.raceId,
      classId: baseSummary.classId,
      title: baseSummary.title,
      stats: baseSummary.stats
    },
    now: input.now
  });
  const recoveryNotice =
    baseSummary.hpCurrent < baseSummary.hpMax &&
    regeneration.resources.hpCurrent >= regeneration.resources.hpMax
      ? {
          type: "hp-full" as const,
          hpCurrent: regeneration.resources.hpCurrent,
          hpMax: regeneration.resources.hpMax
        }
      : undefined;

  if (input.persist !== false && regeneration.changed) {
    const updated = await input.characters.updateResourcesForTelegramUser?.(input.telegramUserId, {
      hpCurrent: regeneration.resources.hpCurrent,
      manaCurrent: regeneration.resources.manaCurrent,
      hpRegenAt: regeneration.resources.hpRegenAt ?? input.now,
      manaRegenAt: regeneration.resources.manaRegenAt ?? input.now,
      expected: {
        hpCurrent: input.character.hpCurrent,
        manaCurrent: input.character.manaCurrent,
        hpRegenAt: input.character.hpRegenAt ?? null,
        manaRegenAt: input.character.manaRegenAt ?? null
      }
    });

    if (!updated) {
      const latest = await input.characters.findByTelegramUserId(input.telegramUserId);

      if (latest) {
        return summarizeAndSyncCharacterResources({
          ...input,
          character: latest,
          ...(input.remortCount !== undefined || latest.remortCount !== undefined
            ? { remortCount: input.remortCount ?? latest.remortCount }
            : {}),
          persist: false
        });
      }
    }
  }

  return {
    character: {
      ...baseSummary,
      hpCurrent: regeneration.resources.hpCurrent,
      hpMax: regeneration.resources.hpMax,
      manaCurrent: regeneration.resources.manaCurrent,
      manaMax: regeneration.resources.manaMax,
      resourceRecovery: regeneration.recovery
    },
    regeneration,
    ...(recoveryNotice ? { recoveryNotice } : {})
  };
}

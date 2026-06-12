import type { CharacterRepository } from "../db/repositories/characterRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";

export type HeroLookupResult =
  | { state: "no-character" }
  | { state: "existing-character"; character: CharacterSummary };

export class HeroService {
  constructor(private readonly characters: CharacterRepository) {}

  async findByTelegramUserId(telegramUserId: bigint): Promise<HeroLookupResult> {
    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return { state: "no-character" };
    }

    return {
      state: "existing-character",
      character: summarizeCharacter(character)
    };
  }
}

import { classes } from "../content/classes";
import { races } from "../content/races";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { buildStarterStats } from "../domain/characters/starterStats";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { TelegramUserProfile, UserRepository } from "../db/repositories/userRepository";
import { err, ok, type Result } from "../shared/result";

export type StartOnboardingResult =
  | { state: "needs-race-selection" }
  | { state: "existing-character"; character: CharacterSummary };

export type RaceSelectionResult = { raceId: string };

export type CompleteOnboardingResult = {
  character: CharacterSummary;
  created: boolean;
};

export type OnboardingError = "invalid-race" | "invalid-class";

export class OnboardingService {
  constructor(
    private readonly users: UserRepository,
    private readonly characters: CharacterRepository
  ) {}

  async start(player: TelegramUserProfile): Promise<StartOnboardingResult> {
    const user = await this.users.upsertTelegramUser(player);
    const character = await this.characters.findByUserId(user.id);

    if (character) {
      return {
        state: "existing-character",
        character: summarizeCharacter(character)
      };
    }

    return { state: "needs-race-selection" };
  }

  selectRace(raceId: string): Result<RaceSelectionResult, OnboardingError> {
    if (!races.some((race) => race.id === raceId)) {
      return err("invalid-race");
    }

    return ok({ raceId });
  }

  async complete(
    player: TelegramUserProfile,
    raceId: string,
    classId: string
  ): Promise<Result<CompleteOnboardingResult, OnboardingError>> {
    if (!races.some((race) => race.id === raceId)) {
      return err("invalid-race");
    }

    if (!classes.some((characterClass) => characterClass.id === classId)) {
      return err("invalid-class");
    }

    const starterStats = buildStarterStats(raceId, classId);
    const result = await this.characters.createForTelegramUserIfMissing(player, {
      name: normalizeCharacterName(player.displayName),
      raceId,
      classId,
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: starterStats.hpCurrent,
      hpMax: starterStats.hpMax,
      manaCurrent: starterStats.manaCurrent,
      manaMax: starterStats.manaMax,
      statsJson: starterStats.stats
    });

    return ok({
      character: summarizeCharacter(result.character),
      created: result.created
    });
  }
}

export function normalizeCharacterName(displayName: string | undefined): string {
  const trimmed = displayName?.trim();

  if (!trimmed) {
    return "Мандрівник";
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 32);
}

import { classes } from "../content/classes";
import {
  getClassUnavailableReason,
  getRaceUnavailableReason,
  isClassAvailableForChoice,
  isPronoun,
  isRaceAvailableForPronoun
} from "../content/characterOptions";
import { activeRaces } from "../content/races";
import type { Pronoun } from "../content/schema";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { getPathForPronoun } from "../domain/characters/path";
import { buildStarterStats } from "../domain/characters/starterStats";
import type { CharacterRepository } from "../db/repositories/characterRepository";
import type { TelegramUserProfile, UserRepository } from "../db/repositories/userRepository";
import { err, ok, type Result } from "../shared/result";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export type StartOnboardingResult =
  | { state: "needs-gender-selection" }
  | { state: "existing-character"; character: CharacterSummary };

export type RaceSelectionResult = { pronoun: Pronoun; raceId: string };

export type ClassSelectionResult = { pronoun: Pronoun; raceId: string; classId: string };

export type CompleteOnboardingResult = {
  character: CharacterSummary;
  created: boolean;
  achievementUnlocks: AchievementUnlock[];
};

export type OnboardingError =
  | { type: "invalid-pronoun" }
  | { type: "invalid-race" }
  | { type: "invalid-class" }
  | { type: "unavailable-race"; reason: string }
  | { type: "unavailable-class"; reason: string };

export class OnboardingService {
  constructor(
    private readonly users: UserRepository,
    private readonly characters: CharacterRepository,
    private readonly achievements?: AchievementService
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

    return { state: "needs-gender-selection" };
  }

  selectRace(pronoun: string, raceId: string): Result<RaceSelectionResult, OnboardingError> {
    if (!isPronoun(pronoun)) {
      return err({ type: "invalid-pronoun" });
    }

    if (!activeRaces.some((race) => race.id === raceId)) {
      return err({ type: "invalid-race" });
    }

    if (!isRaceAvailableForPronoun(pronoun, raceId)) {
      return err({
        type: "unavailable-race",
        reason: getRaceUnavailableReason(pronoun, raceId)
      });
    }

    return ok({ pronoun, raceId });
  }

  selectClass(
    pronoun: string,
    raceId: string,
    classId: string
  ): Result<ClassSelectionResult, OnboardingError> {
    const raceResult = this.selectRace(pronoun, raceId);

    if (!raceResult.ok) {
      return raceResult;
    }

    if (!classes.some((characterClass) => characterClass.id === classId)) {
      return err({ type: "invalid-class" });
    }

    if (!isClassAvailableForChoice(raceResult.value.pronoun, raceId, classId)) {
      return err({
        type: "unavailable-class",
        reason: getClassUnavailableReason(raceResult.value.pronoun, raceId, classId)
      });
    }

    return ok({
      pronoun: raceResult.value.pronoun,
      raceId,
      classId
    });
  }

  async complete(
    player: TelegramUserProfile,
    pronoun: string,
    raceId: string,
    classId: string
  ): Promise<Result<CompleteOnboardingResult, OnboardingError>> {
    const selection = this.selectClass(pronoun, raceId, classId);

    if (!selection.ok) {
      return selection;
    }

    const starterStats = buildStarterStats(raceId, classId);
    const result = await this.characters.createForTelegramUserIfMissing(player, {
      name: normalizeCharacterName(player.displayName),
      pronoun: selection.value.pronoun,
      path: getPathForPronoun(selection.value.pronoun),
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

    const achievementUnlocks = result.created
      ? (await this.achievements?.trackEventSafely({
          type: "character.created",
          characterId: result.character.id,
          occurredAt: new Date(),
          sourceId: result.character.id
        })) ?? []
      : [];

    return ok({
      character: summarizeCharacter(result.character),
      created: result.created,
      achievementUnlocks
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

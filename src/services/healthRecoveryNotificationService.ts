import type {
  CharacterRepository,
  PassiveHealthRecoveryCandidate
} from "../db/repositories/characterRepository";
import type { HeroService } from "./heroService";

export interface HealthRecoveryNotification {
  telegramUserId: bigint;
  hpCurrent: number;
  hpMax: number;
}

export class HealthRecoveryNotificationService {
  constructor(
    private readonly characters: Pick<CharacterRepository, "listPassiveHealthRecoveryCandidates">,
    private readonly hero: Pick<HeroService, "findByTelegramUserId">
  ) {}

  async listDueHpFullNotifications(
    now: Date,
    options: { limit?: number } = {}
  ): Promise<HealthRecoveryNotification[]> {
    const candidates = await this.listCandidates(now, options);
    const notifications: HealthRecoveryNotification[] = [];

    for (const candidate of candidates) {
      const hero = await this.hero.findByTelegramUserId(candidate.telegramUserId);

      if (hero.state !== "existing-character" || hero.recoveryNotice?.type !== "hp-full") {
        continue;
      }

      notifications.push({
        telegramUserId: candidate.telegramUserId,
        hpCurrent: hero.recoveryNotice.hpCurrent,
        hpMax: hero.recoveryNotice.hpMax
      });
    }

    return notifications;
  }

  private async listCandidates(
    now: Date,
    options: { limit?: number }
  ): Promise<PassiveHealthRecoveryCandidate[]> {
    return this.characters.listPassiveHealthRecoveryCandidates
      ? this.characters.listPassiveHealthRecoveryCandidates(now, options)
      : [];
  }
}

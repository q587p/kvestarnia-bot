import type {
  LevelMilestoneBoard,
  LevelMilestoneRepository
} from "../db/repositories/levelMilestoneRepository";
import type { GuildRepository } from "../db/repositories/guildRepository";

export class LevelMilestoneService {
  constructor(
    private readonly milestones: LevelMilestoneRepository,
    private readonly guildIdentity?: Required<Pick<GuildRepository, "getLiveCrestsForCharacterIds">>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getBoard(): Promise<LevelMilestoneBoard> {
    await this.milestones.backfillCurrentLevels();

    return this.withGuildCrests(await this.milestones.listFirstReachedLevels());
  }

  async getBoardForRemort(remortNumber: number): Promise<LevelMilestoneBoard> {
    await this.milestones.backfillCurrentLevels();

    return this.withGuildCrests(await this.milestones.listFirstReachedLevelsForRemort(remortNumber));
  }

  private async withGuildCrests(board: LevelMilestoneBoard): Promise<LevelMilestoneBoard> {
    if (!this.guildIdentity) return board;
    const entries = board.levels.flatMap((group) => group.entries);
    const crests = await this.guildIdentity.getLiveCrestsForCharacterIds(
      entries.map((entry) => entry.characterId),
      this.now()
    );
    for (const entry of entries) {
      const crest = crests.get(entry.characterId);
      if (crest) entry.guildCrest = crest;
    }
    return board;
  }
}

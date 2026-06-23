import type {
  LevelMilestoneBoard,
  LevelMilestoneRepository
} from "../db/repositories/levelMilestoneRepository";

export class LevelMilestoneService {
  constructor(private readonly milestones: LevelMilestoneRepository) {}

  async getBoard(): Promise<LevelMilestoneBoard> {
    await this.milestones.backfillCurrentLevels();

    return this.milestones.listFirstReachedLevels();
  }

  async getBoardForRemort(remortNumber: number): Promise<LevelMilestoneBoard> {
    await this.milestones.backfillCurrentLevels();

    return this.milestones.listFirstReachedLevelsForRemort(remortNumber);
  }
}

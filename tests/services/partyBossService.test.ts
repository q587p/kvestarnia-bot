import { describe, expect, it, vi } from "vitest";
import type {
  PartyBossActionResult,
  PartyBossRepository,
  PartyBossSessionRecord
} from "../../src/db/repositories/partyBossRepository";
import { BIG_BARREL_BROTHER_BOSS_KEY, BIG_BARREL_BROTHER_RULES_VERSION } from "../../src/domain/partyBoss/partyBoss";
import type { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";
import type { AchievementService } from "../../src/services/achievementService";
import { getCombatItemUseKey } from "../../src/services/combatItemUse";
import { PartyBossService } from "../../src/services/partyBossService";

describe("PartyBossService achievements", () => {
  it("tracks exact Big Barrel Brother settlement achievement events from the repository", async () => {
    const occurredAt = new Date("2026-07-01T19:00:00.000Z");
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const result: PartyBossActionResult = {
      state: "resolved",
      session: makeSession("won"),
      achievementEvents: [
        {
          type: "barrel.raid.claimed",
          characterId: "character-leader",
          sourceId: "daily-win-1",
          occurredAt
        },
        {
          type: "barrel.raid.lost",
          characterId: "character-joiner",
          sourceId: "boss-session-1",
          occurredAt
        },
        {
          type: "barrel.raid.bandage-used",
          characterId: "character-healer",
          sourceId: "boss-action-1",
          occurredAt
        },
        {
          type: "item.used",
          characterId: "character-field-kit",
          itemId: "item.field-kit",
          sourceId: "boss-action-2",
          occurredAt
        }
      ]
    };
    const repository = {
      submitActionForTelegramUser: vi.fn<PartyBossRepository["submitActionForTelegramUser"]>().mockResolvedValue(result)
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => occurredAt,
      { trackEventSafely } as unknown as AchievementService
    );

    await service.submitActionForTelegramUser(123n, "token-1", 1, "attack");

    expect(trackEventSafely).toHaveBeenCalledTimes(4);
    expect(trackEventSafely).toHaveBeenNthCalledWith(1, {
      type: "barrel.raid.claimed",
      characterId: "character-leader",
      occurredAt,
      sourceId: "daily-win-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(2, {
      type: "barrel.raid.lost",
      characterId: "character-joiner",
      occurredAt,
      sourceId: "boss-session-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(3, {
      type: "barrel.raid.bandage-used",
      characterId: "character-healer",
      occurredAt,
      sourceId: "boss-action-1"
    });
    expect(trackEventSafely).toHaveBeenNthCalledWith(4, {
      type: "item.used",
      characterId: "character-field-kit",
      itemId: "item.field-kit",
      occurredAt,
      sourceId: "boss-action-2"
    });
  });

  it("passes field kits through the party-boss combat item path", async () => {
    const occurredAt = new Date("2026-07-01T19:00:00.000Z");
    const result: PartyBossActionResult = {
      state: "queued",
      session: makeSession("active")
    };
    const submitItemForTelegramUser =
      vi.fn<PartyBossRepository["submitItemForTelegramUser"]>().mockResolvedValue(result);
    const repository = {
      submitItemForTelegramUser
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(repository, { enabled: true }, () => occurredAt);

    await service.submitItemForTelegramUser(123n, "token-1", 1, getCombatItemUseKey("item.field-kit"));

    expect(submitItemForTelegramUser).toHaveBeenCalledWith(
      123n,
      "token-1",
      1,
      {
        id: "item.field-kit",
        name: "Польова аптечка",
        effect: {
          kind: "heal-hp-to-min-percent",
          percent: 93
        }
      },
      {
        now: occurredAt,
        nextTurnExpiresAt: new Date("2026-07-01T19:00:23.000Z")
      }
    );
  });

  it("does not track achievements for replay results without fresh settlement events", async () => {
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const repository = {
      resolveTimedOutByToken: vi.fn<PartyBossRepository["resolveTimedOutByToken"]>().mockResolvedValue({
        state: "terminal",
        session: makeSession("lost")
      })
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => new Date("2026-07-01T19:00:00.000Z"),
      { trackEventSafely } as unknown as AchievementService
    );

    await service.resolveDueTimedOutByToken("token-1");

    expect(trackEventSafely).not.toHaveBeenCalled();
  });

  it("emits one activity row for a terminal Big Barrel Brother victory", async () => {
    const recordPartyRaidWonSafely =
      vi.fn<PublicActivityEventPublisher["recordPartyRaidWonSafely"]>().mockResolvedValue(null);
    const result: PartyBossActionResult = {
      state: "resolved",
      session: makeSession("won")
    };
    const repository = {
      submitActionForTelegramUser: vi.fn<PartyBossRepository["submitActionForTelegramUser"]>().mockResolvedValue(result)
    } as unknown as PartyBossRepository;
    const service = new PartyBossService(
      repository,
      { enabled: true },
      () => new Date("2026-07-01T19:00:00.000Z"),
      undefined,
      { recordPartyRaidWonSafely } as unknown as PublicActivityEventPublisher
    );

    await service.submitActionForTelegramUser(123n, "token-1", 1, "attack");

    expect(recordPartyRaidWonSafely).toHaveBeenCalledTimes(1);
    expect(recordPartyRaidWonSafely).toHaveBeenCalledWith(result.session);
  });
});

function makeSession(status: "active" | "won" | "lost" | "cancelled"): PartyBossSessionRecord {
  const now = new Date("2026-07-01T19:00:00.000Z");

  return {
    id: "boss-session-1",
    partySessionId: "party-session-1",
    partyInviteToken: "token-1",
    leaderCharacterId: "character-leader",
    status,
    turn: 1,
    version: 1,
    rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
    bossKey: BIG_BARREL_BROTHER_BOSS_KEY,
    state: {
      rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
      partySessionId: "party-session-1",
      status,
      turn: 1,
      boss: {
        monsterId: BIG_BARREL_BROTHER_BOSS_KEY,
        name: "Старший Брат Бочки",
        level: 8,
        hp: status === "won" ? 0 : 10,
        hpMax: 10,
        attack: 1,
        armor: 0,
        resist: 0,
        dexterity: 1,
        tags: ["boss", "barrel"]
      },
      participants: [],
      roundLog: [],
      startedAt: now.toISOString(),
      ...(status === "active" ? {} : { completedAt: now.toISOString() })
    },
    result: status === "active"
      ? null
      : {
          status,
          completedAt: now.toISOString(),
          participants: [],
          bossHpAfter: status === "won" ? 0 : 10
        },
    turnExpiresAt: now,
    completedAt: status === "active" ? null : now,
    participants: []
  };
}

import { describe, expect, it } from "vitest";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelCharacterSnapshot,
  DuelResultPayload,
  ResolvedDuelChallengeRecord
} from "../../src/db/repositories/duelChallengeRepository";
import type {
  CharacterRecord,
  CharacterRepository,
  UpdateCharacterResourcesInput
} from "../../src/db/repositories/characterRepository";
import type { CharacterEquipmentRecord } from "../../src/db/repositories/equipmentRepository";
import { DuelChallengeService } from "../../src/services/duelChallengeService";
import { FakeRandomSource } from "../../src/shared/random";

const fixedNow = () => new Date("2026-06-17T18:00:00.000Z");

describe("DuelChallengeService", () => {
  it("does not create an invite for missing or low-level characters", async () => {
    const world = new FakeDuelWorld();
    const service = buildService(world);

    await expect(service.createOpenChallengeForTelegramUser(1n)).resolves.toEqual({
      state: "no-character"
    });

    world.addCharacter(1n, { level: 2, xp: 10 });
    const gated = await service.createOpenChallengeForTelegramUser(1n);

    expect(gated).toMatchObject({ state: "level-gated", minLevel: 3 });
    expect(world.challenges.size).toBe(0);
  });

  it("asks for confirmation before creating an open invite when the challenger is not fully rested", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { hpCurrent: 12, hpMax: 24 });
    const service = buildService(world);

    const result = await service.createOpenChallengeForTelegramUser(1n, { contextChatId: -100n });

    expect(result).toMatchObject({
      state: "resource-warning",
      warning: {
        hpBelowMax: true,
        manaBelowMax: false
      }
    });
    expect(world.challenges.size).toBe(0);

    const confirmed = await service.createOpenChallengeForTelegramUser(1n, {
      contextChatId: -100n,
      ignoreResourceWarning: true
    });

    expect(confirmed).toMatchObject({
      state: "pending",
      challengerResourceWarning: {
        hpBelowMax: true,
        manaBelowMax: false
      }
    });
    expect(confirmed.state === "pending" && confirmed.challenge.contextChatId).toBe(-100n);
    expect(confirmed.state === "pending" && confirmed.expiresAt).toEqual(new Date("2026-06-17T18:13:00.000Z"));
  });

  it("uses passively restored resources before warning on open invite creation", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      hpCurrent: 1,
      hpMax: 24,
      manaCurrent: 1,
      manaMax: 12,
      hpRegenAt: new Date("2026-06-17T17:00:00.000Z"),
      manaRegenAt: new Date("2026-06-17T17:00:00.000Z")
    });
    const service = buildService(world);

    const result = await service.createOpenChallengeForTelegramUser(1n, { contextChatId: -100n });

    expect(result).toMatchObject({
      state: "pending",
      challengerResourceWarning: null
    });
    expect(world.challenges.size).toBe(1);
    expect(world.resourceUpdates).toHaveLength(1);
    expect(world.characters.get(1n)).toMatchObject({
      hpCurrent: 32,
      manaCurrent: 16
    });
  });

  it("shows a resource warning before accepting with partial resources", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n, { hpCurrent: 10, hpMax: 24, manaCurrent: 4, manaMax: 12 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const warning = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(warning).toMatchObject({
      state: "resource-warning",
      warning: {
        hpBelowMax: true,
        manaBelowMax: true
      }
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    expect(accepted).toMatchObject({ state: "resolved" });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("resolved");
  });

  it("checks accept resource warnings against the accepting hero, not the challenger", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { hpCurrent: 1, hpMax: 24, manaCurrent: 1, manaMax: 12 });
    world.addCharacter(2n, { hpCurrent: 99, hpMax: 24, manaCurrent: 99, manaMax: 12 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const prompt = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(prompt).toMatchObject({
      state: "confirmation"
    });
    if (prompt.state === "confirmation") {
      expect(prompt.target.hpCurrent).toBe(prompt.target.hpMax);
      expect(prompt.target.manaCurrent).toBe(prompt.target.manaMax);
    }
    expect(world.resourceUpdates.length).toBeGreaterThanOrEqual(1);
  });

  it("uses equipment-adjusted resource maxima when warning the recipient", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { manaCurrent: 16 });
    world.addCharacter(2n, {
      hpCurrent: 32,
      hpMax: 24,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.apron-of-foam-resistance")]
    });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const prompt = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(prompt).toMatchObject({
      state: "resource-warning",
      warning: {
        hpBelowMax: true,
        manaBelowMax: false
      }
    });
  });

  it("reloads current resource truth after an optimistic sync conflict", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      hpCurrent: 1,
      hpMax: 24,
      manaCurrent: 1,
      manaMax: 12,
      hpRegenAt: new Date("2026-06-17T17:59:00.000Z"),
      manaRegenAt: new Date("2026-06-17T17:59:00.000Z")
    });
    world.failNextResourceUpdate = true;
    const service = buildService(world);

    const result = await service.createOpenChallengeForTelegramUser(1n);

    expect(result).toMatchObject({
      state: "resource-warning",
      warning: {
        hpBelowMax: true,
        manaBelowMax: true
      }
    });
    expect(world.resourceUpdates).toHaveLength(1);
    expect(world.challenges.size).toBe(0);
  });

  it("uses passively restored resources before warning on invite acceptance", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n, {
      hpCurrent: 1,
      hpMax: 24,
      manaCurrent: 1,
      manaMax: 12,
      hpRegenAt: new Date("2026-06-17T17:00:00.000Z"),
      manaRegenAt: new Date("2026-06-17T17:00:00.000Z")
    });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const prompt = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(prompt).toMatchObject({
      state: "confirmation"
    });
    if (prompt.state === "confirmation") {
      expect(prompt.target.hpCurrent).toBe(prompt.target.hpMax);
      expect(prompt.target.manaCurrent).toBe(prompt.target.manaMax);
    }
  });

  it("prevents self-accept and replays resolved challenges", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n, { hpCurrent: 32, manaCurrent: 16 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await expect(service.acceptForTelegramUser(1n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "self-challenge"
    });

    const prompt = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);

    expect(prompt).toMatchObject({
      state: "confirmation",
      challenger: {
        name: "Пригодник 1"
      },
      target: {
        name: "Пригодник 2"
      }
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    const replay = await service.acceptForTelegramUser(2n, created.challenge.inviteToken);
    const challengerReplay = await service.acceptForTelegramUser(1n, created.challenge.inviteToken);

    expect(accepted).toMatchObject({ state: "resolved" });
    expect(replay).toMatchObject({ state: "resolved" });
    expect(challengerReplay).toMatchObject({ state: "resolved" });

    if (accepted.state !== "resolved") {
      throw new Error("Expected resolved accepted duel");
    }

    expect(accepted.result).toMatchObject({
      balanceVersion: "instant-duel-v2",
      participants: {
        challenger: {
          displayName: "Пригодник 1",
          level: 3,
          remortCount: 0
        },
        target: {
          displayName: "Пригодник 2",
          level: 3,
          remortCount: 0
        }
      },
      audit: {
        challenger: {
          balanceVersion: "instant-duel-v2",
          readinessPenalty: 0
        },
        target: {
          balanceVersion: "instant-duel-v2",
          readinessPenalty: 0
        }
      }
    });
  });

  it("replays stored participant snapshots after later character changes", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Старе Імʼя", manaCurrent: 16 });
    world.addCharacter(2n, { name: "Друга Сторона", manaCurrent: 16 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    const changed = world.characters.get(1n);

    if (!changed) {
      throw new Error("Expected challenger");
    }

    world.characters.set(1n, { ...changed, name: "Нове Імʼя", level: 13, remortCount: 2 });
    const replay = await service.getByToken(created.challenge.inviteToken);

    expect(replay).toMatchObject({
      state: "resolved",
      challenger: {
        name: "Старе Імʼя",
        level: 3
      }
    });
    if (replay.state === "resolved") {
      expect(replay.challenger.remortCount).toBeUndefined();
    }
  });

  it("keeps open invites pending when bystanders cancel or decline", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await expect(service.cancelForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "not-owner"
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");

    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "open-invite"
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("pending");
  });

  it("replays terminal open invite state before owner or open-invite guards", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.cancelForTelegramUser(1n, created.challenge.inviteToken);

    await expect(service.cancelForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "cancelled"
    });
    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "cancelled"
    });
  });

  it("replays expired open invites before open-invite decline handling", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    world.challenges.set(created.challenge.inviteToken, {
      ...created.challenge,
      expiresAt: new Date("2026-06-17T17:59:00.000Z")
    });

    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "expired"
    });
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("expired");
  });

  it("creates a targeted rematch from a resolved duel for either participant", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const rematch = await service.createRematchForTelegramUser(2n, created.challenge.inviteToken, {
      contextChatId: -200n,
      ignoreResourceWarning: true
    });

    expect(rematch).toMatchObject({
      state: "pending"
    });

    if (rematch.state !== "pending") {
      throw new Error(`Expected pending rematch, got ${rematch.state}`);
    }

    expect(rematch.challenge.challengerCharacterId).toBe("character-2");
    expect(rematch.challenge.targetCharacterId).toBe("character-1");
    expect(rematch.challenge.target?.telegramUserId).toBe(1n);
    expect(rematch.challenge.contextChatId).toBe(-200n);
    expect(rematch.expiresAt).toEqual(new Date("2026-06-17T18:13:00.000Z"));
    expect(rematch.challenge.inviteToken).not.toBe(created.challenge.inviteToken);
  });

  it("allows another rematch from a resolved rematch result", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const rematch = await service.createRematchForTelegramUser(2n, created.challenge.inviteToken, {
      ignoreResourceWarning: true
    });

    if (rematch.state !== "pending") {
      throw new Error(`Expected pending rematch, got ${rematch.state}`);
    }

    await service.acceptForTelegramUser(1n, rematch.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const secondRematch = await service.createRematchForTelegramUser(1n, rematch.challenge.inviteToken, {
      ignoreResourceWarning: true
    });

    expect(secondRematch).toMatchObject({
      state: "pending"
    });

    if (secondRematch.state !== "pending") {
      throw new Error(`Expected second pending rematch, got ${secondRematch.state}`);
    }

    expect(secondRematch.challenge.challengerCharacterId).toBe("character-1");
    expect(secondRematch.challenge.targetCharacterId).toBe("character-2");
    expect(secondRematch.challenge.inviteToken).not.toBe(created.challenge.inviteToken);
    expect(secondRematch.challenge.inviteToken).not.toBe(rematch.challenge.inviteToken);
  });

  it("limits the same pair to three resolved duels until the next :23 reset", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);

    for (let index = 0; index < 3; index += 1) {
      const created = await service.createOpenChallengeForTelegramUser(1n, {
        ignoreResourceWarning: true
      });

      if (created.state !== "pending") {
        throw new Error(`Expected pending invite, got ${created.state}`);
      }

      await expect(
        service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
          confirmed: true,
          ignoreResourceWarning: true
        })
      ).resolves.toMatchObject({
        state: "resolved"
      });
    }

    const fourth = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true
    });

    if (fourth.state !== "pending") {
      throw new Error(`Expected pending fourth invite, got ${fourth.state}`);
    }

    await expect(
      service.acceptForTelegramUser(2n, fourth.challenge.inviteToken, {
        confirmed: true,
        ignoreResourceWarning: true
      })
    ).resolves.toMatchObject({
      state: "pair-limited",
      count: 3,
      limit: 3,
      resetAt: new Date("2026-06-17T18:23:00.000Z")
    });
    expect(world.challenges.get(fourth.challenge.inviteToken)?.status).toBe("pending");
  });

  it("lets the same pair duel again after the next :23 reset", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const earlyService = buildService(world);

    for (let index = 0; index < 3; index += 1) {
      const created = await earlyService.createOpenChallengeForTelegramUser(1n, {
        ignoreResourceWarning: true
      });

      if (created.state !== "pending") {
        throw new Error(`Expected pending invite, got ${created.state}`);
      }

      await earlyService.acceptForTelegramUser(2n, created.challenge.inviteToken, {
        confirmed: true,
        ignoreResourceWarning: true
      });
    }

    const afterResetService = buildService(
      world,
      () => new Date("2026-06-17T18:24:00.000Z")
    );
    const created = await afterResetService.createOpenChallengeForTelegramUser(2n, {
      ignoreResourceWarning: true
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending after-reset invite, got ${created.state}`);
    }

    await expect(
      afterResetService.acceptForTelegramUser(1n, created.challenge.inviteToken, {
        confirmed: true,
        ignoreResourceWarning: true
      })
    ).resolves.toMatchObject({
      state: "resolved"
    });
  });

  it("blocks rematch creation when the pair already reached the current limit", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    let firstToken: string | null = null;

    for (let index = 0; index < 3; index += 1) {
      const created = await service.createOpenChallengeForTelegramUser(1n, {
        ignoreResourceWarning: true
      });

      if (created.state !== "pending") {
        throw new Error(`Expected pending invite, got ${created.state}`);
      }

      firstToken ??= created.challenge.inviteToken;
      await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
        confirmed: true,
        ignoreResourceWarning: true
      });
    }

    if (!firstToken) {
      throw new Error("Expected a resolved duel token");
    }

    await expect(
      service.createRematchForTelegramUser(1n, firstToken, {
        ignoreResourceWarning: true
      })
    ).resolves.toMatchObject({
      state: "pair-limited",
      count: 3,
      limit: 3
    });
    expect(world.challenges.size).toBe(3);
  });

  it("does not let bystanders accept a targeted rematch", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    world.addCharacter(3n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const rematch = await service.createRematchForTelegramUser(1n, created.challenge.inviteToken, {
      ignoreResourceWarning: true
    });

    if (rematch.state !== "pending") {
      throw new Error(`Expected pending rematch, got ${rematch.state}`);
    }

    await expect(service.acceptForTelegramUser(3n, rematch.challenge.inviteToken)).resolves.toMatchObject({
      state: "not-target"
    });
    expect(world.challenges.get(rematch.challenge.inviteToken)?.status).toBe("pending");

    await expect(
      service.acceptForTelegramUser(2n, rematch.challenge.inviteToken, {
        confirmed: true,
        ignoreResourceWarning: true
      })
    ).resolves.toMatchObject({
      state: "resolved"
    });
  });

  it("asks for confirmation before creating a rematch with partial resources", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { hpCurrent: 10, hpMax: 24 });
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const warning = await service.createRematchForTelegramUser(1n, created.challenge.inviteToken);

    expect(warning).toMatchObject({
      state: "resource-warning",
      warning: {
        hpBelowMax: true,
        manaBelowMax: false
      }
    });
    expect(world.challenges.size).toBe(1);

    await expect(
      service.createRematchForTelegramUser(1n, created.challenge.inviteToken, {
        ignoreResourceWarning: true
      })
    ).resolves.toMatchObject({
      state: "pending"
    });
  });

  it("builds duel boards with wins draws and losses", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Пані Сила" });
    world.addCharacter(2n, { name: "Пан Обережний" });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const accepted = world.challenges.get(created.challenge.inviteToken);

    if (!accepted?.result) {
      throw new Error("Expected resolved duel");
    }

    world.challenges.set(created.challenge.inviteToken, {
      ...accepted,
      result: {
        ...accepted.result,
        outcome: "challenger",
        winnerCharacterId: accepted.challengerCharacterId,
        loserCharacterId: accepted.targetCharacterId
      }
    });

    const draw = await service.createOpenChallengeForTelegramUser(1n, { ignoreResourceWarning: true });

    if (draw.state !== "pending") {
      throw new Error(`Expected pending draw invite, got ${draw.state}`);
    }

    await service.acceptForTelegramUser(2n, draw.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    const acceptedDraw = world.challenges.get(draw.challenge.inviteToken);

    if (!acceptedDraw?.result) {
      throw new Error("Expected resolved draw duel");
    }

    world.challenges.set(draw.challenge.inviteToken, {
      ...acceptedDraw,
      result: {
        ...acceptedDraw.result,
        outcome: "draw",
        winnerCharacterId: null,
        loserCharacterId: null
      }
    });

    await expect(service.getLeaderboard()).resolves.toEqual({
      day: [
        {
          characterId: "character-1",
          name: "Пані Сила",
          winCount: 1,
          drawCount: 1,
          lossCount: 0
        },
        {
          characterId: "character-2",
          name: "Пан Обережний",
          winCount: 0,
          drawCount: 1,
          lossCount: 1
        }
      ],
      week: [
        {
          characterId: "character-1",
          name: "Пані Сила",
          winCount: 1,
          drawCount: 1,
          lossCount: 0
        },
        {
          characterId: "character-2",
          name: "Пан Обережний",
          winCount: 0,
          drawCount: 1,
          lossCount: 1
        }
      ],
      month: [
        {
          characterId: "character-1",
          name: "Пані Сила",
          winCount: 1,
          drawCount: 1,
          lossCount: 0
        },
        {
          characterId: "character-2",
          name: "Пан Обережний",
          winCount: 0,
          drawCount: 1,
          lossCount: 1
        }
      ]
    });
  });
});

function buildService(world: FakeDuelWorld, clock = fixedNow): DuelChallengeService {
  return new DuelChallengeService(world, world, clock, new FakeRandomSource([0.5]));
}

class FakeDuelWorld implements DuelChallengeRepository, CharacterRepository {
  readonly characters = new Map<bigint, DuelCharacterSnapshot>();
  readonly challenges = new Map<string, DuelChallengeRecord>();
  readonly resourceUpdates: UpdateCharacterResourcesInput[] = [];
  failNextResourceUpdate = false;

  addCharacter(
    telegramUserId: bigint,
    overrides: Partial<CharacterRecord> & { equipment?: CharacterEquipmentRecord[] } = {}
  ): void {
    const characterId = `character-${telegramUserId.toString()}`;
    const base: DuelCharacterSnapshot = {
      id: characterId,
      telegramUserId,
      userId: `user-${telegramUserId.toString()}`,
      name: `Пригодник ${telegramUserId.toString()}`,
      pronoun: "they",
      path: "path.boundary",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 0,
      hpCurrent: 32,
      hpMax: 24,
      manaCurrent: 16,
      manaMax: 12,
      statsJson: {
        strength: 7,
        dexterity: 7,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      ...overrides
    };
    base.equipment = overrides.equipment ?? [];
    this.characters.set(telegramUserId, base);
  }

  createOpenForTelegramUser(
    telegramUserId: bigint,
    input: { inviteToken: string; contextChatId?: bigint | null; expiresAt: Date }
  ): Promise<DuelChallengeRecord | null> {
    const challenger = this.characters.get(telegramUserId);

    if (!challenger) {
      return Promise.resolve(null);
    }

    const challenge: DuelChallengeRecord = {
      id: `duel-${this.challenges.size + 1}`,
      challengerCharacterId: challenger.id,
      targetCharacterId: null,
      contextChatId: input.contextChatId ?? null,
      inviteToken: input.inviteToken,
      status: "pending",
      expiresAt: input.expiresAt,
      resolvedAt: null,
      result: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
      challenger,
      target: null
    };
    this.challenges.set(input.inviteToken, challenge);

    return Promise.resolve(challenge);
  }

  createTargetedForTelegramUser(
    telegramUserId: bigint,
    targetCharacterId: string,
    input: { inviteToken: string; contextChatId?: bigint | null; expiresAt: Date }
  ): Promise<DuelChallengeRecord | null> {
    const challenger = this.characters.get(telegramUserId);
    const target = [...this.characters.values()].find((character) => character.id === targetCharacterId);

    if (!challenger || !target || challenger.id === target.id) {
      return Promise.resolve(null);
    }

    const challenge: DuelChallengeRecord = {
      id: `duel-${this.challenges.size + 1}`,
      challengerCharacterId: challenger.id,
      targetCharacterId: target.id,
      contextChatId: input.contextChatId ?? null,
      inviteToken: input.inviteToken,
      status: "pending",
      expiresAt: input.expiresAt,
      resolvedAt: null,
      result: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
      challenger,
      target
    };
    this.challenges.set(input.inviteToken, challenge);

    return Promise.resolve(challenge);
  }

  findCharacterByTelegramUser(telegramUserId: bigint): Promise<DuelCharacterSnapshot | null> {
    return Promise.resolve(this.characters.get(telegramUserId) ?? null);
  }

  findByUserId(userId: string): Promise<CharacterRecord | null> {
    return Promise.resolve(
      [...this.characters.values()].find((character) => character.userId === userId) ?? null
    );
  }

  findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    return Promise.resolve(this.characters.get(telegramUserId) ?? null);
  }

  updateResourcesForTelegramUser(
    telegramUserId: bigint,
    input: UpdateCharacterResourcesInput
  ): Promise<CharacterRecord | null> {
    this.resourceUpdates.push(input);
    const character = this.characters.get(telegramUserId);

    if (!character) {
      return Promise.resolve(null);
    }

    if (this.failNextResourceUpdate) {
      this.failNextResourceUpdate = false;
      return Promise.resolve(null);
    }

    if (
      input.expected &&
      (character.hpCurrent !== input.expected.hpCurrent ||
        character.manaCurrent !== input.expected.manaCurrent ||
        (character.hpRegenAt ?? null)?.getTime() !== (input.expected.hpRegenAt ?? null)?.getTime() ||
        (character.manaRegenAt ?? null)?.getTime() !==
          (input.expected.manaRegenAt ?? null)?.getTime())
    ) {
      return Promise.resolve(null);
    }

    const updated = {
      ...character,
      hpCurrent: input.hpCurrent,
      manaCurrent: input.manaCurrent,
      hpRegenAt: input.hpRegenAt,
      manaRegenAt: input.manaRegenAt
    };
    this.characters.set(telegramUserId, updated);

    return Promise.resolve(updated);
  }

  deleteByTelegramUserId(): Promise<boolean> {
    return Promise.resolve(false);
  }

  createForTelegramUserIfMissing(): never {
    throw new Error("Not implemented in duel tests.");
  }

  findByToken(inviteToken: string): Promise<DuelChallengeRecord | null> {
    return Promise.resolve(this.challenges.get(inviteToken) ?? null);
  }

  markExpiredByToken(inviteToken: string, now: Date): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.expiresAt <= now) {
      const updated = { ...challenge, status: "expired" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve(updated);
    }

    return Promise.resolve(challenge ?? null);
  }

  cancelByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.challenger.telegramUserId === telegramUserId) {
      const updated = { ...challenge, status: "cancelled" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve(updated);
    }

    return Promise.resolve(challenge ?? null);
  }

  declineByTokenForTelegramUser(): Promise<DuelChallengeRecord | null> {
    return Promise.resolve(null);
  }

  acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);
    const target = this.characters.get(telegramUserId);

    if (
      !challenge ||
      !target ||
      challenge.status !== "pending" ||
      challenge.expiresAt <= now ||
      challenge.challengerCharacterId === target.id ||
      (challenge.targetCharacterId !== null && challenge.targetCharacterId !== target.id)
    ) {
      return Promise.resolve(challenge ?? null);
    }

    const updated = {
      ...challenge,
      targetCharacterId: target.id,
      target,
      status: "resolved" as const,
      resolvedAt: now,
      result,
      updatedAt: now
    };
    this.challenges.set(inviteToken, updated);

    return Promise.resolve(updated);
  }

  countResolvedBetweenCharacterPairSince(
    characterAId: string,
    characterBId: string,
    since: Date
  ): Promise<number> {
    return Promise.resolve(
      [...this.challenges.values()].filter(
        (challenge) =>
          challenge.status === "resolved" &&
          challenge.resolvedAt !== null &&
          challenge.resolvedAt >= since &&
          challenge.result !== null &&
          ((challenge.challengerCharacterId === characterAId &&
            challenge.targetCharacterId === characterBId) ||
            (challenge.challengerCharacterId === characterBId &&
              challenge.targetCharacterId === characterAId))
      ).length
    );
  }

  listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    return Promise.resolve(
      [...this.challenges.values()].filter(
        (challenge) =>
          challenge.status === "resolved" &&
          challenge.resolvedAt !== null &&
          challenge.resolvedAt >= since &&
          challenge.result !== null &&
          challenge.target !== null
      ) as ResolvedDuelChallengeRecord[]
    );
  }
}

function makeEquipment(itemId: string): CharacterEquipmentRecord {
  return {
    id: `equipment-${itemId}`,
    characterId: "character",
    slot: "armor",
    itemId,
    createdAt: fixedNow(),
    updatedAt: fixedNow()
  };
}

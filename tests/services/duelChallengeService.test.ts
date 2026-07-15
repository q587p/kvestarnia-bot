import { describe, expect, it, vi } from "vitest";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelCombatActionRecord,
  DuelCombatSessionRecord,
  DuelCharacterSnapshot,
  DuelResultPayload,
  ResolvedDuelChallengeRecord,
  StartTurnBasedDuelSessionInput,
  UpdateTurnBasedDuelSessionInput
} from "../../src/db/repositories/duelChallengeRepository";
import type {
  CharacterRecord,
  CharacterRepository,
  UpdateCharacterResourcesInput
} from "../../src/db/repositories/characterRepository";
import type { CharacterEquipmentRecord } from "../../src/db/repositories/equipmentRepository";
import { getLevelForXp } from "../../src/domain/progression/level";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import { getEquippedItemContents } from "../../src/services/equipmentService";
import { getCombatMantokAbilityGrantsForEquippedItems } from "../../src/content";
import { DuelChallengeService } from "../../src/services/duelChallengeService";
import type { AchievementService } from "../../src/services/achievementService";
import type { NearbyDuelTargetValidator } from "../../src/services/presenceService";
import type { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";
import { FakeRandomSource } from "../../src/shared/random";
import { startTurnBasedDuel } from "../../src/domain/duels/turnBasedDuel";

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

  it("creates a targeted nearby invite with the selected mode", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);

    const result = await service.createTargetedChallengeForTelegramUser(1n, 2n, {
      contextChatId: -100n,
      mode: "turn-based"
    });

    expect(result).toMatchObject({
      state: "pending",
      challenge: {
        challengerCharacterId: "character-1",
        targetCharacterId: "character-2",
        contextChatId: -100n,
        mode: "turn-based"
      }
    });
  });

  it("marks targeted decline transitions once for notification replay safety", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createTargetedChallengeForTelegramUser(1n, 2n, {
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    await expect(service.declineForTelegramUser(2n, created.challenge.inviteToken)).resolves.toMatchObject({
      state: "declined",
      transitioned: true
    });
    const replay = await service.declineForTelegramUser(2n, created.challenge.inviteToken);

    expect(replay).toMatchObject({ state: "declined" });
    expect(replay.transitioned).toBeUndefined();
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("declined");
  });

  it("rejects a targeted nearby invite when the target is no longer active nearby", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    world.nearbyTargets.available = false;
    const service = buildService(world, fixedNow, world.nearbyTargets);

    const result = await service.createTargetedChallengeForTelegramUser(1n, 2n, {
      contextChatId: -100n,
      mode: "turn-based"
    });

    expect(result).toMatchObject({
      state: "target-not-found"
    });
    expect(world.nearbyTargets.calls).toEqual([{ challenger: 1n, target: 2n }]);
    expect(world.challenges.size).toBe(0);
  });

  it("shows a resource warning before accepting with partial resources", async () => {
    const world = new FakeDuelWorld();
    const activityEvents = new FakeDuelActivityEvents();
    world.addCharacter(1n);
    world.addCharacter(2n, { hpCurrent: 10, hpMax: 24, manaCurrent: 4, manaMax: 12 });
    const service = buildService(world, fixedNow, undefined, undefined, activityEvents);
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
    if (accepted.state !== "resolved") {
      throw new Error(`Expected resolved quick duel, got ${accepted.state}`);
    }
    expect(accepted.result).not.toHaveProperty("xpRewards");
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("resolved");
    expect(activityEvents.duelCompletions).toEqual([
      expect.objectContaining({
        challengeId: created.challenge.id,
        mode: "quick",
        challengerCharacterId: "character-1",
        challengerDisplayName: "Пригодник 1",
        targetCharacterId: "character-2",
        targetDisplayName: "Пригодник 2"
      })
    ]);

    await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    expect(activityEvents.duelCompletions).toHaveLength(1);
  });

  it("runs idempotent quest progress only after quick-duel settlement and on durable replay recovery", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const recordResolvedDuelSafely = vi.fn(() => Promise.resolve([{
      telegramUserId: 1n,
      objective: "quick-duel" as const,
      progress: {
        accepted: true,
        trainingCompleted: false,
        quickDuelCompleted: true,
        turnBasedDuelCompleted: false,
        completedObjectives: 1,
        requiredObjectives: 3 as const,
        readyToClaim: false,
        currentLocationId: "location.korchma.fighting_corner"
      }
    }]));
    const service = buildService(world, fixedNow, undefined, undefined, undefined, {
      isEnabled: () => true,
      recordResolvedDuelSafely
    });
    const created = await service.createOpenChallengeForTelegramUser(1n);
    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const resolved = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    expect(resolved).toMatchObject({
      state: "resolved",
      questProgressUpdates: [{ telegramUserId: 1n, objective: "quick-duel" }]
    });
    expect(recordResolvedDuelSafely).toHaveBeenCalledTimes(1);
    expect(world.challenges.get(created.challenge.inviteToken)?.status).toBe("resolved");

    const replay = await service.getByToken(created.challenge.inviteToken);
    expect(replay).toMatchObject({ state: "resolved" });
    expect(recordResolvedDuelSafely).toHaveBeenCalledTimes(2);
  });

  it("records a player-resolved turn-based round for both participants and repairs one missed follow-up on replay", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const quest = new FakeFightingCornerQuestIntegration(true, new Set([2n]));
    const service = buildService(world, fixedNow, undefined, undefined, undefined, quest);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });
    if (created.state !== "pending") throw new Error("Expected pending turn-based invite.");
    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    if (accepted.state !== "active") throw new Error("Expected active turn-based duel.");

    setSessionHitPoints(world, accepted.session.id, 1);
    const firstActor = accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const secondActor = firstActor === 1n ? 2n : 1n;
    await service.resolveTurnBasedActionForTelegramUser(firstActor, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "attack"
    });
    const terminal = await service.resolveTurnBasedActionForTelegramUser(secondActor, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "attack"
    });

    expect(terminal).toMatchObject({
      state: "updated",
      session: { status: "resolved" },
      questProgressUpdates: [{ telegramUserId: 1n, objective: "turn-based-duel" }]
    });
    expect(world.resolvedRoundLookupCount).toBe(1);
    expect(world.fullJournalLookupCount).toBe(0);

    const repaired = await service.getByToken(created.challenge.inviteToken);
    expect(repaired).toMatchObject({
      state: "resolved",
      questProgressUpdates: [{ telegramUserId: 2n, objective: "turn-based-duel" }]
    });
    const replay = await service.getByToken(created.challenge.inviteToken);
    expect(replay).toMatchObject({ state: "resolved" });
    expect(replay).not.toHaveProperty("questProgressUpdates");
    expect(quest.recorded).toEqual(new Set([1n, 2n]));
  });

  it("records a timeout-attack terminal round through the bounded repository lookup", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const quest = new FakeFightingCornerQuestIntegration();
    const startService = buildService(world, fixedNow, undefined, undefined, undefined, quest);
    const created = await startService.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });
    if (created.state !== "pending") throw new Error("Expected pending turn-based invite.");
    const accepted = await startService.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    if (accepted.state !== "active") throw new Error("Expected active turn-based duel.");

    setSessionHitPoints(world, accepted.session.id, 1);
    const dueSession = world.sessions.get(accepted.session.id)!;
    const timeoutService = buildService(
      world,
      () => dueSession.turnExpiresAt,
      undefined,
      undefined,
      undefined,
      quest
    );
    const terminal = await timeoutService.resolveDueTurnBasedSession(dueSession);

    expect(terminal).toMatchObject({
      state: "updated",
      session: { status: "resolved" },
      questProgressUpdates: [
        { telegramUserId: 1n, objective: "turn-based-duel" },
        { telegramUserId: 2n, objective: "turn-based-duel" }
      ]
    });
    expect(world.resolvedRoundLookupCount).toBe(1);
    expect(world.fullJournalLookupCount).toBe(0);
  });

  it("rejects a resolved challenge without a stored round and performs no journal lookup while disabled", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const quest = new FakeFightingCornerQuestIntegration();
    const service = buildService(world, fixedNow, undefined, undefined, undefined, quest);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });
    if (created.state !== "pending") throw new Error("Expected pending turn-based invite.");
    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });
    if (accepted.state !== "active") throw new Error("Expected active turn-based duel.");

    const surrendered = await service.resolveTurnBasedActionForTelegramUser(2n, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "surrender"
    });
    expect(surrendered).toMatchObject({ state: "updated", session: { status: "forfeited" } });
    expect(surrendered).not.toHaveProperty("questProgressUpdates");
    expect(quest.recorded.size).toBe(0);
    expect(world.resolvedRoundLookupCount).toBe(1);

    world.resolvedRoundLookupCount = 0;
    world.fullJournalLookupCount = 0;
    const disabledService = buildService(
      world,
      fixedNow,
      undefined,
      undefined,
      undefined,
      new FakeFightingCornerQuestIntegration(false)
    );
    await expect(disabledService.getByToken(created.challenge.inviteToken)).resolves.toMatchObject({
      state: "resolved"
    });
    expect(world.resolvedRoundLookupCount).toBe(0);
    expect(world.fullJournalLookupCount).toBe(0);
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
    world.addCharacter(1n, {
      name: "Старе Імʼя",
      manaCurrent: 16,
      activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
    });
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

    world.characters.set(1n, {
      ...changed,
      name: "Нове Імʼя",
      level: 13,
      remortCount: 2,
      activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
    });
    const replay = await service.getByToken(created.challenge.inviteToken);

    expect(replay).toMatchObject({
      state: "resolved",
      challenger: {
        name: "Старе Імʼя",
        level: 3,
        activeCosmeticTitle: "Перший писар"
      }
    });
    if (replay.state === "resolved") {
      expect(replay.challenger.remortCount).toBeUndefined();
      expect(replay.challenger.remortMemoryRank).toBeUndefined();
    }
  });

  it("does not leak live active cosmetic titles into old result snapshots without title data", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Архівний Автор", manaCurrent: 16 });
    world.addCharacter(2n, { name: "Архівна Ціль", manaCurrent: 16 });
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

    if (!accepted?.result?.participants) {
      throw new Error("Expected resolved duel with participant snapshots");
    }

    const stripActiveCosmeticTitle = (participant: typeof accepted.result.participants.challenger) => {
      const { activeCosmeticTitle, ...legacyParticipant } = participant;
      void activeCosmeticTitle;
      return legacyParticipant;
    };
    world.challenges.set(created.challenge.inviteToken, {
      ...accepted,
      result: {
        ...accepted.result,
        participants: {
          challenger: stripActiveCosmeticTitle(accepted.result.participants.challenger),
          target: stripActiveCosmeticTitle(accepted.result.participants.target)
        }
      }
    });
    world.characters.set(1n, {
      ...world.characters.get(1n)!,
      activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
    });
    world.characters.set(2n, {
      ...world.characters.get(2n)!,
      activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
    });

    const replay = await service.getByToken(created.challenge.inviteToken);

    expect(replay).toMatchObject({
      state: "resolved",
      challenger: { name: "Архівний Автор" },
      target: { name: "Архівна Ціль" }
    });
    if (replay.state === "resolved") {
      expect(replay.challenger.activeCosmeticTitle).toBeUndefined();
      expect(replay.target.activeCosmeticTitle).toBeUndefined();
    }
  });

  it("does not leak live active cosmetic titles into legacy resolved duels without participant snapshots", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Старий Автор", manaCurrent: 16 });
    world.addCharacter(2n, { name: "Стара Ціль", manaCurrent: 16 });
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

    const { participants, ...legacyResult } = accepted.result;
    void participants;
    world.challenges.set(created.challenge.inviteToken, {
      ...accepted,
      result: legacyResult
    });
    world.characters.set(1n, {
      ...world.characters.get(1n)!,
      activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
    });
    world.characters.set(2n, {
      ...world.characters.get(2n)!,
      activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
    });

    const replay = await service.getByToken(created.challenge.inviteToken);
    const leaderboard = await service.getLeaderboard();

    if (replay.state === "resolved") {
      expect(replay.challenger.activeCosmeticTitle).toBeUndefined();
      expect(replay.target.activeCosmeticTitle).toBeUndefined();
    }
    const challengerEntry = leaderboard.day.find((entry) => entry.characterId === "character-1");
    const targetEntry = leaderboard.day.find((entry) => entry.characterId === "character-2");
    expect(challengerEntry).toMatchObject({ name: "Старий Автор" });
    expect(targetEntry).toMatchObject({ name: "Стара Ціль" });
    expect(challengerEntry).not.toHaveProperty("activeCosmeticTitle");
    expect(targetEntry).not.toHaveProperty("activeCosmeticTitle");
  });

  it("replays stored positive remort counts after later character changes", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Перший Реморт", manaCurrent: 16, remortCount: 1 });
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

    world.characters.set(1n, { ...changed, name: "Новий Реморт", level: 13, remortCount: 3 });
    const replay = await service.getByToken(created.challenge.inviteToken);

    expect(replay).toMatchObject({
      state: "resolved",
      challenger: {
        name: "Перший Реморт",
        level: 3,
        remortCount: 1,
        remortMemoryRank: 1
      }
    });
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
    world.addCharacter(1n, {
      name: "Пані Сила",
      activeCosmeticTitleGrantId: "cosmetic-title.first-problem-clerk"
    });
    world.addCharacter(2n, {
      name: "Пан Обережний",
      activeCosmeticTitleGrantId: "cosmetic-title.level-two-stool"
    });
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
    world.characters.get(1n)!.activeCosmeticTitleGrantId = null;
    world.characters.get(2n)!.activeCosmeticTitleGrantId = "cosmetic-title.unknown-future";

    await expect(service.getLeaderboard()).resolves.toEqual({
      day: [
        {
          characterId: "character-1",
          name: "Пані Сила",
          activeCosmeticTitle: "Перший писар",
          winCount: 1,
          drawCount: 1,
          lossCount: 0
        },
        {
          characterId: "character-2",
          name: "Пан Обережний",
          activeCosmeticTitle: "Табуретник",
          winCount: 0,
          drawCount: 1,
          lossCount: 1
        }
      ],
      week: [
        {
          characterId: "character-1",
          name: "Пані Сила",
          activeCosmeticTitle: "Перший писар",
          winCount: 1,
          drawCount: 1,
          lossCount: 0
        },
        {
          characterId: "character-2",
          name: "Пан Обережний",
          activeCosmeticTitle: "Табуретник",
          winCount: 0,
          drawCount: 1,
          lossCount: 1
        }
      ],
      month: [
        {
          characterId: "character-1",
          name: "Пані Сила",
          activeCosmeticTitle: "Перший писар",
          winCount: 1,
          drawCount: 1,
          lossCount: 0
        },
        {
          characterId: "character-2",
          name: "Пан Обережний",
          activeCosmeticTitle: "Табуретник",
          winCount: 0,
          drawCount: 1,
          lossCount: 1
        }
      ]
    });
  });

  it("retries a same-round action once after an optimistic turn update race", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    world.failNextTurnUpdateWithConcurrentOpponentChoice = true;
    const resolved = await service.resolveTurnBasedActionForTelegramUser(2n, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "attack"
    });

    expect(world.turnUpdateAttempts).toBe(2);
    expect(resolved).toMatchObject({
      state: "updated",
      session: {
        version: 3,
        state: {
          lastRound: {
            turn: 1
          }
        }
      }
    });
    if (resolved.state === "updated") {
      expect(resolved.session.state.pendingActions).toBeUndefined();
      expect(resolved.session.state.lastRound?.actions).toHaveLength(2);
    }
  });

  it("keeps turn-based duel journals unavailable while combat is active", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    await expect(service.getTurnBasedJournalByToken(created.challenge.inviteToken))
      .resolves.toEqual({ state: "not-ready" });
  });

  it("accepts the second same-round choice from the original older-version button", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const firstActorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const secondActorTelegramId = firstActorTelegramId === 1n ? 2n : 1n;
    const originalTurn = accepted.session.turn;
    const originalVersion = accepted.session.version;

    const queued = await service.resolveTurnBasedActionForTelegramUser(firstActorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: originalTurn,
      expectedVersion: originalVersion,
      action: "attack"
    });

    expect(queued.state).toBe("updated");
    if (queued.state !== "updated") {
      throw new Error(`Expected queued action, got ${queued.state}`);
    }
    expect(queued.session.version).toBe(originalVersion + 1);
    expect(queued.session.state.pendingActions).toBeDefined();

    const resolved = await service.resolveTurnBasedActionForTelegramUser(secondActorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: originalTurn,
      expectedVersion: originalVersion,
      action: "attack"
    });

    expect(resolved.state).toBe("updated");
    if (resolved.state !== "updated") {
      throw new Error(`Expected resolved round, got ${resolved.state}`);
    }
    expect(resolved.session.version).toBe(originalVersion + 2);
    expect(resolved.session.state.lastRound?.turn).toBe(originalTurn);
    expect(resolved.session.state.lastRound?.actions.map((action) => action.action)).toEqual(["attack", "attack"]);
    expect(resolved.session.state.pendingActions).toBeUndefined();
  });

  it("resolves an equipped gear action in a turn-based duel", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 10,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    world.addCharacter(2n, { level: 10 });
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([
      {
        id: "achievement.mantok.gear-action.first",
        title: "Манатка натиснула кнопку",
        cosmeticTitleGrantId: null,
        unlockedAt: fixedNow()
      }
    ]);
    const service = buildService(
      world,
      fixedNow,
      undefined,
      { trackEventSafely } as unknown as AchievementService
    );
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const actorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const actorAction = await service.resolveTurnBasedActionForTelegramUser(actorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: actorTelegramId === 1n ? "gear" : "defend",
      ...(actorTelegramId === 1n ? { grantKey: "rldagr" } : {})
    });

    expect(actorAction.state).toBe("updated");
    if (actorAction.state !== "updated") {
      throw new Error(`Expected first duel action update, got ${actorAction.state}`);
    }

    const secondAction = await service.resolveTurnBasedActionForTelegramUser(
      actorTelegramId === 1n ? 2n : 1n,
      {
        inviteToken: created.challenge.inviteToken,
        expectedTurn: actorAction.session.turn,
        expectedVersion: actorAction.session.version,
        action: actorTelegramId === 1n ? "defend" : "gear",
        ...(actorTelegramId === 1n ? {} : { grantKey: "rldagr" })
      }
    );

    expect(secondAction.state).toBe("updated");
    if (secondAction.state !== "updated") {
      throw new Error(`Expected resolved duel round, got ${secondAction.state}`);
    }
    expect(secondAction.session.state.lastRound?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorCharacterId: "character-1",
          action: "gear",
          skillId: "gear.red-line-dagger"
        })
      ])
    );
    expect(trackEventSafely).toHaveBeenCalledTimes(1);
    expect(trackEventSafely).toHaveBeenCalledWith({
      type: "mantok.gear-action.used",
      characterId: "character-1",
      occurredAt: fixedNow(),
      sourceId: `${secondAction.session.id}:turn:${accepted.session.turn}:gear:gear.red-line-dagger`
    });
    expect(secondAction.achievementUnlocksByCharacterId).toEqual({
      "character-1": [
        {
          id: "achievement.mantok.gear-action.first",
          title: "Манатка натиснула кнопку",
          cosmeticTitleGrantId: null,
          unlockedAt: fixedNow()
        }
      ]
    });
  });

  it("tracks turn-based duel gear achievements only after a queued gear action commits", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 10,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    world.addCharacter(2n, {
      level: 10,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const service = buildService(
      world,
      fixedNow,
      undefined,
      { trackEventSafely } as unknown as AchievementService
    );
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const gearActorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const defenderTelegramId = gearActorTelegramId === 1n ? 2n : 1n;
    const queued = await service.resolveTurnBasedActionForTelegramUser(gearActorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "gear",
      grantKey: "rldagr"
    });

    expect(queued.state).toBe("updated");
    if (queued.state !== "updated") {
      throw new Error(`Expected queued gear action, got ${queued.state}`);
    }
    expect(queued.session.state.pendingActions).toBeDefined();
    expect(trackEventSafely).not.toHaveBeenCalled();

    const resolved = await service.resolveTurnBasedActionForTelegramUser(defenderTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: queued.session.turn,
      expectedVersion: queued.session.version,
      action: "defend"
    });

    expect(resolved.state).toBe("updated");
    if (resolved.state !== "updated") {
      throw new Error(`Expected resolved duel round, got ${resolved.state}`);
    }
    expect(resolved.session.state.pendingActions).toBeUndefined();
    expect(resolved.session.state.lastRound?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorCharacterId: accepted.session.actingCharacterId,
          action: "gear",
          skillId: "gear.red-line-dagger"
        })
      ])
    );
    expect(trackEventSafely).toHaveBeenCalledTimes(1);
    expect(trackEventSafely).toHaveBeenCalledWith({
      type: "mantok.gear-action.used",
      characterId: accepted.session.actingCharacterId,
      occurredAt: fixedNow(),
      sourceId: `${resolved.session.id}:turn:${accepted.session.turn}:gear:gear.red-line-dagger`
    });
  });

  it("tracks every committed turn-based duel gear action from the resolved round", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 9,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.barrel-brother.shield")]
    });
    world.addCharacter(2n, {
      level: 9,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.barrel-brother.shield")]
    });
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([]);
    const service = buildService(
      world,
      fixedNow,
      undefined,
      { trackEventSafely } as unknown as AchievementService
    );
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const firstActorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const secondActorTelegramId = firstActorTelegramId === 1n ? 2n : 1n;
    const queued = await service.resolveTurnBasedActionForTelegramUser(firstActorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "gear",
      grantKey: "bcshield"
    });

    expect(queued.state).toBe("updated");
    if (queued.state !== "updated") {
      throw new Error(`Expected queued shield gear action, got ${queued.state}`);
    }
    expect(trackEventSafely).not.toHaveBeenCalled();

    const resolved = await service.resolveTurnBasedActionForTelegramUser(secondActorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: queued.session.turn,
      expectedVersion: queued.session.version,
      action: "gear",
      grantKey: "bcshield"
    });

    expect(resolved.state).toBe("updated");
    if (resolved.state !== "updated") {
      throw new Error(`Expected resolved shield gear round, got ${resolved.state}`);
    }
    const gearActions = resolved.session.state.lastRound?.actions.filter((action) => action.action === "gear") ?? [];

    expect(gearActions).toHaveLength(2);
    expect(trackEventSafely).toHaveBeenCalledTimes(2);
    expect(trackEventSafely.mock.calls.map(([event]) => event)).toEqual(
      expect.arrayContaining(
        gearActions.map((action) => ({
          type: "mantok.gear-action.used",
          characterId: action.actorCharacterId,
          occurredAt: fixedNow(),
          sourceId: `${resolved.session.id}:turn:${accepted.session.turn}:gear:gear.barrel-counter-shield`
        }))
      )
    );
  });

  it("treats turn-based duel gear callbacks without the equipped grant as stale", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { level: 10 });
    world.addCharacter(2n, { level: 10 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const actorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const result = await service.resolveTurnBasedActionForTelegramUser(actorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "gear",
      grantKey: "rldagr"
    });

    expect(result).toMatchObject({ state: "stale" });
    expect(world.turnUpdateAttempts).toBe(0);
  });

  it("treats stale turn-based duel gear callbacks as stale without advancing the duel", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 10,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    world.addCharacter(2n, {
      level: 10,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const actorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const result = await service.resolveTurnBasedActionForTelegramUser(actorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version + 1,
      action: "gear",
      grantKey: "rldagr"
    });

    expect(result).toMatchObject({ state: "stale" });
    expect(world.turnUpdateAttempts).toBe(0);
  });

  it("reports turn-based duel gear callbacks blocked by mana without mutating the duel", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 10,
      manaCurrent: 0,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    world.addCharacter(2n, {
      level: 10,
      manaCurrent: 0,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const actorTelegramId =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId ? 1n : 2n;
    const result = await service.resolveTurnBasedActionForTelegramUser(actorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "gear",
      grantKey: "rldagr"
    });

    expect(result).toMatchObject({ state: "not-enough-mana" });
    expect(world.turnUpdateAttempts).toBe(0);
  });

  it("reports turn-based duel gear callbacks blocked by cooldown without mutating the duel", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 10,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    world.addCharacter(2n, {
      level: 10,
      manaCurrent: 16,
      manaMax: 12,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const actorSide =
      accepted.session.actingCharacterId === accepted.session.challengerCharacterId
        ? "challenger"
        : "target";
    const actorTelegramId = actorSide === "challenger" ? 1n : 2n;
    const stored = world.sessions.get(accepted.session.id);

    if (!stored) {
      throw new Error("Expected stored turn-based session");
    }

    stored.state.participants[actorSide].cooldowns = {
      abilities: {
        "gear.red-line-dagger": {
          id: "gear.red-line-dagger",
          remainingTurns: 2
        }
      }
    };
    const result = await service.resolveTurnBasedActionForTelegramUser(actorTelegramId, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "gear",
      grantKey: "rldagr"
    });

    expect(result).toMatchObject({ state: "skill-on-cooldown" });
    expect(world.turnUpdateAttempts).toBe(0);
  });

  it("keeps equipped gear grants out of quick duel resolution", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, {
      level: 10,
      equipment: [makeEquipment("item.set.red-line.left-dagger")]
    });
    world.addCharacter(2n, { level: 10 });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    expect(accepted.state).toBe("resolved");
    expect(world.sessions.size).toBe(0);
    expect(world.challenges.get(created.challenge.inviteToken)?.mode).toBe("quick");
  });

  it("reports the challenger when their active combat lease blocks turn-based start", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n, { name: "Зайнятий Автор" });
    world.addCharacter(2n, { name: "Отримувач" });
    const service = buildService(world);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    world.busyCharacterIds.add("character-1");
    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    expect(accepted).toMatchObject({
      state: "busy",
      busyCharacter: {
        name: "Зайнятий Автор"
      }
    });
  });

  it("enforces turn deadlines at the update boundary for actions and timeouts", async () => {
    const world = new FakeDuelWorld();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world, fixedNow);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const earlyService = buildService(world, () => new Date("2026-06-17T18:00:22.999Z"));
    await expect(earlyService.resolveDueTurnBasedSession(accepted.session)).resolves.toMatchObject({
      state: "stale"
    });

    const beforeDeadline = await earlyService.resolveTurnBasedActionForTelegramUser(2n, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "attack"
    });
    expect(beforeDeadline).toMatchObject({ state: "updated" });

    const second = beforeDeadline.state === "updated" ? beforeDeadline.session : accepted.session;
    const lateService = buildService(world, () => second.turnExpiresAt);
    const lateAction = await lateService.resolveTurnBasedActionForTelegramUser(1n, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: second.turn,
      expectedVersion: second.version,
      action: "attack"
    });
    expect(lateAction).toMatchObject({ state: "stale" });

    const timeout = await lateService.resolveDueTurnBasedSession(second);
    expect(timeout).toMatchObject({ state: "updated" });
  });

  it("stores surrender as a resolved parent challenge with a terminal reason", async () => {
    const world = new FakeDuelWorld();
    const activityEvents = new FakeDuelActivityEvents();
    world.addCharacter(1n);
    world.addCharacter(2n);
    const service = buildService(world, fixedNow, undefined, undefined, activityEvents);
    const created = await service.createOpenChallengeForTelegramUser(1n, {
      ignoreResourceWarning: true,
      mode: "turn-based"
    });

    if (created.state !== "pending") {
      throw new Error(`Expected pending invite, got ${created.state}`);
    }

    const accepted = await service.acceptForTelegramUser(2n, created.challenge.inviteToken, {
      confirmed: true,
      ignoreResourceWarning: true
    });

    if (accepted.state !== "active") {
      throw new Error(`Expected active turn-based duel, got ${accepted.state}`);
    }

    const surrendered = await service.resolveTurnBasedActionForTelegramUser(2n, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "surrender"
    });

    expect(surrendered).toMatchObject({
      state: "updated",
      session: {
        status: "forfeited"
      }
    });
    expect(world.challenges.get(created.challenge.inviteToken)).toMatchObject({
      status: "resolved",
      resolvedAt: fixedNow(),
      result: {
        mode: "turn-based",
        terminalReason: "surrender",
        loserCharacterId: "character-2",
        xpRewards: {
          challenger: 6,
          target: 1
        }
      }
    });
    expect(world.characters.get(1n)?.xp).toBe(31);
    expect(world.characters.get(2n)?.xp).toBe(26);
    expect(activityEvents.duelCompletions).toEqual([
      expect.objectContaining({
        challengeId: created.challenge.id,
        mode: "turn-based",
        challengerCharacterId: "character-1",
        challengerDisplayName: "Пригодник 1",
        targetCharacterId: "character-2",
        targetDisplayName: "Пригодник 2",
        outcome: "challenger"
      })
    ]);

    await service.resolveTurnBasedActionForTelegramUser(2n, {
      inviteToken: created.challenge.inviteToken,
      expectedTurn: accepted.session.turn,
      expectedVersion: accepted.session.version,
      action: "surrender"
    });
    expect(world.characters.get(1n)?.xp).toBe(31);
    expect(world.characters.get(2n)?.xp).toBe(26);
    expect(activityEvents.duelCompletions).toHaveLength(1);
  });
});

function buildService(
  world: FakeDuelWorld,
  clock = fixedNow,
  nearbyDuelTargets?: NearbyDuelTargetValidator,
  achievements?: AchievementService,
  activityEvents?: Pick<PublicActivityEventPublisher, "recordDuelCompletedSafely">,
  fightingCornerQuest?: ConstructorParameters<typeof DuelChallengeService>[7]
): DuelChallengeService {
  return new DuelChallengeService(
    world,
    world,
    clock,
    new FakeRandomSource([0.5]),
    nearbyDuelTargets,
    achievements,
    activityEvents,
    fightingCornerQuest
  );
}

class FakeDuelActivityEvents {
  readonly duelCompletions: Parameters<PublicActivityEventPublisher["recordDuelCompletedSafely"]>[0][] = [];

  recordDuelCompletedSafely(
    input: Parameters<PublicActivityEventPublisher["recordDuelCompletedSafely"]>[0]
  ): Promise<null> {
    if (!this.duelCompletions.some((entry) => entry.challengeId === input.challengeId)) {
      this.duelCompletions.push(input);
    }
    return Promise.resolve(null);
  }
}

class FakeFightingCornerQuestIntegration {
  readonly recorded = new Set<bigint>();

  constructor(
    private readonly enabled = true,
    private readonly failOnceFor = new Set<bigint>()
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  recordResolvedDuelSafely(
    challenge: DuelChallengeRecord,
    options: { hasResolvedRound?: boolean } = {}
  ): Promise<Array<{
    telegramUserId: bigint;
    objective: "turn-based-duel";
    progress: {
      accepted: boolean;
      trainingCompleted: boolean;
      quickDuelCompleted: boolean;
      turnBasedDuelCompleted: boolean;
      completedObjectives: number;
      requiredObjectives: 3;
      readyToClaim: boolean;
      currentLocationId: string | null;
    };
  }>> {
    if (!this.enabled || challenge.status !== "resolved" || options.hasResolvedRound !== true || !challenge.target) {
      return Promise.resolve([]);
    }

    const participantIds = [challenge.challenger.telegramUserId, challenge.target.telegramUserId];
    return Promise.resolve(participantIds.flatMap((telegramUserId) => {
      if (this.failOnceFor.delete(telegramUserId) || this.recorded.has(telegramUserId)) {
        return [];
      }
      this.recorded.add(telegramUserId);
      return [{
        telegramUserId,
        objective: "turn-based-duel" as const,
        progress: {
          accepted: true,
          trainingCompleted: false,
          quickDuelCompleted: false,
          turnBasedDuelCompleted: true,
          completedObjectives: 1,
          requiredObjectives: 3 as const,
          readyToClaim: false,
          currentLocationId: "location.korchma.fighting_corner"
        }
      }];
    }));
  }
}

function setSessionHitPoints(world: FakeDuelWorld, sessionId: string, hp: number): void {
  const session = world.sessions.get(sessionId);
  if (!session) throw new Error("Expected stored turn-based session.");
  session.state.participants.challenger.hp = hp;
  session.state.participants.target.hp = hp;
}

class FakeDuelWorld implements DuelChallengeRepository, CharacterRepository {
  readonly characters = new Map<bigint, DuelCharacterSnapshot>();
  readonly challenges = new Map<string, DuelChallengeRecord>();
  readonly sessions = new Map<string, DuelCombatSessionRecord>();
  readonly turnActions = new Map<string, DuelCombatActionRecord[]>();
  readonly resourceUpdates: UpdateCharacterResourcesInput[] = [];
  readonly busyCharacterIds = new Set<string>();
  readonly nearbyTargets = new FakeNearbyDuelTargetValidator();
  failNextResourceUpdate = false;
  failNextTurnUpdateWithConcurrentOpponentChoice = false;
  turnUpdateAttempts = 0;
  resolvedRoundLookupCount = 0;
  fullJournalLookupCount = 0;

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
    input: { inviteToken: string; mode?: "quick" | "turn-based"; contextChatId?: bigint | null; expiresAt: Date }
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
      mode: input.mode ?? "quick",
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
    input: { inviteToken: string; mode?: "quick" | "turn-based"; contextChatId?: bigint | null; expiresAt: Date }
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
      mode: input.mode ?? "quick",
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

  findCharacterByTelegramUser(telegramUserId: bigint, now?: Date): Promise<DuelCharacterSnapshot | null> {
    void now;
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
    return Promise.resolve(this.refreshChallenge(this.challenges.get(inviteToken)));
  }

  markExpiredByToken(inviteToken: string, now: Date): Promise<DuelChallengeRecord | null> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.expiresAt <= now) {
      const updated = { ...challenge, status: "expired" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve(this.refreshChallenge(updated));
    }

    return Promise.resolve(this.refreshChallenge(challenge));
  }

  cancelByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<{ record: DuelChallengeRecord | null; transitioned: boolean }> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.challenger.telegramUserId === telegramUserId) {
      const updated = { ...challenge, status: "cancelled" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve({ record: this.refreshChallenge(updated), transitioned: true });
    }

    return Promise.resolve({ record: this.refreshChallenge(challenge), transitioned: false });
  }

  declineByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<{ record: DuelChallengeRecord | null; transitioned: boolean }> {
    const challenge = this.challenges.get(inviteToken);

    if (challenge?.status === "pending" && challenge.target?.telegramUserId === telegramUserId) {
      const updated = { ...challenge, status: "declined" as const, updatedAt: now };
      this.challenges.set(inviteToken, updated);

      return Promise.resolve({ record: this.refreshChallenge(updated), transitioned: true });
    }

    return Promise.resolve({ record: this.refreshChallenge(challenge), transitioned: false });
  }

  acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<{ record: DuelChallengeRecord | null; transitioned: boolean }> {
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
      return Promise.resolve({ record: challenge ?? null, transitioned: false });
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

    return Promise.resolve({ record: updated, transitioned: true });
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
      ).map((challenge) => this.refreshChallenge(challenge)) as ResolvedDuelChallengeRecord[]
    );
  }

  startTurnBasedByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    input: StartTurnBasedDuelSessionInput
  ): Promise<{ record: DuelCombatSessionRecord | null; transitioned: boolean }> {
    const challenge = this.challenges.get(inviteToken);
    const target = this.characters.get(telegramUserId);

    if (
      !challenge ||
      !target ||
      challenge.status !== "pending" ||
      challenge.mode !== "turn-based" ||
      challenge.expiresAt <= now ||
      challenge.challengerCharacterId === target.id ||
      (challenge.targetCharacterId !== null && challenge.targetCharacterId !== target.id) ||
      this.busyCharacterIds.has(challenge.challengerCharacterId) ||
      this.busyCharacterIds.has(target.id)
    ) {
      return Promise.resolve({ record: null, transitioned: false });
    }

    const summarize = (character: DuelCharacterSnapshot) => {
      const summary = summarizeCharacter(character, {
        equippedItems: getEquippedItemContents(character.equipment),
        remortCount: character.remortCount ?? 0
      });
      const equipmentAbilityGrantIds = getCombatMantokAbilityGrantsForEquippedItems({
        itemIds: character.equipment.map((row) => row.itemId),
        characterLevel: summary.level
      }).map((grant) => grant.id);
      return {
        ...summary,
        id: character.id,
        ...(equipmentAbilityGrantIds.length > 0 ? { equipmentAbilityGrantIds } : {})
      };
    };
    const state = startTurnBasedDuel({
      challenger: summarize(challenge.challenger),
      target: summarize(target),
      rng: input.rng
    });
    const activeChallenge: DuelChallengeRecord = {
      ...challenge,
      targetCharacterId: target.id,
      target,
      status: "active",
      updatedAt: now
    };
    const session: DuelCombatSessionRecord = {
      id: input.sessionId,
      duelChallengeId: activeChallenge.id,
      challengerCharacterId: activeChallenge.challengerCharacterId,
      targetCharacterId: target.id,
      status: "active",
      actingCharacterId: state.actingCharacterId,
      state: cloneState(state),
      turn: state.turn,
      version: 1,
      turnExpiresAt: input.turnExpiresAt,
      completedAt: null,
      challengerChatId: null,
      challengerMessageId: null,
      targetChatId: input.targetChatId ?? null,
      targetMessageId: input.targetMessageId ?? null,
      createdAt: now,
      updatedAt: now,
      challenge: activeChallenge
    };
    this.challenges.set(inviteToken, activeChallenge);
    this.sessions.set(session.id, session);

    return Promise.resolve({ record: this.refreshSession(session), transitioned: true });
  }

  findActiveTurnBasedByTelegramUserId(
    telegramUserId: bigint
  ): Promise<DuelCombatSessionRecord | null> {
    const character = this.characters.get(telegramUserId);

    if (!character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      [...this.sessions.values()].map((session) => this.refreshSession(session)).find(
        (session) =>
          session.status === "active" &&
          (session.challengerCharacterId === character.id || session.targetCharacterId === character.id)
      ) ?? null
    );
  }

  findActiveCombatBlockerCharacterId(characterIds: string[]): Promise<string | null> {
    return Promise.resolve(
      characterIds.find((characterId) => this.busyCharacterIds.has(characterId)) ?? null
    );
  }

  findTurnBasedByTokenForTelegramUserId(
    inviteToken: string,
    telegramUserId: bigint
  ): Promise<DuelCombatSessionRecord | null> {
    const character = this.characters.get(telegramUserId);

    if (!character) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      [...this.sessions.values()].map((session) => this.refreshSession(session)).find(
        (session) =>
          session.challenge.inviteToken === inviteToken &&
          (session.challengerCharacterId === character.id || session.targetCharacterId === character.id)
      ) ?? null
    );
  }

  findTurnBasedByToken(inviteToken: string): Promise<DuelCombatSessionRecord | null> {
    return Promise.resolve(
      [...this.sessions.values()].map((session) => this.refreshSession(session)).find(
        (session) => session.challenge.inviteToken === inviteToken
      ) ?? null
    );
  }

  listTurnBasedActionsByToken(inviteToken: string): Promise<DuelCombatActionRecord[]> {
    this.fullJournalLookupCount += 1;
    const session = [...this.sessions.values()].find(
      (entry) => entry.challenge.inviteToken === inviteToken
    );

    if (!session) {
      return Promise.resolve([]);
    }

    return Promise.resolve([...(this.turnActions.get(session.id) ?? [])]);
  }

  hasResolvedTurnBasedRoundByToken(inviteToken: string): Promise<boolean> {
    this.resolvedRoundLookupCount += 1;
    const session = [...this.sessions.values()].find(
      (entry) => entry.challenge.inviteToken === inviteToken
    );
    return Promise.resolve((session ? this.turnActions.get(session.id) ?? [] : [])
      .some((action) => action.actionKey === "round" || action.actionKey === "timeout-attack"));
  }

  updateTurnBasedIfActiveVersion(
    sessionId: string,
    expectedTurn: number,
    expectedVersion: number,
    input: UpdateTurnBasedDuelSessionInput
  ): Promise<DuelCombatSessionRecord | null> {
    this.turnUpdateAttempts += 1;
    const session = this.sessions.get(sessionId);

    if (
      !session ||
      session.status !== "active" ||
      session.turn !== expectedTurn ||
      session.version !== expectedVersion ||
      (input.deadlineMode === "player-action" && session.turnExpiresAt <= input.now) ||
      (input.deadlineMode === "timeout" && session.turnExpiresAt > input.now)
    ) {
      return Promise.resolve(null);
    }

    if (this.failNextTurnUpdateWithConcurrentOpponentChoice) {
      this.failNextTurnUpdateWithConcurrentOpponentChoice = false;
      const nextState = cloneState(session.state);
      nextState.pendingActions = {
        challenger: {
          actorCharacterId: session.challengerCharacterId,
          action: "attack"
        }
      };
      const raced = {
        ...session,
        state: nextState,
        version: expectedVersion + 1,
        updatedAt: fixedNow()
      };
      this.sessions.set(sessionId, raced);
      return Promise.resolve(null);
    }

    const challenge = this.challenges.get(session.challenge.inviteToken) ?? session.challenge;
    const nextChallenge =
      input.status !== "active" && input.result
        ? {
            ...challenge,
            status: "resolved" as const,
            resolvedAt: input.completedAt ?? fixedNow(),
            result: input.result,
            updatedAt: input.completedAt ?? fixedNow()
          }
        : challenge;
    if (input.status !== "active" && input.result?.xpRewards) {
      this.awardXp(session.challengerCharacterId, input.result.xpRewards.challenger);
      this.awardXp(session.targetCharacterId, input.result.xpRewards.target);
    }
    if (input.action) {
      const actions = this.turnActions.get(sessionId) ?? [];
      actions.push({
        id: `duel-action-${sessionId}-${actions.length + 1}`,
        sessionId,
        actorCharacterId: input.action.actorCharacterId,
        turn: input.action.turn,
        actionKey: input.action.actionKey,
        result: cloneState(input.action.result),
        createdAt: fixedNow()
      });
      this.turnActions.set(sessionId, actions);
    }
    const updated = {
      ...session,
      status: input.status,
      actingCharacterId: input.state.actingCharacterId,
      state: cloneState(input.state),
      turn: input.state.turn,
      version: expectedVersion + 1,
      turnExpiresAt: input.turnExpiresAt,
      completedAt: input.status === "active" ? null : input.completedAt ?? fixedNow(),
      updatedAt: fixedNow(),
      challenge: nextChallenge
    };

    this.challenges.set(nextChallenge.inviteToken, nextChallenge);
    this.sessions.set(sessionId, updated);

    return Promise.resolve(this.refreshSession(updated));
  }

  listDueTurnBasedSessions(): Promise<DuelCombatSessionRecord[]> {
    return Promise.resolve([]);
  }

  repairTurnBasedCombatState(): Promise<{ repairedSessions: number; removedOrphanLeases: number }> {
    return Promise.resolve({ repairedSessions: 0, removedOrphanLeases: 0 });
  }

  recordTurnBasedMessageReference(): Promise<DuelCombatSessionRecord | null> {
    return Promise.resolve(null);
  }

  private refreshChallenge(
    challenge: DuelChallengeRecord | undefined | null
  ): DuelChallengeRecord | null {
    if (!challenge) {
      return null;
    }

    const challenger = this.findCharacterById(challenge.challengerCharacterId) ?? challenge.challenger;
    const target = challenge.targetCharacterId
      ? this.findCharacterById(challenge.targetCharacterId) ?? challenge.target
      : null;

    return {
      ...challenge,
      challenger,
      target
    };
  }

  private refreshSession(session: DuelCombatSessionRecord): DuelCombatSessionRecord {
    const challenge = this.refreshChallenge(session.challenge) ?? session.challenge;

    return {
      ...session,
      challenge
    };
  }

  private findCharacterById(characterId: string): DuelCharacterSnapshot | null {
    return [...this.characters.values()].find((character) => character.id === characterId) ?? null;
  }

  private awardXp(characterId: string, xpReward: number): void {
    const entry = [...this.characters.entries()].find(([, character]) => character.id === characterId);

    if (!entry) {
      return;
    }

    const [telegramUserId, character] = entry;
    const xp = character.xp + Math.max(0, Math.floor(xpReward));
    this.characters.set(telegramUserId, {
      ...character,
      xp,
      level: Math.max(character.level, getLevelForXp(xp, { remortCount: character.remortCount ?? 0 }))
    });
  }
}

class FakeNearbyDuelTargetValidator implements NearbyDuelTargetValidator {
  available = true;
  readonly calls: Array<{ challenger: bigint; target: bigint }> = [];

  isNearbyDuelTargetAvailable(
    challengerTelegramUserId: bigint,
    targetTelegramUserId: bigint
  ): Promise<boolean> {
    this.calls.push({
      challenger: challengerTelegramUserId,
      target: targetTelegramUserId
    });

    return Promise.resolve(this.available);
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeEquipment(itemId: string): CharacterEquipmentRecord {
  return {
    id: `equipment-${itemId}`,
    characterId: "character",
    slot: "chest",
    itemId,
    createdAt: fixedNow(),
    updatedAt: fixedNow()
  };
}

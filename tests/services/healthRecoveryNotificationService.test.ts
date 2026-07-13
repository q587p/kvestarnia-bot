import { describe, expect, it, vi } from "vitest";
import {
  buildHpRecoveryStateFingerprint,
  type ClaimedHpRecoveryNotification,
  type HpRecoveryNotificationRepository,
  type HpRecoverySnapshot
} from "../../src/db/repositories/hpRecoveryNotificationRepository";
import { buildEquipmentAttunementPayload } from "../../src/domain/equipment/equipmentAttunement";
import { HealthRecoveryNotificationService } from "../../src/services/healthRecoveryNotificationService";

const now = new Date("2026-07-13T10:00:00.000Z");
const oldAnchor = new Date("2026-07-13T09:00:00.000Z");

describe("HealthRecoveryNotificationService", () => {
  it.each([
    ["level bonus and stored hpMax regression", { level: 2, hpCurrent: 25 }, 29],
    ["current-life remort progression", {
      level: 1,
      xp: 1300,
      remortCount: 1,
      hpCurrent: 65,
      hpRegenAt: new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }, 69],
    ["equipment HP", {
      hpCurrent: 24,
      equipment: [equipment("chest", "item.apron-of-foam-resistance")]
    }, 27],
    ["set item and two-piece set HP", {
      hpCurrent: 24,
      equipment: [
        equipment("chest", "item.set.barrel-brother.cuirass"),
        equipment("legs", "item.set.barrel-brother.greaves")
      ]
    }, 35]
  ])("uses canonical effective max HP for %s", async (_label, overrides, expectedHpMax) => {
    const snapshot = makeSnapshot(overrides);
    const fixture = makeRepository([makeCheckingRow(snapshot)], [snapshot]);
    const sender = { sendMessage: vi.fn().mockResolvedValue(true) };
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    const metrics = await service.runBatch(sender, now);

    expect(fixture.markReady).toHaveBeenCalledWith(expect.objectContaining({
      effectiveHpMax: expectedHpMax
    }));
    expect(metrics.sent).toBe(1);
  });

  it("keeps a base-full row waiting until an HP-affecting attunement becomes active", async () => {
    const readyAt = new Date("2026-07-13T10:05:00.000Z");
    const snapshot = makeSnapshot({
      hpCurrent: 25,
      equipment: [equipment("chest", "item.apron-of-foam-resistance")],
      attunementActions: [{
        createdAt: now,
        resultJson: buildEquipmentAttunementPayload({
          slot: "chest",
          itemId: "item.apron-of-foam-resistance",
          itemName: "apron",
          equipmentUpdatedAt: oldAnchor,
          strength: "weak",
          startedAt: now,
          readyAt
        })
      }]
    });
    const fixture = makeRepository([makeCheckingRow(snapshot)], [snapshot]);

    await new HealthRecoveryNotificationService(fixture.repository, true, false)
      .runBatch({ sendMessage: vi.fn() }, now);

    expect(fixture.rebase).toHaveBeenCalledWith(expect.objectContaining({ nextAttemptAt: readyAt }));
    expect(fixture.suppressChecking).not.toHaveBeenCalled();
  });

  it.each([
    ["HP item", [equipment("chest", "item.apron-of-foam-resistance")]],
    ["HP set bonus", [
      equipment("chest", "item.set.barrel-brother.cuirass"),
      equipment("legs", "item.set.barrel-brother.greaves")
    ]]
  ])("rebases a persisted row after restart when a pending %s becomes active", async (_label, equipped) => {
    const snapshot = makeSnapshot({ hpCurrent: 25, equipment: equipped });
    const row = { ...makeCheckingRow(snapshot), sourceFingerprint: "pending-before-restart" };
    const fixture = makeRepository([row], [snapshot]);

    await new HealthRecoveryNotificationService(fixture.repository, true, false)
      .runBatch({ sendMessage: vi.fn() }, now);

    expect(fixture.rebase).toHaveBeenCalled();
    expect(fixture.suppressChecking).not.toHaveBeenCalled();
    expect(fixture.markReady).not.toHaveBeenCalled();
  });

  it("suppresses the old attunement generation when the item was unequipped or replaced before readiness", async () => {
    const original = makeSnapshot({
      hpCurrent: 25,
      equipment: [equipment("chest", "item.apron-of-foam-resistance")]
    });
    const current = makeSnapshot({ hpCurrent: 25, equipment: [] });
    const fixture = makeRepository([makeCheckingRow(original)], [current]);

    await new HealthRecoveryNotificationService(fixture.repository, true, false)
      .runBatch({ sendMessage: vi.fn() }, now);

    expect(fixture.suppressChecking).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "already-full"
    }));
  });

  it.each([
    ["ordinary/training/starter", "solo-combat"],
    ["Big Barrel/raid", "party-boss"],
    ["turn-based duel", "turn-based-duel"]
  ])(
    "defers the shipped %s lease",
    async (_surface, kind) => {
      const snapshot = makeSnapshot({ activeCombatLease: { kind, referenceId: "lease" } });
      const fixture = makeRepository([makeCheckingRow(snapshot)], [snapshot]);
      const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

      await service.runBatch({ sendMessage: vi.fn() }, now);

      expect(fixture.rebase).toHaveBeenCalledWith(expect.objectContaining({
        nextAttemptAt: new Date(now.getTime() + 60_000)
      }));
      expect(fixture.markReady).not.toHaveBeenCalled();
    }
  );

  it("uses the relevant Shynok recovery window when scheduling the canonical full check", async () => {
    const recentAnchor = new Date(now.getTime() - 60_000);
    const baselineSnapshot = makeSnapshot({ hpCurrent: 1, hpRegenAt: recentAnchor });
    const boostedSnapshot = makeSnapshot({
      hpCurrent: 1,
      hpRegenAt: recentAnchor,
      recoveryDrink: {
        drinkKey: "drink.simple-beer",
        phase: "timed",
        startedAt: new Date(now.getTime() - 2 * 60_000),
        expiresAt: new Date(now.getTime() + 23 * 60_000),
        metadata: null
      }
    });
    const baseline = makeRepository([makeCheckingRow(baselineSnapshot)], [baselineSnapshot]);
    const boosted = makeRepository([makeCheckingRow(boostedSnapshot)], [boostedSnapshot]);

    await new HealthRecoveryNotificationService(baseline.repository, true, false)
      .runBatch({ sendMessage: vi.fn() }, now);
    await new HealthRecoveryNotificationService(boosted.repository, true, false)
      .runBatch({ sendMessage: vi.fn() }, now);

    const baselineDue = baseline.rebase.mock.calls[0]?.[0].nextAttemptAt as Date;
    const boostedDue = boosted.rebase.mock.calls[0]?.[0].nextAttemptAt as Date;
    expect(boostedDue.getTime()).toBeLessThan(baselineDue.getTime());
  });

  it.each([
    ["direct or lazy full heal", makeSnapshot({ hpCurrent: 25 })],
    ["remort before delivery", makeSnapshot({ remortCount: 1 })]
  ])("suppresses stale work after %s", async (_label, snapshot) => {
    const fixture = makeRepository([makeCheckingRow(makeSnapshot())], [snapshot]);
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    const metrics = await service.runBatch({ sendMessage: vi.fn() }, now);

    expect(metrics.suppressed).toBe(1);
    expect(fixture.markReady).not.toHaveBeenCalled();
  });

  it.each([
    ["new damage", makeSnapshot({ hpCurrent: 8 })],
    ["equipment drift", makeSnapshot({
      hpCurrent: 9,
      equipment: [equipment("chest", "item.apron-of-foam-resistance")]
    })]
  ])("rebases instead of sending after %s", async (_label, snapshot) => {
    const row = { ...makeCheckingRow(makeSnapshot()), sourceFingerprint: "old" };
    const fixture = makeRepository([row], [snapshot]);
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    await service.runBatch({ sendMessage: vi.fn() }, now);

    expect(fixture.rebase).toHaveBeenCalled();
    expect(fixture.markReady).not.toHaveBeenCalled();
  });

  it.each([
    ["success", null, "markSent"],
    ["definite retryable failure", { error_code: 429 }, "retrySending"],
    ["permanent blocked failure", { error_code: 403 }, "suppressSending"],
    ["ambiguous Telegram 5xx", { error_code: 500 }, "ambiguous"],
    ["ambiguous send crash", new Error("socket outcome unknown"), "ambiguous"]
  ])("applies at-most-once delivery semantics for %s", async (_label, error, expected) => {
    const snapshot = makeSnapshot({ hpCurrent: 25, hpRegenAt: now });
    const row = makeReadyRow(snapshot);
    const fixture = makeRepository([row], [snapshot]);
    const sender = {
      sendMessage: error
        ? vi.fn().mockRejectedValue(error)
        : vi.fn().mockResolvedValue(true)
    };
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    const metrics = await service.runBatch(sender, now);

    if (expected === "ambiguous") {
      expect(fixture.markSent).not.toHaveBeenCalled();
      expect(fixture.retrySending).not.toHaveBeenCalled();
      expect(fixture.suppressSending).not.toHaveBeenCalled();
      expect(metrics.errors).toBe(1);
    } else {
      expect(fixture[expected as "markSent"]).toHaveBeenCalled();
    }
  });

  it("respects Telegram retry_after for a definite 429", async () => {
    const snapshot = makeSnapshot({ hpCurrent: 25, hpRegenAt: now });
    const fixture = makeRepository([makeReadyRow(snapshot)], [snapshot]);
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    await service.runBatch({
      sendMessage: vi.fn().mockRejectedValue({ error_code: 429, parameters: { retry_after: 587 } })
    }, now);

    expect(fixture.retrySending).toHaveBeenCalledWith(
      "character",
      1,
      new Date(now.getTime() + 587_000),
      "telegram-retryable"
    );
  });

  it("suppresses a ready retry after the player interacted with a recovered-state card", async () => {
    const interactedAt = new Date(now.getTime() + 1_000);
    const snapshot = makeSnapshot({ hpCurrent: 25, hpRegenAt: now, lastActionAt: interactedAt });
    const row = makeReadyRow(snapshot);
    row.readyAt = now;
    const fixture = makeRepository([row], [snapshot]);
    const sender = { sendMessage: vi.fn() };

    const metrics = await new HealthRecoveryNotificationService(fixture.repository, true, false)
      .runBatch(sender, interactedAt);

    expect(metrics.suppressed).toBe(1);
    expect(fixture.suppressReady).toHaveBeenCalledWith(
      "character",
      1,
      interactedAt,
      "active-after-ready"
    );
    expect(sender.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["stale rollout row", { updatedAt: new Date(now.getTime() - 24 * 60 * 60_000 - 1) }],
    ["attempt-exhausted row", { attemptCount: 13 }]
  ])("suppresses a %s without occupying delivery forever", async (_label, rowOverrides) => {
    const snapshot = makeSnapshot({ hpCurrent: 25, hpRegenAt: now });
    const row = { ...makeReadyRow(snapshot), ...rowOverrides };
    const fixture = makeRepository([row], [snapshot]);
    const sender = { sendMessage: vi.fn() };

    const metrics = await new HealthRecoveryNotificationService(fixture.repository, true, false)
      .runBatch(sender, now);

    expect(metrics.suppressed).toBe(1);
    expect(sender.sendMessage).not.toHaveBeenCalled();
  });

  it("isolates one bad row and continues the batch", async () => {
    const first = makeSnapshot({ characterId: "first", telegramUserId: 1n, hpCurrent: 25, hpRegenAt: now });
    const second = makeSnapshot({ characterId: "second", telegramUserId: 2n, hpCurrent: 25, hpRegenAt: now });
    const fixture = makeRepository([makeReadyRow(first), makeReadyRow(second)], [first, second]);
    fixture.claimReadyForSending.mockImplementation(({ characterId }) =>
      characterId === "first" ? Promise.reject(new Error("row failed")) : Promise.resolve(true)
    );
    const sender = { sendMessage: vi.fn().mockResolvedValue(true) };
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    const metrics = await service.runBatch(sender, now);

    expect(metrics.errors).toBe(1);
    expect(metrics.sent).toBe(1);
    expect(sender.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does no repository work when the rollout flag is off", async () => {
    const fixture = makeRepository([], []);
    const service = new HealthRecoveryNotificationService(fixture.repository, false, true);

    expect(await service.runBatch({ sendMessage: vi.fn() }, now)).toEqual({
      due: 0, claimed: 0, sent: 0, retried: 0, suppressed: 0, errors: 0
    });
    expect(fixture.claimDue).not.toHaveBeenCalled();
    expect(service.areDevHelpersEnabled()).toBe(false);
  });

  it("keeps the dev mutation disabled in production even when rollout is enabled", async () => {
    const fixture = makeRepository([], []);
    const service = new HealthRecoveryNotificationService(fixture.repository, true, false);

    expect(service.areDevHelpersEnabled()).toBe(false);
    expect(await service.prepareDueForTelegramUser(42n, now)).toBe(false);
    expect(fixture.prepareDueForTelegramUser).not.toHaveBeenCalled();
  });
});

function makeRepository(rows: ClaimedHpRecoveryNotification[], snapshots: HpRecoverySnapshot[]) {
  const claimDue = vi.fn().mockResolvedValue(rows);
  const loadSnapshots = vi.fn().mockResolvedValue(snapshots);
  const rebase = vi.fn<HpRecoveryNotificationRepository["rebase"]>().mockResolvedValue(true);
  const suppressChecking = vi.fn().mockResolvedValue(true);
  const suppressReady = vi.fn().mockResolvedValue(true);
  const markReady = vi.fn<HpRecoveryNotificationRepository["markReady"]>().mockImplementation((input) => {
    const snapshot = snapshots.find((candidate) => candidate.characterId === input.characterId);
    if (snapshot) {
      snapshot.hpCurrent = input.effectiveHpMax;
      snapshot.hpRegenAt = input.readyAt;
    }
    return Promise.resolve(true);
  });
  const claimReadyForSending = vi.fn().mockResolvedValue(true);
  const markSent = vi.fn().mockResolvedValue(true);
  const retrySending = vi.fn().mockResolvedValue(true);
  const suppressSending = vi.fn().mockResolvedValue(true);
  const prepareDueForTelegramUser = vi.fn<
    HpRecoveryNotificationRepository["prepareDueForTelegramUser"]
  >().mockResolvedValue(true);
  const repository = {
    claimDue,
    loadSnapshots,
    rebase,
    suppressChecking,
    suppressReady,
    markReady,
    claimReadyForSending,
    markSent,
    retrySending,
    suppressSending,
    prepareDueForTelegramUser
  } as unknown as HpRecoveryNotificationRepository;
  return {
    repository,
    claimDue,
    loadSnapshots,
    rebase,
    suppressChecking,
    suppressReady,
    markReady,
    claimReadyForSending,
    markSent,
    retrySending,
    suppressSending,
    prepareDueForTelegramUser
  };
}

function makeSnapshot(overrides: Partial<HpRecoverySnapshot> = {}): HpRecoverySnapshot {
  return {
    characterId: "character",
    telegramUserId: 42n,
    lastActionAt: null,
    pronoun: "they",
    path: "boundary",
    raceId: "race.human",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    hpCurrent: 9,
    hpMax: 25,
    hpRegenAt: oldAnchor,
    statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
    remortCount: 0,
    activeCombatLease: null,
    equipment: [],
    attunementActions: [],
    recoveryDrink: null,
    ...overrides
  };
}

function makeCheckingRow(snapshot: HpRecoverySnapshot): ClaimedHpRecoveryNotification {
  return {
    characterId: snapshot.characterId,
    generation: 1,
    remortCount: snapshot.remortCount,
    sourceHpCurrent: snapshot.hpCurrent,
    sourceHpMax: snapshot.hpMax,
    sourceHpRegenAt: snapshot.hpRegenAt,
    sourceFingerprint: null,
    status: "checking",
    nextAttemptAt: now,
    processingStartedAt: now,
    readyAt: null,
    sentAt: null,
    suppressedAt: null,
    attemptCount: 1,
    lastErrorCode: null,
    createdAt: oldAnchor,
    updatedAt: now,
    claim: "checking",
    claimStartedAt: now
  };
}

function makeReadyRow(snapshot: HpRecoverySnapshot): ClaimedHpRecoveryNotification {
  return {
    ...makeCheckingRow(snapshot),
    remortCount: snapshot.remortCount,
    sourceHpCurrent: snapshot.hpCurrent,
    sourceHpRegenAt: snapshot.hpRegenAt,
    sourceFingerprint: buildHpRecoveryStateFingerprint(snapshot, now),
    status: "ready",
    processingStartedAt: null,
    readyAt: now,
    claim: "ready",
    claimStartedAt: null
  };
}

function equipment(slot: string, itemId: string) {
  return { slot, itemId, updatedAt: oldAnchor };
}

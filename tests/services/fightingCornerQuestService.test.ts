import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord, CharacterRepository } from "../../src/db/repositories/characterRepository";
import {
  canonicalizeAppliedItemGrants,
  type ClaimDailyActionInput,
  type ClaimDailyActionResult,
  type DailyActionRecord,
  type DailyActionRepository,
  type ItemGrant
} from "../../src/db/repositories/dailyActionRepository";
import { buildQuestIskrokaminBonusGrant } from "../../src/domain/quests/questIskrokaminBonus";
import type { DuelChallengeRecord } from "../../src/db/repositories/duelChallengeRepository";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import {
  ISKROKAMIN_ITEM_ID,
  PINK_SOAP_OF_FIRST_RULE_ITEM_ID
} from "../../src/services/itemGrant";
import {
  FIGHTING_CORNER_QUEST_KEYS,
  FightingCornerQuestService,
  getFightingCornerQuestRewardGold,
  getFightingCornerQuestRewardXp
} from "../../src/services/fightingCornerQuestService";

const ACCEPTED_AT = new Date("2026-07-13T18:00:00.123Z");
const RESOLVED_AT = new Date("2026-07-13T18:13:00.000Z");

describe("FightingCornerQuestService", () => {
  it("loads current-life state through one bounded read of the five exact quest keys", async () => {
    const world = new TestWorld();

    await world.service().getForTelegramUser(42n);

    expect(world.daily.listLookups).toEqual([{
      characterId: "character-1",
      keys: Object.values(FIGHTING_CORNER_QUEST_KEYS),
      localDate: "life:0",
      take: 5
    }]);
  });

  it("unlocks at level 3 without retiring at high levels and requires the physical Quest Table", async () => {
    const world = new TestWorld();
    world.character.level = 2;
    expect(await world.service().getForTelegramUser(42n)).toMatchObject({
      state: "level-locked",
      requiredLevel: 3
    });

    world.character.level = 13;
    expect(await world.service().acceptForTelegramUser(42n)).toMatchObject({ state: "wrong-location" });
    world.character.currentLocationId = "location.korchma.quest_table";
    expect(await world.service().acceptForTelegramUser(42n)).toMatchObject({ state: "accepted" });
    expect(await world.service().acceptForTelegramUser(42n)).toMatchObject({ state: "already-accepted" });
  });

  it("counts only terminal settled Doppelganger training after acceptance and accepts either outcome", async () => {
    const world = new TestWorld();
    await world.accept();
    const service = world.service();

    expect(await service.recordTrainingSessionSafely(42n, trainingSession({ status: "active" }))).toEqual([]);
    expect(await service.recordTrainingSessionSafely(42n, trainingSession({ status: "fled" }))).toEqual([]);
    expect(await service.recordTrainingSessionSafely(42n, trainingSession({ status: "expired" }))).toEqual([]);
    expect(await service.recordTrainingSessionSafely(42n, trainingSession({ settlement: "pending" }))).toEqual([]);
    expect(await service.recordTrainingSessionSafely(42n, {
      ...trainingSession(),
      monsterId: "monster.ordinary"
    })).toEqual([]);
    expect(await service.recordTrainingSessionSafely(42n, trainingSession({ completedAt: "2026-07-13T17:00:00.000Z" }))).toEqual([]);

    const updates = await service.recordTrainingSessionSafely(42n, trainingSession({ status: "lost" }));
    expect(updates).toMatchObject([{ objective: "training", progress: { completedObjectives: 1 } }]);
    expect(await service.recordTrainingSessionSafely(42n, trainingSession({ status: "won" }))).toEqual([]);
  });

  it.each([
    ["before", "2026-07-13T18:00:00.122Z", false],
    ["equal", "2026-07-13T18:00:00.123Z", true],
    ["after", "2026-07-13T18:00:00.124Z", true]
  ] as const)("accepts the inclusive post-accept boundary for an event %s acceptance", async (_label, completedAt, counts) => {
    const world = new TestWorld();
    await world.accept();

    const updates = await world.service().recordTrainingSessionSafely(
      42n,
      trainingSession({ completedAt })
    );

    expect(updates.length > 0).toBe(counts);
  });

  it("credits an ordinary resolved quick duel to both current-life participants but excludes retaliation", async () => {
    const world = new TestWorld();
    await world.accept(42n);
    await world.accept(84n);
    const service = world.service();

    expect(await service.recordResolvedDuelSafely(duel(world, { status: "pending" }))).toEqual([]);

    const updates = await service.recordResolvedDuelSafely(duel(world));
    expect(updates.map((update) => update.telegramUserId)).toEqual([42n, 84n]);
    expect(updates.every((update) => update.objective === "quick-duel")).toBe(true);
    expect(await service.recordResolvedDuelSafely(duel(world))).toEqual([]);

    const retaliationWorld = new TestWorld();
    await retaliationWorld.accept(42n);
    await retaliationWorld.accept(84n);
    retaliationWorld.retaliationTokens.add("duel-token");
    expect(await retaliationWorld.service().recordResolvedDuelSafely(duel(retaliationWorld))).toEqual([]);
  });

  it("credits an instant quick duel exactly once when it resolves at the acceptance timestamp", async () => {
    const world = new TestWorld();
    await world.accept(42n);
    await world.accept(84n);
    const challenge = {
      ...duel(world),
      resolvedAt: ACCEPTED_AT,
      updatedAt: ACCEPTED_AT
    };
    const service = world.service();

    const first = await service.recordResolvedDuelSafely(challenge);
    const replay = await service.recordResolvedDuelSafely(challenge);

    expect(first.map((update) => update.telegramUserId)).toEqual([42n, 84n]);
    expect(first.every((update) => update.objective === "quick-duel")).toBe(true);
    expect(replay).toEqual([]);
  });

  it.each(["pending", "declined", "cancelled", "expired", "forfeited"] as const)(
    "does not credit a %s quick duel",
    async (status) => {
      const world = new TestWorld();
      await world.accept(42n);
      await world.accept(84n);
      expect(await world.service().recordResolvedDuelSafely(duel(world, { status }))).toEqual([]);
    }
  );

  it("requires a durable resolved round for a terminal turn-based duel and does not require victory", async () => {
    const world = new TestWorld();
    await world.accept(42n);
    await world.accept(84n);
    const challenge = duel(world, { mode: "turn-based", outcome: "target" });

    expect(await world.service().recordResolvedDuelSafely(challenge, { hasResolvedRound: false })).toEqual([]);
    const updates = await world.service().recordResolvedDuelSafely(challenge, { hasResolvedRound: true });

    expect(updates).toHaveLength(2);
    expect(updates.every((update) => update.objective === "turn-based-duel")).toBe(true);
  });

  it("allows objectives in any order, recovers missed progress idempotently and requires a separate claim", async () => {
    const world = new TestWorld();
    await world.accept(42n);
    const service = world.service();

    await service.recordResolvedDuelSafely(duel(world, { mode: "turn-based" }), { hasResolvedRound: true });
    await service.recordTrainingSessionSafely(42n, trainingSession({ status: "won" }));
    await service.recordResolvedDuelSafely(duel(world));

    expect(await service.getForTelegramUser(42n)).toMatchObject({
      state: "turn-in-ready",
      progress: { completedObjectives: 3, readyToClaim: true }
    });
    expect(world.character.xp).toBe(0);
    expect(await service.claimForTelegramUser(42n)).toMatchObject({ state: "wrong-location" });

    world.character.currentLocationId = "location.korchma.quest_table";
    expect(await service.claimForTelegramUser(42n)).toMatchObject({ state: "completed" });
  });

  it("grants and replays the exact level 3 soap and Iskrokamin reward", async () => {
    const world = new TestWorld();
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";

    const first = await world.service().claimForTelegramUser(42n);
    const replay = await world.service().claimForTelegramUser(42n);

    expect(first).toMatchObject({
      state: "completed",
      reward: {
        itemGrants: [
          { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
          { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
        ]
      }
    });
    expect(replay).toMatchObject({ state: "already-completed", reward: first.state === "completed" ? first.reward : {} });
  });

  it("stores and replays the exact reward, including the canonical level 4+ Iskrokamin bonus", async () => {
    const world = new TestWorld();
    world.character.level = 4;
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";
    const service = world.service();

    const first = await service.claimForTelegramUser(42n);
    const replay = await service.claimForTelegramUser(42n);

    expect(first).toMatchObject({
      state: "completed",
      reward: {
        xp: getFightingCornerQuestRewardXp({ level: 4, remortCount: 0 }),
        gold: 37,
        itemGrants: [
          { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
          { itemId: ISKROKAMIN_ITEM_ID, quantity: 2 }
        ]
      }
    });
    expect(replay).toMatchObject({ state: "already-completed", reward: first.state === "completed" ? first.reward : {} });
    expect(world.daily.count(FIGHTING_CORNER_QUEST_KEYS.completed, "life:0", 42n)).toBe(1);
    expect(world.grantedItems).toEqual([
      { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
      { itemId: ISKROKAMIN_ITEM_ID, quantity: 2 }
    ]);
  });

  it("normalizes older duplicate applied-grant rows on exact reward replay", async () => {
    const world = new TestWorld();
    world.character.level = 4;
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";
    await world.service().claimForTelegramUser(42n);
    world.daily.replaceResult(42n, FIGHTING_CORNER_QUEST_KEYS.completed, "life:0", {
      reward: {
        appliedItemGrants: [
          { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
          { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 },
          { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
        ]
      }
    });

    const replay = await world.service().claimForTelegramUser(42n);

    expect(replay).toMatchObject({
      state: "already-completed",
      reward: {
        itemGrants: [
          { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
          { itemId: ISKROKAMIN_ITEM_ID, quantity: 2 }
        ]
      }
    });
  });

  it("serializes concurrent claims so XP, gold and items are granted once", async () => {
    const world = new TestWorld();
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";

    const results = await Promise.all([
      world.service().claimForTelegramUser(42n),
      world.service().claimForTelegramUser(42n)
    ]);

    expect(results.map((result) => result.state).sort()).toEqual(["already-completed", "completed"]);
    expect(world.character.xp).toBe(getFightingCornerQuestRewardXp(world.character));
    expect(world.character.gold).toBe(getFightingCornerQuestRewardGold(world.character.level));
    expect(world.grantedItems).toEqual([
      { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
      { itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }
    ]);
  });

  it("omits a pre-owned soap from both applied and replayed grants", async () => {
    const world = new TestWorld();
    world.preown(PINK_SOAP_OF_FIRST_RULE_ITEM_ID);
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";

    const first = await world.service().claimForTelegramUser(42n);
    const replay = await world.service().claimForTelegramUser(42n);

    expect(first).toMatchObject({
      state: "completed",
      reward: { itemGrants: [{ itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }] }
    });
    expect(replay).toMatchObject({
      state: "already-completed",
      reward: { itemGrants: [{ itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }] }
    });
    expect(world.grantedItems).toEqual([{ itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }]);
  });

  it("allows a new remort-life quest while an owned exact base soap remains capped at one", async () => {
    const world = new TestWorld();
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";
    await world.service().claimForTelegramUser(42n);

    world.character.remortCount = 1;
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";
    const nextLife = await world.service().claimForTelegramUser(42n);

    expect(nextLife).toMatchObject({
      state: "completed",
      reward: { itemGrants: [{ itemId: ISKROKAMIN_ITEM_ID, quantity: 1 }] }
    });
    expect(world.grantedItems.filter((grant) => grant.itemId === PINK_SOAP_OF_FIRST_RULE_ITEM_ID))
      .toEqual([{ itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 }]);
    expect(world.daily.count(FIGHTING_CORNER_QUEST_KEYS.completed, "life:1", 42n)).toBe(1);
  });

  it("may grant the exact base soap again in a later life after it is no longer owned", async () => {
    const world = new TestWorld();
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";
    await world.service().claimForTelegramUser(42n);

    world.ownedItems.delete(PINK_SOAP_OF_FIRST_RULE_ITEM_ID);
    world.character.remortCount = 1;
    await world.completeObjectives();
    world.character.currentLocationId = "location.korchma.quest_table";
    const nextLife = await world.service().claimForTelegramUser(42n);

    expect(nextLife.state).toBe("completed");
    expect(nextLife.state === "completed" ? nextLife.reward.itemGrants : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 })
      ])
    );
    expect(world.grantedItems.filter((grant) => grant.itemId === PINK_SOAP_OF_FIRST_RULE_ITEM_ID))
      .toEqual([
        { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 },
        { itemId: PINK_SOAP_OF_FIRST_RULE_ITEM_ID, quantity: 1 }
      ]);
  });

  it("isolates every stage by remort life and rejects results settled for an older life", async () => {
    const world = new TestWorld();
    await world.accept();
    await world.service().recordTrainingSessionSafely(42n, trainingSession({ status: "won", remortCount: 0 }));

    world.character.remortCount = 1;
    world.character.level = 1;
    expect(await world.service().getForTelegramUser(42n)).toMatchObject({ state: "level-locked" });
    world.character.level = 3;
    expect(await world.service().getForTelegramUser(42n)).toMatchObject({
      state: "available",
      progress: { accepted: false, completedObjectives: 0 }
    });
    await world.accept();
    expect(await world.service().recordTrainingSessionSafely(
      42n,
      trainingSession({ status: "won", remortCount: 0 })
    )).toEqual([]);
    expect(world.daily.count(FIGHTING_CORNER_QUEST_KEYS.training, "life:0", 42n)).toBe(1);
    expect(world.daily.count(FIGHTING_CORNER_QUEST_KEYS.training, "life:1", 42n)).toBe(0);
  });

  it("resets only the current life through the non-production helper", async () => {
    const world = new TestWorld();
    await world.accept();
    world.character.remortCount = 1;
    await world.accept();

    expect(await world.service().resetCurrentLifeForTelegramUser(42n)).toBe("reset");
    expect(world.daily.count(FIGHTING_CORNER_QUEST_KEYS.accepted, "life:0", 42n)).toBe(1);
    expect(world.daily.count(FIGHTING_CORNER_QUEST_KEYS.accepted, "life:1", 42n)).toBe(0);
    expect(await world.service({ devHelpersEnabled: false }).resetCurrentLifeForTelegramUser(42n)).toBe("disabled");
  });

  it("contains progress persistence failures so gameplay settlement callers are not rejected", async () => {
    const world = new TestWorld();
    await world.accept();
    world.daily.failClaims = true;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(world.service().recordTrainingSessionSafely(42n, trainingSession({ status: "won" })))
      .resolves.toEqual([]);
    expect(warning).toHaveBeenCalledWith(
      "Kvestarnia: Fighting Corner quest progress follow-up failed.",
      expect.any(Error)
    );
    warning.mockRestore();
  });

  it("uses 42% of the remort-adjusted level band with 5..42 clamps and the canonical gold cap", () => {
    expect(getFightingCornerQuestRewardXp({ level: 1, remortCount: 0 })).toBe(5);
    expect(getFightingCornerQuestRewardXp({ level: 3, remortCount: 0 })).toBe(9);
    expect(getFightingCornerQuestRewardXp({ level: 3, remortCount: 1 })).toBe(11);
    expect(getFightingCornerQuestRewardXp({ level: 999, remortCount: 0 })).toBe(42);
    expect(getFightingCornerQuestRewardGold(3)).toBe(31);
    expect(getFightingCornerQuestRewardGold(99)).toBe(93);
  });
});

class TestWorld {
  readonly character = makeCharacter("character-1", 42n);
  readonly target = makeCharacter("character-2", 84n);
  readonly characters = new Map<bigint, CharacterRecord>([[42n, this.character], [84n, this.target]]);
  readonly grantedItems: ItemGrant[] = [];
  readonly ownedItems = new Map<string, number>();
  readonly retaliationTokens = new Set<string>();
  readonly daily = new TestDailyActionRepository(this.characters, this.grantedItems, this.ownedItems);

  service(options: { enabled?: boolean; devHelpersEnabled?: boolean } = {}): FightingCornerQuestService {
    return new FightingCornerQuestService(
      {
        findByTelegramUserId: (telegramUserId: bigint) => Promise.resolve(this.characters.get(telegramUserId) ?? null)
      } as CharacterRepository,
      this.daily,
      {
        isRogueRetaliationDuelInviteToken: (token: string) => Promise.resolve(this.retaliationTokens.has(token))
      },
      {
        enabled: options.enabled ?? true,
        devHelpersEnabled: options.devHelpersEnabled ?? true
      },
      () => ACCEPTED_AT
    );
  }

  preown(itemId: string, quantity = 1): void {
    this.ownedItems.set(itemId, quantity);
  }

  async accept(telegramUserId = 42n): Promise<void> {
    const character = this.characters.get(telegramUserId)!;
    character.currentLocationId = "location.korchma.quest_table";
    await this.service().acceptForTelegramUser(telegramUserId);
    character.currentLocationId = "location.korchma.fighting_corner";
  }

  async completeObjectives(): Promise<void> {
    await this.accept(42n);
    await this.service().recordTrainingSessionSafely(42n, trainingSession({
      status: "won",
      remortCount: this.character.remortCount ?? 0
    }));
    await this.service().recordResolvedDuelSafely(duel(this));
    await this.service().recordResolvedDuelSafely(duel(this, { mode: "turn-based" }), { hasResolvedRound: true });
  }
}

class TestDailyActionRepository implements DailyActionRepository {
  private readonly rows = new Map<string, DailyActionRecord>();
  readonly listLookups: Array<{
    characterId: string;
    keys: readonly string[];
    localDate: string;
    take: number;
  }> = [];
  failClaims = false;

  constructor(
    private readonly characters: Map<bigint, CharacterRecord>,
    private readonly grantedItems: ItemGrant[],
    private readonly ownedItems: Map<string, number>
  ) {}

  findForTelegramUser(telegramUserId: bigint, input: { key: string; localDate: string }): Promise<DailyActionRecord | null> {
    return Promise.resolve(this.rows.get(rowKey(telegramUserId, input.key, input.localDate)) ?? null);
  }

  listForCharacterByKeys(
    characterId: string,
    input: { keys: readonly string[]; localDate: string; take: number }
  ): Promise<DailyActionRecord[]> {
    this.listLookups.push({ characterId, ...input });
    return Promise.resolve([...this.rows.values()]
      .filter((row) => row.characterId === characterId && row.localDate === input.localDate && input.keys.includes(row.key))
      .slice(0, input.take));
  }

  claimForTelegramUser(telegramUserId: bigint, input: ClaimDailyActionInput): Promise<ClaimDailyActionResult | null> {
    if (this.failClaims) {
      return Promise.reject(new Error("daily action unavailable"));
    }
    const character = this.characters.get(telegramUserId);
    if (!character || (input.expectedLife && input.expectedLife.remortCount !== (character.remortCount ?? 0))) {
      return Promise.resolve(null);
    }
    const key = rowKey(telegramUserId, input.key, input.localDate);
    const existing = this.rows.get(key);
    if (existing) {
      return Promise.resolve({ state: "existing", action: existing, character, levelChange: null, itemGrants: [] });
    }

    const bonus = input.questIskrokaminBonus
      ? buildQuestIskrokaminBonusGrant({
          characterId: character.id,
          characterLevel: character.level,
          sourceIdentity: `${input.key}:${input.localDate}`
        })
      : null;
    const itemGrants = bonus
      ? [...(input.itemGrants ?? []), bonus]
      : [...(input.itemGrants ?? [])];
    const appliedItemGrants = itemGrants.flatMap((grant) => {
      const owned = this.ownedItems.get(grant.itemId) ?? 0;
      const quantity = grant.maxOwnedQuantity === undefined
        ? grant.quantity
        : Math.max(0, Math.min(grant.quantity, grant.maxOwnedQuantity - owned));
      if (quantity <= 0) {
        return [];
      }
      this.ownedItems.set(grant.itemId, owned + quantity);
      return [{ itemId: grant.itemId, quantity }];
    });
    const mergedItemGrants = canonicalizeAppliedItemGrants(appliedItemGrants);
    const base = input.resultJson && typeof input.resultJson === "object" && !Array.isArray(input.resultJson)
      ? input.resultJson
      : {};
    const resultJson = mergedItemGrants.length > 0
      ? { ...base, reward: { ...("reward" in base && typeof base.reward === "object" ? base.reward : {}), appliedItemGrants: mergedItemGrants } }
      : base;
    const row: DailyActionRecord = {
      id: `action-${this.rows.size + 1}`,
      characterId: character.id,
      key: input.key,
      localDate: input.localDate,
      rewardXp: input.rewardXp,
      rewardGold: input.rewardGold,
      spentGold: input.spentGold ?? 0,
      resultJson,
      createdAt: ACCEPTED_AT
    };
    this.rows.set(key, row);
    character.xp += input.rewardXp;
    character.gold += input.rewardGold;
    this.grantedItems.push(...mergedItemGrants);
    return Promise.resolve({
      state: "created",
      action: row,
      character,
      levelChange: { oldLevel: character.level, newLevel: character.level, leveledUp: false },
      itemGrants: mergedItemGrants,
      hpLoss: null
    });
  }

  deleteForTelegramUser(telegramUserId: bigint, input: { key: string; localDate: string }): Promise<"deleted" | "missing"> {
    return Promise.resolve(this.rows.delete(rowKey(telegramUserId, input.key, input.localDate)) ? "deleted" : "missing");
  }

  count(key: string, localDate: string, telegramUserId: bigint): number {
    return this.rows.has(rowKey(telegramUserId, key, localDate)) ? 1 : 0;
  }

  replaceResult(telegramUserId: bigint, key: string, localDate: string, resultJson: unknown): void {
    const keyValue = rowKey(telegramUserId, key, localDate);
    const existing = this.rows.get(keyValue);
    if (!existing) {
      throw new Error(`Missing test daily action ${keyValue}.`);
    }
    this.rows.set(keyValue, { ...existing, resultJson: resultJson as DailyActionRecord["resultJson"] });
  }
}

function makeCharacter(id: string, telegramUserId: bigint): CharacterRecord {
  void telegramUserId;
  return {
    id,
    userId: `user-${id}`,
    currentLocationId: "location.korchma.fighting_corner",
    name: id === "character-1" ? "Марко" : "Орися",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 0,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: { strength: 8, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
    remortCount: 0
  };
}

function trainingSession(options: {
  status?: SoloCombatSessionRecord["status"];
  settlement?: "pending" | "completed";
  completedAt?: string;
  remortCount?: number;
} = {}): SoloCombatSessionRecord {
  const status = options.status ?? "won";
  return {
    id: "training-1",
    characterId: "character-1",
    monsterId: "monster.training-doppelganger",
    status,
    turn: 1,
    state: {
      status,
      completedAt: options.completedAt ?? RESOLVED_AT.toISOString(),
      settlement: { status: options.settlement ?? "completed" },
      life: { remortCount: options.remortCount ?? 0 }
    } as SoloCombatSessionRecord["state"],
    reward: null,
    createdAt: ACCEPTED_AT,
    updatedAt: RESOLVED_AT,
    expiresAt: RESOLVED_AT
  };
}

function duel(
  world: TestWorld,
  options: {
    mode?: "quick" | "turn-based";
    status?: DuelChallengeRecord["status"];
    outcome?: "challenger" | "target" | "draw";
  } = {}
): DuelChallengeRecord {
  const status = options.status ?? "resolved";
  return {
    id: `duel-${options.mode ?? "quick"}`,
    challengerCharacterId: world.character.id,
    targetCharacterId: world.target.id,
    contextChatId: null,
    inviteToken: "duel-token",
    mode: options.mode ?? "quick",
    status,
    expiresAt: RESOLVED_AT,
    resolvedAt: status === "resolved" ? RESOLVED_AT : null,
    result: status === "resolved" ? {
      outcome: options.outcome ?? "challenger",
      winnerCharacterId: world.character.id,
      loserCharacterId: world.target.id,
      challengerScore: 10,
      targetScore: 9,
      swing: 1,
      flavorKey: "test",
      participants: {
        challenger: participant(world.character),
        target: participant(world.target)
      }
    } : null,
    createdAt: ACCEPTED_AT,
    updatedAt: RESOLVED_AT,
    challenger: snapshot(world.character, 42n),
    target: snapshot(world.target, 84n)
  };
}

function participant(character: CharacterRecord) {
  return {
    characterId: character.id,
    displayName: character.name,
    title: "Боєць",
    raceId: character.raceId,
    raceName: "Людина",
    classId: character.classId,
    className: "Воїн",
    level: character.level,
    remortCount: character.remortCount ?? 0
  };
}

function snapshot(character: CharacterRecord, telegramUserId: bigint) {
  return { ...character, telegramUserId, equipment: [] };
}

function rowKey(telegramUserId: bigint, key: string, localDate: string): string {
  return `${telegramUserId}:${key}:${localDate}`;
}

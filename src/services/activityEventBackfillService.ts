import { achievements, items } from "../content";
import type { RecordActivityEventInput } from "../db/repositories/activityEventRepository";
import { BIG_BARREL_BROTHER_RULES_VERSION } from "../domain/partyBoss/partyBoss";
import {
  LATEST_EVENTS_LEGENDARY_ITEM_RARITIES,
  LATEST_EVENTS_MILESTONE_LEVELS,
  LATEST_EVENTS_PUBLIC_ITEM_RARITIES,
  LATEST_EVENTS_PUBLIC_MIN_LEVEL
} from "./activityEventService";

export interface BackfillCharacterCreatedRow {
  id: string;
  name: string;
  createdAt: Date;
}

export interface BackfillLevelAchievementRow {
  id: string;
  characterId: string;
  characterName: string;
  achievementId: string;
  sourceType: string;
  sourceId: string | null;
  unlockedAt: Date;
}

export interface BackfillRareCharacterItemRow {
  id: string;
  characterId: string;
  characterName: string;
  itemId: string;
  createdAt: Date;
}

export interface BackfillPartyBossSessionRow {
  id: string;
  status: string;
  rulesVersion: string;
  bossKey: string;
  stateJson: unknown;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ActivityEventBackfillStore {
  listCharactersCreatedSince(since: Date | null): Promise<BackfillCharacterCreatedRow[]>;
  listLevelAchievementsSince(
    since: Date | null,
    achievementIds: readonly string[]
  ): Promise<BackfillLevelAchievementRow[]>;
  listRareCharacterItemsSince(
    since: Date | null,
    itemIds: readonly string[]
  ): Promise<BackfillRareCharacterItemRow[]>;
  listWonPartyBossSessionsSince(since: Date | null): Promise<BackfillPartyBossSessionRow[]>;
  hasActivityEventDedupeKey(dedupeKey: string): Promise<boolean>;
  hasRareItemEvent(characterId: string, itemId: string): Promise<boolean>;
}

export interface ActivityEventBackfillRecorder {
  record(input: RecordActivityEventInput): Promise<unknown>;
}

export const activityEventBackfillKinds = [
  "character.created",
  "character.level_reached",
  "item.rare_received",
  "party.raid_won"
] as const;

export type ActivityEventBackfillKind = (typeof activityEventBackfillKinds)[number];

export interface ActivityEventBackfillCount {
  scanned: number;
  planned: number;
  applied: number;
  skippedExisting: number;
  skippedInvalid: number;
}

export type ActivityEventBackfillCounts = Record<ActivityEventBackfillKind, ActivityEventBackfillCount>;

export interface ActivityEventBackfillSummary {
  dryRun: boolean;
  since: Date | null;
  counts: ActivityEventBackfillCounts;
  unsupported: {
    underdogCombatWins: "not-backfilled";
  };
}

export async function backfillActivityEvents(input: {
  store: ActivityEventBackfillStore;
  recorder: ActivityEventBackfillRecorder;
  apply: boolean;
  since?: Date | null | undefined;
}): Promise<ActivityEventBackfillSummary> {
  const since = input.since ?? null;
  const summary: ActivityEventBackfillSummary = {
    dryRun: !input.apply,
    since,
    counts: createEmptyCounts(),
    unsupported: {
      underdogCombatWins: "not-backfilled"
    }
  };

  await backfillCharacterCreated(input, summary, since);
  await backfillLevelAchievements(input, summary, since);
  await backfillRareItems(input, summary, since);
  await backfillPartyRaids(input, summary, since);

  return summary;
}

export function getActivityEventBackfillLevelAchievementIds(): string[] {
  return getLevelAchievementEntries().map((entry) => entry.achievementId);
}

export function getActivityEventBackfillRareItemIds(): string[] {
  return items
    .filter((item) => isPublicItemRarity(item.rarity))
    .map((item) => item.id);
}

async function backfillCharacterCreated(
  input: {
    store: ActivityEventBackfillStore;
    recorder: ActivityEventBackfillRecorder;
    apply: boolean;
  },
  summary: ActivityEventBackfillSummary,
  since: Date | null
): Promise<void> {
  const rows = await input.store.listCharactersCreatedSince(since);

  for (const row of rows) {
    const dedupeKey = `character.created:${row.id}`;
    await recordCandidate(input, summary, "character.created", dedupeKey, {
      eventType: "character.created",
      category: "adventurer",
      severity: "normal",
      actorCharacterId: row.id,
      actorDisplayName: row.name,
      sourceType: "character",
      sourceId: row.id,
      dedupeKey,
      occurredAt: row.createdAt
    });
  }
}

async function backfillLevelAchievements(
  input: {
    store: ActivityEventBackfillStore;
    recorder: ActivityEventBackfillRecorder;
    apply: boolean;
  },
  summary: ActivityEventBackfillSummary,
  since: Date | null
): Promise<void> {
  const levelsByAchievementId = new Map(
    getLevelAchievementEntries().map((entry) => [entry.achievementId, entry.level])
  );
  const rows = await input.store.listLevelAchievementsSince(since, [...levelsByAchievementId.keys()]);

  for (const row of rows) {
    const level = levelsByAchievementId.get(row.achievementId);
    if (!level) {
      summary.counts["character.level_reached"].scanned += 1;
      summary.counts["character.level_reached"].skippedInvalid += 1;
      continue;
    }

    const dedupeKey = `character.level_reached:${row.characterId}:${level}`;
    await recordCandidate(input, summary, "character.level_reached", dedupeKey, {
      eventType: "character.level_reached",
      category: "progression",
      severity: LATEST_EVENTS_MILESTONE_LEVELS.includes(level as (typeof LATEST_EVENTS_MILESTONE_LEVELS)[number])
        ? "high"
        : "normal",
      actorCharacterId: row.characterId,
      actorDisplayName: row.characterName,
      sourceType: row.sourceType,
      sourceId: row.sourceId ?? row.id,
      dedupeKey,
      payload: { level },
      occurredAt: row.unlockedAt
    });
  }
}

async function backfillRareItems(
  input: {
    store: ActivityEventBackfillStore;
    recorder: ActivityEventBackfillRecorder;
    apply: boolean;
  },
  summary: ActivityEventBackfillSummary,
  since: Date | null
): Promise<void> {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rows = await input.store.listRareCharacterItemsSince(since, getActivityEventBackfillRareItemIds());

  for (const row of rows) {
    const count = summary.counts["item.rare_received"];
    count.scanned += 1;

    const item = itemById.get(row.itemId);
    if (!item || !isPublicItemRarity(item.rarity)) {
      count.skippedInvalid += 1;
      continue;
    }

    if (await input.store.hasRareItemEvent(row.characterId, item.id)) {
      count.skippedExisting += 1;
      continue;
    }

    const dedupeKey = `item.rare_received:character-item:${row.id}:${row.characterId}:${item.id}`;
    await recordCandidate(
      input,
      summary,
      "item.rare_received",
      dedupeKey,
      {
        eventType: "item.rare_received",
        category: "manatky",
        severity: isLegendaryItemRarity(item.rarity) ? "legendary" : "high",
        actorCharacterId: row.characterId,
        actorDisplayName: row.characterName,
        subjectKind: "item",
        subjectId: item.id,
        subjectName: item.name,
        sourceType: "character-item",
        sourceId: row.id,
        dedupeKey,
        payload: { rarity: item.rarity },
        occurredAt: row.createdAt
      },
      { alreadyScanned: true }
    );
  }
}

async function backfillPartyRaids(
  input: {
    store: ActivityEventBackfillStore;
    recorder: ActivityEventBackfillRecorder;
    apply: boolean;
  },
  summary: ActivityEventBackfillSummary,
  since: Date | null
): Promise<void> {
  const rows = await input.store.listWonPartyBossSessionsSince(since);

  for (const row of rows) {
    const parsed = parsePartyBossState(row);
    if (!parsed) {
      summary.counts["party.raid_won"].scanned += 1;
      summary.counts["party.raid_won"].skippedInvalid += 1;
      continue;
    }

    const dedupeKey = `party.raid_won:${row.id}`;
    await recordCandidate(input, summary, "party.raid_won", dedupeKey, {
      eventType: "party.raid_won",
      category: "raid",
      severity: "high",
      relatedCharacterIds: parsed.relatedCharacterIds,
      subjectKind: "monster",
      subjectId: parsed.monsterId,
      subjectName: parsed.monsterName,
      sourceType: "party-boss",
      sourceId: row.id,
      dedupeKey,
      payload: { participantCount: parsed.participantCount },
      occurredAt: row.completedAt ?? parsed.completedAt ?? row.createdAt
    });
  }
}

async function recordCandidate(
  input: {
    store: ActivityEventBackfillStore;
    recorder: ActivityEventBackfillRecorder;
    apply: boolean;
  },
  summary: ActivityEventBackfillSummary,
  kind: ActivityEventBackfillKind,
  dedupeKey: string,
  event: RecordActivityEventInput,
  options: { alreadyScanned?: boolean } = {}
): Promise<void> {
  const count = summary.counts[kind];
  if (!options.alreadyScanned) {
    count.scanned += 1;
  }

  if (await input.store.hasActivityEventDedupeKey(dedupeKey)) {
    count.skippedExisting += 1;
    return;
  }

  count.planned += 1;

  if (!input.apply) {
    return;
  }

  await input.recorder.record(event);
  count.applied += 1;
}

function createEmptyCounts(): ActivityEventBackfillCounts {
  return Object.fromEntries(
    activityEventBackfillKinds.map((kind) => [
      kind,
      {
        scanned: 0,
        planned: 0,
        applied: 0,
        skippedExisting: 0,
        skippedInvalid: 0
      }
    ])
  ) as ActivityEventBackfillCounts;
}

function getLevelAchievementEntries(): Array<{ achievementId: string; level: number }> {
  return achievements.flatMap((achievement) => {
    const trigger = achievement.trigger;
    if (achievement.status !== "enabled" || trigger.type !== "level.reached") {
      return [];
    }

    if (trigger.threshold < LATEST_EVENTS_PUBLIC_MIN_LEVEL) {
      return [];
    }

    return [{ achievementId: achievement.id, level: trigger.threshold }];
  });
}

function parsePartyBossState(row: BackfillPartyBossSessionRow): {
  monsterId: string;
  monsterName: string;
  relatedCharacterIds: string[];
  participantCount: number;
  completedAt: Date | null;
} | null {
  if (row.status !== "won" || row.rulesVersion !== BIG_BARREL_BROTHER_RULES_VERSION) {
    return null;
  }

  const state = asRecord(row.stateJson);
  const boss = asRecord(state?.boss);
  const monsterId = readString(boss?.monsterId) ?? row.bossKey;
  const monsterName = readString(boss?.name);
  if (!monsterName) {
    return null;
  }

  const participants = readArray(state?.participants).flatMap((participant) => {
    const characterId = readString(asRecord(participant)?.characterId);
    return characterId ? [characterId] : [];
  });

  return {
    monsterId,
    monsterName,
    relatedCharacterIds: participants,
    participantCount: Math.max(1, participants.length),
    completedAt: parseDate(readString(state?.completedAt))
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPublicItemRarity(
  rarity: string
): rarity is (typeof LATEST_EVENTS_PUBLIC_ITEM_RARITIES)[number] {
  return LATEST_EVENTS_PUBLIC_ITEM_RARITIES.includes(
    rarity as (typeof LATEST_EVENTS_PUBLIC_ITEM_RARITIES)[number]
  );
}

function isLegendaryItemRarity(
  rarity: string
): rarity is (typeof LATEST_EVENTS_LEGENDARY_ITEM_RARITIES)[number] {
  return LATEST_EVENTS_LEGENDARY_ITEM_RARITIES.includes(
    rarity as (typeof LATEST_EVENTS_LEGENDARY_ITEM_RARITIES)[number]
  );
}

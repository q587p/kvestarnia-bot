import { createHash, randomBytes } from "node:crypto";
import { items } from "../content";
import {
  classIdToKey,
  findClass,
  findRace,
  getPronounLabel,
  getRaceUnavailableReason,
  isClassAvailableForChoice,
  isRaceAvailableForPronoun,
  raceIdToKey,
  raceKeyToId,
  classKeyToId
} from "../content/characterOptions";
import { activeRaces } from "../content/races";
import { classes } from "../content/classes";
import type { Pronoun } from "../content/schema";
import type {
  RemortBoard,
  RemortDraftRecord,
  RemortIdentityRecord,
  RemortRepository,
  RemortSnapshot
} from "../db/repositories/remortRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  buildRemortStarterStats,
  getDefaultRemortIdentity,
  getRemortMemoryRank,
  isRemortPreservableItem,
  REMORT_DRAFT_TTL_MS,
  REMORT_MAX_PRESERVED_ITEMS,
  REMORT_REQUIRED_LEVEL,
  validateRemortIdentity
} from "../domain/remort";
import { systemClock, type Clock } from "../shared/time";

export type RemortViewResult =
  | { state: "no-character" }
  | { state: "locked"; character: CharacterSummary; requiredLevel: number }
  | {
      state: "ready";
      character: CharacterSummary;
      remortCount: number;
      memoryRankAfter: number;
      draft: RemortDraftRecord;
      identity: RemortIdentityView;
      eligibleItems: RemortEligibleItemView[];
      selectedItems: RemortEligibleItemView[];
      expiresAt: Date;
    };

export type RemortUpdateResult =
  | RemortViewResult
  | { state: "invalid-selection"; reason: string; view: Extract<RemortViewResult, { state: "ready" }> | null };

export type RemortConfirmResult =
  | { state: "no-character" }
  | { state: "invalid-token" }
  | { state: "locked"; level: number; requiredLevel: number }
  | { state: "invalid-draft"; reason: string }
  | {
      state: "completed" | "replayed";
      character: CharacterSummary;
      remortNumber: number;
      memoryRank: number;
      hpBonus: number;
      manaBonus: number;
      preservedItems: Array<{ itemId: string; name: string; quantity: number }>;
      previousLevel: number;
    };

export interface RemortIdentityView {
  pronoun: Pronoun;
  pronounLabel: string;
  raceId: string;
  raceKey: string;
  raceName: string;
  classId: string;
  classKey: string;
  className: string;
}

export interface RemortEligibleItemView {
  itemId: string;
  itemKey: string;
  name: string;
  quantity: number;
  selected: boolean;
  known: boolean;
}

export class RemortService {
  constructor(
    private readonly remorts: RemortRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async openForTelegramUser(telegramUserId: bigint): Promise<RemortViewResult> {
    const now = this.clock();
    const snapshot = await this.remorts.getSnapshotForTelegramUser(telegramUserId, now);

    if (!snapshot) {
      return { state: "no-character" };
    }

    if (snapshot.character.level < REMORT_REQUIRED_LEVEL) {
      return {
        state: "locked",
        character: summarizeCharacter(snapshot.character, { remortCount: snapshot.remortCount }),
        requiredLevel: REMORT_REQUIRED_LEVEL
      };
    }

    const identity = snapshot.draft?.identity ?? getDefaultRemortIdentity(snapshot.character);
    const selectedItems = sanitizeSelectedItems(snapshot, snapshot.draft?.selectedItems ?? []);
    const expiresAt = new Date(now.getTime() + REMORT_DRAFT_TTL_MS);
    const draft = snapshot.draft
      ? await this.remorts.updateDraftForTelegramUser(telegramUserId, {
          token: snapshot.draft.token,
          identity,
          selectedItems,
          expiresAt,
          now
        })
      : await this.remorts.createOrUpdateDraftForTelegramUser(telegramUserId, {
          token: generateRemortToken(),
          identity,
          selectedItems,
          expiresAt,
          now
        });

    if (!draft) {
      return { state: "no-character" };
    }

    return this.buildView(telegramUserId, draft.token);
  }

  async selectPronoun(
    telegramUserId: bigint,
    token: string,
    pronoun: string
  ): Promise<RemortUpdateResult> {
    const view = await this.buildReadyViewOrNull(telegramUserId, token);
    if (!view) {
      return { state: "invalid-selection", reason: "Чернетка реморту вже не відгукується.", view: null };
    }

    if (pronoun !== "he" && pronoun !== "she" && pronoun !== "they") {
      return { state: "invalid-selection", reason: "Канцелярія не впізнала звертання.", view };
    }

    const identity = getDefaultRemortIdentity({
      pronoun,
      raceId: view.identity.raceId,
      classId: view.identity.classId
    });

    return this.updateDraftIdentity(telegramUserId, token, identity);
  }

  async selectRace(
    telegramUserId: bigint,
    token: string,
    raceKey: string
  ): Promise<RemortUpdateResult> {
    const view = await this.buildReadyViewOrNull(telegramUserId, token);
    if (!view) {
      return { state: "invalid-selection", reason: "Чернетка реморту вже не відгукується.", view: null };
    }

    const raceId = raceKeyToId(raceKey);
    if (!raceId) {
      return { state: "invalid-selection", reason: "Канцелярія не знайшла такої раси.", view };
    }

    const current = view.identity;
    if (!isRaceAvailableForPronoun(current.pronoun, raceId)) {
      return {
        state: "invalid-selection",
        reason: getRaceUnavailableReason(current.pronoun, raceId),
        view
      };
    }

    const fallbackClassId = firstCompatibleClassId(current.pronoun, raceId);
    if (!fallbackClassId) {
      return { state: "invalid-selection", reason: "Канцелярія не знайшла класу для цієї раси.", view };
    }

    const classId = isClassAvailableForChoice(current.pronoun, raceId, current.classId)
      ? current.classId
      : fallbackClassId;
    const identity = {
      pronoun: current.pronoun,
      raceId,
      classId
    };

    return this.updateDraftIdentity(telegramUserId, token, identity);
  }

  async selectClass(
    telegramUserId: bigint,
    token: string,
    classKey: string
  ): Promise<RemortUpdateResult> {
    const view = await this.buildReadyViewOrNull(telegramUserId, token);
    if (!view) {
      return { state: "invalid-selection", reason: "Чернетка реморту вже не відгукується.", view: null };
    }

    const classId = classKeyToId(classKey);
    if (!classId) {
      return { state: "invalid-selection", reason: "Канцелярія не знайшла такого класу.", view };
    }

    const validation = validateRemortIdentity({
      pronoun: view.identity.pronoun,
      raceId: view.identity.raceId,
      classId
    });

    if (!validation.ok) {
      return { state: "invalid-selection", reason: validation.reason, view };
    }

    return this.updateDraftIdentity(telegramUserId, token, validation.identity);
  }

  async toggleItem(
    telegramUserId: bigint,
    token: string,
    itemKey: string
  ): Promise<RemortUpdateResult> {
    const view = await this.buildReadyViewOrNull(telegramUserId, token);
    if (!view) {
      return { state: "invalid-selection", reason: "Чернетка реморту вже не відгукується.", view: null };
    }

    const matches = view.eligibleItems.filter((item) => item.itemKey === itemKey);
    const eligible = matches.length === 1 ? matches[0] : null;
    if (!eligible) {
      return { state: "invalid-selection", reason: "Ця манатка не проходить у нове життя.", view };
    }

    const itemId = eligible.itemId;
    const selected = new Set(view.selectedItems.map((item) => item.itemId));
    if (selected.has(itemId)) {
      selected.delete(itemId);
    } else {
      if (selected.size >= REMORT_MAX_PRESERVED_ITEMS) {
        return {
          state: "invalid-selection",
          reason: `Через реморт можна протягнути тільки ${REMORT_MAX_PRESERVED_ITEMS} манаток.`,
          view
        };
      }

      selected.add(itemId);
    }

    return this.updateDraftItems(telegramUserId, token, [...selected].map((id) => ({ itemId: id })));
  }

  async confirmForTelegramUser(telegramUserId: bigint, token: string): Promise<RemortConfirmResult> {
    const now = this.clock();
    const result = await this.remorts.completeDraftForTelegramUser(telegramUserId, {
      token,
      now,
      validate: (snapshot) => {
        if (snapshot.character.level < REMORT_REQUIRED_LEVEL) {
          return { state: "locked", level: snapshot.character.level };
        }

        const draft = snapshot.draft;
        if (!draft || draft.token !== token) {
          return { state: "invalid-draft", reason: "Чернетка реморту не знайшлася." };
        }

        const identity = validateRemortIdentity(draft.identity);
        if (!identity.ok) {
          return { state: "invalid-draft", reason: identity.reason };
        }

        const selectedItemsResult = validateSelectedItemsForConfirm(snapshot, draft.selectedItems);
        if (!selectedItemsResult.ok) {
          return { state: "invalid-draft", reason: selectedItemsResult.reason };
        }

        const selectedItems = selectedItemsResult.items.map((item) => ({
          itemId: item.itemId,
          quantity: 1
        }));
        const keptItems = buildKeptItems(snapshot, selectedItems);
        const remortNumber = snapshot.remortCount + 1;
        const starter = buildRemortStarterStats({
          raceId: identity.identity.raceId,
          classId: identity.identity.classId,
          remortNumber
        });

        return {
          state: "ready",
          identity: identity.identity,
          selectedItems,
          keptItems,
          remortNumber,
          memoryRank: starter.memoryRank,
          hpBonus: starter.hpBonus,
          manaBonus: starter.manaBonus,
          hpCurrent: starter.hpCurrent,
          hpMax: starter.hpMax,
          manaCurrent: starter.manaCurrent,
          manaMax: starter.manaMax,
          statsJson: starter.stats
        };
      }
    });

    if (result.state === "completed" || result.state === "replayed") {
      const remortCount = await this.remorts.countByTelegramUserId(telegramUserId);
      return {
        state: result.state,
        character: summarizeCharacter(result.character, { remortCount }),
        remortNumber: result.remort.remortNumber,
        memoryRank: result.remort.preservedPayload.memoryRank,
        hpBonus: result.remort.preservedPayload.hpBonus,
        manaBonus: result.remort.preservedPayload.manaBonus,
        preservedItems: result.remort.preservedPayload.items.map((item) => ({
          ...item,
          name: itemName(item.itemId)
        })),
        previousLevel: result.remort.previousLevel
      };
    }

    if (result.state === "locked") {
      return {
        state: "locked",
        level: result.level,
        requiredLevel: REMORT_REQUIRED_LEVEL
      };
    }

    return result;
  }

  listBoard(): Promise<RemortBoard> {
    return this.remorts.listBoard();
  }

  private async updateDraftIdentity(
    telegramUserId: bigint,
    token: string,
    identity: RemortIdentityRecord
  ): Promise<RemortUpdateResult> {
    const now = this.clock();
    const draft = await this.remorts.updateDraftForTelegramUser(telegramUserId, {
      token,
      identity,
      expiresAt: new Date(now.getTime() + REMORT_DRAFT_TTL_MS),
      now
    });

    if (!draft) {
      return { state: "invalid-selection", reason: "Чернетка реморту вже не відгукується.", view: null };
    }

    return this.buildView(telegramUserId, token);
  }

  private async updateDraftItems(
    telegramUserId: bigint,
    token: string,
    selectedItems: Array<{ itemId: string }>
  ): Promise<RemortUpdateResult> {
    const now = this.clock();
    const draft = await this.remorts.updateDraftForTelegramUser(telegramUserId, {
      token,
      selectedItems,
      expiresAt: new Date(now.getTime() + REMORT_DRAFT_TTL_MS),
      now
    });

    if (!draft) {
      return { state: "invalid-selection", reason: "Чернетка реморту вже не відгукується.", view: null };
    }

    return this.buildView(telegramUserId, token);
  }

  private async buildView(telegramUserId: bigint, token: string): Promise<RemortViewResult> {
    const ready = await this.buildReadyViewOrNull(telegramUserId, token);
    return ready ?? { state: "no-character" };
  }

  private async buildReadyViewOrNull(
    telegramUserId: bigint,
    token: string
  ): Promise<Extract<RemortViewResult, { state: "ready" }> | null> {
    const now = this.clock();
    const snapshot = await this.remorts.getSnapshotForTelegramUser(telegramUserId, now);

    if (!snapshot || snapshot.character.level < REMORT_REQUIRED_LEVEL || !snapshot.draft || snapshot.draft.token !== token) {
      return null;
    }

    const selectedItems = sanitizeSelectedItems(snapshot, snapshot.draft.selectedItems);
    const selectedIds = new Set(selectedItems.map((item) => item.itemId));
    const eligibleItems = buildEligibleItems(snapshot).map((item) => ({
      ...item,
      selected: selectedIds.has(item.itemId)
    }));
    const identityValidation = validateRemortIdentity(snapshot.draft.identity);
    const identity = identityValidation.ok
      ? identityValidation.identity
      : getDefaultRemortIdentity(snapshot.character);

    return {
      state: "ready",
      character: summarizeCharacter(snapshot.character, { remortCount: snapshot.remortCount }),
      remortCount: snapshot.remortCount,
      memoryRankAfter: getRemortMemoryRank(snapshot.remortCount + 1),
      draft: snapshot.draft,
      identity: toIdentityView(identity),
      eligibleItems,
      selectedItems: eligibleItems.filter((item) => item.selected),
      expiresAt: snapshot.draft.expiresAt
    };
  }
}

function buildEligibleItems(snapshot: RemortSnapshot): RemortEligibleItemView[] {
  const contentById = new Map(items.map((item) => [item.id, item]));

  return snapshot.items.flatMap((row) => {
    const content = contentById.get(row.itemId);
    const quantity = Math.max(0, Math.floor(row.quantity));

    if (quantity <= 0) {
      return [];
    }

    if (content && !isRemortPreservableItem({ item: content })) {
      return [];
    }

    return [{
      itemId: row.itemId,
      itemKey: makeRemortItemSelectionKey(row.itemId),
      name: content?.name ?? "Архівна манатка",
      quantity,
      selected: false,
      known: Boolean(content)
    }];
  });
}

function sanitizeSelectedItems(
  snapshot: RemortSnapshot,
  selectedItems: Array<{ itemId: string }>
): Array<{ itemId: string }> {
  const eligibleIds = new Set(buildEligibleItems(snapshot).map((item) => item.itemId));
  const selected: Array<{ itemId: string }> = [];
  const seen = new Set<string>();

  for (const item of selectedItems) {
    if (!eligibleIds.has(item.itemId) || seen.has(item.itemId)) {
      continue;
    }

    selected.push({ itemId: item.itemId });
    seen.add(item.itemId);

    if (selected.length >= REMORT_MAX_PRESERVED_ITEMS) {
      break;
    }
  }

  return selected;
}

function validateSelectedItemsForConfirm(
  snapshot: RemortSnapshot,
  selectedItems: Array<{ itemId: string }>
): { ok: true; items: Array<{ itemId: string }> } | { ok: false; reason: string } {
  if (selectedItems.length > REMORT_MAX_PRESERVED_ITEMS) {
    return {
      ok: false,
      reason: `Через реморт можна протягнути тільки ${REMORT_MAX_PRESERVED_ITEMS} манаток.`
    };
  }

  const eligibleIds = new Set(buildEligibleItems(snapshot).map((item) => item.itemId));
  const selected: Array<{ itemId: string }> = [];
  const seen = new Set<string>();

  for (const item of selectedItems) {
    if (!item.itemId || seen.has(item.itemId)) {
      return {
        ok: false,
        reason: "Чернетка реморту заплуталась у манатках. Відкрийте /remort ще раз."
      };
    }

    if (!eligibleIds.has(item.itemId)) {
      return {
        ok: false,
        reason: "Одна з вибраних манаток уже не в торбі. Відкрийте /remort ще раз і виберіть заново."
      };
    }

    selected.push({ itemId: item.itemId });
    seen.add(item.itemId);
  }

  return { ok: true, items: selected };
}

function buildKeptItems(
  _snapshot: RemortSnapshot,
  selectedItems: Array<{ itemId: string; quantity: number }>
): Array<{ itemId: string; quantity: number }> {
  return selectedItems
    .filter((item) => item.quantity > 0)
    .sort((left, right) => left.itemId.localeCompare(right.itemId))
    .map((item) => ({ itemId: item.itemId, quantity: item.quantity }));
}

function toIdentityView(identity: RemortIdentityRecord): RemortIdentityView {
  const pronoun = identity.pronoun as Pronoun;
  const race = findRace(identity.raceId);
  const characterClass = findClass(identity.classId);

  return {
    pronoun,
    pronounLabel: getPronounLabel(pronoun),
    raceId: identity.raceId,
    raceKey: raceIdToKey(identity.raceId),
    raceName: race?.name ?? identity.raceId,
    classId: identity.classId,
    classKey: classIdToKey(identity.classId),
    className: characterClass?.name ?? identity.classId
  };
}

export function getRemortPronounOptions(): Array<{ id: Pronoun; label: string }> {
  return [
    { id: "he", label: "Він" },
    { id: "she", label: "Вона" },
    { id: "they", label: "Вони" }
  ];
}

export function getRemortRaceOptions(): Array<{ key: string; label: string }> {
  return activeRaces.map((race) => ({ key: raceIdToKey(race.id), label: race.name }));
}

export function getRemortClassOptions(): Array<{ key: string; label: string }> {
  return classes.map((characterClass) => ({ key: classIdToKey(characterClass.id), label: characterClass.name }));
}

function itemName(itemId: string): string {
  return items.find((item) => item.id === itemId)?.name ?? "Архівна манатка";
}

export function makeRemortItemSelectionKey(itemId: string): string {
  return createHash("sha256").update(itemId).digest("hex").slice(0, 12);
}

function firstCompatibleClassId(pronoun: Pronoun, raceId: string): string | null {
  return classes.find((candidate) => isClassAvailableForChoice(pronoun, raceId, candidate.id))?.id ?? null;
}

function generateRemortToken(): string {
  return randomBytes(8).toString("hex");
}

import { randomUUID } from "node:crypto";
import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type { CharacterRecord, CharacterRepository } from "../db/repositories/characterRepository";
import type { DailyActionRepository } from "../db/repositories/dailyActionRepository";
import type {
  KorchmaRoundLeaderboard,
  KorchmaRoundPurchaseRepository,
  KorchmaRoundTier
} from "../db/repositories/korchmaRoundPurchaseRepository";
import type {
  ShynokDrinkStateRecord,
  ShynokMantokSaleRecord,
  ShynokRepository,
  ShynokRoundRecipientRecord
} from "../db/repositories/shynokRepository";
import {
  buildDrinkEffect,
  getShynokDrinkDefinition,
  isShynokDrinkKey,
  SHYNOK_DRINKS,
  type ShynokDrinkKey
} from "../domain/shynokDrinks";
import {
  buildMantokSaleBasket,
  buildMantokSaleEligibleStacks,
  MANTOK_SALE_PAGE_SIZE,
  selectAllMantokSaleEligibleUnits,
  type MantokSaleEligibleStack
} from "../domain/mantokSales";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import { PRESENCE_LOCATION_KORCHMA_BAR } from "./presenceService";
import {
  FRIDAY_BARREL_RAID_KEY,
  getBarrelRaidPeriod,
  toKorchmaLocalDate
} from "./tavernRaidService";
import { systemClock, type Clock } from "../shared/time";

export const SHYNOK_SELF_ORDER_TTL_MS = 5 * 60_000;
export const SHYNOK_ROUND_ORDER_TTL_MS = 5 * 60_000;
export const SHYNOK_ROUND_OFFER_TTL_MS = 5 * 60_000;
export const SHYNOK_SALE_TTL_MS = 10 * 60_000;

export type ShynokGateState = "no-character" | "wrong-place" | "active-combat" | "pending-raid";

export type ShynokOverviewResult =
  | { state: ShynokGateState }
  | {
      state: "ready";
      character: CharacterSummary;
      activeDrink: PresentedShynokDrinkState | null;
      openRoundOffers: PresentedRoundOffer[];
    };

export type ShynokDrinkMenuResult =
  | { state: ShynokGateState }
  | { state: "ready"; character: CharacterSummary; activeDrink: PresentedShynokDrinkState | null };

export type ShynokDrinkOrderResult =
  | { state: ShynokGateState }
  | {
      state: "preview";
      character: CharacterSummary;
      token: string;
      drink: PresentedDrinkDefinition;
      activeDrink: PresentedShynokDrinkState | null;
    };

export type ShynokDrinkConfirmResult =
  | { state: ShynokGateState | "invalid-token" | "expired" | "replacement-changed" }
  | { state: "not-enough-gold"; character: CharacterSummary; priceGold: number }
  | {
      state: "completed" | "replayed";
      character: CharacterSummary;
      drink: PresentedShynokDrinkState | null;
      spentGold: number;
    };

export type ShynokRoundPreviewResult =
  | { state: ShynokGateState }
  | { state: "raid-required"; character: CharacterSummary; leaderboard: KorchmaRoundLeaderboard }
  | { state: "not-enough-gold"; character: CharacterSummary; gold: number; priceGold: number }
  | {
      state: "preview";
      character: CharacterSummary;
      token: string;
      tier: KorchmaRoundTier;
      drink: PresentedDrinkDefinition;
      priceGold: number;
      recipientCount: number;
      leaderboard: KorchmaRoundLeaderboard;
    };

export type ShynokRoundConfirmResult =
  | { state: ShynokGateState | "invalid-token" | "expired" | "raid-required" }
  | { state: "not-enough-gold"; character: CharacterSummary; priceGold: number }
  | {
      state: "completed" | "replayed";
      character: CharacterSummary;
      tier: KorchmaRoundTier;
      priceGold: number;
      recipientCount: number;
      leaderboard: KorchmaRoundLeaderboard;
    };

export type ShynokRoundOfferRespondResult =
  | { state: ShynokGateState | "invalid-offer" | "expired" }
  | { state: "declined"; offer: PresentedRoundOffer }
  | {
      state: "replacement-preview";
      offer: PresentedRoundOffer;
      drink: PresentedDrinkDefinition;
      activeDrink: PresentedShynokDrinkState;
      replacementGuard: string;
    }
  | { state: "stale-replacement"; offer: PresentedRoundOffer }
  | { state: "accepted" | "replayed"; offer: PresentedRoundOffer; drink: PresentedShynokDrinkState | null };

export type ShynokSaleSelectionResult =
  | { state: ShynokGateState }
  | { state: "invalid-token" }
  | {
      state: "selection";
      character: CharacterSummary;
      sale: ShynokMantokSaleRecord;
      items: PresentedSaleItem[];
      selectedCount: number;
      eligibleCount: number;
      nominalValue: number;
      payoutGold: number;
      page: number;
      pageCount: number;
    };

export type ShynokSaleConfirmResult =
  | { state: ShynokGateState | "invalid-token" | "expired" | "cancelled" | "stale-selection" | "zero-payout" }
  | { state: "sold" | "replayed"; character: CharacterSummary; sale: ShynokMantokSaleRecord; items: PresentedSaleLine[] };

export interface PresentedDrinkDefinition {
  key: ShynokDrinkKey;
  name: string;
  emoji: string;
  priceGold: number;
  durationMinutes: number;
  recoveryMultiplierBp?: number;
  accuracyPenaltyPp?: number;
  outgoingDamageMultiplierBp?: number;
  incomingDamageMultiplierBp?: number;
}

export interface PresentedShynokDrinkState extends PresentedDrinkDefinition {
  phase: "timed" | "queued";
  startedAt: Date;
  expiresAt: Date;
}

export interface PresentedRoundOffer {
  id: string;
  drink: PresentedDrinkDefinition;
  expiresAt: Date;
}

export interface PresentedSaleItem {
  index: number;
  itemId: string;
  content: ItemContent;
  availableQuantity: number;
  selectedQuantity: number;
  unitGoldValue: number;
}

export interface PresentedSaleLine {
  itemId: string;
  quantity: number;
  content: ItemContent;
  unitGoldValue: number;
}

export class ShynokService {
  constructor(
    private readonly shynok: ShynokRepository,
    private readonly characters: CharacterRepository,
    private readonly dailyActions: DailyActionRepository,
    private readonly roundPurchases: KorchmaRoundPurchaseRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async getOverviewForTelegramUser(telegramUserId: bigint): Promise<ShynokOverviewResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const now = this.clock();
    const [activeDrink, openRoundOffers] = await Promise.all([
      this.shynok.getActiveDrinkForTelegramUser(telegramUserId, now),
      this.shynok.listOpenRoundOffersForTelegramUser(telegramUserId, now)
    ]);

    return {
      state: "ready",
      character: summarizeCharacter(gate.character),
      activeDrink: presentDrinkState(activeDrink),
      openRoundOffers: openRoundOffers.map(presentRoundOffer)
    };
  }

  async getDrinkMenuForTelegramUser(telegramUserId: bigint): Promise<ShynokDrinkMenuResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    return {
      state: "ready",
      character: summarizeCharacter(gate.character),
      activeDrink: presentDrinkState(await this.shynok.getActiveDrinkForTelegramUser(telegramUserId, this.clock()))
    };
  }

  async createSelfDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    drinkKey: ShynokDrinkKey
  ): Promise<ShynokDrinkOrderResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const now = this.clock();
    const drink = getShynokDrinkDefinition(drinkKey);
    const activeDrink = await this.shynok.getActiveDrinkForTelegramUser(telegramUserId, now);
    const order = await this.shynok.createSelfDrinkOrderForTelegramUser(telegramUserId, {
      token: randomUUID(),
      drinkKey,
      priceGold: drink.priceGold,
      replacement: activeDrink ? {
        expected: "activation",
        drinkStateId: activeDrink.id,
        activationId: activeDrink.activationId,
        drinkKey: activeDrink.drinkKey,
        phase: activeDrink.phase,
        startedAt: activeDrink.startedAt.toISOString(),
        expiresAt: activeDrink.expiresAt.toISOString()
      } : { expected: "none" },
      now,
      expiresAt: new Date(now.getTime() + SHYNOK_SELF_ORDER_TTL_MS)
    });

    if (!order) {
      return { state: "no-character" };
    }

    return {
      state: "preview",
      character: summarizeCharacter(gate.character),
      token: order.token,
      drink: presentDrinkDefinition(drink.key),
      activeDrink: presentDrinkState(activeDrink)
    };
  }

  async confirmSelfDrinkOrderForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ShynokDrinkConfirmResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const result = await this.shynok.confirmSelfDrinkOrderForTelegramUser(telegramUserId, {
      token,
      now: this.clock(),
      result: { kind: "self-drink-confirm" }
    });

    switch (result.state) {
      case "no-character":
      case "invalid-token":
      case "expired":
      case "replacement-changed":
        return { state: result.state };
      case "not-enough-gold":
        return {
          state: "not-enough-gold",
          character: summarizeCharacter(result.character),
          priceGold: result.order.priceGold
        };
      case "completed":
      case "replayed":
        return {
          state: result.state,
          character: summarizeCharacter(result.character),
          drink: presentDrinkState(result.drink),
          spentGold: result.order.priceGold
        };
    }
  }

  async createRoundOrderForTelegramUser(
    telegramUserId: bigint,
    tier: KorchmaRoundTier
  ): Promise<ShynokRoundPreviewResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const now = this.clock();
    const raid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: getBarrelRaidPeriod(now).id
    });
    const leaderboard = await this.roundPurchases.getLeaderboard(toKorchmaLocalDate(now));

    if (!raid) {
      return {
        state: "raid-required",
        character: summarizeCharacter(gate.character),
        leaderboard
      };
    }

    const recipients = await this.shynok.listRoundRecipientsForTelegramUser(telegramUserId, now);
    const recipientCount = Math.max(1, recipients.length);
    const drinkKey = tier === "fine" ? "drink.fine-beer" : "drink.simple-beer";
    const priceGold = getRoundPrice(tier, recipientCount);

    if (gate.character.gold < priceGold) {
      return {
        state: "not-enough-gold",
        character: summarizeCharacter(gate.character),
        gold: gate.character.gold,
        priceGold
      };
    }

    const order = await this.shynok.createRoundOrderForTelegramUser(telegramUserId, {
      token: randomUUID(),
      drinkKey,
      priceGold,
      snapshot: recipients.map((recipient) => ({
        characterId: recipient.characterId,
        telegramUserId: recipient.telegramUserId.toString(),
        name: recipient.name,
        remortCount: recipient.remortCount
      })),
      now,
      expiresAt: new Date(now.getTime() + SHYNOK_ROUND_ORDER_TTL_MS)
    });

    if (!order) {
      return { state: "no-character" };
    }

    return {
      state: "preview",
      character: summarizeCharacter(gate.character),
      token: order.token,
      tier,
      drink: presentDrinkDefinition(drinkKey),
      priceGold,
      recipientCount,
      leaderboard
    };
  }

  async confirmRoundOrderForTelegramUser(
    telegramUserId: bigint,
    token: string,
    tier: KorchmaRoundTier
  ): Promise<ShynokRoundConfirmResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const now = this.clock();
    const raid = await this.dailyActions.findForTelegramUser(telegramUserId, {
      key: FRIDAY_BARREL_RAID_KEY,
      localDate: getBarrelRaidPeriod(now).id
    });
    if (!raid) {
      return { state: "raid-required" };
    }

    const result = await this.shynok.confirmRoundOrderForTelegramUser(telegramUserId, {
      token,
      tier,
      localDate: toKorchmaLocalDate(now),
      offerExpiresAt: new Date(now.getTime() + SHYNOK_ROUND_OFFER_TTL_MS),
      now
    });
    const leaderboard = await this.roundPurchases.getLeaderboard(toKorchmaLocalDate(now));

    switch (result.state) {
      case "no-character":
      case "invalid-token":
      case "expired":
        return { state: result.state };
      case "not-enough-gold":
        return {
          state: "not-enough-gold",
          character: summarizeCharacter(result.character),
          priceGold: result.order.priceGold
        };
      case "completed":
      case "replayed":
        return {
          state: result.state,
          character: summarizeCharacter(result.character),
          tier,
          priceGold: result.order.priceGold,
          recipientCount: result.recipientCount,
          leaderboard
        };
    }
  }

  async respondToRoundOfferForTelegramUser(
    telegramUserId: bigint,
    offerId: string,
    action: "accept" | "decline" | "confirm-replacement",
    replacementGuard?: string
  ): Promise<ShynokRoundOfferRespondResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const result = await this.shynok.respondToRoundOfferForTelegramUser(telegramUserId, {
      offerId,
      action,
      ...(replacementGuard ? { replacementGuard } : {}),
      now: this.clock(),
      result: { kind: `round-offer-${action}` }
    });

    switch (result.state) {
      case "no-character":
      case "invalid-offer":
      case "expired":
        return { state: result.state };
      case "declined":
        return {
          state: "declined",
          offer: presentRoundOffer(result.offer)
        };
      case "replacement-required": {
        const activeDrink = presentDrinkState(result.drink);
        if (!activeDrink) {
          return {
            state: "stale-replacement",
            offer: presentRoundOffer(result.offer)
          };
        }
        return {
          state: "replacement-preview",
          offer: presentRoundOffer(result.offer),
          drink: presentDrinkDefinition(result.offer.drinkKey),
          activeDrink,
          replacementGuard: result.replacementGuard
        };
      }
      case "stale-replacement":
        return {
          state: "stale-replacement",
          offer: presentRoundOffer(result.offer)
        };
      case "accepted":
      case "replayed":
        return {
          state: result.state,
          offer: presentRoundOffer(result.offer),
          drink: presentDrinkState(result.drink)
        };
    }
  }

  async startSaleForTelegramUser(
    telegramUserId: bigint,
    page = 0
  ): Promise<ShynokSaleSelectionResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }

    const snapshot = await this.shynok.getInventorySnapshotForTelegramUser(telegramUserId);
    if (!snapshot) {
      return { state: "no-character" };
    }

    const eligible = getEligibleSaleStacks(snapshot);
    const basket = buildMantokSaleBasket([], eligible) ?? {
      items: [],
      nominalValue: 0,
      payoutGold: 0,
      fingerprint: "empty"
    };
    const now = this.clock();
    const sale = await this.shynok.createSaleForTelegramUser(telegramUserId, {
      token: randomUUID(),
      selection: basket.items,
      selectionFingerprint: basket.fingerprint,
      nominalValue: basket.nominalValue,
      payoutGold: basket.payoutGold,
      expiresAt: new Date(now.getTime() + SHYNOK_SALE_TTL_MS),
      now
    });

    if (!sale) {
      return { state: "no-character" };
    }

    return buildSaleSelectionResult(gate.character, sale, eligible, page);
  }

  async updateSaleSelectionForTelegramUser(
    telegramUserId: bigint,
    input: { token: string; page: number; action: "add" | "remove" | "all" | "clear"; index?: number }
  ): Promise<ShynokSaleSelectionResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }
    const [snapshot, sale] = await Promise.all([
      this.shynok.getInventorySnapshotForTelegramUser(telegramUserId),
      this.shynok.findSaleForTelegramUser(telegramUserId, input.token)
    ]);

    if (!snapshot) {
      return { state: "no-character" };
    }

    if (!sale || sale.status !== "pending") {
      return { state: "invalid-token" };
    }

    const eligible = getEligibleSaleStacks(snapshot);
    const nextSelection = updateSelection(sale.selection, eligible, input);
    const basket = buildMantokSaleBasket(nextSelection, eligible) ?? {
      items: [],
      nominalValue: 0,
      payoutGold: 0,
      fingerprint: "empty"
    };
    const updated = await this.shynok.updateSaleSelectionForTelegramUser(telegramUserId, {
      token: input.token,
      selection: basket.items,
      selectionFingerprint: basket.fingerprint,
      nominalValue: basket.nominalValue,
      payoutGold: basket.payoutGold,
      now: this.clock()
    });

    if (!updated) {
      return { state: "invalid-token" };
    }

    return buildSaleSelectionResult(gate.character, updated, eligible, input.page);
  }

  async getSaleSelectionForTelegramUser(
    telegramUserId: bigint,
    token: string,
    page = 0
  ): Promise<ShynokSaleSelectionResult> {
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }
    const [snapshot, sale] = await Promise.all([
      this.shynok.getInventorySnapshotForTelegramUser(telegramUserId),
      this.shynok.findSaleForTelegramUser(telegramUserId, token)
    ]);
    if (!snapshot) {
      return { state: "no-character" };
    }
    if (!sale || sale.status !== "pending") {
      return { state: "invalid-token" };
    }

    return buildSaleSelectionResult(gate.character, sale, getEligibleSaleStacks(snapshot), page);
  }

  async cancelSaleForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ShynokSaleConfirmResult> {
    const sale = await this.shynok.cancelSaleForTelegramUser(telegramUserId, token, this.clock());

    if (!sale) {
      return { state: "invalid-token" };
    }

    return { state: "cancelled" };
  }

  async confirmSaleForTelegramUser(
    telegramUserId: bigint,
    token: string
  ): Promise<ShynokSaleConfirmResult> {
    const now = this.clock();
    const gate = await this.checkGate(telegramUserId);
    if (gate.state !== "ready") {
      return gate;
    }
    const snapshot = await this.shynok.getInventorySnapshotForTelegramUser(telegramUserId);
    const sale = await this.shynok.findSaleForTelegramUser(telegramUserId, token);

    if (!snapshot) {
      return { state: "no-character" };
    }
    if (!sale) {
      return { state: "invalid-token" };
    }

    const eligible = getEligibleSaleStacks(snapshot);
    const basket = sale.status === "pending"
      ? buildMantokSaleBasket(sale.selection, eligible)
      : null;
    if (sale.status === "pending" && (!basket || basket.fingerprint !== sale.selectionFingerprint)) {
      return { state: "stale-selection" };
    }

    const result = await this.shynok.confirmSaleForTelegramUser(telegramUserId, {
      token,
      itemContents: items,
      result: {
        nominalValue: sale.nominalValue,
        payoutGold: sale.payoutGold,
        unitCount: sale.selection.reduce((sum, item) => sum + item.quantity, 0),
        items: sale.selection.map((item) => {
          const content = items.find((entry) => entry.id === item.itemId);
          return {
            itemId: item.itemId,
            quantity: item.quantity,
            unitGoldValue: content?.goldValue ?? 0
          };
        }),
        completedAt: now.toISOString()
      },
      now
    });

    switch (result.state) {
      case "sold":
      case "replayed":
        return {
          state: result.state,
          character: summarizeCharacter(result.character),
          sale: result.sale,
          items: presentSaleReplayLines(result.sale.result) ?? presentSaleLines(result.sale.selection, eligible, items)
        };
      case "no-character":
      case "invalid-token":
      case "expired":
      case "cancelled":
      case "stale-selection":
      case "zero-payout":
        return { state: result.state };
    }
  }

  private async checkGate(
    telegramUserId: bigint
  ): Promise<{ state: "ready"; character: CharacterRecord } | { state: ShynokGateState }> {
    const snapshot = await this.shynok.getAccessSnapshotForTelegramUser(telegramUserId);
    if (!snapshot) {
      return { state: "no-character" };
    }
    if (snapshot.character.currentLocationId !== PRESENCE_LOCATION_KORCHMA_BAR) {
      return { state: "wrong-place" };
    }
    if (snapshot.activeCombatLease) {
      return { state: "active-combat" };
    }
    if (snapshot.currentRaidId) {
      return { state: "pending-raid" };
    }

    return { state: "ready", character: snapshot.character };
  }

}

export function getRoundPrice(tier: KorchmaRoundTier, recipientCount: number): number {
  const count = Math.max(1, Math.floor(recipientCount));
  return tier === "fine" ? Math.max(193, 42 * count) : Math.max(93, 13 * count);
}

export function presentDrinkDefinition(key: ShynokDrinkKey): PresentedDrinkDefinition {
  const drink = getShynokDrinkDefinition(key);

  return { ...drink };
}

export function presentDrinkState(state: ShynokDrinkStateRecord | null): PresentedShynokDrinkState | null {
  if (!state) {
    return null;
  }
  const effect = buildDrinkEffect({
    drinkKey: state.drinkKey,
    startedAt: state.startedAt
  });

  return {
    ...presentDrinkDefinition(state.drinkKey),
    phase: effect.phase,
    startedAt: state.startedAt,
    expiresAt: state.expiresAt
  };
}

function presentRoundOffer(offer: ShynokRoundRecipientRecord): PresentedRoundOffer {
  return {
    id: offer.id,
    drink: presentDrinkDefinition(offer.drinkKey),
    expiresAt: offer.expiresAt
  };
}

function getEligibleSaleStacks(snapshot: {
  items: Array<{ itemId: string; quantity: number }>;
  equippedItemIds: string[];
  reservedItemIds: string[];
}): MantokSaleEligibleStack[] {
  return buildMantokSaleEligibleStacks({
    stacks: snapshot.items,
    equippedItemIds: new Set(snapshot.equippedItemIds),
    reservedItemIds: new Set(snapshot.reservedItemIds),
    itemContents: items
  }).sort((left, right) => left.unitGoldValue - right.unitGoldValue || left.itemId.localeCompare(right.itemId));
}

function buildSaleSelectionResult(
  character: Parameters<typeof summarizeCharacter>[0],
  sale: ShynokMantokSaleRecord,
  eligible: MantokSaleEligibleStack[],
  requestedPage: number
): Extract<ShynokSaleSelectionResult, { state: "selection" }> {
  const selectedById = new Map(sale.selection.map((item) => [item.itemId, item.quantity]));
  const eligibleCount = eligible.reduce((sum, item) => sum + item.quantity, 0);
  const selectedCount = sale.selection.reduce((sum, item) => sum + item.quantity, 0);
  const pageCount = Math.max(1, Math.ceil(eligible.length / MANTOK_SALE_PAGE_SIZE));
  const page = clampPage(requestedPage, pageCount);
  const start = page * MANTOK_SALE_PAGE_SIZE;

  return {
    state: "selection",
    character: summarizeCharacter(character),
    sale,
    items: eligible.slice(start, start + MANTOK_SALE_PAGE_SIZE).map((item, offset) => ({
      index: start + offset,
      itemId: item.itemId,
      content: item.content,
      availableQuantity: item.quantity,
      selectedQuantity: selectedById.get(item.itemId) ?? 0,
      unitGoldValue: item.unitGoldValue
    })),
    selectedCount,
    eligibleCount,
    nominalValue: sale.nominalValue,
    payoutGold: sale.payoutGold,
    page,
    pageCount
  };
}

function updateSelection(
  selection: readonly { itemId: string; quantity: number }[],
  eligible: MantokSaleEligibleStack[],
  input: { action: "add" | "remove" | "all" | "clear"; index?: number }
): Array<{ itemId: string; quantity: number }> {
  if (input.action === "clear") {
    return [];
  }
  if (input.action === "all") {
    return selectAllMantokSaleEligibleUnits(eligible);
  }

  const target = typeof input.index === "number" ? eligible[input.index] : undefined;
  if (!target) {
    return [...selection];
  }

  const selected = new Map(selection.map((item) => [item.itemId, item.quantity]));
  const current = selected.get(target.itemId) ?? 0;

  if (input.action === "add" && current < target.quantity) {
    selected.set(target.itemId, current + 1);
  }
  if (input.action === "remove" && current > 0) {
    if (current === 1) {
      selected.delete(target.itemId);
    } else {
      selected.set(target.itemId, current - 1);
    }
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

function presentSaleLines(
  selection: readonly { itemId: string; quantity: number }[],
  eligible: MantokSaleEligibleStack[],
  itemContents: typeof items = items
): PresentedSaleLine[] {
  const eligibleById = new Map(eligible.map((item) => [item.itemId, item]));
  const contentById = new Map(itemContents.map((item) => [item.id, item]));

  return selection.flatMap((item) => {
    const stack = eligibleById.get(item.itemId);
    const content = stack?.content ?? contentById.get(item.itemId);
    const unitGoldValue = stack?.unitGoldValue ?? content?.goldValue;

    return content && typeof unitGoldValue === "number"
      ? [{
          itemId: item.itemId,
          quantity: item.quantity,
          content,
          unitGoldValue
        }]
      : [];
  });
}

function presentSaleReplayLines(result: unknown): PresentedSaleLine[] | null {
  if (!isRecord(result) || !Array.isArray(result.items)) {
    return null;
  }
  const contentById = new Map(items.map((item) => [item.id, item]));
  const lines = result.items.flatMap((entry): PresentedSaleLine[] => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }
    const quantity = Number(entry.quantity);
    const unitGoldValue = Number(entry.unitGoldValue);
    const content = contentById.get(entry.itemId);
    if (!content || !Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(unitGoldValue) || unitGoldValue < 0) {
      return [];
    }

    return [{
      itemId: entry.itemId,
      quantity,
      content,
      unitGoldValue
    }];
  });

  return lines.length > 0 ? lines : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isInteger(page) || page < 0) {
    return 0;
  }

  return Math.min(page, pageCount - 1);
}

export function listShynokDrinkDefinitions(): PresentedDrinkDefinition[] {
  return SHYNOK_DRINKS.map((drink) => presentDrinkDefinition(drink.key));
}

export function parseDrinkKey(value: string): ShynokDrinkKey | null {
  return isShynokDrinkKey(value) ? value : null;
}

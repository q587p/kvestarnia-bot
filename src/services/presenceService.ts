import type {
  MarkPresenceInput,
  PresenceRecord,
  PresenceRepository
} from "../db/repositories/presenceRepository";
import type { TelegramUserProfile } from "../db/repositories/userRepository";
import { systemClock, type Clock } from "../shared/time";

export const PRESENCE_ACTIVE_MS = 5 * 60 * 1000;
export const PRESENCE_IDLE_MS = 15 * 60 * 1000;

export const PRESENCE_LOCATION_KORCHMA_FRONT = "location.korchma.front";
export const PRESENCE_LOCATION_KORCHMA_HALL = "location.korchma.hall";
export const PRESENCE_LOCATION_KORCHMA_QUEST_TABLE = "location.korchma.quest_table";
export const PRESENCE_LOCATION_KORCHMA_BAR = "location.korchma.bar";
export const PRESENCE_LOCATION_KORCHMA_CELLAR = "location.korchma.cellar";
export const PRESENCE_LOCATION_KORCHMA_BARREL = "location.korchma.barrel";
export const PRESENCE_LOCATION_KORCHMA_NEWS_CORNER = "location.korchma.news_corner";
export const PRESENCE_LOCATION_KORCHMA_RANGER_CORNER = "location.korchma.ranger_corner";
export const PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER = "location.korchma.fighting_corner";
export const PRESENCE_LOCATION_KORCHMA_DEEP = "location.korchma.deep";
export const PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1 = "location.korchma.deep.level1";
export const PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT = "location.korchma.deep.level1.left";
export const PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT = "location.korchma.deep.level1.straight";
export const PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT = "location.korchma.deep.level1.right";
export const PRESENCE_LOCATION_UNKNOWN = "location.unknown";

export const PRESENCE_LOCATION_TAVERN = "location.tavern";
export const PRESENCE_LOCATION_SHAWARMA = "location.shawarma-table";
export const PRESENCE_LOCATION_TAVERN_CELLAR = "location.tavern-cellar";

const KORCHMA_INTERIOR_LOCATION_IDS = [
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT
];

export const PRESENCE_RAID_FRIDAY_BARREL = "raid.friday-barrel";
export const PRESENCE_ADVENTURE_CHOICE = "adventure.choice";
export const PRESENCE_ADVENTURE_MIMIC_SHAWARMA = "adventure.mimic-shawarma";
export const PRESENCE_ADVENTURE_MIMIC_FIGHT = "adventure.mimic-shawarma-fight";
export const PRESENCE_ADVENTURE_SOLO_FIGHT = "adventure.solo-fight";
export const PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND = "adventure.cellar.mouse-errand";
export const PRESENCE_ADVENTURE_HUNT_BOARD = "adventure.hunt-board.contract";
export const PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER = "adventure.training-doppelganger";
export const PRESENCE_ADVENTURE_DUEL_CHALLENGE = "adventure.duel-challenge";

export type PresenceStatus = "active" | "idle" | "inactive";
export type PresenceActivityKind = "raid" | "adventure";

export interface MarkPlayerPresenceInput {
  user: TelegramUserProfile;
  locationId?: string;
  currentRaidId?: string | null;
  currentAdventureId?: string | null;
}

export interface PresencePerson {
  telegramUserId: bigint;
  name: string;
  level?: number;
  status: Exclude<PresenceStatus, "inactive">;
}

export interface PresenceGroup {
  active: PresencePerson[];
  idle: PresencePerson[];
  total: number;
}

export interface KorchmaArrivalBoardEntry {
  telegramUserId: bigint;
  name: string;
  level?: number;
  locationName: string;
}

export interface KorchmaArrivalBoard {
  entries: KorchmaArrivalBoardEntry[];
}

export interface PublicPresenceLocationSnapshot {
  locationId: string;
  title: string;
  regionName: string | null;
  activeCount: number;
  idleCount: number;
  players: string[];
}

export interface PublicPresenceLocationsSnapshot {
  totalActive: number;
  totalIdle: number;
  total: number;
  locations: PublicPresenceLocationSnapshot[];
}

export interface PresenceServiceOptions {
  publicPresenceNamesEnabled?: boolean;
}

export type OnlineSnapshot =
  | { state: "no-character" }
  | {
      state: "ready";
      globalTotal: number;
      location: {
        id: string;
        name: string;
        people: PresenceGroup;
      };
      activity: PresenceActivitySnapshot | null;
    };

export type LookSnapshot =
  | { state: "no-character" }
  | {
      state: "ready";
      location: {
        id: string;
        name: string;
        people: PresenceGroup;
      };
    };

export type NearbyDuelCandidatesSnapshot =
  | { state: "no-character" }
  | {
      state: "ready";
      location: {
        id: string;
        name: string;
      };
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      visible: PresencePerson[];
    };

export interface NearbyDuelTargetValidator {
  isNearbyDuelTargetAvailable(
    challengerTelegramUserId: bigint,
    targetTelegramUserId: bigint
  ): Promise<boolean>;
}

export type CurrentPlaceSnapshot =
  | { state: "no-character" }
  | {
      state: "ready";
      locationId: string;
      locationName: string;
      insideKorchma: boolean;
    };

export type CurrentPresenceActivitySnapshot =
  | { state: "no-character" }
  | {
      state: "ready";
      currentRaidId: string | null;
      currentAdventureId: string | null;
    };

export type PresenceActivitySnapshot =
  | {
      kind: "raid";
      id: string;
      name: string;
      locationName: string;
      people: PresenceGroup;
    }
  | {
      kind: "adventure";
      id: string;
      name: string;
      locationName: string;
      people: PresenceGroup;
    };

export type ParticipantsSnapshot =
  | { state: "no-character" }
  | {
      state: "ready";
      activity: PresenceActivitySnapshot;
    };

export class PresenceService {
  constructor(
    private readonly presence: PresenceRepository,
    private readonly clock: Clock = systemClock,
    private readonly options: PresenceServiceOptions = {}
  ) {}

  async markAction(input: MarkPlayerPresenceInput): Promise<void> {
    const repositoryInput: MarkPresenceInput = {
      user: input.user,
      at: this.clock(),
      ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
      ...(input.currentRaidId === undefined ? {} : { currentRaidId: input.currentRaidId }),
      ...(input.currentAdventureId === undefined
        ? {}
        : { currentAdventureId: input.currentAdventureId })
    };

    await this.presence.markAction(repositoryInput);
  }

  async getOnlineForTelegramUser(telegramUserId: bigint): Promise<OnlineSnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    const since = this.getRecentCutoff();
    const globalPeople = groupPeople(await this.presence.listSeenSince(since), this.clock());
    const locationId = normalizePresenceLocationId(current.lastSeenLocationId);
    const locationPeople = groupPeople(
      await this.listByLocationGroupSeenSince(locationId, since),
      this.clock()
    );

    return {
      state: "ready",
      globalTotal: globalPeople.total,
      location: {
        id: locationId,
        name: getLocationName(locationId),
        people: locationPeople
      },
      activity: await this.getCurrentActivity(current, since)
    };
  }

  async getLookForTelegramUser(telegramUserId: bigint): Promise<LookSnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    const since = this.getRecentCutoff();
    const locationId = normalizePresenceLocationId(current.lastSeenLocationId);

    return {
      state: "ready",
      location: {
        id: locationId,
        name: getLocationName(locationId),
        people: groupPeople(
          await this.listByLocationGroupSeenSince(locationId, since),
          this.clock()
        )
      }
    };
  }

  async getNearbyDuelCandidatesForTelegramUser(
    telegramUserId: bigint,
    page = 0,
    pageSize = 5
  ): Promise<NearbyDuelCandidatesSnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    const since = this.getRecentCutoff();
    const locationId = normalizePresenceLocationId(current.lastSeenLocationId);
    const people = groupPeople(
      await this.listByLocationGroupSeenSince(locationId, since),
      this.clock()
    );
    const candidates = people.active.filter((person) => person.telegramUserId !== telegramUserId);
    const safePageSize = Math.max(1, Math.min(50, Math.trunc(pageSize)));
    const totalPages = Math.max(1, Math.ceil(candidates.length / safePageSize));
    const safePage = Math.max(0, Math.min(Math.trunc(page), totalPages - 1));
    const start = safePage * safePageSize;

    return {
      state: "ready",
      location: {
        id: locationId,
        name: getLocationName(locationId)
      },
      page: safePage,
      pageSize: safePageSize,
      total: candidates.length,
      totalPages,
      visible: candidates.slice(start, start + safePageSize)
    };
  }

  async isNearbyDuelTargetAvailable(
    challengerTelegramUserId: bigint,
    targetTelegramUserId: bigint
  ): Promise<boolean> {
    if (challengerTelegramUserId === targetTelegramUserId) {
      return false;
    }

    const current = await this.presence.findByTelegramUserId(challengerTelegramUserId);

    if (!current?.characterName) {
      return false;
    }

    const since = this.getRecentCutoff();
    const locationId = normalizePresenceLocationId(current.lastSeenLocationId);
    const people = groupPeople(
      await this.listByLocationGroupSeenSince(locationId, since),
      this.clock()
    );

    return people.active.some((person) => person.telegramUserId === targetTelegramUserId);
  }

  async getKorchmaInteriorPresence(): Promise<PresenceGroup> {
    const since = this.getRecentCutoff();
    const records = await Promise.all(
      KORCHMA_INTERIOR_LOCATION_IDS.map((locationId) =>
        this.listByLocationGroupSeenSince(locationId, since)
      )
    );

    return groupPeople(records.flat(), this.clock());
  }

  async getKorchmaArrivalBoard(limit = 10): Promise<KorchmaArrivalBoard> {
    const records = await this.presence.listKorchmaVisitors(limit);

    return {
      entries: uniquePresenceRecords(records).map((record) => ({
        telegramUserId: record.telegramUserId,
        name: getPresenceName(record),
        ...(record.characterLevel === null || record.characterLevel === undefined
          ? {}
          : { level: record.characterLevel }),
        locationName: getLocationName(normalizePresenceLocationId(record.lastSeenLocationId))
      }))
    };
  }

  async getCurrentPlaceForTelegramUser(telegramUserId: bigint): Promise<CurrentPlaceSnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    const locationId = normalizePresenceLocationId(current.lastSeenLocationId);

    return {
      state: "ready",
      locationId,
      locationName: getLocationName(locationId),
      insideKorchma: isKorchmaInteriorLocation(locationId)
    };
  }

  async getCurrentActivityForTelegramUser(
    telegramUserId: bigint
  ): Promise<CurrentPresenceActivitySnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      currentRaidId: current.currentRaidId ?? null,
      currentAdventureId: current.currentAdventureId ?? null
    };
  }

  async getRaidParticipantsForTelegramUser(
    telegramUserId: bigint,
    raidId: string
  ): Promise<ParticipantsSnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      activity: await this.getRaidActivity(raidId, this.getRecentCutoff())
    };
  }

  async getAdventureParticipantsForTelegramUser(
    telegramUserId: bigint,
    adventureId: string
  ): Promise<ParticipantsSnapshot> {
    const current = await this.presence.findByTelegramUserId(telegramUserId);

    if (!current?.characterName) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      activity: await this.getAdventureActivity(adventureId, this.getRecentCutoff())
    };
  }

  async getPublicPresenceLocations(): Promise<PublicPresenceLocationsSnapshot> {
    const now = this.clock();
    const records = await this.presence.listSeenSince(this.getRecentCutoff());
    const locations = new Map<string, MutablePublicPresenceLocation>();

    for (const record of records) {
      const status = getPresenceStatus(record.lastActionAt, now);

      if (status === "inactive") {
        continue;
      }

      const location = getPublicPresenceLocation(record.lastSeenLocationId);
      const current = getOrCreatePublicLocation(locations, location);

      if (status === "active") {
        current.activeCount += 1;
      } else {
        current.idleCount += 1;
      }

      if (
        this.options.publicPresenceNamesEnabled === true &&
        location.showNames &&
        record.showInPublicPresence !== false
      ) {
        current.players.push(getPresenceName(record));
      }
    }

    const publicLocations = [...locations.values()]
      .map((location): PublicPresenceLocationSnapshot => ({
        locationId: location.locationId,
        title: location.title,
        regionName: location.regionName,
        activeCount: location.activeCount,
        idleCount: location.idleCount,
        players: [...new Set(location.players)].sort((left, right) =>
          left.localeCompare(right, "uk")
        )
      }))
      .filter((location) => location.activeCount + location.idleCount > 0)
      .sort((left, right) => {
        const totalDiff =
          right.activeCount + right.idleCount - (left.activeCount + left.idleCount);

        return totalDiff === 0 ? left.title.localeCompare(right.title, "uk") : totalDiff;
      });

    return {
      totalActive: publicLocations.reduce((sum, location) => sum + location.activeCount, 0),
      totalIdle: publicLocations.reduce((sum, location) => sum + location.idleCount, 0),
      total: publicLocations.reduce(
        (sum, location) => sum + location.activeCount + location.idleCount,
        0
      ),
      locations: publicLocations
    };
  }

  private getRecentCutoff(): Date {
    return new Date(this.clock().getTime() - PRESENCE_IDLE_MS);
  }

  private async getCurrentActivity(
    current: PresenceRecord,
    since: Date
  ): Promise<PresenceActivitySnapshot | null> {
    if (current.currentRaidId) {
      return this.getRaidActivity(current.currentRaidId, since);
    }

    if (current.currentAdventureId) {
      return this.getAdventureActivity(current.currentAdventureId, since);
    }

    return null;
  }

  private async getRaidActivity(id: string, since: Date): Promise<PresenceActivitySnapshot> {
    return {
      kind: "raid",
      id,
      name: getRaidName(id),
      locationName: getActivityLocationName(id),
      people: groupPeople(await this.presence.listByRaidSeenSince(id, since), this.clock())
    };
  }

  private async getAdventureActivity(
    id: string,
    since: Date
  ): Promise<PresenceActivitySnapshot> {
    return {
      kind: "adventure",
      id,
      name: getAdventureName(id),
      locationName: getActivityLocationName(id),
      people: groupPeople(await this.presence.listByAdventureSeenSince(id, since), this.clock())
    };
  }

  private async listByLocationGroupSeenSince(
    locationId: string,
    since: Date
  ): Promise<PresenceRecord[]> {
    const records = await Promise.all(
      getLocationQueryIds(locationId).map((id) => this.presence.listByLocationSeenSince(id, since))
    );

    return uniquePresenceRecords(records.flat());
  }
}

export function getPresenceStatus(lastActionAt: Date | null | undefined, now: Date): PresenceStatus {
  if (!lastActionAt) {
    return "inactive";
  }

  const ageMs = now.getTime() - lastActionAt.getTime();

  if (ageMs <= PRESENCE_ACTIVE_MS) {
    return "active";
  }

  if (ageMs <= PRESENCE_IDLE_MS) {
    return "idle";
  }

  return "inactive";
}

function groupPeople(records: PresenceRecord[], now: Date): PresenceGroup {
  const people = uniquePresenceRecords(records)
    .map((record): PresencePerson | null => {
      const status = getPresenceStatus(record.lastActionAt, now);

      if (status === "inactive") {
        return null;
      }

      return {
        telegramUserId: record.telegramUserId,
        name: getPresenceName(record),
        ...(record.characterLevel === null || record.characterLevel === undefined
          ? {}
          : { level: record.characterLevel }),
        status
      };
    })
    .filter((person): person is PresencePerson => person !== null)
    .sort((left, right) => left.name.localeCompare(right.name, "uk"));

  const active = people.filter((person) => person.status === "active");
  const idle = people.filter((person) => person.status === "idle");

  return {
    active,
    idle,
    total: active.length + idle.length
  };
}

function getPresenceName(record: PresenceRecord): string {
  return record.characterName ?? record.displayName ?? record.telegramUserId.toString();
}

export function getLocationName(id: string): string {
  return getPublicPresenceLocation(id).title;
}

interface PublicPresenceLocation {
  locationId: string;
  title: string;
  regionName: string | null;
  showNames: boolean;
  isSpecific: boolean;
}

interface MutablePublicPresenceLocation extends PublicPresenceLocationSnapshot {
  players: string[];
}

export function getPublicPresenceLocation(
  locationId: string | null | undefined
): PublicPresenceLocation {
  const rawId = locationId ?? PRESENCE_LOCATION_KORCHMA_FRONT;

  if (isSecretPresenceLocation(rawId)) {
    return {
      locationId: PRESENCE_LOCATION_UNKNOWN,
      title: "Невідома місцина",
      regionName: null,
      showNames: false,
      isSpecific: false
    };
  }

  const id = normalizePresenceLocationId(rawId);

  if (id === PRESENCE_LOCATION_KORCHMA_FRONT) {
    return {
      locationId: id,
      title: "Перед корчмою",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_HALL) {
    return {
      locationId: id,
      title: "Зала корчми",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
    return {
      locationId: id,
      title: "Стіл зі справами",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_BAR) {
    return {
      locationId: id,
      title: "Шинок",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_CELLAR) {
    return {
      locationId: id,
      title: "Льох корчми",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_BARREL) {
    return {
      locationId: id,
      title: "Біля Бочки Пінного Міражу",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_NEWS_CORNER) {
    return {
      locationId: id,
      title: "Дошка вістей",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_RANGER_CORNER) {
    return {
      locationId: id,
      title: "Єгерський куток",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER) {
    return {
      locationId: id,
      title: "Бійцівський куток",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_DEEP) {
    return {
      locationId: id,
      title: "Низ",
      regionName: "Корчма Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1) {
    return {
      locationId: id,
      title: "Сутерени Корчми",
      regionName: "Низ",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT) {
    return {
      locationId: id,
      title: "Лівий прохід",
      regionName: "Сутерени Корчми",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT) {
    return {
      locationId: id,
      title: "Прямий прохід",
      regionName: "Сутерени Корчми",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT) {
    return {
      locationId: id,
      title: "Правий прохід",
      regionName: "Сутерени Корчми",
      showNames: true,
      isSpecific: true
    };
  }

  return {
    locationId: id,
    title: "Невідома місцина",
    regionName: null,
    showNames: false,
    isSpecific: false
  };
}

export function normalizePresenceLocationId(locationId: string | null | undefined): string {
  if (!locationId) {
    return PRESENCE_LOCATION_KORCHMA_FRONT;
  }

  if (locationId === PRESENCE_LOCATION_TAVERN) {
    return PRESENCE_LOCATION_KORCHMA_HALL;
  }

  if (locationId === PRESENCE_LOCATION_SHAWARMA) {
    return PRESENCE_LOCATION_KORCHMA_QUEST_TABLE;
  }

  if (locationId === PRESENCE_LOCATION_TAVERN_CELLAR) {
    return PRESENCE_LOCATION_KORCHMA_CELLAR;
  }

  return locationId;
}

export function isKorchmaInteriorLocation(locationId: string | null | undefined): boolean {
  const id = normalizePresenceLocationId(locationId);

  return (
    id === PRESENCE_LOCATION_KORCHMA_HALL ||
    id === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE ||
    id === PRESENCE_LOCATION_KORCHMA_BAR ||
    id === PRESENCE_LOCATION_KORCHMA_CELLAR ||
    id === PRESENCE_LOCATION_KORCHMA_BARREL ||
    id === PRESENCE_LOCATION_KORCHMA_NEWS_CORNER ||
    id === PRESENCE_LOCATION_KORCHMA_RANGER_CORNER ||
    id === PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER ||
    id === PRESENCE_LOCATION_KORCHMA_DEEP ||
    id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1 ||
    id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT ||
    id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT ||
    id === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT
  );
}

function getLocationQueryIds(locationId: string): string[] {
  const id = normalizePresenceLocationId(locationId);

  if (id === PRESENCE_LOCATION_KORCHMA_HALL) {
    return [id, PRESENCE_LOCATION_TAVERN];
  }

  if (id === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
    return [id, PRESENCE_LOCATION_SHAWARMA];
  }

  if (id === PRESENCE_LOCATION_KORCHMA_CELLAR) {
    return [id, PRESENCE_LOCATION_TAVERN_CELLAR];
  }

  return [id];
}

function uniquePresenceRecords(records: PresenceRecord[]): PresenceRecord[] {
  const byUser = new Map<bigint, PresenceRecord>();

  for (const record of records) {
    byUser.set(record.telegramUserId, record);
  }

  return [...byUser.values()];
}

function getOrCreatePublicLocation(
  locations: Map<string, MutablePublicPresenceLocation>,
  location: PublicPresenceLocation
): MutablePublicPresenceLocation {
  const existing = locations.get(location.locationId);

  if (existing) {
    return existing;
  }

  const created = {
    locationId: location.locationId,
    title: location.title,
    regionName: location.regionName,
    activeCount: 0,
    idleCount: 0,
    players: []
  };

  locations.set(location.locationId, created);
  return created;
}

function isSecretPresenceLocation(locationId: string): boolean {
  const normalized = locationId.toLowerCase();

  return (
    normalized.startsWith("secret.") ||
    normalized.startsWith("hidden.") ||
    normalized.includes(".secret") ||
    normalized.includes(".hidden")
  );
}

function getRaidName(id: string): string {
  if (id === PRESENCE_RAID_FRIDAY_BARREL) {
    return "Бочка Пінного Міражу";
  }

  return "рейд місцевого значення";
}

function getAdventureName(id: string): string {
  if (id === PRESENCE_ADVENTURE_CHOICE) {
    return "Корчемний вибір пригоди";
  }

  if (id === PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND) {
    return "Льохова справа";
  }

  if (id === PRESENCE_ADVENTURE_HUNT_BOARD) {
    return "Єгерська справа";
  }

  if (id === PRESENCE_ADVENTURE_MIMIC_FIGHT) {
    return "Сутичка з Міміком-шаурмою";
  }

  if (id === PRESENCE_ADVENTURE_SOLO_FIGHT) {
    return "Бій у кутку";
  }

  if (id === PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER) {
    return "Сумлінний Допельґанґер";
  }

  if (id === PRESENCE_ADVENTURE_DUEL_CHALLENGE) {
    return "Миттєва дуель";
  }

  return "Підозріла шаурма";
}

function getActivityLocationName(id: string): string {
  if (id === PRESENCE_RAID_FRIDAY_BARREL) {
    return getLocationName(PRESENCE_LOCATION_KORCHMA_BARREL);
  }

  if (id === PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND) {
    return getLocationName(PRESENCE_LOCATION_KORCHMA_CELLAR);
  }

  if (id === PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER) {
    return getLocationName(PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER);
  }

  if (id === PRESENCE_ADVENTURE_DUEL_CHALLENGE) {
    return getLocationName(PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER);
  }

  return getLocationName(PRESENCE_LOCATION_KORCHMA_QUEST_TABLE);
}

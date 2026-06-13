import type {
  MarkPresenceInput,
  PresenceRecord,
  PresenceRepository
} from "../db/repositories/presenceRepository";
import type { TelegramUserProfile } from "../db/repositories/userRepository";
import { systemClock, type Clock } from "../shared/time";

export const PRESENCE_ACTIVE_MS = 5 * 60 * 1000;
export const PRESENCE_IDLE_MS = 15 * 60 * 1000;

export const PRESENCE_LOCATION_TAVERN = "location.tavern";
export const PRESENCE_LOCATION_SHAWARMA = "location.shawarma-table";
export const PRESENCE_LOCATION_UNKNOWN = "location.unknown";

export const PRESENCE_RAID_FRIDAY_BARREL = "raid.friday-barrel";
export const PRESENCE_ADVENTURE_MIMIC_SHAWARMA = "adventure.mimic-shawarma";
export const PRESENCE_ADVENTURE_MIMIC_FIGHT = "adventure.mimic-shawarma-fight";

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
    const locationId = current.lastSeenLocationId ?? PRESENCE_LOCATION_TAVERN;
    const locationPeople = groupPeople(
      await this.presence.listByLocationSeenSince(locationId, since),
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
    const locationId = current.lastSeenLocationId ?? PRESENCE_LOCATION_TAVERN;

    return {
      state: "ready",
      location: {
        id: locationId,
        name: getLocationName(locationId),
        people: groupPeople(
          await this.presence.listByLocationSeenSince(locationId, since),
          this.clock()
        )
      }
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
  const people = records
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
  const publicLocation = getPublicPresenceLocation(id);

  if (!publicLocation.isSpecific) {
    return publicLocation.title;
  }

  if (id === PRESENCE_LOCATION_SHAWARMA) {
    return "Стіл із підозрілою шаурмою";
  }

  return "Таверна Квестарні";
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
  const id = locationId ?? PRESENCE_LOCATION_TAVERN;

  if (isSecretPresenceLocation(id)) {
    return {
      locationId: PRESENCE_LOCATION_UNKNOWN,
      title: "Невідома місцина",
      regionName: null,
      showNames: false,
      isSpecific: false
    };
  }

  if (id === PRESENCE_LOCATION_SHAWARMA) {
    return {
      locationId: id,
      title: "Стіл із підозрілою шаурмою",
      regionName: "Таверна Квестарні",
      showNames: true,
      isSpecific: true
    };
  }

  if (id === PRESENCE_LOCATION_TAVERN) {
    return {
      locationId: id,
      title: "Таверна Квестарні",
      regionName: "Перед шинком",
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
  if (id === PRESENCE_ADVENTURE_MIMIC_FIGHT) {
    return "Сутичка з Міміком-шаурмою";
  }

  return "Підозріла шаурма";
}

function getActivityLocationName(id: string): string {
  if (id === PRESENCE_RAID_FRIDAY_BARREL) {
    return getLocationName(PRESENCE_LOCATION_TAVERN);
  }

  return getLocationName(PRESENCE_LOCATION_SHAWARMA);
}

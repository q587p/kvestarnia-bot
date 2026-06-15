import { describe, expect, it } from "vitest";
import {
  HP_BASE_FULL_REGEN_SECONDS,
  MANA_BASE_FULL_REGEN_SECONDS,
  applyPassiveResourceRegeneration,
  getHpFullRegenSeconds,
  getManaFullRegenSeconds
} from "../../src/domain/resources/resourceRegeneration";
import type { CharacterStats } from "../../src/domain/characters/starterStats";

const baseStats: CharacterStats = {
  strength: 6,
  dexterity: 6,
  intelligence: 6,
  charisma: 6,
  luck: 6
};

describe("applyPassiveResourceRegeneration", () => {
  it("restores deterministic whole HP and mana points from elapsed time", () => {
    const result = applyPassiveResourceRegeneration({
      resources: {
        hpCurrent: 10,
        hpMax: 20,
        manaCurrent: 3,
        manaMax: 9,
        hpRegenAt: new Date("2026-06-12T10:00:00.000Z"),
        manaRegenAt: new Date("2026-06-12T10:00:00.000Z")
      },
      profile: {
        raceId: "race.human-ish",
        classId: "class.rogue",
        stats: baseStats
      },
      now: new Date("2026-06-12T10:05:00.000Z")
    });

    expect(result.resources.hpCurrent).toBeGreaterThan(10);
    expect(result.resources.manaCurrent).toBeGreaterThan(3);
    expect(result.resources.hpCurrent).toBeLessThanOrEqual(20);
    expect(result.resources.manaCurrent).toBeLessThanOrEqual(9);
    expect(result.changed).toBe(true);
  });

  it("preserves fractional progress when no whole point is restored yet", () => {
    const marker = new Date("2026-06-12T10:00:00.000Z");
    const result = applyPassiveResourceRegeneration({
      resources: {
        hpCurrent: 1,
        hpMax: 20,
        manaCurrent: 1,
        manaMax: 10,
        hpRegenAt: marker,
        manaRegenAt: marker
      },
      profile: {
        raceId: "race.human-ish",
        classId: "class.rogue",
        stats: baseStats
      },
      now: new Date("2026-06-12T10:00:05.000Z")
    });

    expect(result.resources.hpCurrent).toBe(1);
    expect(result.resources.manaCurrent).toBe(1);
    expect(result.resources.hpRegenAt).toBe(marker);
    expect(result.resources.manaRegenAt).toBe(marker);
    expect(result.changed).toBe(false);
  });

  it("does not mark full resources changed just because old markers passed", () => {
    const now = new Date("2026-06-12T10:05:00.000Z");
    const marker = new Date("2026-06-12T09:00:00.000Z");
    const result = applyPassiveResourceRegeneration({
      resources: {
        hpCurrent: 20,
        hpMax: 20,
        manaCurrent: 10,
        manaMax: 10,
        hpRegenAt: marker,
        manaRegenAt: marker
      },
      profile: {
        raceId: "race.human-ish",
        classId: "class.rogue",
        stats: baseStats
      },
      now
    });

    expect(result.resources.hpCurrent).toBe(20);
    expect(result.resources.manaCurrent).toBe(10);
    expect(result.resources.hpRegenAt).toBe(marker);
    expect(result.resources.manaRegenAt).toBe(marker);
    expect(result.recovery.hpSecondsToFull).toBe(0);
    expect(result.recovery.manaSecondsToFull).toBe(0);
    expect(result.changed).toBe(false);
  });

  it("persists missing markers for partially recovered resources so recovery can progress", () => {
    const now = new Date("2026-06-12T10:00:00.000Z");
    const result = applyPassiveResourceRegeneration({
      resources: {
        hpCurrent: 10,
        hpMax: 20,
        manaCurrent: 5,
        manaMax: 10,
        hpRegenAt: null,
        manaRegenAt: null
      },
      profile: {
        raceId: "race.human-ish",
        classId: "class.rogue",
        stats: baseStats
      },
      now
    });

    expect(result.resources.hpCurrent).toBe(10);
    expect(result.resources.manaCurrent).toBe(5);
    expect(result.resources.hpRegenAt).toEqual(now);
    expect(result.resources.manaRegenAt).toEqual(now);
    expect(result.changed).toBe(true);

    const progressed = applyPassiveResourceRegeneration({
      resources: result.resources,
      profile: {
        raceId: "race.human-ish",
        classId: "class.rogue",
        stats: baseStats
      },
      now: new Date("2026-06-12T10:05:00.000Z")
    });

    expect(progressed.resources.hpCurrent).toBeGreaterThan(10);
    expect(progressed.resources.manaCurrent).toBeGreaterThan(5);
  });

  it("clamps overfilled resources and reports a change", () => {
    const now = new Date("2026-06-12T10:05:00.000Z");
    const marker = new Date("2026-06-12T09:00:00.000Z");
    const result = applyPassiveResourceRegeneration({
      resources: {
        hpCurrent: 99,
        hpMax: 20,
        manaCurrent: 99,
        manaMax: 10,
        hpRegenAt: marker,
        manaRegenAt: marker
      },
      profile: {
        raceId: "race.human-ish",
        classId: "class.rogue",
        stats: baseStats
      },
      now
    });

    expect(result.resources.hpCurrent).toBe(20);
    expect(result.resources.manaCurrent).toBe(10);
    expect(result.resources.hpRegenAt).toBe(marker);
    expect(result.resources.manaRegenAt).toBe(marker);
    expect(result.changed).toBe(true);
  });

  it("lets class, race, title, and stats affect regeneration speed within caps", () => {
    const slowHp = getHpFullRegenSeconds({
      raceId: "race.dryland-rusalka",
      classId: "class.mage",
      stats: {
        ...baseStats,
        strength: 3
      }
    });
    const fastHp = getHpFullRegenSeconds({
      raceId: "race.dwarf",
      classId: "class.warrior",
      title: "Стійкий завідувач щита",
      stats: {
        ...baseStats,
        strength: 10
      }
    });
    const fastMana = getManaFullRegenSeconds({
      raceId: "race.molfar-soul",
      classId: "class.mage",
      title: "Канцеляр оберегів",
      stats: {
        ...baseStats,
        intelligence: 10
      }
    });

    expect(slowHp).toBeGreaterThan(HP_BASE_FULL_REGEN_SECONDS);
    expect(fastHp).toBeLessThan(HP_BASE_FULL_REGEN_SECONDS);
    expect(fastMana).toBeLessThan(MANA_BASE_FULL_REGEN_SECONDS);
  });
});

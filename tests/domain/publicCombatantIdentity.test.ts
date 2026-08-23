import { describe, expect, it } from "vitest";
import {
  buildLegacyPublicCombatantIdentity,
  freezePublicCombatantIdentity,
  parsePublicCombatantIdentity
} from "../../src/domain/combat/publicCombatantIdentity";
import { cloneCombatState } from "../../src/domain/combat/combatState";

describe("public combatant identity snapshot", () => {
  it("freezes only terminal-card identity fields and round-trips version 1", () => {
    const snapshot = freezePublicCombatantIdentity({
      name: "Архівна Героїня",
      title: "Пані Незмінного Протоколу",
      guildCrest: "🛡️",
      level: 13,
      raceId: "race.human-ish",
      raceName: "Людисько",
      classId: "class.mage",
      className: "Магиня"
    });

    expect(parsePublicCombatantIdentity(snapshot)).toEqual(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual([
      "classId",
      "className",
      "guildCrest",
      "level",
      "name",
      "raceId",
      "raceName",
      "title",
      "version"
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/telegram|inventory|equipment|gold|mana|hp|stats|seed/i);
  });

  it("rejects malformed snapshots and uses a storage-only generic legacy identity", () => {
    expect(parsePublicCombatantIdentity({ version: 2 })).toBeNull();
    expect(parsePublicCombatantIdentity({
      version: 1,
      name: "Архів",
      title: "Запис",
      level: 0,
      raceId: "race.human-ish",
      raceName: "Людисько",
      classId: "class.warrior",
      className: "Воїн"
    })).toBeNull();
    expect(buildLegacyPublicCombatantIdentity({ guildCrest: "🛡️" })).toEqual({
      version: 1,
      name: "Пригодник",
      title: "Пригодник зі старого запису",
      level: 1,
      raceId: "legacy.unknown-race",
      raceName: "—",
      classId: "legacy.unknown-class",
      className: "—",
      guildCrest: "🛡️"
    });
  });

  it("preserves the frozen identity across combat-state cloning", () => {
    const publicIdentity = buildLegacyPublicCombatantIdentity();
    expect(cloneCombatState({
      turn: 1,
      status: "active",
      publicIdentity,
      hero: { hp: 10, hpMax: 10, mana: 3, manaMax: 3 },
      monster: { hp: 5, hpMax: 5 }
    }).publicIdentity).toEqual(publicIdentity);
  });
});

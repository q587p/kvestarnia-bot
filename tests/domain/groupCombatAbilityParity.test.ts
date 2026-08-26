import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { classAbilities, fallbackClassAbility } from "../../src/content/playerAbilities";
import {
  GROUP_COMBAT_RAID_ONLY_SPECIALIZATIONS,
  GROUP_COMBAT_SHARED_CLASS_ABILITY_IDS
} from "../../src/domain/groupCombat/groupCombatAbilityParity";

describe("PartyBoss to GroupCombat ability parity", () => {
  it("classifies every shared PartyBoss class profile as typed GroupCombat parity", () => {
    expect([...GROUP_COMBAT_SHARED_CLASS_ABILITY_IDS].sort())
      .toEqual([...classAbilities.map((ability) => ability.id), fallbackClassAbility.id].sort());
  });

  it("keeps each truly raid-only specialization concrete and separately owned", async () => {
    const owner = await readFile("docs/backlog/group-combat-raid-specializations.md", "utf8");
    expect(GROUP_COMBAT_RAID_ONLY_SPECIALIZATIONS.map((entry) => entry.id)).toEqual([
      "raid.class.warrior.taunt",
      "raid.class.bard.lament",
      "raid.race.kharakternyk.ward-sign",
      "raid.class.bureaucramancer.protocol-13-z"
    ]);
    for (const entry of GROUP_COMBAT_RAID_ONLY_SPECIALIZATIONS) {
      expect(entry.reason.length).toBeGreaterThan(80);
      expect(owner).toContain(entry.owner.split("#")[1]!);
    }
  });
});

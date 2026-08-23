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

  it("pins the shared target, focus, cooldown, and resource resolver seams", async () => {
    const groupCombat = await readFile("src/domain/groupCombat/groupCombat.ts", "utf8");
    const partyBoss = await readFile("src/domain/partyBoss/partyBoss.ts", "utf8");
    const combatEngine = await readFile("src/domain/combat/combatEngine.ts", "utf8");
    for (const seam of [
      "getCombatClassAbilityProfile",
      "resolveActorCombatAction",
      "tickActorCooldowns",
      "primaryTargetScope",
      "secondaryTargetScope"
    ]) {
      expect(groupCombat).toContain(seam);
      expect(partyBoss).toContain(seam);
    }
    for (const resourceContract of ["manaCost", "cooldownTurns"]) {
      expect(combatEngine).toContain(resourceContract);
    }
    expect(groupCombat).toContain("enemyFocusVersion");
  });
});

import type { EquipmentSlot } from "./equipmentSlots";
import { mantokEquipmentCoverageItems } from "./mantokEquipmentCoverage";

export const MANTOK_EQUIPMENT_COVERAGE_LOOT_WEIGHT = 0.35;

export type MantokEquipmentCoverageLootEntry = {
  itemId: string;
  weight: number;
  kind: "mantok-coverage";
  equipmentSlot: EquipmentSlot;
};

const COVERAGE_LOOT_MONSTER_IDS_BY_SLOT: Record<EquipmentSlot, readonly string[]> = {
  weapon: [
    "monster.stamp-doorkeeper-skeleton",
    "monster.conditionally-sliced-loaf-bandit",
    "monster.final-comment-troll",
    "monster.cabbage-knight-on-break",
    "monster.failed-tender-pea-giant",
    "monster.thirteen-address-dragon-courier"
  ],
  offhand: [
    "monster.collective-liability-cauldron",
    "monster.queue-counter-gargoyle",
    "monster.tender-committee-frog",
    "monster.service-key-monkey",
    "monster.collateral-grey-bear",
    "monster.queue-dragon-prince"
  ],
  head: [
    "monster.preapproval-dragonling",
    "monster.unread-rules-ghost",
    "monster.six-hour-meeting-viy",
    "monster.archive-ventilation-dragon",
    "monster.overtime-heat-poludnytsia"
  ],
  chest: [
    "monster.borshch-slime",
    "monster.cabbage-knight-on-break",
    "monster.siege-iron-varenyk",
    "monster.cold-storage-state-mammoth",
    "monster.empty-chamber-lady"
  ],
  legs: [
    "monster.anxious-slippers-swarm",
    "monster.foam-auditor-boots",
    "monster.late-vacation-mavka",
    "monster.last-route-star-boar",
    "monster.last-shift-vovkulaka"
  ],
  accessory: [
    "monster.basement-mouse-with-title",
    "monster.dry-sea-teapot",
    "monster.no-change-merchantling",
    "monster.false-note-bandura-griffin",
    "monster.mountain-leasing-aridnyk"
  ],
  tool: [
    "monster.spreadsheet-goblin",
    "monster.deadline-spider",
    "monster.archival-knysh-eater",
    "monster.liar-corridor-map",
    "monster.inventory-prophet"
  ]
};

export const mantokEquipmentCoverageLoot = buildMantokEquipmentCoverageLoot();

function buildMantokEquipmentCoverageLoot(): Record<
  string,
  readonly MantokEquipmentCoverageLootEntry[]
> {
  const entriesByMonsterId = new Map<string, MantokEquipmentCoverageLootEntry[]>();

  for (const [equipmentSlot, monsterIds] of Object.entries(COVERAGE_LOOT_MONSTER_IDS_BY_SLOT) as Array<
    [EquipmentSlot, readonly string[]]
  >) {
    const slotDefinitions = mantokEquipmentCoverageItems.filter(
      (definition) => definition.equipmentSlot === equipmentSlot
    );

    slotDefinitions.forEach((definition, index) => {
      const monsterId = monsterIds[index % monsterIds.length];

      if (!monsterId) {
        return;
      }

      const entries = entriesByMonsterId.get(monsterId) ?? [];
      entries.push({
        itemId: definition.id,
        weight: MANTOK_EQUIPMENT_COVERAGE_LOOT_WEIGHT,
        kind: "mantok-coverage",
        equipmentSlot
      });
      entriesByMonsterId.set(monsterId, entries);
    });
  }

  return Object.fromEntries(
    [...entriesByMonsterId.entries()].map(([monsterId, entries]) => [monsterId, entries])
  );
}

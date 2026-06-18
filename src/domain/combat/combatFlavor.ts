import {
  selectDoppelgangerLine,
  type DoppelgangerLineCategory
} from "./doppelgangerLines";

export type CombatActorKind = "hero" | "monster" | "doppelganger";

export type CombatIntentId =
  | "plain-attack"
  | "warrior-pressure"
  | "mage-spell"
  | "varenyk-mancer-filling"
  | "bureaucramancer-form"
  | "bard-verse"
  | "rogue-feint"
  | "ranger-shot"
  | "priest-blessing"
  | "kharakternyk-omen"
  | "race-flavor"
  | "low-hp-desperation"
  | "mirror-mockery";

export interface CombatFlavorContext {
  actorKind: CombatActorKind;
  classId?: string | null;
  className?: string | null;
  raceId?: string | null;
  raceName?: string | null;
  title?: string | null;
  targetName?: string | null;
  doppelName?: string | null;
  abilityName?: string | null;
  itemName?: string | null;
  seed?: string | undefined;
  recentLineIds?: readonly string[] | undefined;
  recentLineMemorySize?: number | undefined;
  heroHpRatio?: number;
  monsterHpRatio?: number;
  turn?: number;
  action?: "attack" | "skill" | "flee";
}

export interface CombatFlavorLine {
  intentId: CombatIntentId;
  lineId?: string;
  category?: DoppelgangerLineCategory;
  tags: string[];
  text: string;
}

export function buildDoppelgangerCounterFlavor(
  context: CombatFlavorContext
): CombatFlavorLine {
  const tags = [
    `actor:${context.actorKind}`,
    "training",
    "doppelganger",
    ...(context.action ? [`action:${context.action}`] : []),
    ...(context.classId ? [`class:${context.classId}`] : []),
    ...(context.raceId ? [`race:${context.raceId}`] : []),
    ...getPressureTags(context)
  ];

  if (context.action === "flee") {
    return buildFlavorLine("mirror-mockery", tags, "turn.copying", context);
  }

  const classIntent = getClassIntent(context.classId);

  if (classIntent) {
    return buildFlavorLine(classIntent, tags, getCounterCategory(context), context);
  }

  const raceIntent = getRaceIntent(context.raceId);

  if (raceIntent) {
    return buildFlavorLine(raceIntent, tags, getCounterCategory(context), context);
  }

  if (isLowRatio(context.monsterHpRatio)) {
    return buildFlavorLine("low-hp-desperation", tags, "turn.low_hp", context);
  }

  return buildFlavorLine("mirror-mockery", tags, getCounterCategory(context), context);
}

function buildFlavorLine(
  intentId: CombatIntentId,
  tags: string[],
  category: DoppelgangerLineCategory,
  context: CombatFlavorContext
): CombatFlavorLine {
  const line = selectDoppelgangerLine({
    category,
    seed: context.seed,
    targetName: context.targetName,
    doppelName: context.doppelName,
    raceName: context.raceName,
    className: context.className,
    title: context.title,
    abilityName: context.abilityName,
    itemName: context.itemName,
    turn: context.turn,
    recentLineIds: context.recentLineIds,
    recentLineMemorySize: context.recentLineMemorySize
  });

  return {
    intentId,
    lineId: line.id,
    category: line.category,
    tags: [...tags, `category:${line.category}`, `line:${line.id}`],
    text: line.text
  };
}

function getCounterCategory(context: CombatFlavorContext): DoppelgangerLineCategory {
  if (isLowRatio(context.monsterHpRatio)) {
    return "turn.low_hp";
  }

  if (context.action === "skill") {
    return "turn.before_ability";
  }

  return typeof context.turn === "number" && context.turn % 2 === 0
    ? "turn.copying"
    : "turn.idle";
}

function getClassIntent(classId: string | null | undefined): CombatIntentId | null {
  switch (classId) {
    case "class.warrior":
      return "warrior-pressure";
    case "class.mage":
      return "mage-spell";
    case "class.varenyk-mancer":
      return "varenyk-mancer-filling";
    case "class.bureaucramancer":
      return "bureaucramancer-form";
    case "class.bard":
      return "bard-verse";
    case "class.rogue":
      return "rogue-feint";
    case "class.ranger":
      return "ranger-shot";
    case "class.priest":
      return "priest-blessing";
    case "class.kharakternyk":
      return "kharakternyk-omen";
    default:
      return null;
  }
}

function getRaceIntent(raceId: string | null | undefined): CombatIntentId | null {
  switch (raceId) {
    case "race.bisyny":
    case "race.intellectual-orc":
    case "race.domovyk":
    case "race.molfar-soul":
    case "race.dryland-rusalka":
    case "race.dwarf":
    case "race.elf":
    case "race.drantohor":
      return "race-flavor";
    default:
      return null;
  }
}

function getPressureTags(context: CombatFlavorContext): string[] {
  return [
    ...(isLowRatio(context.heroHpRatio) ? ["pressure:hero-low-hp"] : []),
    ...(isLowRatio(context.monsterHpRatio) ? ["pressure:copy-low-hp"] : []),
    ...(typeof context.turn === "number" ? [`turn:${Math.max(1, Math.floor(context.turn))}`] : [])
  ];
}

function isLowRatio(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 0.3;
}

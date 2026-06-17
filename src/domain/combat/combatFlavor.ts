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
  raceId?: string | null;
  title?: string | null;
  heroHpRatio?: number;
  monsterHpRatio?: number;
  turn?: number;
  action?: "attack" | "skill" | "flee";
}

export interface CombatFlavorLine {
  intentId: CombatIntentId;
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
    return {
      intentId: "mirror-mockery",
      tags,
      text: "Допельґанґер теж робить крок назад і занотовує: «тактичне віддзеркалення, дуже зручне слово»."
    };
  }

  const classLine = getClassFlavor(context.classId);

  if (classLine) {
    return {
      ...classLine,
      tags
    };
  }

  const raceLine = getRaceFlavor(context.raceId);

  if (raceLine) {
    return {
      ...raceLine,
      tags
    };
  }

  if (isLowRatio(context.monsterHpRatio)) {
    return {
      intentId: "low-hp-desperation",
      tags,
      text: "Копія тримається на впертості, дзеркальному принципі й одному дуже сумнівному вдиху."
    };
  }

  return {
    intentId: "mirror-mockery",
    tags,
    text: "Копія повторює ваші рухи з такою сумлінністю, що Корчмар уже шукає, кому виставити рахунок за авторство."
  };
}

function getClassFlavor(classId: string | null | undefined): Omit<CombatFlavorLine, "tags"> | null {
  switch (classId) {
    case "class.warrior":
      return {
        intentId: "warrior-pressure",
        text: "Допельґанґер повторює ваш бойовий аргумент, але ставить кому в болюче місце."
      };
    case "class.mage":
      return {
        intentId: "mage-spell",
        text: "Копія шепоче закляття, дуже схоже на ваше, але з гіршою дикцією."
      };
    case "class.varenyk-mancer":
      return {
        intentId: "varenyk-mancer-filling",
        text: "Допельґанґер викликає вареничний аргумент. Начинка на його боці, тимчасово."
      };
    case "class.bureaucramancer":
      return {
        intentId: "bureaucramancer-form",
        text: "Копія дістає форму 13-Б і просить ваш біль розписатися тут, тут і тут."
      };
    case "class.bard":
      return {
        intentId: "bard-verse",
        text: "Він бере ваш куплет і додає приспів, за який соромно обом."
      };
    case "class.rogue":
      return {
        intentId: "rogue-feint",
        text: "Допельґанґер зникає рівно настільки, щоб удар виглядав юридично несподіваним."
      };
    case "class.ranger":
      return {
        intentId: "ranger-shot",
        text: "Копія знаходить ваш слід там, де ви його ще не лишали."
      };
    case "class.priest":
      return {
        intentId: "priest-blessing",
        text: "Допельґанґер благословляє ситуацію. Ситуація не опирається."
      };
    case "class.kharakternyk":
      return {
        intentId: "kharakternyk-omen",
        text: "Копія підморгує прикметі. Прикмета підморгує у відповідь і бʼє вас по плану."
      };
    default:
      return null;
  }
}

function getRaceFlavor(raceId: string | null | undefined): Omit<CombatFlavorLine, "tags"> | null {
  switch (raceId) {
    case "race.bisyny":
      return {
        intentId: "race-flavor",
        text: "Копія дрібно редактує ваш задум, і тепер він бісить уже обидві сторони."
      };
    case "race.intellectual-orc":
      return {
        intentId: "race-flavor",
        text: "Допельґанґер підкріплює удар короткою тезою. Теза важча за вигляд."
      };
    case "race.domovyk":
      return {
        intentId: "race-flavor",
        text: "Копія бʼє з-за уявного порога, ніби це її хата і ваші правила тут зайві."
      };
    case "race.molfar-soul":
      return {
        intentId: "race-flavor",
        text: "Навколо копії збирається туман. Туман удає, що все це давно передбачав."
      };
    case "race.dryland-rusalka":
      return {
        intentId: "race-flavor",
        text: "Копія дивиться на чайник так переконливо, що пара стає бойовою позицією."
      };
    case "race.dwarf":
      return {
        intentId: "race-flavor",
        text: "Допельґанґер стоїть низько, вперто й так, ніби підлога винна йому вибачення."
      };
    case "race.elf":
      return {
        intentId: "race-flavor",
        text: "Копія атакує з ельфійською точністю і виразом обличчя, який уже подав скаргу на пил."
      };
    case "race.drantohor":
      return {
        intentId: "race-flavor",
        text: "Копія заходить із боку, який на мапі не позначили з міркувань безпеки."
      };
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

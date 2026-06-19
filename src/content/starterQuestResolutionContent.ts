import type { CharacterSummary } from "../domain/characters/characterSummary";
import type {
  QuestMethodDefinition,
  QuestResolutionScene
} from "./questResolution";
import {
  classTechniqueProfiles,
  getCompactClassKey,
  getCompactRaceKey,
  raceTechniqueProfiles,
  toQuestCallbackKey
} from "./questResolution";

export type StarterQuestSceneId = "shawarma" | "cellar-mouse";

export function buildStarterQuestResolutionScene(
  sceneId: StarterQuestSceneId,
  character: CharacterSummary
): QuestResolutionScene {
  return sceneId === "shawarma"
    ? buildShawarmaScene(character)
    : buildCellarMouseScene(character);
}

function buildShawarmaScene(character: CharacterSummary): QuestResolutionScene {
  const race = getRaceProfile(character.raceId);
  const heroClass = getClassProfile(character.classId);

  return {
    sceneId: "shawarma",
    sceneTitle: "Підозріла шаурма",
    sceneObject: "шаурму",
    methods: [
      method({
        id: "inspect-folds",
        source: "scene",
        label: "🔎 Перевірити, чому лаваш дихає не в ритм",
        hint: "Розслідування без поспіху.",
        primaryStat: "intelligence",
        secondaryStat: "luck",
        techniques: ["investigation"],
        rewardProfile: "modest",
        legacyAction: "receipt",
        itemIntent: "receipt",
        strong: "Лаваш сам розгорнув доказ раніше, ніж хтось сказав «вечеря».",
        success: "Вечеря дала свідчення й перестала прикидатися гарніром.",
        mixed: "Правда вийшла, соус записав героя свідком.",
        complication: "Шаурма образилась на допит і залишила дуже юридичний запах."
      }),
      method({
        id: `r${getCompactRaceKey(character.raceId)}`,
        source: "race",
        label: `🧬 ${adaptProfileLabel(race.methodPrefix, "шаурму", "шаурми")}`,
        buttonLabel: `🧬 ${adaptProfileLabel(race.shortButtonLabel ?? race.methodPrefix, "шаурму", "шаурми")}`,
        hint: "Особистий підхід героя.",
        primaryStat: race.primaryStat,
        secondaryStat: race.secondaryStat,
        techniques: race.techniques,
        rewardProfile: "standard",
        legacyAction: "receipt",
        itemIntent: "receipt",
        strong: "Особистий підхід розгорнув лаваш саме там, де ховалась правда.",
        success: "Шаурма не витримала біографічного тиску й видала доказ.",
        mixed: "Доказ є, але соус тепер має власну версію подій.",
        complication: "Підхід вийшов стильний, а лаваш лишив липкий коментар."
      }),
      method({
        id: `c${getCompactClassKey(character.classId)}`,
        source: "class",
        label: `🎭 ${adaptProfileLabel(heroClass.methodPrefix, "шаурму", "шаурми")}`,
        buttonLabel: `🎭 ${adaptProfileLabel(heroClass.shortButtonLabel ?? heroClass.methodPrefix, "шаурму", "шаурми")}`,
        hint: "Професійний підхід героя.",
        primaryStat: heroClass.primaryStat,
        secondaryStat: heroClass.secondaryStat,
        techniques: heroClass.techniques,
        rewardProfile: "standard",
        legacyAction: "poke",
        itemIntent: "wrapper",
        combatSkillId: heroClass.combatSkillId,
        strong: "Професійний підхід розкрив начинку так акуратно, що зуби самі вийшли в протокол.",
        success: "Професійний підхід дав результат. Шаурма видала доказ і вдала простий лаваш.",
        mixed: "Професійний підхід дав результат, але соус поставив зустрічне питання.",
        complication: "Шаурма не розкрилась повністю, зате стала підозріло чемною."
      }),
      method({
        id: `s${getCompactRaceKey(character.raceId)}${getCompactClassKey(character.classId)}`,
        source: "signature",
        label: `🏷️ «${character.title}»: викрити шаурму легендою`,
        buttonLabel: `🏷️ Викрити: «${character.title}»`,
        hint: "Непевніше, зате стильніше.",
        primaryStat: heroClass.primaryStat,
        secondaryStat: race.primaryStat,
        techniques: [firstTechnique(race), firstTechnique(heroClass)],
        rewardProfile: "generous",
        legacyAction: "flee",
        itemIntent: "none",
        combatSkillId: heroClass.combatSkillId,
        strong: `Підпис «${character.title}» витягнув з начинки правду раніше, ніж вона згадала про зуби.`,
        success: "Геройська легенда стала доказом. Шаурма визнала, що це не випадкова вечеря.",
        mixed: "Шаурма майже повірила, але соус лишив останню репліку собі.",
        complication: "Біографічний аргумент вийшов красивий, результат — трохи липкий."
      })
    ]
  };
}

function buildCellarMouseScene(character: CharacterSummary): QuestResolutionScene {
  const race = getRaceProfile(character.raceId);
  const heroClass = getClassProfile(character.classId);

  return {
    sceneId: "cellar-mouse",
    sceneTitle: "Льохова миша",
    sceneObject: "мишу",
    methods: [
      method({
        id: "cheese-trap",
        source: "scene",
        label: "🧀 Поставити пастку по маршруту крихт",
        hint: "Пастка й сліди. Винагорода звичайна.",
        primaryStat: "dexterity",
        secondaryStat: "intelligence",
        techniques: ["traps", "tracking"],
        rewardProfile: "standard",
        legacyAction: "cheese-trap",
        itemIntent: "cheese-trap",
        strong: "Миша підписала мир крихтою й лишила сир як доказ.",
        success: "Сирна політика стала передбачуваною до наступної мишачої паузи.",
        mixed: "Миша взяла сир, але забула забрати процедурний сумнів.",
        complication: "Пастка клацнула по власній гідності. Миша аплодувала з-за шафи."
      }),
      method({
        id: "bribe-cheese",
        source: "scene",
        label: "🪙 Дати миші 1 золоту «на сирний фонд»",
        hint: "Коштує 1 золото. Добрі шанси, винагорода скромніша.",
        primaryStat: "charisma",
        secondaryStat: "luck",
        techniques: ["bribery"],
        rewardProfile: "modest",
        goldCost: 1,
        legacyAction: "bribe-cheese",
        itemIntent: "negotiate",
        strong: "Сирний фонд раптом став мирним договором.",
        success: "Миша прийняла внесок і назвала це фінансовою дипломатією.",
        mixed: "Миша взяла золото, угоду й право бурчати в протокол.",
        complication: "Фонд спрацював, але миша скликала профспілку для урочистости."
      }),
      method({
        id: `r${getCompactRaceKey(character.raceId)}`,
        source: "race",
        label: `🧬 ${adaptProfileLabel(race.methodPrefix, "мишу", "миші")}`,
        buttonLabel: `🧬 ${adaptProfileLabel(race.shortButtonLabel ?? race.methodPrefix, "мишу", "миші")}`,
        hint: "Особистий підхід героя.",
        primaryStat: race.primaryStat,
        secondaryStat: race.secondaryStat,
        techniques: race.techniques,
        rewardProfile: "standard",
        legacyAction: "sweep-bravely",
        itemIntent: "sweep-bravely",
        strong: "Особистий підхід навів у льосі такий лад, що миша сама попросила графік.",
        success: "Особистий підхід дав результат. Льох визнав героя тимчасовою владою.",
        mixed: "Льох чистіший, угода — ні.",
        complication: "Миша не програла, а стратегічно перемістилась у чистіше місце."
      }),
      method({
        id: `c${getCompactClassKey(character.classId)}`,
        source: "class",
        label: `🎭 ${adaptProfileLabel(heroClass.methodPrefix, "мишу", "миші")}`,
        buttonLabel: `🎭 ${adaptProfileLabel(heroClass.shortButtonLabel ?? heroClass.methodPrefix, "мишу", "миші")}`,
        hint: "Професійний підхід героя.",
        primaryStat: heroClass.primaryStat,
        secondaryStat: heroClass.secondaryStat,
        techniques: heroClass.techniques,
        rewardProfile: "standard",
        legacyAction: "negotiate",
        itemIntent: "negotiate",
        combatSkillId: heroClass.combatSkillId,
        strong: "Професійний підхід перетворив писк на переговорну позицію.",
        success: "Миша погодилась: такий фаховий аргумент краще не гризти.",
        mixed: "Аргумент спрацював, але миша лишила собі право драматично пищати.",
        complication: "Фаховий підхід зачепив полицю, і полиця тепер теж хоче слово."
      }),
      method({
        id: `s${getCompactRaceKey(character.raceId)}${getCompactClassKey(character.classId)}`,
        source: "signature",
        label: `🏷️ «${character.title}»: вирішити сирну політику`,
        buttonLabel: `🏷️ Сирна політика: «${character.title}»`,
        hint: "Непевніше, зате стильніше.",
        primaryStat: heroClass.primaryStat,
        secondaryStat: race.primaryStat,
        techniques: [firstTechnique(race), firstTechnique(heroClass)],
        rewardProfile: "generous",
        legacyAction: "negotiate",
        itemIntent: "negotiate",
        combatSkillId: heroClass.combatSkillId,
        strong: `Підпис «${character.title}» перетворив льох на малу мирну конференцію.`,
        success: "Геройська легенда стала аргументом. Миша погодилась не гризти квестові дошки.",
        mixed: "Угода чинна, але кожна крихта має окрему думку.",
        complication: "Титул вразив мишу. Миша вразила титул зустрічним пунктом."
      })
    ]
  };
}

function method(input: {
  id: string;
  source: QuestMethodDefinition["source"];
  label: string;
  buttonLabel?: string | undefined;
  hint: string;
  primaryStat: QuestMethodDefinition["primaryStat"];
  secondaryStat?: QuestMethodDefinition["secondaryStat"] | undefined;
  techniques: readonly QuestMethodDefinition["techniques"][number][];
  rewardProfile: QuestMethodDefinition["rewardProfile"];
  goldCost?: number | undefined;
  legacyAction: string;
  itemIntent: string;
  combatSkillId?: string | undefined;
  strong: string;
  success: string;
  mixed: string;
  complication: string;
}): QuestMethodDefinition {
  return {
    id: input.id,
    callbackKey: toQuestCallbackKey(input.id),
    source: input.source,
    label: input.label,
    ...(input.buttonLabel ? { buttonLabel: input.buttonLabel } : {}),
    hint: input.hint,
    intent: input.goldCost ? "bribe" : input.source === "signature" ? "deceive" : "investigate",
    techniques: input.techniques,
    primaryStat: input.primaryStat,
    ...(input.secondaryStat ? { secondaryStat: input.secondaryStat } : {}),
    baseChance: input.goldCost ? 76 : input.source === "scene" ? 68 : 63,
    rewardProfile: input.rewardProfile,
    ...(input.goldCost ? { goldCost: input.goldCost } : {}),
    ...(input.combatSkillId ? { combatSkillId: input.combatSkillId } : {}),
    legacyAction: input.legacyAction,
    itemIntent: input.itemIntent,
    consequenceByGrade: {
      "strong-success": "full-reward",
      success: "full-reward",
      "mixed-success": input.goldCost ? "gold-cost-success" : "reduced-reward",
      complication: input.goldCost ? "gold-cost-success" : "cosmetic-mess"
    },
    outcomeText: {
      "strong-success": text("✨ Справу закрито блискуче", input.strong),
      success: text("✅ Справу закрито", input.success),
      "mixed-success": text("🟡 Справу закрито з хвостиком", input.mixed),
      complication: text("⚠️ Метод лишив кумедний безлад", input.complication)
    }
  };
}

function adaptProfileLabel(prefix: string, object: string, objectGenitive: string): string {
  return prefix
    .replace(/справу/gu, object)
    .replace(/справи/gu, objectGenitive)
    .replace(/проблему/gu, object)
    .replace(/проблеми/gu, objectGenitive)
    .replace(/аргумент/gu, object)
    .replace(/автора/gu, objectGenitive);
}

function text(
  headline: string,
  body: string
): {
  headline: string;
  body: readonly string[];
} {
  return {
    headline,
    body: [body]
  };
}

type QuestTechniqueProfileLike = typeof raceTechniqueProfiles[string];

function getRaceProfile(raceId: string): QuestTechniqueProfileLike {
  return raceTechniqueProfiles[raceId] ?? raceTechniqueProfiles["race.human-ish"]!;
}

function getClassProfile(classId: string): QuestTechniqueProfileLike {
  return classTechniqueProfiles[classId] ?? classTechniqueProfiles["class.warrior"]!;
}

function firstTechnique(profile: QuestTechniqueProfileLike): QuestMethodDefinition["techniques"][number] {
  return profile.techniques[0] ?? "investigation";
}

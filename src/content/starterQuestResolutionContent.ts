import type { CharacterSummary } from "../domain/characters/characterSummary";
import type {
  QuestConsequenceKind,
  QuestIntent,
  QuestMethodDefinition,
  QuestResolutionScene,
  QuestTechniqueProfile
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
  const sceneMethods = [
    method({
      id: "inspect-folds",
      source: "scene",
      label: "🔎 Перевірити, чому лаваш дихає не в ритм",
      hint: "Розслідування без поспіху.",
      intent: "investigate",
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
      id: "pin-wrapper",
      source: "scene",
      label: "🍴 Притиснути лаваш виделкою до зʼясування",
      hint: "Сміливо й трохи липко.",
      intent: "fight",
      primaryStat: "strength",
      secondaryStat: "dexterity",
      techniques: ["force"],
      rewardProfile: "standard",
      legacyAction: "poke",
      itemIntent: "wrapper",
      strong: "Виделка втримала лаваш, а лаваш не втримав алібі.",
      success: "Підозра перестала ворушитись і лишила обгортку як речовий доказ.",
      mixed: "Лаваш притиснуто, але соус тепер має процесуальні претензії.",
      complication: "Шаурма прикинулась слухняною, щоб зручніше лишити липкий коментар."
    }),
    method({
      id: "name-retreat",
      source: "scene",
      label: "🗝️ Відступити так, щоб назва сама себе видала",
      hint: "Обережний трюк без зайвої героїки.",
      intent: "deceive",
      primaryStat: "dexterity",
      secondaryStat: "charisma",
      techniques: ["deception"],
      rewardProfile: "modest",
      legacyAction: "flee",
      itemIntent: "none",
      strong: "Шаурма потягнулася за перемогою і випадково показала зуби.",
      success: "Відступ спрацював: вечеря сама сказала зайве.",
      mixed: "Доказ є, але герой ще довго пахне тактичним соусом.",
      complication: "Шаурма повірила у свою перемогу й лишила сцену дуже самовдоволеною."
    })
  ];

  return {
    sceneId: "shawarma",
    sceneTitle: "Підозріла шаурма",
    sceneObject: "шаурму",
    methods: [...sceneMethods, ...buildPersonalMethods(character, "Підозріла шаурма", sceneMethods)]
  };
}

function buildCellarMouseScene(character: CharacterSummary): QuestResolutionScene {
  const sceneMethods = [
    method({
      id: "cheese-trap",
      source: "scene",
      label: "🧀 Поставити пастку по маршруту крихт",
      hint: "Пастка й сліди. Винагорода звичайна.",
      intent: "craft",
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
      id: "sweep-evidence",
      source: "scene",
      label: "🧹 Вимести пил так, щоб лишився тільки слід",
      hint: "Домашній лад і трохи дедукції.",
      intent: "investigate",
      primaryStat: "strength",
      secondaryStat: "intelligence",
      techniques: ["domesticity", "investigation"],
      rewardProfile: "modest",
      legacyAction: "sweep-bravely",
      itemIntent: "sweep-bravely",
      strong: "Пил відступив, слід лишився, миша визнала це майже чесною владою.",
      success: "Льох став чистіший, а миша менш упевнена у власній таємності.",
      mixed: "Льох чистіший, угода — ні.",
      complication: "Миша не програла, а стратегічно перемістилась у чистіше місце."
    }),
    method({
      id: "negotiate-shelf",
      source: "scene",
      label: "🤝 Поділити льох до наступної ревізії",
      hint: "Переговори без пастки.",
      intent: "negotiate",
      primaryStat: "charisma",
      secondaryStat: "intelligence",
      techniques: ["persuasion"],
      rewardProfile: "standard",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Миша прийняла полицю, умови й серветку як дипломатичний прапор.",
      success: "Миша погодилась: таку угоду краще не гризти.",
      mixed: "Угода чинна, але кожна крихта має окрему думку.",
      complication: "Миша лишила собі право драматично пищати під час виконання."
    }),
    method({
      id: "bribe-cheese",
      source: "scene",
      label: "🪙 Дати миші 1 золоту «на сирний фонд»",
      hint: "Коштує 1 золото. Добрі шанси, винагорода скромніша.",
      intent: "bribe",
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
      id: "fake-cat-notice",
      source: "scene",
      label: "🐾 Підкинути оголошення про перевірку котом",
      hint: "Непевний обман із гучним папірцем.",
      intent: "deceive",
      primaryStat: "dexterity",
      secondaryStat: "charisma",
      techniques: ["deception"],
      rewardProfile: "standard",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Оголошення спрацювало ще до слова «кіт». Миша стала дипломаткою.",
      success: "Миша повірила паперу рівно настільки, щоб вийти на переговори.",
      mixed: "Оголошення прийняли, але полиця тепер вимагає печатку кота.",
      complication: "Миша знайшла дрібний шрифт і попросила компенсацію сиром."
    })
  ];

  return {
    sceneId: "cellar-mouse",
    sceneTitle: "Льохова миша",
    sceneObject: "мишу",
    methods: [...sceneMethods, ...buildPersonalMethods(character, "Льохова миша", sceneMethods)]
  };
}

function method(input: {
  id: string;
  source: QuestMethodDefinition["source"];
  label: string;
  buttonLabel?: string | undefined;
  hint: string;
  intent: QuestIntent;
  primaryStat: QuestMethodDefinition["primaryStat"];
  secondaryStat?: QuestMethodDefinition["secondaryStat"] | undefined;
  techniques: readonly QuestMethodDefinition["techniques"][number][];
  rewardProfile: QuestMethodDefinition["rewardProfile"];
  goldCost?: number | undefined;
  consequence?: QuestConsequenceKind | undefined;
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
    intent: input.intent,
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
      complication: input.consequence ?? (input.goldCost ? "gold-cost-success" : "cosmetic-mess")
    },
    outcomeText: {
      "strong-success": text("✨ Справу закрито блискуче", input.strong),
      success: text("✅ Справу закрито", input.success),
      "mixed-success": text("🟡 Справу закрито з хвостиком", input.mixed),
      complication: text("⚠️ Метод лишив кумедний безлад", input.complication)
    }
  };
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

function buildPersonalMethods(
  character: CharacterSummary,
  sceneTitle: string,
  sceneMethods: readonly QuestMethodDefinition[]
): QuestMethodDefinition[] {
  const race = getRaceProfile(character.raceId);
  const heroClass = getClassProfile(character.classId);
  const title = character.title ? `«${character.title}»` : "геройський підпис";

  return sceneMethods.flatMap((base) => [
    method({
      id: compactPersonalMethodId("r", getCompactRaceKey(character.raceId), base.id),
      source: "race",
      label: `${profileIcon(character.raceId)} ${raceStarterLabel(character.raceId, base)}`,
      buttonLabel: `${profileIcon(character.raceId)} ${raceStarterButton(character.raceId, base)}`,
      hint: "Особистий підхід героя.",
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: race.primaryStat,
      techniques: uniqueTechniques([firstTechnique(race), ...base.techniques]),
      rewardProfile: "standard",
      goldCost: base.goldCost,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      strong: `${race.label} знаходить власний хід у «${stripIcon(base.label)}». ${sceneTitle} коротко припиняє сперечатись.`,
      success: `${race.label} спрацювала. «${stripIcon(base.label)}» лишається зрозумілим, а сцена — вирішеною.`,
      mixed: `Особистий хід спрацював, але «${stripIcon(base.label)}» лишив дрібний хвіст для бурчання.`,
      complication: `${race.label} дала результат із кумедним безладом. Корчмар записує це як стиль.`
    }),
    method({
      id: compactPersonalMethodId("c", getCompactClassKey(character.classId), base.id),
      source: "class",
      label: `${classIcon(character.classId)} ${classStarterLabel(character.classId, base)}`,
      buttonLabel: `${classIcon(character.classId)} ${classStarterButton(character.classId, base)}`,
      hint: "Професійний підхід героя.",
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: heroClass.primaryStat,
      techniques: uniqueTechniques([firstTechnique(heroClass), ...base.techniques]),
      rewardProfile: "standard",
      goldCost: base.goldCost,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      combatSkillId: heroClass.combatSkillId,
      strong: `${heroClass.label} підсилює «${stripIcon(base.label)}» так чисто, що сцена здається майже навчальною.`,
      success: `${heroClass.label} дає результат. «${stripIcon(base.label)}» стає не подвигом, а робочим методом.`,
      mixed: `Професійний хід спрацював, але «${stripIcon(base.label)}» залишив трохи сценічного пилу.`,
      complication: `${heroClass.label} зачепила зайву полицю реальности. Результат є, порядок ще сперечається.`
    }),
    method({
      id: compactPersonalMethodId(`s${getCompactRaceKey(character.raceId)}`, getCompactClassKey(character.classId), base.id),
      source: "signature",
      label: `🏷️ ${title} поєднує ${race.label} і ${heroClass.label} для «${stripIcon(base.label)}»`,
      buttonLabel: `🏷️ ${title}`,
      hint: "Непевніше, зате стильніше.",
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: heroClass.primaryStat,
      techniques: uniqueTechniques([firstTechnique(race), firstTechnique(heroClass), ...base.techniques]),
      rewardProfile: "generous",
      goldCost: base.goldCost,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      combatSkillId: heroClass.combatSkillId,
      strong: `${title} зводить ${race.label} і ${heroClass.label} в один точний рух. Сцена визнає, що це вже біографія.`,
      success: `${title} спрацьовує: ${race.label} знаходить край, ${heroClass.label} ставить крапку.`,
      mixed: `${title} допомагає, але «${stripIcon(base.label)}» лишає маленький шурхіт для пізнішої легенди.`,
      complication: `${title} виглядає переконливо. Сцена теж так думає, але додає власний безлад.`
    })
  ]);
}

function getRaceProfile(raceId: string): QuestTechniqueProfile {
  return raceTechniqueProfiles[raceId] ?? raceTechniqueProfiles["race.human-ish"]!;
}

function getClassProfile(classId: string): QuestTechniqueProfile {
  return classTechniqueProfiles[classId] ?? classTechniqueProfiles["class.warrior"]!;
}

function firstTechnique(profile: QuestTechniqueProfile): QuestMethodDefinition["techniques"][number] {
  return profile.techniques[0] ?? "investigation";
}

function compactPersonalMethodId(prefix: string, profileKey: string, baseId: string): string {
  return `${prefix}${profileKey}${toQuestCallbackKey(baseId).slice(1)}`;
}

function uniqueTechniques(techniques: readonly QuestMethodDefinition["techniques"][number][]): QuestMethodDefinition["techniques"][number][] {
  return [...new Set(techniques)];
}

function stripIcon(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function raceStarterLabel(raceId: string, base: QuestMethodDefinition): string {
  const action = stripIcon(base.label);
  const labels: Record<string, string> = {
    "race.human-ish": `Звірити практикою «${action}»`,
    "race.dwarf": `Простукати основу «${action}»`,
    "race.elf": `Виправити форму «${action}»`,
    "race.bisyny": `Оскаржити назву «${action}»`,
    "race.drantohor": `Знайти хибну карту до «${action}»`,
    "race.domovyk": `Оголосити хатнім правилом «${action}»`,
    "race.dryland-rusalka": `Підняти сухий приплив для «${action}»`,
    "race.intellectual-orc": `Провести рецензію на «${action}»`,
    "race.molfar-soul": `Поставити оберіг біля «${action}»`
  };

  return labels[raceId] ?? action;
}

function raceStarterButton(raceId: string, base: QuestMethodDefinition): string {
  const action = stripIcon(base.label);
  const labels: Record<string, string> = {
    "race.human-ish": `Звірити «${action}»`,
    "race.dwarf": `Простукати «${action}»`,
    "race.elf": `Виправити «${action}»`,
    "race.bisyny": `Оскаржити «${action}»`,
    "race.drantohor": "Знайти карту",
    "race.domovyk": "Оголосити правилом",
    "race.dryland-rusalka": "Підняти сухий приплив",
    "race.intellectual-orc": "Провести рецензію",
    "race.molfar-soul": "Поставити оберіг"
  };

  return labels[raceId] ?? action;
}

function classStarterLabel(classId: string, base: QuestMethodDefinition): string {
  const action = stripIcon(base.label);
  const labels: Record<string, string> = {
    "class.warrior": `Притиснути до чесности «${action}»`,
    "class.mage": `Розігріти прихований шар «${action}»`,
    "class.bard": `Переспівати ритм «${action}»`,
    "class.rogue": `Витягти доказ із «${action}»`,
    "class.priest": `Благословити умови «${action}»`,
    "class.varenyk-mancer": `Запечатати начинкою «${action}»`,
    "class.bureaucramancer": `Оформити акт на «${action}»`,
    "class.ranger": `Прочитати слід у «${action}»`,
    "class.kharakternyk": `Подивитися боком на «${action}»`
  };

  return labels[classId] ?? action;
}

function classStarterButton(classId: string, base: QuestMethodDefinition): string {
  const action = stripIcon(base.label);
  const labels: Record<string, string> = {
    "class.warrior": `Притиснути «${action}»`,
    "class.mage": "Розігріти шар",
    "class.bard": "Переспівати хід",
    "class.rogue": "Витягти доказ",
    "class.priest": "Благословити умови",
    "class.varenyk-mancer": "Запечатати начинкою",
    "class.bureaucramancer": "Оформити акт",
    "class.ranger": "Прочитати слід",
    "class.kharakternyk": "Подивитися боком"
  };

  return labels[classId] ?? action;
}

function profileIcon(id: string): string {
  if (id === "race.domovyk") return "🏠";
  if (id === "race.dryland-rusalka") return "🫖";
  if (id === "race.intellectual-orc") return "📚";
  if (id === "race.molfar-soul") return "🧿";
  if (id === "race.dwarf") return "⛏️";
  if (id === "race.elf") return "🪡";
  if (id === "race.bisyny") return "✍️";
  if (id === "race.drantohor") return "🗺️";
  return "🧬";
}

function classIcon(id: string): string {
  if (id === "class.warrior") return "🛡️";
  if (id === "class.mage") return "🔥";
  if (id === "class.bard") return "🎭";
  if (id === "class.rogue") return "🗝️";
  if (id === "class.priest") return "🕯️";
  if (id === "class.varenyk-mancer") return "🥟";
  if (id === "class.bureaucramancer") return "📋";
  if (id === "class.ranger") return "🏹";
  return "🌾";
}

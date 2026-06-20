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
      consequence: "minor-injury",
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
      consequence: "minor-injury",
      legacyAction: "poke",
      itemIntent: "wrapper",
      strong: "Виделка втримала лаваш, а лаваш не втримав алібі.",
      success: "Підозра перестала ворушитись і лишила обгортку як речовий доказ.",
      mixed: "Лаваш притиснуто, але соус тепер має процесуальні претензії.",
      complication: "Шаурма прикинулась слухняною, щоб зручніше лишити липкий коментар."
    }),
    method({
      id: "demand-receipt",
      source: "scene",
      label: "📋 Вимагати чек і походження начинки",
      hint: "Папери, походження й дуже ранній аудит.",
      intent: "ritual",
      primaryStat: "intelligence",
      secondaryStat: "charisma",
      techniques: ["authority", "investigation"],
      rewardProfile: "standard",
      legacyAction: "receipt",
      itemIntent: "receipt",
      strong: "Чек сам викрив зуби дрібним шрифтом.",
      success: "Походження начинки стало зрозумілим, хоча начинка просила адвоката.",
      mixed: "Чек знайшовся, але вписав героя як свідка вечері.",
      complication: "Шаурма принесла чек на імʼя іншої вечері й зробила вигляд, що так і треба."
    }),
    method({
      id: "offer-garlic",
      source: "scene",
      label: "🧄 Запропонувати зубчик часнику як примирення",
      hint: "Мирна приманка без великої героїки.",
      intent: "negotiate",
      primaryStat: "charisma",
      secondaryStat: "luck",
      techniques: ["persuasion", "improvisation"],
      rewardProfile: "modest",
      legacyAction: "flee",
      itemIntent: "none",
      strong: "Часник спрацював як дипломат, хоч ніхто не давав йому мандат.",
      success: "Шаурма відволіклась на запах і видала важливий хрускіт.",
      mixed: "Примирення майже вдалось, але соус попросив окремий договір.",
      complication: "Часник виявився її адвокатом і почав пахнути процедурою."
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
      consequence: "minor-injury",
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
      consequence: "minor-injury",
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
  affordanceId?: string | undefined;
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
    affordanceId: input.affordanceId ?? input.id,
    source: input.source,
    label: input.label,
    ...(input.buttonLabel ? { buttonLabel: input.buttonLabel } : {}),
    hint: withRiskHint(input.hint, input.consequence ?? (input.goldCost ? "gold-cost-success" : "cosmetic-mess")),
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

  return sceneMethods.flatMap((base) => [
    method({
      id: compactPersonalMethodId("r", getCompactRaceKey(character.raceId), base.id),
      affordanceId: base.affordanceId,
      source: "race",
      label: base.label,
      buttonLabel: base.label,
      hint: buildPersonalHint(base, "race"),
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: race.primaryStat,
      techniques: uniqueTechniques([firstTechnique(race), ...base.techniques]),
      rewardProfile: "standard",
      goldCost: base.goldCost,
      consequence: base.consequenceByGrade.complication,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      strong: appendIdentityBeat(base, "strong-success", race, "race"),
      success: appendIdentityBeat(base, "success", race, "race"),
      mixed: appendIdentityBeat(base, "mixed-success", race, "race"),
      complication: appendIdentityBeat(base, "complication", race, "race")
    }),
    method({
      id: compactPersonalMethodId("c", getCompactClassKey(character.classId), base.id),
      affordanceId: base.affordanceId,
      source: "class",
      label: base.label,
      buttonLabel: base.label,
      hint: buildPersonalHint(base, "class"),
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: heroClass.primaryStat,
      techniques: uniqueTechniques([firstTechnique(heroClass), ...base.techniques]),
      rewardProfile: "standard",
      goldCost: base.goldCost,
      consequence: base.consequenceByGrade.complication,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      combatSkillId: heroClass.combatSkillId,
      strong: appendIdentityBeat(base, "strong-success", heroClass, "class"),
      success: appendIdentityBeat(base, "success", heroClass, "class"),
      mixed: appendIdentityBeat(base, "mixed-success", heroClass, "class"),
      complication: appendIdentityBeat(base, "complication", heroClass, "class")
    }),
    method({
      id: compactPersonalMethodId(`s${getCompactRaceKey(character.raceId)}`, getCompactClassKey(character.classId), base.id),
      affordanceId: base.affordanceId,
      source: "signature",
      label: base.label,
      buttonLabel: base.label,
      hint: buildPersonalHint(base, "signature"),
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: heroClass.primaryStat,
      techniques: uniqueTechniques([firstTechnique(race), firstTechnique(heroClass), ...base.techniques]),
      rewardProfile: "generous",
      goldCost: base.goldCost,
      consequence: base.consequenceByGrade.complication,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      combatSkillId: heroClass.combatSkillId,
      strong: appendSignatureBeat(base, "strong-success", race, heroClass, character.title ?? null),
      success: appendSignatureBeat(base, "success", race, heroClass, character.title ?? null),
      mixed: appendSignatureBeat(base, "mixed-success", race, heroClass, character.title ?? null),
      complication: appendSignatureBeat(base, "complication", race, heroClass, character.title ?? null)
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

function buildPersonalHint(
  base: QuestMethodDefinition,
  source: "race" | "class" | "signature"
): string {
  const prefix =
    source === "signature"
      ? "Особистий ризикований варіант."
      : source === "class"
        ? "Професійний варіант."
        : "Особистий варіант.";

  return withRiskHint(`${prefix} ${base.hint}`, base.consequenceByGrade.complication);
}

function appendIdentityBeat(
  base: QuestMethodDefinition,
  grade: keyof QuestMethodDefinition["outcomeText"],
  profile: QuestTechniqueProfile,
  source: "race" | "class"
): string {
  const core = base.outcomeText[grade].body.join(" ");
  const motif = techniqueMotif(firstTechnique(profile));
  const owner = capitalizeFirst(source === "race" ? profile.label : profile.label.toLowerCase());

  return `${core} ${owner} додає ${motif}, тож дія лишається конкретною й зрозумілою.`;
}

function appendSignatureBeat(
  base: QuestMethodDefinition,
  grade: keyof QuestMethodDefinition["outcomeText"],
  race: QuestTechniqueProfile,
  heroClass: QuestTechniqueProfile,
  title: string | null
): string {
  const core = base.outcomeText[grade].body.join(" ");
  const titleBeat = title ? ` Титул «${title}» киває як свідок.` : "";

  return `${core} ${capitalizeFirst(techniqueMotif(firstTechnique(race)))} зустрічає ${techniqueMotif(firstTechnique(heroClass))}.${titleBeat}`;
}

function withRiskHint(hint: string, consequence: QuestConsequenceKind): string {
  if (consequence === "minor-injury" || consequence === "serious-injury") {
    return /постраждати|небезпеч|пальц|забит|синц|обпект|впасти|травм/i.test(hint)
      ? hint
      : `${hint} Можна постраждати.`;
  }

  if (consequence === "fight-handoff") {
    return /бійк|бій|істот|мешканц|поклик|виліз|варта/i.test(hint)
      ? hint
      : `${hint} Ризик бійки.`;
  }

  return hint;
}

function techniqueMotif(technique: QuestMethodDefinition["techniques"][number]): string {
  const motifs: Partial<Record<QuestMethodDefinition["techniques"][number], string>> = {
    authority: "печатку й право голосу",
    bribery: "малий сирний фонд",
    craft: "ремесло з гострим краєм",
    deception: "хитрий обхід кута",
    domesticity: "хатню юрисдикцію",
    force: "вагу прямого аргументу",
    improvisation: "корисний збіг",
    investigation: "уважну ревізію причини",
    performance: "ритм і паузу",
    persuasion: "угоду без зайвої слави",
    ritual: "обрядову впертість",
    tracking: "слід там, де його соромились",
    traps: "пастку з чесним виглядом",
    arcana: "тихий магічний шов",
    finesse: "точний рух без фанфар"
  };

  return motifs[technique] ?? "практичний нахил";
}

function capitalizeFirst(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

function compactPersonalMethodId(prefix: string, profileKey: string, baseId: string): string {
  return `${prefix}${profileKey}${toQuestCallbackKey(baseId).slice(1)}`;
}

function uniqueTechniques(techniques: readonly QuestMethodDefinition["techniques"][number][]): QuestMethodDefinition["techniques"][number][] {
  return [...new Set(techniques)];
}

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
    legacyActionAliases: {
      receipt: "demand-receipt",
      poke: "pin-wrapper",
      flee: "name-retreat"
    },
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
    }),
    method({
      id: "write-mouse-minutes",
      source: "scene",
      label: "📝 Записати мишачий протокол",
      hint: "Спокійна канцелярська розмова без погроз і великих сирних обіцянок.",
      intent: "investigate",
      primaryStat: "intelligence",
      secondaryStat: "charisma",
      techniques: ["investigation", "authority"],
      rewardProfile: "modest",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Протокол вийшов такий чемний, що миша сама додала пункт «не пищати після десятої».",
      success: "Ви записали домовленість на серветці. Миша підписала хвостиком і вимагала копію для полиці.",
      mixed: "Протокол працює, але миша внесла примітку: «сирні питання розглядати окремо».",
      complication: "Серветка стала надто офіційною. Миша попросила перерву на дрібний канцелярський писк."
    }),
    method({
      id: "offer-thimble-office",
      source: "scene",
      label: "🪣 Видати наперсток-кабінет",
      hint: "Домашня дипломатія: дати миші посаду, яка не займає весь льох.",
      intent: "negotiate",
      primaryStat: "charisma",
      secondaryStat: "luck",
      techniques: ["persuasion", "domesticity"],
      rewardProfile: "modest",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Наперсток став кабінетом із приймальнею на одну крихту. Миша переїхала урочисто й тихо.",
      success: "Миша прийняла кабінет і пообіцяла вести прийом тільки за попереднім писком.",
      mixed: "Кабінет спрацював, але миша попросила табличку «не турбувати, думаю про сир».",
      complication: "Наперсток виявився занадто представницьким. Миша скликала екскурсію для пилу."
    }),
    method({
      id: "audit-crumb-border",
      source: "scene",
      label: "🔎 Перевірити крихтовий кордон",
      hint: "Обережна ревізія слідів, де кожна крихта вдає прикордонний стовпчик.",
      intent: "investigate",
      primaryStat: "dexterity",
      secondaryStat: "intelligence",
      techniques: ["investigation", "finesse"],
      rewardProfile: "standard",
      legacyAction: "sweep-bravely",
      itemIntent: "sweep-bravely",
      strong: "Крихтовий кордон став коротшим на цілу імперію. Миша визнала, що межа була емоційна.",
      success: "Ви прибрали зайві крихти й лишили одну службову. Миша назвала це компромісом.",
      mixed: "Кордон посунувся, але одна крихта просить статус спостерігача.",
      complication: "Крихти розсипались у нову карту. Миша заявила, що це вже геополітика."
    }),
    method({
      id: "borrow-shadow",
      source: "scene",
      label: "🌘 Позичити миші тінь",
      hint: "Непевна хитрість для тих, хто готовий пояснювати, чия це тінь.",
      intent: "deceive",
      primaryStat: "luck",
      secondaryStat: "dexterity",
      techniques: ["deception", "sneak"],
      rewardProfile: "standard",
      consequence: "minor-injury",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Тінь лягла так переконливо, що миша відчула себе зайнятою особою й пішла вести справи.",
      success: "Миша прийняла тінь за поважний аргумент і тимчасово вийшла з-під полиці.",
      mixed: "Тінь допомогла, але тепер полиця питає, хто взяв її вечірній силует.",
      complication: "Тінь сплуталась під ногами. Миша чемно попросила не жонглювати темрявою в тісному льосі."
    }),
    method({
      id: "sing-cheese-anthem",
      source: "scene",
      label: "🎵 Заспівати сирний гімн",
      hint: "Непевний виступ: більше серця, ніж гарантій тиші.",
      intent: "negotiate",
      primaryStat: "charisma",
      secondaryStat: "luck",
      techniques: ["performance", "persuasion"],
      rewardProfile: "standard",
      consequence: "minor-injury",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Гімн вийшов коротким і величним. Миша підвелась на задні лапки й одразу погодилась на порядок.",
      success: "Сирний мотив зняв напругу. Миша попросила приспів не повторювати після півночі.",
      mixed: "Пісня спрацювала, але одна пляшка у льосі тепер підспівує неправильну ноту.",
      complication: "Гімн затягнувся. Миша видала вам ритмічне зауваження просто по гордості."
    }),
    method({
      id: "appoint-shelf-mayor",
      source: "scene",
      label: "🏛️ Призначити мера полиці",
      hint: "Офіційний спосіб перекласти дрібну кризу на ще дрібнішу посаду.",
      intent: "negotiate",
      primaryStat: "charisma",
      secondaryStat: "intelligence",
      techniques: ["authority", "persuasion"],
      rewardProfile: "modest",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Миша стала мером полиці й одразу заборонила безлад без попереднього порядку денного.",
      success: "Посада спрацювала. Миша тепер свариться з пилом офіційно й не займає весь льох.",
      mixed: "Мерство прийнято, але миша просить маленьку печатку з великою самоповагою.",
      complication: "Перший указ мера звучав як писк. Полиця не заперечила, але попросила переклад."
    }),
    method({
      id: "file-napkin-treaty",
      source: "scene",
      label: "🧾 Підшити серветкову угоду",
      hint: "Мирна паперова угода, яка тримається на складках і взаємній втомі.",
      intent: "craft",
      primaryStat: "intelligence",
      secondaryStat: "dexterity",
      techniques: ["craft", "domesticity"],
      rewardProfile: "modest",
      legacyAction: "negotiate",
      itemIntent: "negotiate",
      strong: "Серветкова угода лягла рівно. Миша визнала її мʼякою, але юридично пухнастою.",
      success: "Угоду підшито до полички уявного архіву. Миша пообіцяла не гризти її без засідання.",
      mixed: "Складки тримають мир, хоча один край просить додаткову крихту як гарантію.",
      complication: "Серветка розклалась не тим боком. Миша заявила, що це додаток, і почала його тлумачити."
    })
  ];

  return {
    sceneId: "cellar-mouse",
    sceneTitle: "Льохова миша",
    sceneObject: "мишу",
    legacyActionAliases: {
      "cheese-trap": "cheese-trap",
      "sweep-bravely": "sweep-evidence",
      negotiate: "negotiate-shelf",
      "bribe-cheese": "bribe-cheese"
    },
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
      affordanceId: `${base.affordanceId}:race:${getCompactRaceKey(character.raceId)}:${base.id}`,
      source: "race",
      label: buildPersonalMethodLabel(base.label),
      buttonLabel: buildPersonalMethodLabel(base.label),
      hint: buildPersonalHint(base),
      intent: base.intent,
      primaryStat: base.primaryStat,
      secondaryStat: race.primaryStat,
      techniques: uniqueTechniques([firstTechnique(race), ...base.techniques]),
      rewardProfile: "standard",
      goldCost: base.goldCost,
      consequence: base.consequenceByGrade.complication,
      legacyAction: base.legacyAction ?? base.id,
      itemIntent: base.itemIntent ?? base.legacyAction ?? base.id,
      strong: appendIdentityBeat(base, "strong-success", race),
      success: appendIdentityBeat(base, "success", race),
      mixed: appendIdentityBeat(base, "mixed-success", race),
      complication: appendIdentityBeat(base, "complication", race)
    }),
    method({
      id: compactPersonalMethodId("c", getCompactClassKey(character.classId), base.id),
      affordanceId: `${base.affordanceId}:class:${getCompactClassKey(character.classId)}:${base.id}`,
      source: "class",
      label: buildPersonalMethodLabel(base.label),
      buttonLabel: buildPersonalMethodLabel(base.label),
      hint: buildPersonalHint(base),
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
      strong: appendIdentityBeat(base, "strong-success", heroClass),
      success: appendIdentityBeat(base, "success", heroClass),
      mixed: appendIdentityBeat(base, "mixed-success", heroClass),
      complication: appendIdentityBeat(base, "complication", heroClass)
    }),
    method({
      id: compactPersonalMethodId(`s${getCompactRaceKey(character.raceId)}`, getCompactClassKey(character.classId), base.id),
      affordanceId: `${base.affordanceId}:signature:${getCompactRaceKey(character.raceId)}:${getCompactClassKey(character.classId)}:${base.id}`,
      source: "signature",
      label: buildSignatureMethodLabel(base.label),
      buttonLabel: buildSignatureMethodLabel(base.label),
      hint: buildPersonalHint(base),
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

function buildPersonalMethodLabel(label: string): string {
  return label;
}

function buildSignatureMethodLabel(label: string): string {
  return label;
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

function buildPersonalHint(base: QuestMethodDefinition): string {
  return withRiskHint(base.hint, base.consequenceByGrade.complication);
}

function appendIdentityBeat(
  base: QuestMethodDefinition,
  grade: keyof QuestMethodDefinition["outcomeText"],
  profile: QuestTechniqueProfile
): string {
  const core = base.outcomeText[grade].body.join(" ");
  const beat = techniqueIdentityBeat(firstTechnique(profile));

  return `${core} ${beat[grade]}`;
}

function appendSignatureBeat(
  base: QuestMethodDefinition,
  grade: keyof QuestMethodDefinition["outcomeText"],
  race: QuestTechniqueProfile,
  heroClass: QuestTechniqueProfile,
  title: string | null
): string {
  const core = base.outcomeText[grade].body.join(" ");
  const raceTechnique = firstTechnique(race);
  const classTechnique = firstTechnique(heroClass);
  const raceBeat = techniqueIdentityBeat(raceTechnique);
  const classBeat = classTechnique === raceTechnique ? null : techniqueIdentityBeat(classTechnique);
  const titleBeat = title ? ` Титул «${title}» лишає на справі підпис із дуже серйозним виглядом.` : "";

  return `${core} ${raceBeat[grade]}${classBeat ? ` ${classBeat[grade]}` : ""}${titleBeat}`;
}

function techniqueIdentityBeat(technique: QuestMethodDefinition["techniques"][number]): Record<keyof QuestMethodDefinition["outcomeText"], string> {
  const beats: Partial<Record<QuestMethodDefinition["techniques"][number], Record<keyof QuestMethodDefinition["outcomeText"], string>>> = {
    authority: {
      "strong-success": "Печатка лягає тихо, але всі одразу згадують про порядок.",
      success: "Офіційний тон тримає сцену в межах пристойности.",
      "mixed-success": "Печатка допомагає, та просить окрему полицю для самолюбства.",
      complication: "Печатка падає не тим боком і будить зайву інстанцію."
    },
    bribery: {
      "strong-success": "Малий внесок поводиться як мирний посередник, а не як хабар у темному кутку.",
      success: "Сирний чи часниковий фонд стишує суперечку без зайвих промов.",
      "mixed-success": "Внесок допомагає, але залишає крихітний рядок дрібного шрифту.",
      complication: "Внесок прийнято, проте сцена раптом просить касову мораль."
    },
    domesticity: {
      "strong-success": "Хатня юрисдикція розставляє речі так, ніби вони самі цього просили.",
      success: "Домашній порядок стишує сцену краще за лекцію.",
      "mixed-success": "Побут допомагає, але залишає одну крихту з характером.",
      complication: "Хатній порядок ображається й відповідає дуже близько до пальців."
    },
    force: {
      "strong-success": "Прямий аргумент ставить крапку раніше, ніж сцена знаходить кому скаржитись.",
      success: "Сила працює, хоч і залишає довкола трохи тиші з переляком.",
      "mixed-success": "Натиск дає результат, але гордість просить пластир.",
      complication: "Сила заходить надто голосно й будить гострий край сцени."
    },
    investigation: {
      "strong-success": "Уважна ревізія знаходить причину там, де сцена ховала сором.",
      success: "Перевірка складає докази в порядок без зайвого пафосу.",
      "mixed-success": "Ревізія працює, але один доказ лишається з характером.",
      complication: "Зачеплений доказ відстрибує й робить висновок болючим."
    },
    performance: {
      "strong-success": "Ритм і пауза змушують сцену вийти на правильний такт.",
      success: "Виступ тримає увагу там, де безлад хотів утекти.",
      "mixed-success": "Ритм майже влучає, та остання пауза просить окремий уклін.",
      complication: "Пауза провалюється, і сцена бере незапланований біс."
    },
    tracking: {
      "strong-success": "Слід виходить із сорому й сам показує коротку дорогу.",
      success: "Стежка складається достатньо чітко, щоб безлад перестав тікати.",
      "mixed-success": "Слід знайдено, проте він лишає маленький обхід через ніяковість.",
      complication: "Стежка веде не до відповіді, а до гострого краю."
    },
    traps: {
      "strong-success": "Пастка має чесний вигляд і ловить саме ту проблему, яка вдавала невинність.",
      success: "Пастка спрацьовує без зайвого клацання по пальцях.",
      "mixed-success": "Пастка ловить частину безладу, а решта просить адвоката.",
      complication: "Пастка замикається не на тому краї й залишає болючий урок."
    },
    arcana: {
      "strong-success": "Тихий магічний шов тримає сцену без великого сяйва.",
      success: "Чари працюють малим стібком і не вимагають окремої завіси.",
      "mixed-success": "Магічний шов тримається, але тихо іскрить під серветкою.",
      complication: "Чар ковзає вбік і кличе наслідок, який не питав дозволу."
    },
    finesse: {
      "strong-success": "Точний рух прибирає зайве так чисто, що сцена моргає із запізненням.",
      success: "Точний рух спрацьовує без фанфар і зайвих уламків.",
      "mixed-success": "Рух майже ідеальний, та один край лишає дрібний слід.",
      complication: "Точність зривається на волосину, і волосина виявляється дуже гострою."
    },
    deception: {
      "strong-success": "Обхідний хід лишає правду цілою, але переставляє її стілець.",
      success: "Хитрий кут спрацьовує без таблички на дверях.",
      "mixed-success": "Трюк майже непомітний, та одна складка все одно підморгує.",
      complication: "Обман зачіпає власну нитку й тягне наслідок на світло."
    },
    persuasion: {
      "strong-success": "Мирна умова сідає між сторонами й забирає в суперечки ложку.",
      success: "Угода працює без зайвої слави й не потребує крику.",
      "mixed-success": "Домовленість тримається, хоч одна претензія ще совається.",
      complication: "Слова повертаються з додатком, який ніхто не читав уголос."
    },
    ritual: {
      "strong-success": "Малий обряд замикає сцену так буденно, ніби це інструкція до чайника.",
      success: "Обрядова впертість тримає межу без великого диму.",
      "mixed-success": "Обряд працює, але одна іскра просить визнати її знаком.",
      complication: "Ритуал бере зайвий оберт і відкриває наслідок із того боку."
    },
    craft: {
      "strong-success": "Ремесло ставить край так рівно, що безлад соромиться стирчати.",
      success: "Акуратний ремонт тримає результат без фанфар.",
      "mixed-success": "Ремісничий шов працює, хоч один кут і бурчить.",
      complication: "Інструмент ковзає, і сцена нагадує про гострий бік майстерности."
    },
    improvisation: {
      "strong-success": "Корисний збіг приходить вчасно й удає, що так було заплановано.",
      success: "Імпровізація ловить потрібну мить за край фартуха.",
      "mixed-success": "Випадок допомагає, та просить не називати його системою.",
      complication: "Збіг плутає двері й приносить наслідок не з того боку."
    }
  };

  return beats[technique] ?? {
    "strong-success": "Практичний нахил робить сцену простішою, ніж вона хотіла здаватись.",
    success: "Практичний хід допомагає без зайвого підпису.",
    "mixed-success": "Практичність працює, але лишає дрібну претензію.",
    complication: "Практичний хід чіпляє незручний край сцени."
  };
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

function compactPersonalMethodId(prefix: string, profileKey: string, baseId: string): string {
  return `${prefix}${profileKey}${toQuestCallbackKey(baseId).slice(1)}`;
}

function uniqueTechniques(techniques: readonly QuestMethodDefinition["techniques"][number][]): QuestMethodDefinition["techniques"][number][] {
  return [...new Set(techniques)];
}

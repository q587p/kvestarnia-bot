import type { CharacterSummary } from "../domain/characters/characterSummary";
import type {
  QuestConsequenceKind,
  QuestIntent,
  QuestMethodDefinition,
  QuestMethodOutcomeText,
  QuestResolutionGrade,
  QuestResolutionScene,
  QuestRewardProfile,
  QuestTechniqueId
} from "./questResolution";
import {
  classTechniqueProfiles,
  getCompactClassKey,
  getCompactRaceKey,
  raceTechniqueProfiles
} from "./questResolution";

interface AdventureSceneSeed {
  object: string;
  methods: readonly AdventureMethodSeed[];
  mixed: string;
  complication: string;
}

interface AdventureMethodSeed {
  id: string;
  label: string;
  hint: string;
  intent: QuestIntent;
  techniques: readonly QuestTechniqueId[];
  primaryStat: QuestMethodDefinition["primaryStat"];
  secondaryStat?: QuestMethodDefinition["secondaryStat"];
  baseChance: number;
  rewardProfile: QuestRewardProfile;
  consequence?: QuestConsequenceKind;
  cost?: number;
  combatSkillId?: string;
}

const GENERAL_SCENE_SEEDS: Record<string, AdventureSceneSeed> = {
  stew: scene("казанок", "Суп стих, але кожна ложка ще бере високу ноту.", "Пара скликала дрібну вокальну біду.", [
    method("conduct-duet", "🎵 Продиригувати юшкою", "Добрі шанси, винагорода звичайна.", "negotiate", ["performance"], "charisma", "luck", 66, "standard"),
    method("lower-fire", "🔥 Знайти ноту в температурі", "Надійна перевірка розумом, винагорода скромніша.", "investigate", ["arcana", "craft"], "intelligence", "luck", 70, "modest"),
    method("taste-critic", "📚 Провести дегустаційну рецензію", "Аналіз і авторитет, звичайна винагорода.", "investigate", ["investigation", "authority"], "intelligence", "charisma", 64, "standard"),
    method("lid-challenge", "🛡️ Викликати казанок на двобій кришок", "Ризиковано, зате щедріше.", "fight", ["force"], "strength", "luck", 55, "generous", "fight-handoff")
  ]),
  barrel: scene("бочку", "Угода працює, але бочка отримала право на кухоль тиші.", "Порожнеча покликала мешканця з дуже глухим голосом.", [
    method("inspect-staves", "🔎 Знайти мешканця між клепками", "Ретельно й відносно надійно.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("sign-lease", "📋 Укласти угоду з порожнечею", "Переговори з папером, звичайна винагорода.", "negotiate", ["authority", "persuasion"], "charisma", "intelligence", 64, "standard"),
    method("bribe-cork", "🪙 Дати корку 2 золотих застави", "Коштує 2 золота. Шанси добрі, винагорода скромніша.", "bribe", ["bribery"], "charisma", "luck", 76, "modest", "gold-cost-success", 2),
    method("evict-emptiness", "💪 Виселити порожнечу силою", "Непевно й гучно, але щедріше.", "fight", ["force"], "strength", "charisma", 56, "generous", "fight-handoff")
  ]),
  helmet: scene("шолом", "Шолом замовк, але герой отримав чужий епітет на вечір.", "Стара слава вилізла з шолома й хоче реваншу.", [
    method("duel-memory", "🛡️ Викликати спогад на чесний поєдинок", "Сміливо й ризиковано.", "fight", ["force", "authority"], "strength", "charisma", 55, "generous", "fight-handoff", undefined, "skill.forceful-strike"),
    method("fact-check", "🔎 Перевірити подвиги за вмʼятинами", "Розумно, стримано, без фанфар.", "investigate", ["investigation"], "intelligence", "luck", 69, "modest"),
    method("stage-applause", "🎭 Дати шолому контрольовану сцену", "Сценічно, не надто певно.", "negotiate", ["performance"], "charisma", "luck", 62, "standard"),
    method("steal-punchline", "🗝️ Забрати найгучнішу байку", "Тихий трюк зі звичайною винагородою.", "deceive", ["deception", "finesse"], "dexterity", "charisma", 61, "standard")
  ]),
  calendar: scene("календар", "Четвер повернувся, але між обідом і вечерею.", "Зайвий день лишив дрібний часовий безлад.", [
    method("audit-days", "📋 Перерахувати дні й знайти підміну", "Надійна канцелярія часу.", "investigate", ["investigation"], "intelligence", "luck", 72, "modest"),
    method("negotiate-week", "🤝 Домовитися з трьома пʼятницями", "Переговори з датами.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("forge-thursday", "🗝️ Підробити четвер для часу", "Непевний трюк, винагорода щедріша.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous"),
    method("bribe-deadline", "🪙 Дати дедлайну 1 золото за мовчання", "Коштує 1 золото. Майже надійно.", "bribe", ["bribery"], "charisma", "luck", 78, "modest", "gold-cost-success", 1)
  ]),
  receipt: scene("чек", "Портал закрився, протяг лишив рахунок.", "З іншого боку вилізла істота з печаткою.", [
    method("read-print", "🔎 Знайти адресу порталу в дрібному шрифті", "Ретельно, винагорода скромніша.", "investigate", ["investigation"], "intelligence", "luck", 71, "modest"),
    method("stamp-closed", "📋 Закрити прохід печаткою", "Авторитет і папір, звичайна винагорода.", "ritual", ["authority"], "intelligence", "charisma", 66, "standard", undefined, undefined, "skill.form-thirteen-b"),
    method("swap-total", "🗝️ Підмінити суму на «нуль вимірів»", "Ризиковий обман.", "deceive", ["deception"], "dexterity", "charisma", 59, "generous"),
    method("pay-draft", "🪙 Кинути 2 золотих як мито", "Коштує 2 золота. Добрі шанси.", "bribe", ["bribery"], "charisma", "luck", 76, "modest", "gold-cost-success", 2)
  ]),
  bench: scene("лаву", "Пророцтво замовкло, лишивши пораду про шкарпетки.", "Лава сказала зайве, і тепер усім ніяково.", [
    method("cross-examine", "📋 Допитати лаву про джерела", "Розумний тиск без бійки.", "investigate", ["authority", "investigation"], "intelligence", "charisma", 68, "standard"),
    method("out-prophesy", "🎵 Відповісти кращим пророцтвом", "Сценічно й трохи непевно.", "negotiate", ["performance"], "charisma", "luck", 62, "standard"),
    method("sand-splinter", "🪡 Прибрати тріску з даром", "Точна робота, скромна винагорода.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 70, "modest"),
    method("sit-defiantly", "💪 Сісти й витримати правду поставою", "Грубо, смішно, щедріше.", "fight", ["force"], "strength", "luck", 57, "generous", "cosmetic-mess")
  ]),
  cloak: scene("плащ", "Черга відновлена, але плащ зберіг один голос.", "Плащ душить драмою й майже руками.", [
    method("verify-owner", "🔎 Перевірити підкладку й підпис", "Ретельно й спокійно.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("queue-talk", "🤝 Запропонувати плащу талончик", "Переговори з тканиною.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("wear-disguise", "🗝️ Вдати власника плаща", "Непевний обман.", "deceive", ["deception"], "dexterity", "charisma", 59, "generous"),
    method("challenge-rank", "🛡️ Оскаржити право тканини на місце", "Силовий аргумент із ризиком.", "fight", ["force", "authority"], "strength", "charisma", 56, "generous", "fight-handoff")
  ]),
  spoon: scene("ложку", "Раду розпущено, але створено підкомітет серветок.", "Прибори вимагають ще одне засідання без винагороди.", [
    method("agenda", "📋 Скласти порядок денний до вечері", "Надійна бюрократія столу.", "investigate", ["authority"], "intelligence", "charisma", 70, "modest"),
    method("coalition", "🤝 Домовитися з виделками", "Переговори, звичайна винагорода.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("hide-gavel", "🗝️ Забрати ложку-спікера", "Тихий трюк.", "deceive", ["deception", "finesse"], "dexterity", "charisma", 60, "standard"),
    method("table-knock", "💪 Закрити засідання стуком", "Прямо й гучно.", "fight", ["force"], "strength", "luck", 58, "generous", "cosmetic-mess")
  ]),
  mirror: scene("дзеркало", "Дзеркало показало правду, але з невдалим освітленням.", "Відбиття вийшло назовні й просить слово.", [
    method("find-angle", "🔎 Знайти фізичний кут брехні", "Розум і точність.", "investigate", ["investigation"], "dexterity", "intelligence", 68, "standard"),
    method("debate-reflection", "🤝 Сперечатися з відбиттям", "Харизма проти скла.", "negotiate", ["authority"], "charisma", "intelligence", 64, "standard"),
    method("better-pose", "🎭 Переграти дзеркало позою", "Сцена любить сміливих.", "negotiate", ["performance"], "charisma", "luck", 61, "generous"),
    method("cover-listen", "🗝️ Накрити й підслухати правду", "Обман без зайвих овацій.", "deceive", ["deception"], "dexterity", "charisma", 62, "standard")
  ]),
  boots: scene("чоботи", "Чоботи повернулись, але планують відпустку.", "Погоня лишила героя з пилом і без частини золота.", [
    method("track-soles", "🏹 Прочитати маршрут підошов", "Слід і розум.", "investigate", ["tracking"], "dexterity", "intelligence", 68, "standard", undefined, undefined, "skill.trick-shot"),
    method("offer-expedition", "🤝 Записати їх у безпечну експедицію", "Дипломатія взуття.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("lace-trap", "🪤 Звʼязати шнурки пасткою", "Точний трюк.", "craft", ["traps"], "dexterity", "intelligence", 62, "generous"),
    method("outrun-boots", "💪 Перегнати чоботи до дверей", "Гучно й ризиковано.", "fight", ["force"], "strength", "dexterity", 57, "generous", "cosmetic-mess")
  ]),
  chimney: scene("комин", "Довідки зупинились, одна лишилась на героя.", "Сажа склалась у службову істоту.", [
    method("trace-stamps", "🔎 Знайти джерело печаток у сажі", "Надійне розслідування.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("revoke-license", "📋 Відкликати право диму на документи", "Авторитет і дим.", "ritual", ["authority"], "intelligence", "charisma", 66, "standard"),
    method("clean-evidence", "🧹 Вичистити акт без втрат", "Точна робота.", "craft", ["craft"], "dexterity", "intelligence", 63, "standard"),
    method("bribe-smoke", "🪙 Дати 2 золотих на вентиляцію", "Коштує 2 золота. Добрі шанси.", "bribe", ["bribery"], "charisma", "luck", 76, "modest", "gold-cost-success", 2)
  ]),
  candle: scene("свічку", "Світить, але лише на найбільш драматичні предмети.", "Тіні скликали страйк.", [
    method("write-rider", "📋 Скласти короткий райдер світла", "Розумний контракт.", "investigate", ["authority"], "intelligence", "charisma", 68, "standard"),
    method("applause", "🎭 Організувати чергові оплески", "Сцена за світло.", "negotiate", ["performance"], "charisma", "luck", 64, "standard"),
    method("mirror-light", "🗝️ Обдурити відбитим полумʼям", "Фінт із тінню.", "deceive", ["deception"], "dexterity", "intelligence", 60, "generous"),
    method("relight", "💪 Запалити попри профспілку", "Прямо й ризиковано.", "fight", ["force"], "strength", "luck", 56, "generous", "fight-handoff")
  ]),
  chair: scene("стілець", "Трон погодився бути стільцем, але просить «ваша спинка».", "Меблева варта вийшла з-під столу.", [
    method("genealogy", "🔎 Перевірити родовід ніжок", "Ретельна генеалогія меблів.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("ceremony", "📋 Провести малу коронацію", "Авторитет без зайвої сили.", "ritual", ["authority"], "charisma", "intelligence", 65, "standard"),
    method("swap-cushion", "🗝️ Підмінити королівську подушку", "Тихий обман.", "deceive", ["deception"], "dexterity", "charisma", 60, "standard"),
    method("sit-down", "💪 Сісти до завершення промови", "Сміливо й небезпечно.", "fight", ["force"], "strength", "luck", 56, "generous", "fight-handoff")
  ]),
  broom: scene("мітлу", "Докази врятовано, картопля відмовляється свідчити.", "Мітла атакує процес прибирання.", [
    method("follow-sweep", "🏹 Простежити, куди йдуть докази", "Слід у пилу.", "investigate", ["tracking"], "dexterity", "intelligence", 67, "standard"),
    method("evidence-bag", "📋 Оформити кожну смітинку", "Паперова надійність.", "investigate", ["authority"], "intelligence", "charisma", 70, "modest"),
    method("plant-decoy", "🗝️ Підкласти фальшивий доказ", "Ризиковий трюк.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous"),
    method("wrestle-broom", "💪 Відібрати килим у мітли", "Бійка з інвентарем.", "fight", ["force"], "strength", "dexterity", 55, "generous", "fight-handoff")
  ]),
  door: scene("двері", "Двері відпускають, але повертають героя через кухню.", "Двері відкрили філософську петлю.", [
    method("inspect-hinges", "🔎 Знайти, хто навчив петлі рахувати", "Ремонт і логіка.", "craft", ["craft", "investigation"], "intelligence", "dexterity", 70, "modest"),
    method("negotiate-toll", "🤝 Домовитися про перший безкоштовний вихід", "Переговори з порогом.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("fake-payment", "🗝️ Показати монету лише відбиттям", "Обман без витрат.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous"),
    method("pay-tip", "🪙 Дати 1 золото на мастило", "Коштує 1 золото. Надійно.", "bribe", ["bribery"], "charisma", "luck", 78, "modest", "gold-cost-success", 1)
  ]),
  map: scene("мапу", "Мапа правильна, але позначає героя стихійним лихом.", "Експедиція з мапи просить супровід.", [
    method("survey-table", "🔎 Переміряти материк тарілок", "Точна географія столу.", "investigate", ["tracking"], "intelligence", "dexterity", 69, "standard"),
    method("redraw-coast", "🪡 Виправити море підливи", "Ремесло й точність.", "craft", ["craft"], "dexterity", "intelligence", 65, "standard"),
    method("negotiate-border", "🤝 Домовитися з горою кухлів", "Дипломатія посуду.", "negotiate", ["persuasion"], "charisma", "intelligence", 64, "standard"),
    method("wrong-route", "🌾 Піти за помилкою до короткого шляху", "Вдача бере кермо.", "sneak", ["improvisation"], "luck", "dexterity", 58, "generous")
  ]),
  teapot: scene("чайник", "Чайник мовчить, але кришка продовжує штабну нараду.", "Пара стала тактичною формацією.", [
    method("decode-whistle", "🔎 Розібрати свист як шифр", "Розум проти пари.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("counter-plan", "📋 Запропонувати кращу облогу кухні", "Авторитетний план.", "negotiate", ["authority"], "charisma", "intelligence", 65, "standard"),
    method("cool-it", "🔥 Змінити температуру поради", "Магія й ремесло.", "craft", ["arcana", "craft"], "intelligence", "dexterity", 63, "standard", undefined, undefined, "skill.hot-spell"),
    method("tea-bribe", "🪙 Дати 1 золото на добрий чай", "Коштує 1 золото. Добрі шанси.", "bribe", ["bribery"], "charisma", "luck", 77, "modest", "gold-cost-success", 1)
  ]),
  menu: scene("меню", "Ціни нормальні, але компот лишився з наслідками.", "Меню виставило рахунок за настрій.", [
    method("audit-prices", "🔎 Перевірити, хто оцінив тривогу", "Ретельний аудит.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("feelings", "🤝 Торгуватися за дешевшу славу", "Харизма проти прайсу.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("change-font", "🗝️ Підмінити «наслідки» на «серветки»", "Ризиковий шрифт.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 59, "generous"),
    method("buy-calm", "🪙 Купити малий спокій за 2 золотих", "Коштує 2 золота. Надійно.", "bribe", ["bribery"], "charisma", "luck", 78, "modest", "gold-cost-success", 2)
  ]),
  sign: scene("вивіску", "«Корчма» повернулась, риба лишила заявку.", "Публіка заплуталась і просить компенсацію.", [
    method("repair-letters", "🪡 Повернути літери на зміну", "Ремонт із розумом.", "craft", ["craft"], "intelligence", "dexterity", 69, "standard"),
    method("shift-talk", "🤝 Дати вивісці вечір без «ч»", "Переговори з буквами.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("rebrand-decoy", "🗝️ Повісити тимчасову назву", "Обман і стиль.", "deceive", ["deception"], "dexterity", "charisma", 59, "generous"),
    method("hold-straight", "💪 Втримати бізнес-модель руками", "Силовий аргумент.", "fight", ["force"], "strength", "luck", 56, "generous", "cosmetic-mess")
  ]),
  portrait: scene("портрет", "Портрет чемний, але підморгує лише Корчмарю.", "Намальований герой ступив із рами.", [
    method("study-paint", "🔎 Знайти живу фарбу", "Розслідування мистецтва.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("pose-back", "🎭 Змусити портрет ніяковіти", "Сцена проти сцени.", "negotiate", ["performance"], "charisma", "luck", 63, "standard"),
    method("swap-eyes", "🗝️ Змінити напрям погляду", "Точний обман.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 60, "generous"),
    method("cover-history", "📋 Оголосити реставрацію", "Авторитетна тканина.", "ritual", ["authority"], "charisma", "intelligence", 66, "standard")
  ]),
  key: scene("ключ", "Потрібний замок відкрито, ключ тепер закриває пісні.", "Неправильні двері відчинили неправильну пригоду.", [
    method("catalog-locks", "🔎 Провести обхід замків", "Ретельна інвентаризація.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("ask-key", "🤝 Переконати ключ згадати першу любов", "Дипломатія металу.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("pick-memory", "🗝️ Відкрити памʼять відмичкою", "Точний трюк.", "sneak", ["finesse"], "dexterity", "intelligence", 60, "generous"),
    method("forge-purpose", "💪 Перекувати сенс одним ударом", "Сила і ремесло.", "craft", ["force", "craft"], "strength", "intelligence", 57, "generous")
  ]),
  ledger: scene("журнал", "Числа сходяться, але кожен борг має приспів.", "Паперова істота вимагає округлення кулаком.", [
    method("recalculate", "🔎 Знайти риму, де зламалась сума", "Розумний підрахунок.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("debate-total", "📋 Переконати журнал, що Корчмар не завжди правий", "Авторитет проти підсумку.", "negotiate", ["authority"], "charisma", "intelligence", 64, "standard"),
    method("steal-rhyme", "🗝️ Витягти риму з підсумку", "Тихий обман.", "deceive", ["deception"], "dexterity", "charisma", 60, "generous"),
    method("perform-balance", "🎵 Заспівати правильний баланс", "Сценічна бухгалтерія.", "negotiate", ["performance"], "charisma", "luck", 61, "standard")
  ]),
  rug: scene("килим", "Слід повернувся, монета лишилася заставою.", "Килим виявився дуже переконливим міміком.", [
    method("read-pile", "🏹 Прочитати напрям ворсу", "Слід у текстилі.", "investigate", ["tracking"], "dexterity", "intelligence", 68, "standard"),
    method("offer-trade", "🤝 Обміняти слід на непотрібну таємницю", "Переговори з ворсом.", "negotiate", ["persuasion"], "charisma", "luck", 64, "standard"),
    method("pick-rug", "🗝️ Витягти монету й доказ", "Непевна точність.", "sneak", ["finesse"], "dexterity", "charisma", 59, "generous"),
    method("shake-truth", "💪 Витрусити правду силою", "Бійка з килимом.", "fight", ["force"], "strength", "dexterity", 55, "generous", "fight-handoff")
  ]),
  bell: scene("дзвінок", "Офіціянт приходить правильно, але з блокнотом проблеми.", "Дрібна викликана проблема хоче черги.", [
    method("trace-call", "🔎 Визначити, куди йде дзвін", "Розумне відстеження.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("set-menu", "📋 Домовитися про список викликів", "Авторитетний порядок.", "negotiate", ["authority"], "charisma", "intelligence", 65, "standard"),
    method("fake-ring", "🗝️ Підмінити звук", "Трюк зі звуком.", "deceive", ["deception"], "dexterity", "charisma", 60, "standard"),
    method("challenge-problem", "💪 Подзвонити навмисно", "Ризик із щедрою сценою.", "fight", ["force"], "strength", "luck", 55, "generous", "fight-handoff")
  ])
} as const satisfies Record<string, AdventureSceneSeed>;

export function buildAdventureResolutionScene(input: {
  problemId: string;
  title: string;
  character: CharacterSummary;
}): QuestResolutionScene {
  const seed = GENERAL_SCENE_SEEDS[input.problemId] ?? buildGeneratedSceneSeed(input.problemId);
  const methods = [
    ...seed.methods.map((methodSeed) => materializeSceneMethod(input.title, seed, methodSeed)),
    buildRaceMethod(input.character, input.title),
    buildClassMethod(input.character, input.title),
    buildSignatureMethod(input.character, input.title, seed.object)
  ];

  return {
    sceneId: input.problemId,
    sceneTitle: input.title,
    sceneObject: seed.object,
    methods
  };
}

export function getGeneralAdventureResolutionProblemIds(): readonly string[] {
  return Object.keys(GENERAL_SCENE_SEEDS);
}

function buildGeneratedSceneSeed(problemId: string): AdventureSceneSeed {
  if (problemId.startsWith("race-") && problemId.endsWith("-survey")) {
    return generated("анкету", "Анкета повернулась у графу, але просить громадянство.", "Папір подав апеляцію чорнилом.");
  }

  if (problemId.startsWith("race-") && problemId.endsWith("-mug")) {
    return generated("кухоль", "Кухоль визнав інструктаж, але просить підставку.", "Посуд скликав церемонію без дозволу.");
  }

  if (problemId.startsWith("race-") && problemId.endsWith("-portrait")) {
    return generated("портрет", "Рама витримала героїчність, але просить перерву.", "Фарба почала сперечатись окремо.");
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-manual")) {
    return generated("підручник", "Підручник склав себе на трійку з плюсом.", "Практика втекла з прикладів.");
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-uniform")) {
    return generated("форму", "Клітинка розширилась, але називає це реформою.", "Бланк вимагає додаткового додатку.");
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-exam")) {
    return generated("іспит", "Іспит визнав героя питанням підвищеної складности.", "Викладач попросив перездачу реальности.");
  }

  return generated("титул", "Черга прийняла титул, але просить печатку слави.", "Журнал почав питати, чи репутація має ноги.");
}

function generated(object: string, mixed: string, complication: string): AdventureSceneSeed {
  return scene(object, mixed, complication, [
    method("inspect-scene", "🔎 Знайти дрібний шрифт сцени", "Надійне розслідування.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("negotiate-scene", "🤝 Домовитися з головним предметом", "Звичайний ризик, звичайна винагорода.", "negotiate", ["persuasion"], "charisma", "intelligence", 64, "standard"),
    method("deceive-scene", "🗝️ Підмінити рамку проблеми", "Непевний трюк, щедріше.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous"),
    method("ritual-scene", "🕯️ Провести короткий ритуал порядку", "Містично, але без мани.", "ritual", ["ritual"], "charisma", "intelligence", 62, "standard")
  ]);
}

function scene(
  object: string,
  mixed: string,
  complication: string,
  methods: readonly AdventureMethodSeed[]
): AdventureSceneSeed {
  return { object, mixed, complication, methods };
}

function method(
  id: string,
  label: string,
  hint: string,
  intent: QuestIntent,
  techniques: readonly QuestTechniqueId[],
  primaryStat: QuestMethodDefinition["primaryStat"],
  secondaryStat: QuestMethodDefinition["secondaryStat"],
  baseChance: number,
  rewardProfile: QuestRewardProfile,
  consequence?: QuestConsequenceKind,
  cost?: number,
  combatSkillId?: string
): AdventureMethodSeed {
  return {
    id,
    label,
    hint,
    intent,
    techniques,
    primaryStat,
    secondaryStat,
    baseChance,
    rewardProfile,
    ...(consequence ? { consequence } : {}),
    ...(cost ? { cost } : {}),
    ...(combatSkillId ? { combatSkillId } : {})
  };
}

function materializeSceneMethod(
  sceneTitle: string,
  sceneSeed: AdventureSceneSeed,
  seed: AdventureMethodSeed
): QuestMethodDefinition {
  const consequence = seed.consequence ?? "cosmetic-mess";

  return {
    id: seed.id,
    source: "scene",
    label: seed.label,
    hint: seed.hint,
    intent: seed.intent,
    techniques: seed.techniques,
    primaryStat: seed.primaryStat,
    ...(seed.secondaryStat ? { secondaryStat: seed.secondaryStat } : {}),
    baseChance: seed.baseChance,
    rewardProfile: seed.rewardProfile,
    ...(seed.cost ? { goldCost: seed.cost } : {}),
    ...(seed.combatSkillId ? { combatSkillId: seed.combatSkillId } : {}),
    consequenceByGrade: consequences(consequence),
    outcomeText: buildOutcomeText({
      sceneTitle,
      label: seed.label,
      strong: `${sceneTitle} нарешті перестає сперечатися. Корчмар навіть не встигає знайти зайву форму.`,
      success: "Рішення лягає точно в цю сцену. Корчма занотовує спосіб і ховає чорнило.",
      mixed: sceneSeed.mixed,
      complication: sceneSeed.complication
    })
  };
}

function buildRaceMethod(character: CharacterSummary, sceneTitle: string): QuestMethodDefinition {
  const profile = getRaceProfile(character.raceId);
  const id = `r${getCompactRaceKey(character.raceId)}`;

  return buildProfileMethod({
    id,
    source: "race",
    label: `🧬 ${profile.methodPrefix}`,
    buttonLabel: `🧬 ${profile.shortButtonLabel ?? profile.methodPrefix}`,
    hint: "Особистий підхід героя. Винагорода звичайна.",
    sceneTitle,
    profile,
    rewardProfile: "standard"
  });
}

function buildClassMethod(character: CharacterSummary, sceneTitle: string): QuestMethodDefinition {
  const profile = getClassProfile(character.classId);
  const id = `c${getCompactClassKey(character.classId)}`;

  return buildProfileMethod({
    id,
    source: "class",
    label: `🎭 ${profile.methodPrefix}`,
    buttonLabel: `🎭 ${profile.shortButtonLabel ?? profile.methodPrefix}`,
    hint: "Професійний підхід героя. Винагорода звичайна.",
    sceneTitle,
    profile,
    rewardProfile: "standard"
  });
}

function buildSignatureMethod(character: CharacterSummary, sceneTitle: string, object: string): QuestMethodDefinition {
  const raceProfile = getRaceProfile(character.raceId);
  const classProfile = getClassProfile(character.classId);
  const id = `s${getCompactRaceKey(character.raceId)}${getCompactClassKey(character.classId)}`;
  const title = character.title ? `«${character.title}»` : "геройський підпис";
  const techniques = [...new Set([firstTechnique(raceProfile), firstTechnique(classProfile)])] as QuestTechniqueId[];

  return {
    id,
    source: "signature",
    label: `🏷️ ${title}: змусити ${object} визнати точну біографію`,
    buttonLabel: `🏷️ ${title}`,
    hint: "Непевніше, зате стильніше.",
    intent: chooseIntent(techniques),
    techniques,
    primaryStat: classProfile.primaryStat,
    ...(raceProfile.primaryStat !== classProfile.primaryStat ? { secondaryStat: raceProfile.primaryStat } : {}),
    baseChance: 61,
    rewardProfile: "generous",
    ...(classProfile.combatSkillId ? { combatSkillId: classProfile.combatSkillId } : {}),
    consequenceByGrade: consequences("cosmetic-mess"),
    outcomeText: buildOutcomeText({
      sceneTitle,
      label: title,
      strong: `Підпис ${title} перетворює проблему на автобіографічний доказ. Корчма коротко вірить у долю.`,
      success: "Точна біографія стала доказом. Корчма визнала, що така комбінація не трапляється випадково.",
      mixed: "Справа погодилась, але попросила не пояснювати біографію вдруге.",
      complication: "Титул заплутав протокол і лишив на сцені трохи кумедного безладу."
    })
  };
}

function buildProfileMethod(input: {
  id: string;
  source: "race" | "class";
  label: string;
  buttonLabel: string;
  hint: string;
  sceneTitle: string;
  profile: QuestTechniqueProfileLike;
  rewardProfile: QuestRewardProfile;
}): QuestMethodDefinition {
  return {
    id: input.id,
    source: input.source,
    label: input.label,
    buttonLabel: input.buttonLabel,
    hint: input.hint,
    intent: chooseIntent(input.profile.techniques),
    techniques: input.profile.techniques,
    primaryStat: input.profile.primaryStat,
    ...(input.profile.secondaryStat ? { secondaryStat: input.profile.secondaryStat } : {}),
    baseChance: 64,
    rewardProfile: input.rewardProfile,
    ...(input.profile.combatSkillId ? { combatSkillId: input.profile.combatSkillId } : {}),
    consequenceByGrade: consequences("cosmetic-mess"),
    outcomeText: buildOutcomeText({
      sceneTitle: input.sceneTitle,
      label: input.profile.label,
      strong: "Особистий підхід дає блискучий результат. Корчма визнає авторський стиль.",
      success: "Підхід спрацьовує, і корчма занотовує це як «не повторювати без свідків».",
      mixed: "Справа погодилась, але лишила невеликий слід власної гордости.",
      complication: "Підхід розвʼязує не той край проблеми, зате всі бачать характер."
    })
  };
}

type QuestTechniqueProfileLike = typeof raceTechniqueProfiles[string];

function getRaceProfile(raceId: string): QuestTechniqueProfileLike {
  return raceTechniqueProfiles[raceId] ?? raceTechniqueProfiles["race.human-ish"]!;
}

function getClassProfile(classId: string): QuestTechniqueProfileLike {
  return classTechniqueProfiles[classId] ?? classTechniqueProfiles["class.warrior"]!;
}

function firstTechnique(profile: QuestTechniqueProfileLike): QuestTechniqueId {
  return profile.techniques[0] ?? "investigation";
}

function chooseIntent(techniques: readonly QuestTechniqueId[]): QuestIntent {
  if (techniques.includes("bribery")) return "bribe";
  if (techniques.includes("deception")) return "deceive";
  if (techniques.includes("force")) return "fight";
  if (techniques.includes("ritual") || techniques.includes("arcana")) return "ritual";
  if (techniques.includes("craft")) return "craft";
  if (techniques.includes("tracking") || techniques.includes("investigation")) return "investigate";
  if (techniques.includes("finesse")) return "sneak";
  return "negotiate";
}

function consequences(complication: QuestConsequenceKind): Record<QuestResolutionGrade, QuestConsequenceKind> {
  return {
    "strong-success": "full-reward",
    success: "full-reward",
    "mixed-success": "reduced-reward",
    complication
  };
}

function buildOutcomeText(input: {
  sceneTitle: string;
  label: string;
  strong: string;
  success: string;
  mixed: string;
  complication: string;
}): Record<QuestResolutionGrade, QuestMethodOutcomeText> {
  return {
    "strong-success": {
      headline: "✨ Справу закрито блискуче",
      body: [input.sceneTitle, "", input.strong]
    },
    success: {
      headline: "✅ Справу закрито",
      body: [input.sceneTitle, "", input.success]
    },
    "mixed-success": {
      headline: "🟡 Справу закрито з хвостиком",
      body: [input.sceneTitle, "", input.mixed]
    },
    complication: {
      headline: "⚠️ Метод зачепив не той нерв",
      body: [input.sceneTitle, "", input.complication]
    }
  };
}

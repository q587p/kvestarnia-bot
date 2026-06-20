import type { CharacterSummary } from "../domain/characters/characterSummary";
import type {
  QuestConsequenceKind,
  QuestIntent,
  QuestMethodDefinition,
  QuestMethodOutcomeText,
  QuestResolutionGrade,
  QuestResolutionScene,
  QuestRewardProfile,
  QuestTechniqueId,
  QuestTechniqueProfile
} from "./questResolution";
import {
  classTechniqueProfiles,
  getCompactClassKey,
  getCompactRaceKey,
  raceTechniqueProfiles,
  toQuestCallbackKey
} from "./questResolution";

interface AdventureSceneSeed {
  object: string;
  objectGenitive: string;
  methods: readonly AdventureMethodSeed[];
  mixed: string;
  complication: string;
}

interface AdventureOutcomeBeats {
  strong: string;
  success: string;
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
  outcomes: AdventureOutcomeBeats;
}

const AUTHORED_METHOD_FOCUS = {
  "conduct-duet": authoredFocus("Юшкою"),
  "lower-fire": authoredFocus("Ноту в температурі"),
  "taste-critic": authoredFocus("Дегустаційну рецензію"),
  "lid-challenge": authoredFocus("Казанок на двобій кришок"),
  "inspect-staves": authoredFocus("Мешканця між клепками"),
  "sign-lease": authoredFocus("Угоду з порожнечею"),
  "bribe-cork": authoredFocus("Корку 2 золотих застави"),
  "evict-emptiness": authoredFocus("Порожнечу силою"),
  "duel-memory": authoredFocus("Спогад на чесний поєдинок"),
  "fact-check": authoredFocus("Подвиги за вмʼятинами"),
  "stage-applause": authoredFocus("Шолому контрольовану сцену"),
  "steal-punchline": authoredFocus("Найгучнішу байку"),
  "audit-days": authoredFocus("Дні й знайти підміну"),
  "negotiate-week": authoredFocus("З трьома пʼятницями"),
  "forge-thursday": authoredFocus("Четвер для часу"),
  "bribe-deadline": authoredFocus("Дедлайну 1 золото за мовчання"),
  "read-print": authoredFocus("Адресу порталу в дрібному шрифті"),
  "stamp-closed": authoredFocus("Прохід печаткою"),
  "swap-total": authoredFocus("Суму на «нуль вимірів»"),
  "pay-draft": authoredFocus("2 золотих як мито"),
  "cross-examine": authoredFocus("Лаву про джерела"),
  "out-prophesy": authoredFocus("Кращим пророцтвом"),
  "sand-splinter": authoredFocus("Тріску з даром"),
  "sit-defiantly": authoredFocus("Й витримати правду поставою"),
  "verify-owner": authoredFocus("Підкладку й підпис"),
  "queue-talk": authoredFocus("Плащу талончик"),
  "wear-disguise": authoredFocus("Власника плаща"),
  "challenge-rank": authoredFocus("Право тканини на місце"),
  "agenda": authoredFocus("Порядок денний до вечері"),
  "coalition": authoredFocus("З виделками"),
  "hide-gavel": authoredFocus("Ложку-спікера"),
  "table-knock": authoredFocus("Засідання стуком"),
  "find-angle": authoredFocus("Фізичний кут брехні"),
  "debate-reflection": authoredFocus("З відбиттям"),
  "better-pose": authoredFocus("Дзеркало позою"),
  "cover-listen": authoredFocus("Й підслухати правду"),
  "track-soles": authoredFocus("Маршрут підошов"),
  "offer-expedition": authoredFocus("Їх у безпечну експедицію"),
  "lace-trap": authoredFocus("Шнурки пасткою"),
  "outrun-boots": authoredFocus("Чоботи до дверей"),
  "trace-stamps": authoredFocus("Джерело печаток у сажі"),
  "revoke-license": authoredFocus("Право диму на документи"),
  "clean-evidence": authoredFocus("Акт без втрат"),
  "bribe-smoke": authoredFocus("2 золотих на вентиляцію"),
  "write-rider": authoredFocus("Короткий райдер світла"),
  "applause": authoredFocus("Чергові оплески"),
  "mirror-light": authoredFocus("Відбитим полумʼям"),
  "relight": authoredFocus("Попри профспілку"),
  "genealogy": authoredFocus("Родовід ніжок"),
  "ceremony": authoredFocus("Малу коронацію"),
  "swap-cushion": authoredFocus("Королівську подушку"),
  "sit-down": authoredFocus("До завершення промови"),
  "follow-sweep": authoredFocus("Куди йдуть докази"),
  "evidence-bag": authoredFocus("Кожну смітинку"),
  "plant-decoy": authoredFocus("Фальшивий доказ"),
  "wrestle-broom": authoredFocus("Килим у мітли"),
  "inspect-hinges": authoredFocus("Хто навчив петлі рахувати"),
  "negotiate-toll": authoredFocus("Про перший безкоштовний вихід"),
  "fake-payment": authoredFocus("Монету лише відбиттям"),
  "pay-tip": authoredFocus("1 золото на мастило"),
  "survey-table": authoredFocus("Материк тарілок"),
  "redraw-coast": authoredFocus("Море підливи"),
  "negotiate-border": authoredFocus("З горою кухлів"),
  "wrong-route": authoredFocus("За помилкою до короткого шляху"),
  "decode-whistle": authoredFocus("Свист як шифр"),
  "counter-plan": authoredFocus("Кращу облогу кухні"),
  "cool-it": authoredFocus("Температуру поради"),
  "tea-bribe": authoredFocus("1 золото на добрий чай"),
  "audit-prices": authoredFocus("Хто оцінив тривогу"),
  "feelings": authoredFocus("За дешевшу славу"),
  "change-font": authoredFocus("«наслідки» на «серветки»"),
  "buy-calm": authoredFocus("Малий спокій за 2 золотих"),
  "repair-letters": authoredFocus("Літери на зміну"),
  "shift-talk": authoredFocus("Вивісці вечір без «ч»"),
  "rebrand-decoy": authoredFocus("Тимчасову назву"),
  "hold-straight": authoredFocus("Бізнес-модель руками"),
  "study-paint": authoredFocus("Живу фарбу"),
  "pose-back": authoredFocus("Портрет ніяковіти"),
  "swap-eyes": authoredFocus("Напрям погляду"),
  "cover-history": authoredFocus("Реставрацію"),
  "catalog-locks": authoredFocus("Обхід замків"),
  "ask-key": authoredFocus("Ключ згадати першу любов"),
  "pick-memory": authoredFocus("Памʼять відмичкою"),
  "forge-purpose": authoredFocus("Сенс одним ударом"),
  "recalculate": authoredFocus("Риму, де зламалась сума"),
  "debate-total": authoredFocus("Журнал, що Корчмар не завжди правий"),
  "steal-rhyme": authoredFocus("Риму з підсумку"),
  "perform-balance": authoredFocus("Правильний баланс"),
  "read-pile": authoredFocus("Напрям ворсу"),
  "offer-trade": authoredFocus("Слід на непотрібну таємницю"),
  "pick-rug": authoredFocus("Монету й доказ"),
  "shake-truth": authoredFocus("Правду силою"),
  "trace-call": authoredFocus("Куди йде дзвін"),
  "set-menu": authoredFocus("Про список викликів"),
  "fake-ring": authoredFocus("Звук"),
  "challenge-problem": authoredFocus("Навмисно"),
  "survey-small-print": authoredFocus("Дрібний шрифт анкети"),
  "survey-ink-talk": authoredFocus("З чорнилом про графу"),
  "survey-line-shift": authoredFocus("Межу графи"),
  "survey-stamp-ritual": authoredFocus("Печатку на здоровий глузд"),
  "mug-handle-audit": authoredFocus("Ручку на зайву гордість"),
  "mug-toast-talk": authoredFocus("Тост за прості правила"),
  "mug-foam-switch": authoredFocus("Урочисту піну"),
  "mug-coaster-order": authoredFocus("Підставку за регламентом"),
  "portrait-paint-audit": authoredFocus("Живу фарбу в портреті"),
  "portrait-pose-back": authoredFocus("Портрет позою"),
  "portrait-frame-shift": authoredFocus("Кут рамки"),
  "portrait-restoration": authoredFocus("Реставрацію"),
  "manual-footnote": authoredFocus("Примітку, яка втекла в практику"),
  "manual-lecture": authoredFocus("Підручнику межі уроку"),
  "manual-example-swap": authoredFocus("Надто живий приклад"),
  "manual-bookmark": authoredFocus("Закладку до розділу"),
  "uniform-grid-audit": authoredFocus("Вперту клітинку"),
  "uniform-office-talk": authoredFocus("З канцелярським краєм"),
  "uniform-margin-trick": authoredFocus("Запасне поле"),
  "uniform-stamp-order": authoredFocus("Розширення клітинки"),
  "exam-read-rubric": authoredFocus("Критерії іспиту"),
  "exam-appeal": authoredFocus("Апеляцію до здорового глузду"),
  "exam-question-swap": authoredFocus("Місцями питання й відповідь"),
  "exam-ritual-silence": authoredFocus("Ритуал тиші в аудиторії"),
  "title-ledger-read": authoredFocus("Титул у журналі слави"),
  "title-queue-talk": authoredFocus("З чергою пошани"),
  "title-ribbon-trick": authoredFocus("Стрічки урочистости"),
  "title-stamp-ceremony": authoredFocus("Малу церемонію печатки"),
  "skim-foam": authoredFocus("Найгучнішу піну окремою ложкою"),
  "tap-bottom": authoredFocus("Дно на таємну кімнату"),
  "polish-visor": authoredFocus("Забрало до чесної версії"),
  "pin-week": authoredFocus("Тиждень до стіни доказів"),
  "fold-corner": authoredFocus("Кут порталу в кишеньковий формат"),
  "cushion-witness": authoredFocus("Подушку як мʼякого свідка"),
  "stitch-shadow": authoredFocus("Тінь плаща до правильного гачка"),
  "count-quorum": authoredFocus("Кворум ложок до десерту"),
  "pad-frame": authoredFocus("Раму рукавицею правди"),
  "oil-soles": authoredFocus("Підошви проти відпусткових планів"),
  "jar-soot": authoredFocus("Сажу в банку з етикеткою"),
  "trim-wick": authoredFocus("Ґніт до робочого настрою"),
  "measure-legs": authoredFocus("Ніжки на змову меблів"),
  "braid-bristles": authoredFocus("Щетину в мирну косу"),
  "oil-hinge": authoredFocus("Завісу замість платити мито"),
  "pin-thread-route": authoredFocus("Нитку через безпечний маршрут"),
  "hold-lid": authoredFocus("Кришку під час мирних переговорів"),
  "blot-price": authoredFocus("Цінник серветкою доказів"),
  "chalk-fish": authoredFocus("Рибі офіційний напрямок"),
  "clean-frame": authoredFocus("Раму від зайвого підморгування"),
  "warm-teeth": authoredFocus("Зубці над тихим полумʼям"),
  "bookmark-debt": authoredFocus("Борг серветкою з правильним римуванням"),
  "pin-corner": authoredFocus("Кут, який знає забагато"),
  "pad-clapper": authoredFocus("Язичок дзвінка рукавицею"),
  "survey-fold-corner": authoredFocus("Кут анкети під правильну графу"),
  "mug-steady-handle": authoredFocus("Ручку кухля підставкою"),
  "portrait-varnish-knock": authoredFocus("Лаком по краю рами"),
  "manual-bookmark-risk": authoredFocus("Сторінку небезпечним прикладом"),
  "uniform-pin-cuff": authoredFocus("Манжет під потрібну клітинку"),
  "exam-scratch-margin": authoredFocus("Відповідь на полях іспиту"),
  "title-knot-crest": authoredFocus("Стрічку титулу на доказі"),
} as const satisfies Record<string, AuthoredMethodFocus>;

function authoredFocus(focus: string): AuthoredMethodFocus {
  return {
    strong: `${focus} знаходить точний робочий кут.`,
    success: `${focus} тримає справу достатньо міцно.`,
    mixed: `${focus} майже складає порядок.`,
    complication: `${focus} зривається у найгострішому місці.`
  };
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
    method("forge-thursday", "🗝️ Підробити четвер для часу", "Непевний трюк, можна постраждати від часу.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous", "minor-injury"),
    method("bribe-deadline", "🪙 Дати дедлайну 1 золото за мовчання", "Коштує 1 золото. Майже надійно.", "bribe", ["bribery"], "charisma", "luck", 78, "modest", "gold-cost-success", 1)
  ]),
  receipt: scene("чек", "Портал закрився, протяг лишив рахунок.", "З іншого боку вилізла істота з печаткою.", [
    method("read-print", "🔎 Знайти адресу порталу в дрібному шрифті", "Ретельно, винагорода скромніша.", "investigate", ["investigation"], "intelligence", "luck", 71, "modest"),
    method("stamp-closed", "📋 Закрити прохід печаткою", "Авторитет і папір, звичайна винагорода.", "ritual", ["authority"], "intelligence", "charisma", 66, "standard", undefined, undefined, "skill.form-thirteen-b"),
    method("swap-total", "🗝️ Підмінити суму на «нуль вимірів»", "Ризиковий обман: може пустити щось із-за чека.", "deceive", ["deception"], "dexterity", "charisma", 59, "generous", "fight-handoff"),
    method("pay-draft", "🪙 Кинути 2 золотих як мито", "Коштує 2 золота. Добрі шанси.", "bribe", ["bribery"], "charisma", "luck", 76, "modest", "gold-cost-success", 2)
  ]),
  bench: scene("лаву", "Пророцтво замовкло, лишивши пораду про шкарпетки.", "Лава сказала зайве, і тепер усім ніяково.", [
    method("cross-examine", "📋 Допитати лаву про джерела", "Розумний тиск без бійки.", "investigate", ["authority", "investigation"], "intelligence", "charisma", 68, "standard"),
    method("out-prophesy", "🎵 Відповісти кращим пророцтвом", "Сценічно й трохи непевно.", "negotiate", ["performance"], "charisma", "luck", 62, "standard"),
    method("sand-splinter", "🪡 Прибрати тріску з даром", "Точна робота, скромна винагорода.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 70, "modest"),
    method("sit-defiantly", "💪 Сісти й витримати правду поставою", "Грубо, смішно, небезпечно для гідности й спини.", "fight", ["force"], "strength", "luck", 57, "generous", "minor-injury")
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
    method("table-knock", "💪 Закрити засідання стуком", "Прямо й гучно, небезпечно для пальців.", "fight", ["force"], "strength", "luck", 58, "generous", "minor-injury")
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
    method("lace-trap", "🪤 Звʼязати шнурки пасткою", "Точний трюк, можна впасти разом із доказом.", "craft", ["traps"], "dexterity", "intelligence", 62, "generous", "minor-injury"),
    method("outrun-boots", "💪 Перегнати чоботи до дверей", "Гучно й ризиковано, можна добряче забитись.", "fight", ["force"], "strength", "dexterity", 57, "generous", "serious-injury")
  ]),
  chimney: scene("комин", "Довідки зупинились, одна лишилась на героя.", "Сажа склалась у службову істоту.", [
    method("trace-stamps", "🔎 Знайти джерело печаток у сажі", "Надійне розслідування.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("revoke-license", "📋 Відкликати право диму на документи", "Авторитет і дим; може покликати сажову істоту.", "ritual", ["authority"], "intelligence", "charisma", 66, "standard", "fight-handoff"),
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
    method("fake-payment", "🗝️ Показати монету лише відбиттям", "Обман без витрат, але двері можуть клацнути по пальцях.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous", "minor-injury"),
    method("pay-tip", "🪙 Дати 1 золото на мастило", "Коштує 1 золото. Надійно, без обіцянки правильного виходу.", "bribe", ["bribery"], "charisma", "luck", 78, "modest", "gold-cost-success", 1)
  ]),
  map: scene("мапу", "Мапа правильна, але позначає героя стихійним лихом.", "Експедиція з мапи просить супровід.", [
    method("survey-table", "🔎 Переміряти материк тарілок", "Точна географія столу.", "investigate", ["tracking"], "intelligence", "dexterity", 69, "standard"),
    method("redraw-coast", "🪡 Виправити море підливи", "Ремесло й точність.", "craft", ["craft"], "dexterity", "intelligence", 65, "standard"),
    method("negotiate-border", "🤝 Домовитися з горою кухлів", "Дипломатія посуду.", "negotiate", ["persuasion"], "charisma", "intelligence", 64, "standard"),
    method("wrong-route", "🌾 Піти за помилкою до короткого шляху", "Вдача бере кермо; може привести до бійки.", "sneak", ["improvisation"], "luck", "dexterity", 58, "generous", "fight-handoff")
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
    method("change-font", "🗝️ Підмінити «наслідки» на «серветки»", "Ризиковий шрифт, можна порізатись об цінник.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 59, "generous", "minor-injury"),
    method("buy-calm", "🪙 Купити малий спокій за 2 золотих", "Коштує 2 золота. Надійно.", "bribe", ["bribery"], "charisma", "luck", 78, "modest", "gold-cost-success", 2)
  ]),
  sign: scene("вивіску", "«Корчма» повернулась, риба лишила заявку.", "Публіка заплуталась і просить компенсацію.", [
    method("repair-letters", "🪡 Повернути літери на зміну", "Ремонт із розумом.", "craft", ["craft"], "intelligence", "dexterity", 69, "standard"),
    method("shift-talk", "🤝 Дати вивісці вечір без «ч»", "Переговори з буквами.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("rebrand-decoy", "🗝️ Повісити тимчасову назву", "Обман і стиль.", "deceive", ["deception"], "dexterity", "charisma", 59, "generous"),
    method("hold-straight", "💪 Втримати бізнес-модель руками", "Силовий аргумент, небезпечно для пальців.", "fight", ["force"], "strength", "luck", 56, "generous", "minor-injury")
  ]),
  portrait: scene("портрет", "Портрет чемний, але підморгує лише Корчмарю.", "Намальований герой ступив із рами.", [
    method("study-paint", "🔎 Знайти живу фарбу", "Розслідування мистецтва.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("pose-back", "🎭 Змусити портрет ніяковіти", "Сцена проти сцени; може витягти фарбу з рами.", "negotiate", ["performance"], "charisma", "luck", 63, "standard", "fight-handoff"),
    method("swap-eyes", "🗝️ Змінити напрям погляду", "Точний обман.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 60, "generous"),
    method("cover-history", "📋 Оголосити реставрацію", "Авторитетна тканина.", "ritual", ["authority"], "charisma", "intelligence", 66, "standard")
  ]),
  key: scene("ключ", "Потрібний замок відкрито, ключ тепер закриває пісні.", "Неправильні двері відчинили неправильну пригоду.", [
    method("catalog-locks", "🔎 Провести обхід замків", "Ретельна інвентаризація.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
    method("ask-key", "🤝 Переконати ключ згадати першу любов", "Дипломатія металу.", "negotiate", ["persuasion"], "charisma", "intelligence", 65, "standard"),
    method("pick-memory", "🗝️ Відкрити памʼять відмичкою", "Точний трюк, можна вколотись чужим спогадом.", "sneak", ["finesse"], "dexterity", "intelligence", 60, "generous", "minor-injury"),
    method("forge-purpose", "💪 Перекувати сенс одним ударом", "Сила і ремесло, можна серйозно вдарити не той сенс.", "craft", ["force", "craft"], "strength", "intelligence", 57, "generous", "serious-injury")
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
  const sceneMethods = [...seed.methods, ...buildSceneNativeTopUpMethods(input.problemId)];
  const methods = [
    ...sceneMethods.map((methodSeed) => materializeSceneMethod(input.title, seed, methodSeed)),
    ...buildRaceMethods(input.character, input.title, { ...seed, methods: sceneMethods }),
    ...buildClassMethods(input.character, input.title, { ...seed, methods: sceneMethods }),
    ...buildSignatureMethods(input.character, input.title, { ...seed, methods: sceneMethods })
  ];

  return {
    sceneId: input.problemId,
    sceneTitle: input.title,
    sceneObject: seed.object,
    sceneObjectGenitive: seed.objectGenitive,
    methods
  };
}

export function getGeneralAdventureResolutionProblemIds(): readonly string[] {
  return Object.keys(GENERAL_SCENE_SEEDS);
}

function buildGeneratedSceneSeed(problemId: string): AdventureSceneSeed {
  if (problemId.startsWith("race-") && problemId.endsWith("-survey")) {
    return generated("survey");
  }

  if (problemId.startsWith("race-") && problemId.endsWith("-mug")) {
    return generated("mug");
  }

  if (problemId.startsWith("race-") && problemId.endsWith("-portrait")) {
    return generated("portrait");
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-manual")) {
    return generated("manual");
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-uniform")) {
    return generated("uniform");
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-exam")) {
    return generated("exam");
  }

  return generated("title");
}

type GeneratedSceneKind = "survey" | "mug" | "portrait" | "manual" | "uniform" | "exam" | "title";

function generated(kind: GeneratedSceneKind): AdventureSceneSeed {
  const generatedSeeds = {
    survey: scene("анкету", "анкети", "Анкета повернулась у графу, але просить громадянство.", "Папір подав апеляцію чорнилом.", [
      method("survey-small-print", "🔎 Вичитати дрібний шрифт анкети", "Ретельна перевірка паперу.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("survey-ink-talk", "🤝 Домовитися з чорнилом про графу", "Переговори з канцелярією.", "negotiate", ["persuasion"], "charisma", "intelligence", 64, "standard"),
      method("survey-line-shift", "🗝️ Посунути межу графи", "Точний трюк із лінійкою, можна порізатись папером.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 58, "generous", "minor-injury"),
      method("survey-stamp-ritual", "📋 Поставити печатку на здоровий глузд", "Паперова церемонія.", "ritual", ["authority", "ritual"], "charisma", "intelligence", 62, "standard")
    ]),
    mug: scene("кухоль", "кухля", "Кухоль визнав інструктаж, але просить підставку.", "Посуд скликав церемонію без дозволу.", [
      method("mug-handle-audit", "🔎 Перевірити ручку на зайву гордість", "Ретельна посудна перевірка.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("mug-toast-talk", "🤝 Підняти тост за прості правила", "Дипломатія з піною.", "negotiate", ["persuasion", "performance"], "charisma", "intelligence", 64, "standard"),
      method("mug-foam-switch", "🗝️ Підмінити урочисту піну", "Непевний барний трюк, можна отримати ручкою по пальцях.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous", "minor-injury"),
      method("mug-coaster-order", "🪵 Видати підставку за регламентом", "Ремесло й порядок.", "craft", ["craft", "authority"], "dexterity", "intelligence", 62, "standard")
    ]),
    portrait: scene("портрет", "портрета", "Рама витримала героїчність, але просить перерву.", "Фарба почала сперечатись окремо.", [
      method("portrait-paint-audit", "🔎 Знайти живу фарбу в портреті", "Мистецьке розслідування.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("portrait-pose-back", "🎭 Переграти портрет позою", "Сцена проти рами.", "negotiate", ["performance"], "charisma", "luck", 64, "standard"),
      method("portrait-frame-shift", "🗝️ Змінити кут рамки", "Точний обман для ока; фарба може вийти назовні.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 58, "generous", "fight-handoff"),
      method("portrait-restoration", "📋 Оголосити реставрацію", "Авторитетна тканина.", "ritual", ["authority"], "charisma", "intelligence", 62, "standard")
    ]),
    manual: scene("підручник", "підручника", "Підручник склав себе на трійку з плюсом.", "Практика втекла з прикладів.", [
      method("manual-footnote", "🔎 Знайти примітку, яка втекла в практику", "Розумна перевірка сторінок.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("manual-lecture", "🤝 Пояснити підручнику межі уроку", "Переговори з теорією.", "negotiate", ["persuasion", "authority"], "charisma", "intelligence", 64, "standard"),
      method("manual-example-swap", "🗝️ Підмінити надто живий приклад", "Ризиковий трюк із полями, можна отримати закладкою по носі.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous", "minor-injury"),
      method("manual-bookmark", "🪡 Пришити закладку до розділу", "Точна реміснича правка.", "craft", ["craft"], "dexterity", "intelligence", 62, "standard")
    ]),
    uniform: scene("форму", "форми", "Клітинка розширилась, але називає це реформою.", "Бланк вимагає додаткового додатку.", [
      method("uniform-grid-audit", "🔎 Переміряти вперту клітинку", "Точна перевірка бланка.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("uniform-office-talk", "🤝 Домовитися з канцелярським краєм", "Дипломатія полів.", "negotiate", ["persuasion"], "charisma", "intelligence", 64, "standard"),
      method("uniform-margin-trick", "🗝️ Підсунути запасне поле", "Непевний трюк із форматом, можна встрягнути в клітинку.", "deceive", ["deception", "craft"], "dexterity", "charisma", 58, "generous", "minor-injury"),
      method("uniform-stamp-order", "📋 Узаконити розширення клітинки", "Печатка й порядок.", "ritual", ["authority"], "charisma", "intelligence", 62, "standard")
    ]),
    exam: scene("іспит", "іспиту", "Іспит визнав героя питанням підвищеної складности.", "Викладач попросив перездачу реальности.", [
      method("exam-read-rubric", "🔎 Вичитати критерії іспиту", "Ретельний розбір умов.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("exam-appeal", "🤝 Подати апеляцію до здорового глузду", "Переговори з оцінюванням.", "negotiate", ["persuasion", "authority"], "charisma", "intelligence", 64, "standard"),
      method("exam-question-swap", "🗝️ Поміняти місцями питання й відповідь", "Непевний фокус із білетом, можна постраждати від оцінювання.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous", "minor-injury"),
      method("exam-ritual-silence", "🕯️ Провести ритуал тиші в аудиторії", "Містично, але без мани.", "ritual", ["ritual"], "charisma", "intelligence", 62, "standard")
    ]),
    title: scene("титул", "титулу", "Черга прийняла титул, але просить печатку слави.", "Журнал почав питати, чи репутація має ноги.", [
      method("title-ledger-read", "🔎 Знайти титул у журналі слави", "Ретельний пошук репутації.", "investigate", ["investigation"], "intelligence", "luck", 70, "modest"),
      method("title-queue-talk", "🤝 Домовитися з чергою пошани", "Переговори без фанфар.", "negotiate", ["persuasion"], "charisma", "intelligence", 64, "standard"),
      method("title-ribbon-trick", "🗝️ Переплутати стрічки урочистости", "Непевний трюк зі славою, можна зачепити репутацію й лікоть.", "deceive", ["deception"], "dexterity", "charisma", 58, "generous", "minor-injury"),
      method("title-stamp-ceremony", "📋 Провести малу церемонію печатки", "Офіційно й трохи смішно.", "ritual", ["authority", "performance"], "charisma", "intelligence", 62, "standard")
    ])
  } satisfies Record<GeneratedSceneKind, AdventureSceneSeed>;

  return generatedSeeds[kind];
}

function buildSceneNativeTopUpMethods(problemId: string): readonly AdventureMethodSeed[] {
  const generatedKind = getGeneratedSceneKind(problemId);
  const topUpMethods: Record<string, AdventureMethodSeed> = {
    stew: method("skim-foam", "🥄 Зняти найгучнішу піну окремою ложкою", "Обережно, але можна обпекти пальці.", "craft", ["craft"], "dexterity", "intelligence", 64, "standard", "minor-injury"),
    barrel: method("tap-bottom", "🪵 Вистукати дно на таємну кімнату", "Ремесло й підозра, без виселення силою.", "investigate", ["craft", "investigation"], "intelligence", "dexterity", 66, "standard"),
    helmet: method("polish-visor", "🪞 Відполірувати забрало до чесної версії", "Точно, але стара слава може вдарити відблиском.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 62, "standard", "minor-injury"),
    calendar: method("pin-week", "📌 Пришпилити тиждень до стіни доказів", "Канцелярська точність без сварки з пʼятницями.", "craft", ["authority", "craft"], "intelligence", "dexterity", 66, "standard"),
    receipt: method("fold-corner", "🧾 Загнути кут порталу в кишеньковий формат", "Точний паперовий трюк, небезпечний для пальців.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 62, "standard", "minor-injury"),
    bench: method("cushion-witness", "🧵 Підкласти подушку як мʼякого свідка", "Тихий доказ без героїчної посадки.", "craft", ["domesticity", "investigation"], "dexterity", "charisma", 66, "modest"),
    cloak: method("stitch-shadow", "🧵 Пришити тінь плаща до правильного гачка", "Тканина слухає, голка інколи сперечається.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 62, "standard", "minor-injury"),
    spoon: method("count-quorum", "📋 Перерахувати кворум ложок до десерту", "Порядок денний без стуку по столу.", "investigate", ["authority", "investigation"], "intelligence", "charisma", 66, "modest"),
    mirror: method("pad-frame", "🧤 Притримати раму рукавицею правди", "Обережний трюк зі склом, можна постраждати.", "craft", ["craft", "force"], "strength", "intelligence", 61, "standard", "minor-injury"),
    boots: method("oil-soles", "🛢️ Змастити підошви проти відпусткових планів", "Практично й менш героїчно за погоню.", "craft", ["craft", "tracking"], "intelligence", "dexterity", 65, "standard"),
    chimney: method("jar-soot", "🏺 Зібрати сажу в банку з етикеткою", "Ремесло й акт приймання, можна забруднитися до синця.", "craft", ["craft", "authority"], "dexterity", "intelligence", 62, "standard", "minor-injury"),
    candle: method("trim-wick", "✂️ Підрізати ґніт до робочого настрою", "Точно, гаряче, небезпечно для пальців.", "craft", ["craft", "arcana"], "dexterity", "intelligence", 61, "standard", "minor-injury"),
    chair: method("measure-legs", "📏 Виміряти ніжки на змову меблів", "Розслідування без негайного виклику варти.", "investigate", ["investigation", "craft"], "intelligence", "dexterity", 67, "standard"),
    broom: method("braid-bristles", "🧹 Заплести щетину в мирну косу", "Ремесло з ризиком отримати мітлою по пальцях.", "craft", ["craft", "domesticity"], "charisma", "luck", 62, "standard", "minor-injury"),
    door: method("oil-hinge", "🛢️ Змастити завісу замість платити мито", "Практичний трюк, завіса може клацнути у відповідь.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 62, "standard", "minor-injury"),
    map: method("pin-thread-route", "🧵 Протягнути нитку через безпечний маршрут", "Слідопитство без короткого шляху навмання.", "investigate", ["tracking", "traps"], "dexterity", "intelligence", 66, "standard"),
    teapot: method("hold-lid", "🫖 Притримати кришку під час мирних переговорів", "Обережно з парою, можна постраждати.", "craft", ["craft", "arcana"], "dexterity", "intelligence", 61, "standard", "minor-injury"),
    menu: method("blot-price", "🖋️ Промокнути цінник серветкою доказів", "Тонка робота без переписування наслідків.", "craft", ["craft", "investigation"], "dexterity", "intelligence", 66, "standard"),
    sign: method("chalk-fish", "🖍️ Домалювати рибі офіційний напрямок", "Ремонт із дрібною дипломатією.", "craft", ["craft", "persuasion"], "dexterity", "charisma", 66, "standard"),
    portrait: method("clean-frame", "🧽 Витерти раму від зайвого підморгування", "Обережно, фарба не любить свідків.", "craft", ["craft", "investigation"], "dexterity", "intelligence", 64, "standard", "minor-injury"),
    key: method("warm-teeth", "🔥 Нагріти зубці над тихим полумʼям", "Точна робота з металом, пальцям непевно.", "craft", ["craft", "arcana"], "intelligence", "dexterity", 61, "standard", "minor-injury"),
    ledger: method("bookmark-debt", "🔖 Закласти борг серветкою з правильним римуванням", "Канцелярія без округлення кулаком, але папір ріже пальці.", "craft", ["authority", "craft"], "dexterity", "charisma", 62, "standard", "minor-injury"),
    rug: method("pin-corner", "📌 Пришпилити кут, який знає забагато", "Текстильна точність, можна вколоти гордість.", "craft", ["craft", "traps"], "intelligence", "dexterity", 62, "standard", "minor-injury"),
    bell: method("pad-clapper", "🧤 Обгорнути язичок дзвінка рукавицею", "Тихо, але дзвінок може вкусити звуком.", "craft", ["craft", "finesse"], "dexterity", "luck", 62, "standard", "minor-injury"),
    survey: method("survey-fold-corner", "📎 Загнути кут анкети під правильну графу", "Папір мирний лише здалеку; можна порізатися.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 61, "standard", "minor-injury"),
    mug: method("mug-steady-handle", "☕ Утримати ручку кухля підставкою", "Посудна інженерія без урочистого тосту, ручка може вдарити по пальцях.", "craft", ["craft", "domesticity"], "strength", "intelligence", 62, "standard", "minor-injury"),
    portraitFamily: method("portrait-varnish-knock", "🖼️ Постукати лаком по краю рами", "Може покликати того, хто сидить у портреті.", "ritual", ["ritual", "force"], "strength", "luck", 58, "generous", "fight-handoff"),
    manual: method("manual-bookmark-risk", "🔖 Закласти сторінку небезпечним прикладом", "Паперова педагогіка, можна постраждати від правила.", "craft", ["authority", "craft"], "intelligence", "dexterity", 61, "standard", "minor-injury"),
    uniform: method("uniform-pin-cuff", "📌 Підігнути манжет під потрібну клітинку", "Кравецький ризик для пальців.", "craft", ["craft", "finesse"], "dexterity", "intelligence", 61, "standard", "minor-injury"),
    exam: method("exam-scratch-margin", "✏️ Видряпати відповідь на полях іспиту", "Нервово, паперово, небезпечно для пальців.", "deceive", ["deception", "craft"], "dexterity", "intelligence", 59, "generous", "minor-injury"),
    title: method("title-knot-crest", "🎗️ Завʼязати стрічку титулу на доказі", "Стильно, але вузол може затягнутися.", "craft", ["authority", "craft"], "strength", "dexterity", 61, "standard", "minor-injury")
  };
  const key = generatedKind === "portrait" ? "portraitFamily" : generatedKind;
  const selected = topUpMethods[problemId] ?? (key ? topUpMethods[key] : undefined);

  return selected ? [selected] : [];
}

function getGeneratedSceneKind(problemId: string): GeneratedSceneKind | null {
  if (problemId.startsWith("race-") && problemId.endsWith("-survey")) {
    return "survey";
  }

  if (problemId.startsWith("race-") && problemId.endsWith("-mug")) {
    return "mug";
  }

  if (problemId.startsWith("race-") && problemId.endsWith("-portrait")) {
    return "portrait";
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-manual")) {
    return "manual";
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-uniform")) {
    return "uniform";
  }

  if (problemId.startsWith("class-") && problemId.endsWith("-exam")) {
    return "exam";
  }

  return "title";
}

function scene(
  object: string,
  objectGenitiveOrMixed: string,
  mixedOrComplication: string,
  complicationOrMethods: string | readonly AdventureMethodSeed[],
  maybeMethods?: readonly AdventureMethodSeed[]
): AdventureSceneSeed {
  const objectGenitive = maybeMethods ? objectGenitiveOrMixed : object;
  const mixed = maybeMethods ? mixedOrComplication : objectGenitiveOrMixed;
  const complication = maybeMethods ? complicationOrMethods as string : mixedOrComplication;
  const methods = maybeMethods ?? complicationOrMethods as readonly AdventureMethodSeed[];

  return { object, objectGenitive, mixed, complication, methods };
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
  const consequenceKind = consequence ?? "cosmetic-mess";

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
    ...(combatSkillId ? { combatSkillId } : {}),
    outcomes: buildMethodOutcomeBeats({
      id,
      consequence: consequenceKind
    })
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
    callbackKey: toQuestCallbackKey(seed.id),
    affordanceId: seed.id,
    source: "scene",
    label: seed.label,
    hint: withRiskHint(seed.hint, consequence),
    intent: seed.intent,
    techniques: seed.techniques,
    primaryStat: seed.primaryStat,
    ...(seed.secondaryStat ? { secondaryStat: seed.secondaryStat } : {}),
    baseChance: seed.baseChance,
    rewardProfile: seed.rewardProfile,
    ...(seed.cost ? { goldCost: seed.cost } : {}),
    ...(seed.combatSkillId ? { combatSkillId: seed.combatSkillId } : {}),
    consequenceByGrade: consequences(consequence),
    outcomeText: buildSceneOutcomeText(sceneTitle, sceneSeed, seed)
  };
}

function buildRaceMethods(character: CharacterSummary, sceneTitle: string, sceneSeed: AdventureSceneSeed): QuestMethodDefinition[] {
  const profile = getRaceProfile(character.raceId);
  const raceKey = getCompactRaceKey(character.raceId);

  return sceneSeed.methods.map((seed) => buildProfileMethod({
    id: compactPersonalMethodId("r", raceKey, seed.id),
    source: "race",
    label: seed.label,
    buttonLabel: seed.label,
    hint: buildProfileHint(seed, "race"),
    sceneTitle,
    sceneSeed,
    profile,
    seed,
    rewardProfile: "standard",
    profileKind: "race"
  }));
}

function buildClassMethods(character: CharacterSummary, sceneTitle: string, sceneSeed: AdventureSceneSeed): QuestMethodDefinition[] {
  const profile = getClassProfile(character.classId);
  const classKey = getCompactClassKey(character.classId);

  return sceneSeed.methods.map((seed) => buildProfileMethod({
    id: compactPersonalMethodId("c", classKey, seed.id),
    source: "class",
    label: seed.label,
    buttonLabel: seed.label,
    hint: buildProfileHint(seed, "class"),
    sceneTitle,
    sceneSeed,
    profile,
    seed,
    rewardProfile: "standard",
    profileKind: "class"
  }));
}

function buildSignatureMethods(character: CharacterSummary, sceneTitle: string, sceneSeed: AdventureSceneSeed): QuestMethodDefinition[] {
  const raceProfile = getRaceProfile(character.raceId);
  const classProfile = getClassProfile(character.classId);
  const raceKey = getCompactRaceKey(character.raceId);
  const classKey = getCompactClassKey(character.classId);

  return sceneSeed.methods.map((seed) => {
    const id = compactPersonalMethodId(`s${raceKey}`, classKey, seed.id);
    const techniques = uniqueTechniques([
      firstTechnique(raceProfile),
      firstTechnique(classProfile),
      ...seed.techniques
    ]);

    return {
      id,
      callbackKey: toQuestCallbackKey(id),
      affordanceId: seed.id,
      source: "signature",
      label: seed.label,
      buttonLabel: seed.label,
      hint: buildProfileHint(seed, "signature"),
      intent: seed.intent,
      techniques,
      primaryStat: seed.primaryStat,
      ...(classProfile.primaryStat !== seed.primaryStat ? { secondaryStat: classProfile.primaryStat } : {}),
      baseChance: Math.max(54, Math.min(66, seed.baseChance - 4)),
      rewardProfile: "generous",
      ...(seed.cost ? { goldCost: seed.cost } : {}),
      ...(classProfile.combatSkillId ?? seed.combatSkillId ? { combatSkillId: classProfile.combatSkillId ?? seed.combatSkillId } : {}),
      consequenceByGrade: consequences(seed.consequence ?? "cosmetic-mess"),
      outcomeText: buildProfileOutcomeText({
        sceneTitle,
        sceneSeed,
        seed,
        identity: buildSignatureIdentityBeat(raceProfile, classProfile, character.title ?? null)
      })
    };
  });
}

function buildProfileMethod(input: {
  id: string;
  source: "race" | "class";
  label: string;
  buttonLabel: string;
  hint: string;
  sceneTitle: string;
  sceneSeed: AdventureSceneSeed;
  profile: QuestTechniqueProfile;
  seed: AdventureMethodSeed;
  rewardProfile: QuestRewardProfile;
  profileKind: "race" | "class";
}): QuestMethodDefinition {
  const techniques = uniqueTechniques([firstTechnique(input.profile), ...input.seed.techniques]);

  return {
    id: input.id,
    callbackKey: toQuestCallbackKey(input.id),
    affordanceId: input.seed.id,
    source: input.source,
    label: input.label,
    buttonLabel: input.buttonLabel,
    hint: buildProfileHint(input.seed, input.profileKind),
    intent: input.seed.intent,
    techniques,
    primaryStat: input.seed.primaryStat,
    ...(input.profile.primaryStat !== input.seed.primaryStat ? { secondaryStat: input.profile.primaryStat } : {}),
    baseChance: Math.max(54, Math.min(72, input.seed.baseChance + (input.profileKind === "class" ? 1 : 0))),
    rewardProfile: input.rewardProfile,
    ...(input.seed.cost ? { goldCost: input.seed.cost } : {}),
    ...(input.profile.combatSkillId ?? input.seed.combatSkillId ? { combatSkillId: input.profile.combatSkillId ?? input.seed.combatSkillId } : {}),
    consequenceByGrade: consequences(input.seed.consequence ?? "cosmetic-mess"),
    outcomeText: buildProfileOutcomeText({
      sceneTitle: input.sceneTitle,
      sceneSeed: input.sceneSeed,
      seed: input.seed,
      identity: buildTechniqueIdentityBeat(input.profile, input.profileKind)
    })
  };
}

function getRaceProfile(raceId: string): QuestTechniqueProfile {
  return raceTechniqueProfiles[raceId] ?? raceTechniqueProfiles["race.human-ish"]!;
}

function getClassProfile(classId: string): QuestTechniqueProfile {
  return classTechniqueProfiles[classId] ?? classTechniqueProfiles["class.warrior"]!;
}

function firstTechnique(profile: QuestTechniqueProfile): QuestTechniqueId {
  return profile.techniques[0] ?? "investigation";
}

function consequences(complication: QuestConsequenceKind): Record<QuestResolutionGrade, QuestConsequenceKind> {
  return {
    "strong-success": "full-reward",
    success: "full-reward",
    "mixed-success": "reduced-reward",
    complication
  };
}

function buildSceneOutcomeText(
  sceneTitle: string,
  _sceneSeed: Pick<AdventureSceneSeed, "object" | "objectGenitive" | "mixed" | "complication">,
  seed: AdventureMethodSeed
): Record<QuestResolutionGrade, QuestMethodOutcomeText> {
  const beats = seed.outcomes;

  return buildOutcomeText({
    sceneTitle,
    label: seed.label,
    strong: beats.strong,
    success: beats.success,
    mixed: beats.mixed,
    complication: beats.complication
  });
}

function buildProfileOutcomeText(input: {
  sceneTitle: string;
  sceneSeed: Pick<AdventureSceneSeed, "object" | "objectGenitive" | "mixed" | "complication">;
  seed: AdventureMethodSeed;
  identity: {
    strong: string;
    success: string;
    mixed: string;
    complication: string;
  };
}): Record<QuestResolutionGrade, QuestMethodOutcomeText> {
  const beats = input.seed.outcomes;

  return buildOutcomeText({
    sceneTitle: input.sceneTitle,
    label: input.seed.label,
    strong: `${beats.strong} ${input.identity.strong}`,
    success: `${beats.success} ${input.identity.success}`,
    mixed: `${beats.mixed} ${input.identity.mixed}`,
    complication: `${beats.complication} ${input.identity.complication}`
  });
}

function buildMethodOutcomeBeats(input: {
  id: string;
  consequence: QuestConsequenceKind;
}): AdventureOutcomeBeats {
  const override = getMethodOutcomeOverride(input.id);

  if (override) {
    return override;
  }

  const focus = getAuthoredMethodFocus(input.id);
  const complication = buildMethodComplicationBeat(input.consequence, focus);

  return {
    strong: `${focus.strong} Сцена складається без зайвого клею і не просить перекладу з жестів.`,
    success: `${focus.success} Безлад стишується достатньо, щоб Корчмар не відкривав другу справу.`,
    mixed: `${focus.mixed} Результат є, але дрібна претензія ще шарудить під столом.`,
    complication
  };
}

interface AuthoredMethodFocus {
  strong: string;
  success: string;
  mixed: string;
  complication: string;
}

function getAuthoredMethodFocus(id: string): AuthoredMethodFocus {
  const focus = (AUTHORED_METHOD_FOCUS as Record<string, AuthoredMethodFocus>)[id];

  if (!focus) {
    throw new Error(`Missing authored adventure outcome focus for method ${id}.`);
  }

  return focus;
}

function buildMethodComplicationBeat(
  consequence: QuestConsequenceKind,
  focus: AuthoredMethodFocus
): string {
  if (consequence === "fight-handoff") {
    return `${focus.complication} Із-за сцени виходить той, хто пояснює наслідки кулаками.`;
  }

  if (consequence === "serious-injury") {
    return `${focus.complication} Герой платить за це добрим ударом по здоровʼю.`;
  }

  if (consequence === "minor-injury") {
    return `${focus.complication} Пальці або лікоть одразу записують урок у здоровʼя.`;
  }

  if (consequence === "gold-cost-success") {
    return `${focus.complication} Внесок прийнято, але платний дрібний шрифт лишається в протоколі.`;
  }

  if (consequence === "xp-only") {
    return `${focus.complication} Урок є, а монети розходяться на пояснення.`;
  }

  if (consequence === "reduced-reward") {
    return `${focus.complication} Результат лишається, проте винагорода помітно худне.`;
  }

  return `${focus.complication} Відповідь є, але на підлозі лишається безлад із власною думкою.`;
}

function getMethodOutcomeOverride(id: string): AdventureOutcomeBeats | undefined {
  return ({
  "inspect-staves": {
    strong: "Огляд клепок знаходить крихітний житловий зазор і одразу показує, хто там підписувався тирсою.",
    success: "Клепки видають адресу мешканця; бочка стишується, бо доказ уже стукає зсередини.",
    mixed: "Мешканця знайдено, проте він вимагає визнати тишу службовим приміщенням.",
    complication: "Стук по клепках будить сусіда між дошками, і бочка починає відповідати не тим голосом."
  },
  "sign-lease": {
    strong: "Орендна угода ловить порожнечу в пункті про спільну тишу й закриває суперечку печаткою.",
    success: "Порожнеча отримує правила проживання, бочка отримує спокій, а Корчмар — копію з підписом.",
    mixed: "Угоду підписано, але дрібний підпункт лишає бочці право бурчати після опівночі.",
    complication: "Папери надають порожнечі забагато прав, і вона просить окрему полицю для свого ніщо."
  },
  "bribe-cork": {
    strong: "Корок приймає заставу, змінює умови тиші й урочисто вдає, що це не хабар.",
    success: "Дві монети створюють малий фонд спокою; бочка стихає, внесок лишається в обігу.",
    mixed: "Застава працює, але корок відкладає частину суми «на майбутні порожні потреби».",
    complication: "Корок бере гроші й додає платну умову, і тепер тишу треба не лише мати, а й утримувати."
  },
  "evict-emptiness": {
    strong: "Порожнечу виселено одним чесним ривком, і бочка раптом згадує, що вона меблі, а не гуртожиток.",
    success: "Силове виселення спрацьовує; за клепками ще бурчать, але ключі вже в Корчмаря.",
    mixed: "Порожнеча виходить, лишаючи після себе глухий синець у повітрі й трохи менше винагороди.",
    complication: "Ривок витягає не порожнечу, а її прихованого мешканця. Далі він сперечатиметься кулаками."
  },
  "conduct-duet": {
    strong: "Юшка слухає батон, бере правильну ноту й змушує ложки аплодувати без брязкоту.",
    success: "Диригування збирає суп у куплет; казанок стихає, хоч і просить афішу.",
    mixed: "Дует вдається, але остання ложка бере соло й лишає на столі гарячу пляму.",
    complication: "Батон летить надто широко, і казанок відповідає киплячим бісом."
  },
  "lower-fire": {
    strong: "Температура знаходить потрібну ноту, пара складається в тихий акорд і не лізе в очі.",
    success: "Вогонь стишується, суп перестає співати вище здорового глузду.",
    mixed: "Ноту знижено, але пара залишає на рукаві гарячий підпис.",
    complication: "Жар провалюється не туди, випускає хмару пари й коротко пояснює, чому пальці не диригують."
  },
  "taste-critic": {
    strong: "Дегустаційна рецензія знаходить фальшиву спецію, і суп визнає правку ще до крапки.",
    success: "Критика смакує суворо, але чесно; казанок знімає найвищу ноту з меню.",
    mixed: "Рецензія допомагає, та післясмак вимагає дрібної компенсації репутацією.",
    complication: "Критик куштує забагато правди, і юшка відповідає гарячим коментарем."
  },
  "lid-challenge": {
    strong: "Двобій кришок закінчується швидко: казанок визнає поразку й накриває власну драму.",
    success: "Кришка тримає удар, суп стихає, а ложки роблять вигляд, що не боялися.",
    mixed: "Казанок поступається, але відправляє бризки як офіційну ноту протесту.",
    complication: "Виклик звучить надто переконливо, і з-під кришки виходить те, що давно хотіло битися."
  },
  "audit-days": {
    strong: "Аудит днів знаходить зайвий четвер у колонці «сам прийшов» і списує його без сварки.",
    success: "Календар приймає перерахунок, три п'ятниці повертаються в чергу.",
    mixed: "Дати сходяться, проте один обід лишається без законного часу.",
    complication: "Перевірка знаходить ще один дрібний день, який уже встиг подати апеляцію."
  },
  "negotiate-week": {
    strong: "Переговори з п'ятницями дають їм чергування, чай і заборону з'являтися хором.",
    success: "Три п'ятниці погоджуються на графік, хоча кожна підписує його іншим настроєм.",
    mixed: "Тиждень зібрано, але п'ятниці вибивають собі понаднормову паузу.",
    complication: "П'ятниці торгуються до темряви й залишають герою рахунок за календарну дипломатію."
  },
  "forge-thursday": {
    strong: "Підроблений четвер виглядає настільки переконливо, що час сам ставить на ньому печатку.",
    success: "Фальшивий четвер закриває діру між обідом і вечерею без зайвого шуму.",
    mixed: "Підробка працює, але хвилинна стрілка кусає за рукав.",
    complication: "Четвер виявляється підробкою з характером і боляче відкушує шматок часу."
  },
  "bribe-deadline": {
    strong: "Дедлайн бере монету, тихо переносить себе на потім і не залишає свідків.",
    success: "Золото купує мовчання дати; календар закривається без фанфар.",
    mixed: "Дедлайн мовчить, але ставить маленьку позначку «боржник часу».",
    complication: "Монета зникає, а дедлайн оголошує, що тиша була лише передоплатою."
  },
  "inspect-hinges": {
    strong: "Петлі викривають того, хто навчив двері рахувати виходи, і соромно скриплять.",
    success: "Огляд петель знаходить механізм плати; двері відкриваються, бурмочучи тарифи.",
    mixed: "Петлі піддаються, але повертають героя через кухню як службовий маршрут.",
    complication: "Петля замикає доказ на пальці й вимагає пояснити, хто тут майстер."
  },
  "negotiate-toll": {
    strong: "Переговори вибивають безкоштовний перший вихід і право дверей зітхати без збору.",
    success: "Двері погоджуються на пільгу, якщо ніхто не називатиме це слабкістю.",
    mixed: "Прохід відкрито, проте двері записують героя в чергу на майбутню розмову.",
    complication: "Тариф починає сперечатись окремо від дверей і затримує всіх у дуже ввічливому коридорі."
  },
  "fake-payment": {
    strong: "Відбиття монети обманює замок чисто, і двері дякують порожньому блиску.",
    success: "Фальшива оплата проходить; двері рахують відблиск і відкриваються.",
    mixed: "Трюк працює, але відбиття лишається боржником і блимає з підлоги.",
    complication: "Двері ловлять фальшиву плату на пальцях і стискають доказ із прикрим скрипом."
  },
  "pay-tip": {
    strong: "Чайові змащують петлі так вдало, що двері відкриваються з майже професійною чемністю.",
    success: "Плата проходить у правильну щілину, і вихід стає коротшим на одну сварку.",
    mixed: "Двері беруть чайові, але проводять героя довшим маршрутом «для сервісу».",
    complication: "Монета прийнята, проте двері вирішують, що чайові не скасовують дрібний допит."
  }
  } as Record<string, AdventureOutcomeBeats>)[id];
}

function buildProfileHint(
  seed: AdventureMethodSeed,
  profileKind: "race" | "class" | "signature"
): string {
  const prefix =
    profileKind === "signature"
      ? "Особистий ризикований варіант."
      : profileKind === "class"
        ? "Професійний варіант."
        : "Особистий варіант.";

  return withRiskHint(`${prefix} ${seed.hint}`, seed.consequence ?? "cosmetic-mess");
}

function withRiskHint(hint: string, consequence: QuestConsequenceKind): string {
  if (consequence === "minor-injury" || consequence === "serious-injury") {
    return hasInjuryWarning(hint)
      ? hint
      : `${hint} Можна постраждати.`;
  }

  if (consequence === "fight-handoff") {
    return hasFightWarning(hint)
      ? hint
      : `${hint} Ризик бійки.`;
  }

  return hint;
}

function hasInjuryWarning(hint: string): boolean {
  return /постраждати|небезпеч|пальц|забит|синц|обпект|впасти|травм/i.test(hint);
}

function hasFightWarning(hint: string): boolean {
  return /бійк|бій|істот|мешканц|поклик|виліз|супровід|варта/i.test(hint);
}

function buildTechniqueIdentityBeat(
  profile: QuestTechniqueProfile,
  profileKind: "race" | "class"
): {
  strong: string;
  success: string;
  mixed: string;
  complication: string;
} {
  const motif = techniqueMotif(firstTechnique(profile));
  const owner = profileKind === "race" ? profile.label : profile.label.toLocaleLowerCase("uk-UA");

  return {
    strong: `${capitalizeFirst(owner)} додає ${motif}; сцена приймає це як природну частину рішення.`,
    success: `${capitalizeFirst(motif)} підсилює обраний хід без службової таблички на кнопці.`,
    mixed: `${capitalizeFirst(owner)} допомагає втримати сцену, але ${motif} лишає маленьку претензію на серветці.`,
    complication: `${capitalizeFirst(motif)} заходить у сцену під неправильним кутом, і наслідок виходить особистим, а не безіменним.`
  };
}

function buildSignatureIdentityBeat(
  raceProfile: QuestTechniqueProfile,
  classProfile: QuestTechniqueProfile,
  title: string | null
): {
  strong: string;
  success: string;
  mixed: string;
  complication: string;
} {
  const raceMotif = techniqueMotif(firstTechnique(raceProfile));
  const classMotif = techniqueMotif(firstTechnique(classProfile));
  const titleBeat = title ? ` Титул «${title}» тихо свідчить, що це майже офіційно.` : "";

  return {
    strong: `${capitalizeFirst(raceMotif)} тримає сцену з одного боку, а ${classMotif} ставить поруч робочу крапку.${titleBeat}`,
    success: `${capitalizeFirst(raceMotif)} і ${classMotif} сходяться без підпису на кнопці; сцена впізнає героя за дією.`,
    mixed: `${capitalizeFirst(raceMotif)} штовхає рішення вперед, ${classMotif} підпирає збоку, але дрібна претензія лишається.`,
    complication: `Сцена ловить одночасно ${raceMotif} і ${classMotif}; тому наслідок виходить яскравий, особистий і незручний.`
  };
}

function techniqueMotif(technique: QuestTechniqueId): string {
  const motifs: Partial<Record<QuestTechniqueId, string>> = {
    authority: "печатка й право голосу",
    bribery: "малий фонд взаєморозуміння",
    craft: "ремесло з гострим краєм",
    deception: "хитрий обхід кута",
    domesticity: "хатня юрисдикція",
    force: "вага прямого аргументу",
    improvisation: "корисний збіг",
    investigation: "уважна ревізія причини",
    performance: "ритм і пауза",
    persuasion: "угода без зайвої слави",
    ritual: "обрядова впертість",
    tracking: "слід там, де його соромились",
    traps: "пастка з чесним виглядом",
    arcana: "тихий магічний шов",
    finesse: "точний рух без фанфар"
  };

  return motifs[technique] ?? "практичний нахил";
}

function capitalizeFirst(value: string): string {
  return value.length > 0 ? `${value[0]!.toLocaleUpperCase("uk-UA")}${value.slice(1)}` : value;
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

function compactPersonalMethodId(prefix: string, profileKey: string, seedId: string): string {
  return `${prefix}${profileKey}${toQuestCallbackKey(seedId).slice(1)}`;
}

function uniqueTechniques(techniques: readonly QuestTechniqueId[]): QuestTechniqueId[] {
  return [...new Set(techniques)];
}

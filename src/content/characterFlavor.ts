import type { CharacterSummary } from "../domain/characters/characterSummary";
import type { CharacterPath } from "../domain/characters/path";
import type { Pronoun } from "./schema";

export type FlavorPlacement =
  | "korchma.greeting"
  | "quest.start"
  | "quest.outcome"
  | "raid.prep-hint";

export type FlavorScene = "shawarma" | "fight" | "cellar" | "barrel";

export interface CharacterFlavorSelector {
  raceIds?: string[];
  classIds?: string[];
  pronouns?: Pronoun[];
  paths?: CharacterPath[];
  combos?: Array<{ raceId: string; classId: string }>;
  actions?: string[];
}

export interface CharacterFlavorLine {
  id: string;
  placement: FlavorPlacement;
  scene?: FlavorScene;
  selector?: CharacterFlavorSelector;
  priority?: number;
  text: string;
}

export interface CharacterFlavorQuery {
  placement: FlavorPlacement;
  scene?: FlavorScene;
  action?: string;
  seed?: string;
}

export function selectCharacterFlavorLine(
  character: CharacterSummary,
  query: CharacterFlavorQuery
): CharacterFlavorLine | null {
  const scored = characterFlavorLines
    .filter((line) => line.placement === query.placement)
    .filter((line) => !query.scene || !line.scene || line.scene === query.scene)
    .map((line) => ({
      line,
      score: scoreFlavorLine(line, character, query.action)
    }))
    .filter((entry) => entry.score.tier > 0);

  if (scored.length === 0) {
    return null;
  }

  const bestTier = Math.max(...scored.map((entry) => entry.score.tier));
  const bestPriority = Math.max(
    ...scored
      .filter((entry) => entry.score.tier === bestTier)
      .map((entry) => entry.score.priority)
  );
  const candidates = scored
    .filter((entry) => entry.score.tier === bestTier && entry.score.priority === bestPriority)
    .map((entry) => entry.line)
    .sort((left, right) => left.id.localeCompare(right.id));

  return pickDeterministic(candidates, buildFlavorSeed(character, query));
}

function scoreFlavorLine(
  line: CharacterFlavorLine,
  character: CharacterSummary,
  action: string | undefined
): { tier: number; priority: number } {
  const selector = line.selector;

  if (!selector) {
    return { tier: 1, priority: line.priority ?? 0 };
  }

  if (selector.actions && (!action || !selector.actions.includes(action))) {
    return { tier: 0, priority: line.priority ?? 0 };
  }

  if (
    selector.combos?.some(
      (combo) => combo.raceId === character.raceId && combo.classId === character.classId
    )
  ) {
    return { tier: 5, priority: line.priority ?? 0 };
  }

  if (selector.classIds?.includes(character.classId)) {
    return { tier: 4, priority: line.priority ?? 0 };
  }

  if (selector.raceIds?.includes(character.raceId)) {
    return { tier: 3, priority: line.priority ?? 0 };
  }

  if (selector.pronouns?.includes(character.pronoun) || selector.paths?.includes(character.path)) {
    return { tier: 2, priority: line.priority ?? 0 };
  }

  return { tier: 0, priority: line.priority ?? 0 };
}

function pickDeterministic<T>(items: readonly T[], seed: string): T {
  const item = items[hashString(seed) % items.length];

  if (item === undefined) {
    throw new Error("No flavor candidates.");
  }

  return item;
}

function buildFlavorSeed(character: CharacterSummary, query: CharacterFlavorQuery): string {
  return [
    query.seed ?? currentUtcDateSeed(),
    character.name,
    character.raceId,
    character.classId,
    character.pronoun,
    character.path,
    character.title,
    query.placement,
    query.scene ?? "",
    query.action ?? ""
  ].join("|");
}

function currentUtcDateSeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export const characterFlavorLines: CharacterFlavorLine[] = [
  {
    id: "korchma.greeting.fallback.problem-left",
    placement: "korchma.greeting",
    text: "Заходьте. Якщо ви квест — сідайте зліва. Якщо проблема — теж зліва."
  },
  {
    id: "korchma.greeting.fallback.furniture",
    placement: "korchma.greeting",
    text: "Корчма рада всім, хто не кусає меблі без попередження."
  },
  {
    id: "korchma.greeting.race.human-ish",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.human-ish"] },
    text: "Нарешті хтось майже нормальний. Найпідозріліша категорія."
  },
  {
    id: "korchma.greeting.race.dwarf",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.dwarf"] },
    text: "Полиці сьогодні нижчі. Не дякуйте, це вони самі злякались."
  },
  {
    id: "korchma.greeting.race.elf",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.elf"] },
    text: "Підлогу мили. Не ідеально, але ми залишили місце для вашого розчарування."
  },
  {
    id: "korchma.greeting.race.bisyny",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.bisyny"] },
    text: "Словник у мене під замком. Ображатися будемо за розкладом."
  },
  {
    id: "korchma.greeting.race.drantohor",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.drantohor"] },
    text: "О, з Остромагу? Карта справа. Вона бреше, але впевнено."
  },
  {
    id: "korchma.greeting.race.domovyk",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.domovyk"] },
    text: "Якщо це тепер ваша хата, рахунок за ремонт теж ваш."
  },
  {
    id: "korchma.greeting.race.dryland-rusalka",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.dryland-rusalka"] },
    text: "Води в нас тільки в чаї. Море не завезли, бо воно не влізло в накладну."
  },
  {
    id: "korchma.greeting.race.intellectual-orc",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.intellectual-orc"] },
    text: "Табурети без захисту дисертацій не ламати."
  },
  {
    id: "korchma.greeting.race.molfar-soul",
    placement: "korchma.greeting",
    selector: { raceIds: ["race.molfar-soul"] },
    text: "Туман лишайте біля входу. Минулого разу він не заплатив."
  },
  {
    id: "korchma.greeting.class.warrior",
    placement: "korchma.greeting",
    selector: { classIds: ["class.warrior"] },
    text: "Залізо тримайте спокійно. Меблі сьогодні без броні."
  },
  {
    id: "korchma.greeting.class.mage",
    placement: "korchma.greeting",
    selector: { classIds: ["class.mage"] },
    text: "Складні слова — надворі. Усередині вони підпалюють серветки."
  },
  {
    id: "korchma.greeting.class.bard",
    placement: "korchma.greeting",
    selector: { classIds: ["class.bard"] },
    text: "Співати можна. Але якщо бочка підхопить приспів — ви її заспокоюєте."
  },
  {
    id: "korchma.greeting.class.rogue",
    placement: "korchma.greeting",
    selector: { classIds: ["class.rogue"] },
    text: "Руки покажіть. Дякую. Тепер покажіть ті, якими ви справді працюєте."
  },
  {
    id: "korchma.greeting.class.priest",
    placement: "korchma.greeting",
    selector: { classIds: ["class.priest"] },
    text: "Благословення приймаємо. Але бочку не відспівувати — вона ще корисна."
  },
  {
    id: "korchma.greeting.class.varenyk-mancer",
    placement: "korchma.greeting",
    selector: { classIds: ["class.varenyk-mancer"] },
    text: "Кухня просила не піднімати тісто без дозволу. Минулого разу воно мало вимоги."
  },
  {
    id: "korchma.greeting.class.bureaucramancer",
    placement: "korchma.greeting",
    selector: { classIds: ["class.bureaucramancer"] },
    text: "Форми 13-Б сьогодні не видаємо. Тільки 13-Б/пінне і то під розпис."
  },
  {
    id: "korchma.greeting.class.ranger",
    placement: "korchma.greeting",
    selector: { classIds: ["class.ranger"] },
    text: "Сліди ведуть до бару. Це не загадка, це бізнес-модель."
  },
  {
    id: "korchma.greeting.class.kharakternyk",
    placement: "korchma.greeting",
    selector: { classIds: ["class.kharakternyk"] },
    text: "Не дивіться так на бочку. Вона вже майже вибачилась."
  },
  {
    id: "korchma.greeting.combo.bisyny-bard",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.bisyny", classId: "class.bard" }] },
    text: "Суперечки про переклад під музику? Нарешті в нас буде культурний скандал."
  },
  {
    id: "korchma.greeting.combo.drantohor-kharakternyk",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.drantohor", classId: "class.kharakternyk" }] },
    text: "Остромаг прислав характерника чи характерник загубив Остромаг? Не відповідайте, так цікавіше."
  },
  {
    id: "korchma.greeting.combo.domovyk-bureaucramancer",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.domovyk", classId: "class.bureaucramancer" }] },
    text: "Архівний дух? Шафа за баром уже подала заяву на родинні звʼязки."
  },
  {
    id: "korchma.greeting.combo.dryland-rusalka-varenyk-mancer",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.dryland-rusalka", classId: "class.varenyk-mancer" }] },
    text: "Сирена сметани. Море не прийшло, зате кухня нервує."
  },
  {
    id: "korchma.greeting.combo.intellectual-orc-warrior",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.intellectual-orc", classId: "class.warrior" }] },
    text: "Критик прикладного биття? Тільки не рецензуйте двері обома руками."
  },
  {
    id: "korchma.greeting.combo.molfar-soul-mage",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.molfar-soul", classId: "class.mage" }] },
    text: "Збирач туману? Не складайте його біля вікна, він знову втече в кредит."
  },
  {
    id: "shawarma.start.class.mage",
    placement: "quest.start",
    scene: "shawarma",
    selector: { classIds: ["class.mage"] },
    text: "Соус на шаурмі світиться не за санітарними нормами. Це або мімік, або дуже амбітний часник."
  },
  {
    id: "shawarma.start.class.bureaucramancer",
    placement: "quest.start",
    scene: "shawarma",
    selector: { classIds: ["class.bureaucramancer"] },
    text: "На шаурмі немає печатки походження. Вона дихає ще до заповнення форми. Нахабство."
  },
  {
    id: "shawarma.start.class.varenyk-mancer",
    placement: "quest.start",
    scene: "shawarma",
    selector: { classIds: ["class.varenyk-mancer"] },
    text: "Тісто всередині вас шепоче: «Це не наш формат, але теж родич по борошну»."
  },
  {
    id: "shawarma.start.class.rogue",
    placement: "quest.start",
    scene: "shawarma",
    selector: { classIds: ["class.rogue"] },
    text: "Шаурма лежить так, ніби ховає гаманець. Або зуби. У будь-якому разі це виклик."
  },
  {
    id: "shawarma.start.race.bisyny",
    placement: "quest.start",
    scene: "shawarma",
    selector: { raceIds: ["race.bisyny"] },
    text: "Шаурма дивиться на вас так, ніби теж хоче посперечатися про назву. Небезпечна вечеря."
  },
  {
    id: "shawarma.start.race.domovyk",
    placement: "quest.start",
    scene: "shawarma",
    selector: { raceIds: ["race.domovyk"] },
    text: "Шаурма лежить на вашому столі. Якщо це пастка, вона принаймні має платити за оренду."
  },
  {
    id: "shawarma.outcome.bureaucramancer.receipt",
    placement: "quest.outcome",
    scene: "shawarma",
    selector: { classIds: ["class.bureaucramancer"], actions: ["receipt"] },
    text: "Форма на лаваш виявилась довшою за сам лаваш. Мімік підписався зубами й юридично програв."
  },
  {
    id: "shawarma.outcome.bisyny.receipt",
    placement: "quest.outcome",
    scene: "shawarma",
    selector: { raceIds: ["race.bisyny"], actions: ["receipt"] },
    text: "Суперечка про назву тривала 17 секунд. Шаурма не витримала й видала чек, аби тільки це скінчилось."
  },
  {
    id: "shawarma.outcome.drantohor.poke",
    placement: "quest.outcome",
    scene: "shawarma",
    selector: { raceIds: ["race.drantohor"], actions: ["poke"] },
    text: "Ви показали шаурмі маршрут з Остромагу. Вона заплуталась, видихнула соусом і втратила бойовий настрій."
  },
  {
    id: "shawarma.outcome.domovyk.poke",
    placement: "quest.outcome",
    scene: "shawarma",
    selector: { raceIds: ["race.domovyk"], actions: ["poke"] },
    text: "Ви постукали по столу як власник території. Шаурма вперше задумалась про квартплату."
  },
  {
    id: "fight.start.class.warrior",
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: ["class.warrior"] },
    text: "Мімік показав зуби. Ви показали план: дуже простий і металевий."
  },
  {
    id: "fight.start.class.rogue",
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: ["class.rogue"] },
    text: "У міміка є спина. Десь. Треба лише творчо її знайти."
  },
  {
    id: "fight.start.class.priest",
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: ["class.priest"] },
    text: "Це не вечеря, це спокуса з соусом. Суворий погляд уже заряджено."
  },
  {
    id: "fight.start.class.kharakternyk",
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: ["class.kharakternyk"] },
    text: "Мімік зубиться. Ви дивитесь. Туман робить вигляд, що просто проходив."
  },
  {
    id: "fight.outcome.warrior.attack",
    placement: "quest.outcome",
    scene: "fight",
    selector: { classIds: ["class.warrior"], actions: ["attack"] },
    text: "Ваш удар був настільки прямий, що навіть лаваш зрозумів сюжет."
  },
  {
    id: "fight.outcome.rogue.attack",
    placement: "quest.outcome",
    scene: "fight",
    selector: { classIds: ["class.rogue"], actions: ["attack"] },
    text: "Ви знайшли міміку умовну спину. Мімік подав апеляцію до анатомії."
  },
  {
    id: "fight.outcome.bureaucramancer.receipt",
    placement: "quest.outcome",
    scene: "fight",
    selector: { classIds: ["class.bureaucramancer"], actions: ["receipt"] },
    text: "Чек став зброєю масового оформлення. Мімік отримав шкоду по самоповазі."
  },
  {
    id: "fight.outcome.kharakternyk.attack",
    placement: "quest.outcome",
    scene: "fight",
    selector: { classIds: ["class.kharakternyk"], actions: ["attack"] },
    text: "Ви не стільки вдарили, скільки пояснили долю. Доля була з заліза."
  },
  {
    id: "fight.outcome.drantohor.flee",
    placement: "quest.outcome",
    scene: "fight",
    selector: { raceIds: ["race.drantohor"], actions: ["flee"] },
    text: "Ви відійшли до точки, де, за вашими словами, «точно був вхід в Остромаг»."
  },
  {
    id: "cellar.start.race.domovyk",
    placement: "quest.start",
    scene: "cellar",
    selector: { raceIds: ["race.domovyk"] },
    text: "Підвал дивиться на вас як на законного, хоч і неоформленого, керівника житлового питання."
  },
  {
    id: "cellar.start.class.ranger",
    placement: "quest.start",
    scene: "cellar",
    selector: { classIds: ["class.ranger"] },
    text: "На пилюці видно сліди. Один мишачий, один сирний, один підозріло бюрократичний."
  },
  {
    id: "cellar.start.class.bard",
    placement: "quest.start",
    scene: "cellar",
    selector: { classIds: ["class.bard"] },
    text: "Знизу чути писк у розмірі майже куплету. Миша явно готує сольник."
  },
  {
    id: "cellar.start.class.bureaucramancer",
    placement: "quest.start",
    scene: "cellar",
    selector: { classIds: ["class.bureaucramancer"] },
    text: "На люку немає інвентарного номера. Це пояснює, чому миша відчула безвладдя."
  },
  {
    id: "cellar.start.race.bisyny",
    placement: "quest.start",
    scene: "cellar",
    selector: { raceIds: ["race.bisyny"] },
    text: "Миша почула вашу назву й уже готується до дискусії, хоча ви ще не спустилися."
  },
  {
    id: "cellar.start.race.drantohor",
    placement: "quest.start",
    scene: "cellar",
    selector: { raceIds: ["race.drantohor"] },
    text: "Підвал нагадує короткий шлях до Остромагу: темно, сирно й ніхто не гарантує виходу."
  },
  {
    id: "cellar.outcome.domovyk.negotiate",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { raceIds: ["race.domovyk"], actions: ["negotiate"] },
    text: "Миша визнала ваші права на підвал, але попросила автономію за шафою. Компроміс пахне сиром."
  },
  {
    id: "cellar.outcome.bureaucramancer.negotiate",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { classIds: ["class.bureaucramancer"], actions: ["negotiate"] },
    text: "Сирний меморандум підписано крихтою. Миша отримала статус «тимчасово декоративна»."
  },
  {
    id: "cellar.outcome.bard.negotiate",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { classIds: ["class.bard"], actions: ["negotiate"] },
    text: "Миша погодилась на мир, бо ваш приспів застряг у неї в голові сильніше за пастку."
  },
  {
    id: "cellar.outcome.ranger.cheese-trap",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { classIds: ["class.ranger"], actions: ["cheese-trap"] },
    text: "Ви поставили пастку так майстерно, що миша оцінила маршрут і попросила копію карти."
  },
  {
    id: "cellar.outcome.rogue.cheese-trap",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { classIds: ["class.rogue"], actions: ["cheese-trap"] },
    text: "Сир зник, пастка зʼявилась, миша підозрює всіх, включно з автором квесту."
  },
  {
    id: "cellar.outcome.bisyny.cheese-trap",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { raceIds: ["race.bisyny"], actions: ["cheese-trap"] },
    text: "Ви назвали сир «молочним артефактом». Миша вийшла сперечатися й формально програла."
  },
  {
    id: "cellar.outcome.drantohor.sweep-bravely",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { raceIds: ["race.drantohor"], actions: ["sweep-bravely"] },
    text: "Ви підмели так широко, що знайшли три крихти, старий кордон і, можливо, півдороги до Остромагу."
  },
  {
    id: "cellar.outcome.kharakternyk.sweep-bravely",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { classIds: ["class.kharakternyk"], actions: ["sweep-bravely"] },
    text: "Ви глянули на пил. Пил прикинувся чистою підлогою. Віник образився, але результат є."
  },
  // Future raid role flavor only. No mechanical roles or raid balance effects yet.
  {
    id: "barrel.raid-hint.class.warrior",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.warrior"] },
    text: "Воїнам у повному рейді дадуть просте завдання: стояти між бочкою й усіма поганими рішеннями."
  },
  {
    id: "barrel.raid-hint.class.mage",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.mage"] },
    text: "Магам у повному рейді дозволять палити, морозити й виглядати винними. Не одночасно біля штор."
  },
  {
    id: "barrel.raid-hint.class.bard",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.bard"] },
    text: "Бардам у повному рейді дадуть бафи, дебафи й відповідальність за моральний стан табуретів."
  },
  {
    id: "barrel.raid-hint.class.rogue",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.rogue"] },
    text: "Злодіям у повному рейді: не атакуйте напряму. Удар у спину вам не просто так дано, а щоб не пояснювати рахунок за лікування."
  },
  {
    id: "barrel.raid-hint.class.priest",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.priest"] },
    text: "Жерцям у повному рейді: не забувайте лікувати союзників. Союзники мають неприємну звичку закінчуватись."
  },
  {
    id: "barrel.raid-hint.class.varenyk-mancer",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.varenyk-mancer"] },
    text: "Вареник-мантам у повному рейді: тісто — це контроль. Сметана — це відповідальність."
  },
  {
    id: "barrel.raid-hint.class.bureaucramancer",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.bureaucramancer"] },
    text: "Бюрокромантам у повному рейді: без форми 13-Б бочка не має права бути босом. Нагадуйте їй боляче."
  },
  {
    id: "barrel.raid-hint.class.ranger",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.ranger"] },
    text: "Єгерям у повному рейді: слідкуйте за слідами піни. Так, бочка лишає сліди. Ні, ми теж не раді."
  },
  {
    id: "barrel.raid-hint.class.kharakternyk",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { classIds: ["class.kharakternyk"] },
    text: "Характерникам у повному рейді: дивіться на боса так, щоб він сам згадав cooldown."
  },
  {
    id: "barrel.raid-hint.race.drantohor",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { raceIds: ["race.drantohor"] },
    text: "Дрантогор чудовий танк, якщо не заблукає до Остромагу між pull-ом і wipe-ом."
  },
  {
    id: "barrel.raid-hint.race.bisyny",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { raceIds: ["race.bisyny"] },
    text: "Бісини в рейді біситимуть боса, союзників і локалізацію механік. Це майже crowd control."
  },
  {
    id: "barrel.raid-hint.race.domovyk",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { raceIds: ["race.domovyk"] },
    text: "Домовик у рейді знає, кому належить підлога. Спойлер: не босу."
  },
  {
    id: "barrel.raid-hint.combo.drantohor-kharakternyk",
    placement: "raid.prep-hint",
    scene: "barrel",
    selector: { combos: [{ raceId: "race.drantohor", classId: "class.kharakternyk" }] },
    text: "Межовий заблуканець у рейді — це коли розташування боса сперечається з географією."
  }
];

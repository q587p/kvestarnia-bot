import type { CharacterSummary } from "../domain/characters/characterSummary";
import type { CharacterPath } from "../domain/characters/path";
import { classes } from "./classes";
import { activeRaces } from "./races";
import type { Pronoun } from "./schema";

export type FlavorPlacement =
  | "korchma.greeting"
  | "quest.start"
  | "quest.outcome"
  | "raid.prep-hint"
  | "raid.ranger-action";

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
  const scored = getScoredFlavorLines(character, query);

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

export function selectCharacterFlavorLines(
  character: CharacterSummary,
  query: CharacterFlavorQuery,
  options: { includeFallback?: boolean; limit?: number } = {}
): CharacterFlavorLine[] {
  const limit = options.limit ?? 2;
  const scored = getScoredFlavorLines(character, query);

  if (scored.length === 0 || limit <= 0) {
    return [];
  }

  if (!options.includeFallback) {
    const selected = selectCharacterFlavorLine(character, query);
    return selected ? [selected] : [];
  }

  const selected: CharacterFlavorLine[] = [];
  const specific = selectBestFromTier(scored, (tier) => tier > 1, character, query, "specific");

  if (specific) {
    selected.push(specific);
  }

  const fallback = selectBestFromTier(scored, (tier) => tier === 1, character, query, "fallback");

  if (fallback && !selected.some((line) => line.id === fallback.id)) {
    selected.push(fallback);
  }

  return selected.slice(0, limit);
}

function getScoredFlavorLines(
  character: CharacterSummary,
  query: CharacterFlavorQuery
): Array<{ line: CharacterFlavorLine; score: { tier: number; priority: number } }> {
  return characterFlavorLines
    .filter((line) => line.placement === query.placement)
    .filter((line) => !query.scene || !line.scene || line.scene === query.scene)
    .map((line) => ({
      line,
      score: scoreFlavorLine(line, character, query.action)
    }))
    .filter((entry) => entry.score.tier > 0);
}

function selectBestFromTier(
  scored: Array<{ line: CharacterFlavorLine; score: { tier: number; priority: number } }>,
  acceptsTier: (tier: number) => boolean,
  character: CharacterSummary,
  query: CharacterFlavorQuery,
  seedSuffix: string
): CharacterFlavorLine | null {
  const matching = scored.filter((entry) => acceptsTier(entry.score.tier));

  if (matching.length === 0) {
    return null;
  }

  const bestTier = Math.max(...matching.map((entry) => entry.score.tier));
  const bestPriority = Math.max(
    ...matching.filter((entry) => entry.score.tier === bestTier).map((entry) => entry.score.priority)
  );
  const candidates = matching
    .filter((entry) => entry.score.tier === bestTier && entry.score.priority === bestPriority)
    .map((entry) => entry.line)
    .sort((left, right) => left.id.localeCompare(right.id));

  return pickDeterministic(candidates, `${buildFlavorSeed(character, query)}|${seedSuffix}`);
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

function buildShawarmaStartRaceLines(): CharacterFlavorLine[] {
  return activeRaces.map((race) => ({
    id: `shawarma.start.race-pool.${contentSlug(race.id)}`,
    placement: "quest.start",
    scene: "shawarma",
    selector: { raceIds: [race.id] },
    priority: -1,
    text: `${race.name} відчуває, що ця шаурма не просто лежить. Вона вивчає правила дому й шукає слабке місце в серветці.`
  }));
}

function buildShawarmaStartClassLines(): CharacterFlavorLine[] {
  return classes.map((heroClass) => ({
    id: `shawarma.start.class-pool.${contentSlug(heroClass.id)}`,
    placement: "quest.start",
    scene: "shawarma",
    selector: { classIds: [heroClass.id] },
    priority: -1,
    text: `${heroClass.name} бачить у цій шаурмі не вечерю, а задачу з соусом, підозрою і погано прихованою самовпевненістю.`
  }));
}

function buildShawarmaStartComboLines(): CharacterFlavorLine[] {
  return availableRaceClassCombos().map(({ raceId, classId, raceName, className }) => ({
    id: `shawarma.start.combo.${contentSlug(raceId)}-${contentSlug(classId)}`,
    placement: "quest.start",
    scene: "shawarma",
    selector: { combos: [{ raceId, classId }] },
    text: `${raceName}-${className} підходить до шаурми так, ніби це перша сторінка дуже дурної, але перспективної справи. Шаурма нервово шурхотить лавашем.`
  }));
}

function buildShawarmaOutcomeRaceLines(): CharacterFlavorLine[] {
  return activeRaces.flatMap((race) =>
    shawarmaActions().map((action) => ({
      id: `shawarma.outcome.race-pool.${contentSlug(race.id)}.${action}`,
      placement: "quest.outcome",
      scene: "shawarma",
      selector: { raceIds: [race.id], actions: [action] },
      priority: -1,
      text: `${race.name} лишає на справі власний підпис: шаурма тепер поводиться тихіше й підозрює, що її щойно перемогли стилем.`
    }))
  );
}

function buildShawarmaOutcomeClassLines(): CharacterFlavorLine[] {
  return classes.flatMap((heroClass) =>
    shawarmaActions().map((action) => ({
      id: `shawarma.outcome.class-pool.${contentSlug(heroClass.id)}.${action}`,
      placement: "quest.outcome",
      scene: "shawarma",
      selector: { classIds: [heroClass.id], actions: [action] },
      priority: -1,
      text: `${heroClass.name} завершує епізод професійно: шаурма ще дихає, але вже розуміє, що протокол пригоди не на її боці.`
    }))
  );
}

function buildFightStartRaceLines(): CharacterFlavorLine[] {
  return activeRaces.map((race) => ({
    id: `fight.start.race-pool.${contentSlug(race.id)}`,
    placement: "quest.start",
    scene: "fight",
    selector: { raceIds: [race.id] },
    priority: -1,
    text: `${race.name} помічає, що підозрілий монстр рухається не як їжа. Їжа зазвичай не вибирає, кого вкусити першим.`
  }));
}

function buildFightStartClassLines(): CharacterFlavorLine[] {
  return classes.map((heroClass) => ({
    id: `fight.start.class-pool.${contentSlug(heroClass.id)}`,
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: [heroClass.id] },
    priority: -1,
    text: `${heroClass.name} оцінює сутичку: зуби є, пафос є, план майже є. Залишилось зробити вигляд, що так і задумано.`
  }));
}

function buildFightStartComboLines(): CharacterFlavorLine[] {
  return availableRaceClassCombos().map(({ raceId, classId, raceName, className }) => ({
    id: `fight.start.combo.${contentSlug(raceId)}-${contentSlug(classId)}`,
    placement: "quest.start",
    scene: "fight",
    selector: { combos: [{ raceId, classId }] },
    text: `${raceName}-${className} стає навпроти підозрілого монстра. У корчмі на мить тихо: всі хочуть побачити, чи це стиль, план або страховий випадок.`
  }));
}

function buildFightOutcomeRaceLines(): CharacterFlavorLine[] {
  return activeRaces.flatMap((race) =>
    fightActions().map((action) => ({
      id: `fight.outcome.race-pool.${contentSlug(race.id)}.${action}`,
      placement: "quest.outcome",
      scene: "fight",
      selector: { raceIds: [race.id], actions: [action] },
      priority: -1,
      text: `${race.name} виходить із сутички з виглядом, ніби все було під контролем. Монстр не погоджується, але вже тихіше.`
    }))
  );
}

function buildFightOutcomeClassLines(): CharacterFlavorLine[] {
  return classes.flatMap((heroClass) =>
    fightActions().map((action) => ({
      id: `fight.outcome.class-pool.${contentSlug(heroClass.id)}.${action}`,
      placement: "quest.outcome",
      scene: "fight",
      selector: { classIds: [heroClass.id], actions: [action] },
      priority: -1,
      text: `${heroClass.name} робить те, що вміє найкраще: перетворює проблему на досвід, шум і трохи крихт на підлозі.`
    }))
  );
}

function availableRaceClassCombos(): Array<{
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
}> {
  return activeRaces.flatMap((race) =>
    classes
      .filter((heroClass) => !heroClass.allowedRaces || heroClass.allowedRaces.includes(race.id))
      .map((heroClass) => ({
        raceId: race.id,
        raceName: race.name,
        classId: heroClass.id,
        className: heroClass.name
      }))
  );
}

function shawarmaActions(): Array<"poke" | "receipt" | "flee"> {
  return ["poke", "receipt", "flee"];
}

function fightActions(): Array<"attack" | "receipt" | "flee"> {
  return ["attack", "receipt", "flee"];
}

function contentSlug(id: string): string {
  return id.split(".").at(-1) ?? id;
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
    text: "Монстр показав зуби. Ви показали план: дуже простий і металевий."
  },
  {
    id: "fight.start.class.rogue",
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: ["class.rogue"] },
    text: "У монстра є спина. Десь. Треба лише творчо її знайти."
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
    text: "Монстр зубиться. Ви дивитесь. Туман робить вигляд, що просто проходив."
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
  ...buildShawarmaStartRaceLines(),
  ...buildShawarmaStartClassLines(),
  ...buildShawarmaStartComboLines(),
  ...buildShawarmaOutcomeRaceLines(),
  ...buildShawarmaOutcomeClassLines(),
  ...buildFightStartRaceLines(),
  ...buildFightStartClassLines(),
  ...buildFightStartComboLines(),
  ...buildFightOutcomeRaceLines(),
  ...buildFightOutcomeClassLines(),
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
  },
  ...buildBarrelRaidHintLines(),
  ...buildBarrelRangerActionLines()
];

function buildBarrelRaidHintLines(): CharacterFlavorLine[] {
  return [
    ...recordLines("barrel.raid-hint.extra.class", classRaidTips(), (classId) => ({
      placement: "raid.prep-hint",
      scene: "barrel",
      selector: { classIds: [classId] }
    })),
    ...recordLines("barrel.raid-hint.extra.race", raceRaidTips(), (raceId) => ({
      placement: "raid.prep-hint",
      scene: "barrel",
      selector: { raceIds: [raceId] }
    })),
    ...recordLines("barrel.raid-hint.combo", comboRaidTips(), (combo) => {
      const [raceId, classId] = combo.split(":");

      return {
        placement: "raid.prep-hint",
        scene: "barrel",
        selector: {
          combos:
            raceId && classId
              ? [
                  {
                    raceId,
                    classId
                  }
                ]
              : []
        }
      };
    }),
    ...recordLines("barrel.raid-hint.fallback", universalRaidTips(), () => ({
      placement: "raid.prep-hint",
      scene: "barrel"
    }))
  ];
}

function buildBarrelRangerActionLines(): CharacterFlavorLine[] {
  return [
    ...recordLines("barrel.ranger-action.class", rangerClassActions(), (classId) => ({
      placement: "raid.ranger-action",
      scene: "barrel",
      selector: { classIds: [classId] }
    })),
    ...recordLines("barrel.ranger-action.race", rangerRaceActions(), (raceId) => ({
      placement: "raid.ranger-action",
      scene: "barrel",
      selector: { raceIds: [raceId] }
    })),
    ...recordLines("barrel.ranger-action.fallback", rangerUniversalActions(), () => ({
      placement: "raid.ranger-action",
      scene: "barrel"
    }))
  ];
}

function recordLines(
  idPrefix: string,
  record: Record<string, string[]>,
  buildMeta: (key: string) => Pick<CharacterFlavorLine, "placement" | "scene" | "selector">
): CharacterFlavorLine[] {
  return Object.entries(record).flatMap(([key, texts]) =>
    texts.map((text, index) => ({
      id: `${idPrefix}.${key.replace(/[^a-z0-9-]+/gi, "-")}.${index + 1}`,
      ...buildMeta(key),
      text
    }))
  );
}

function classRaidTips(): Record<string, string[]> {
  return {
    "class.warrior": [
      "Якщо Бочка шумить, станьте попереду. Якщо вона шумить голосніше, значить план працює.",
      "Не бийте піну з розмаху. Спершу переконайтесь, що це піна, а не корчмарська гордість.",
      "Щит проти Бочки тримайте низько: найпідступніші бризки атакують репутацію чобіт.",
      "Коли стратегія закінчується, у воїна починається інструкція з двох слів: стояти переконливо.",
      "Не сперечайтесь із Бочкою про силу. Вона кругла, а круглі аргументи повертаються."
    ],
    "class.mage": [
      "Перед закляттям перевірте, чи це не штора. Корчмар досі пам’ятає минулу «ілюмінацію».",
      "Лід добре тримає піну, але погано тримає пояснення перед власником підлоги.",
      "Якщо формула пахне солодом, це вже не магія, а меню з ризиком вибуху.",
      "Не накладайте тишу на Бочку: вона почне мовчати голосніше.",
      "Магічне світло допомагає бачити бризки. Воно ж допомагає бризкам бачити вас."
    ],
    "class.bard": [
      "Не беріть тональність Бочки. Вона кругла і бере ноти по колу.",
      "Бадьорий приспів піднімає мораль. Надто бадьорий піднімає кришку.",
      "Якщо табурети почали плескати, не зупиняйтесь: меблі рідко помиляються в драматургії.",
      "Дебаф на піну працює краще, якщо римувати «міраж» із «ажиотаж» не доведеться.",
      "Не давайте Бочці соло. Востаннє після цього три кухлі подали заяву в хор."
    ],
    "class.rogue": [
      "У Бочки є спина. Це філософське питання, але злодії живуть саме з таких питань.",
      "Красти піну без дозволу не радимо: піна потім краде видимість.",
      "Якщо ніхто вас не бачить, це добре. Якщо не бачить навіть ви, це вже бочкова тактика.",
      "Пастка біля крана працює тільки тоді, коли кран не підкупив підлогу.",
      "Тінь за Бочкою слизька. Перевіряйте маршрут, перш ніж виглядати загадково."
    ],
    "class.priest": [
      "Не відспівуйте Бочку завчасно. Вона просто драматично булькає.",
      "Благословення на сухі шкарпетки діє краще, якщо союзники вірять у шкарпетки.",
      "Якщо піна лізе в душу, суворий погляд теж вважається малою молитвою.",
      "Лікуйте тих, хто стоїть найближче до крана. Це не фаворитизм, це географія.",
      "Не сперечайтесь із дивом у кухлі. Спершу перевірте, чи воно оплатило рахунок."
    ],
    "class.varenyk-mancer": [
      "Тісто добре глушить бризки, але потім вимагає статусу пригодницького інвентарю.",
      "Не ліпіть вареник на кран. Кран образиться, а начинка отримає владу.",
      "Сметана заспокоює піну тільки в теорії. На практиці вона просить ложку.",
      "Якщо Бочка пахне начинкою, відійдіть: це або успіх, або дуже впевнена пастка.",
      "Качалку тримайте напоготові. Вона не зброя, вона переговорна позиція."
    ],
    "class.bureaucramancer": [
      "Піна без інвентарного номера вважається самовільною. Повідомте її суворим тоном.",
      "Форма 13-Б не зупиняє Бочку, але змушує її булькати з повагою.",
      "Перед рейдом поставте печатку на план. Якщо план втече, печатка лишиться доказом.",
      "Кран не має права ухилятися від аудиту. Навіть якщо дуже блищить.",
      "Найстрашніше для Бочки — не меч, а фраза «згідно з пунктом другим»."
    ],
    "class.ranger": [
      "Сліди піни ведуть по колу. Це не помилка, це характер Бочки.",
      "Не губіть стріли в піні: потім вони повертаються з мокрими історіями.",
      "Якщо єгер у кутку мовчить, це не згода. Це професійне оцінювання ризику.",
      "Пастка має стояти там, де Бочка думає, що її немає. Бочка думає голосно.",
      "Вітер у корчмі бреше, але запах піни бреше ще талановитіше."
    ],
    "class.kharakternyk": [
      "Подивіться на Бочку так, щоб вона сама згадала, хто тут тимчасова проблема.",
      "Туман біля крана тримайте тонким шаром: товстий уже вважає себе начальством.",
      "Не кличте долю вголос. У корчмі вона приходить із рахунком.",
      "Якщо Бочка не здається, зробіть вигляд, що це був ваш план. Часто працює.",
      "Характер тримайте сухим. Все інше сьогодні може не пощастити."
    ]
  };
}

function raceRaidTips(): Record<string, string[]> {
  return {
    "race.human-ish": [
      "Людиську корисно почати з простого: не довіряти меблям, які надто спокійні.",
      "Якщо план здається нормальним, перевірте, чи його не придумала Бочка.",
      "Майже нормальність — це перевага: Бочка не знає, з якого боку чекати дурниці.",
      "Не соромтесь імпровізувати. У корчмі це називають «людиський протокол».",
      "Тримайте кухоль як свідка. Свідки в корчмі рідко корисні, але додають ваги."
    ],
    "race.dwarf": [
      "Гномам радять не копати під Бочку. Під нею вже є підозри.",
      "Низький центр ваги допомагає, коли піна вирішує стати погодою.",
      "Якщо підлога гуде, це або корисні копалини, або Бочка вдає глибину.",
      "Не міряйте якість рейду стуком по дереву. Дерево тут нервове.",
      "Борода тримає піну краще за щит, але потім має свою думку."
    ],
    "race.elf": [
      "Ельфам краще не дивитися на стан крана надто довго: естетика теж має HP.",
      "Тримайте дистанцію красиво. Якщо не вийде красиво, тримайте хоч якусь.",
      "Не сперечайтесь із Бочкою про старовину. Вона старіша за половину рахунків.",
      "Піна на плащі — не катастрофа, а тимчасова композиція.",
      "Якщо корчма здається недосконалою, це не дебаф. Це весь інтер’єр."
    ],
    "race.bisyny": [
      "Бісинам радять не починати з термінології. Бочка все одно відповідатиме бульками.",
      "Якщо назвати піну «аргументом», вона почне поводитись як коментарі.",
      "Суперечка з Бочкою корисна, поки Бочка не просить модератора.",
      "Не виправляйте корчмаря під час рейду. Він тримає облік помсти.",
      "Найкращий crowd control — змусити Бочку пояснювати власну назву."
    ],
    "race.drantohor": [
      "Дрантогору варто запам’ятати: вихід із рейду не там, де Остромаг.",
      "Якщо маршрут пішов боком, можливо, це не помилка, а ваша расова дипломатія.",
      "Не малюйте карту на піні. Вона втече в іншу юрисдикцію.",
      "Бочка любить кола. Дрантогор теж. Не дайте їм створити експедицію.",
      "Питайте дорогу в підлоги, але не в табурета: табурет працює на корчму."
    ],
    "race.domovyk": [
      "Домовику корисно нагадати Бочці, що підлога має власника. А власник має віник.",
      "Якщо щось гуркоче, це або рейд, або хата просить уваги.",
      "Не сваріть кран при всіх. Спершу дайте йому шанс поводитися як майно.",
      "Піна під лавою — це не сміття, а доказ. Зберіть його поглядом.",
      "Домовик не панікує. Домовик переставляє хаос ближче до виходу."
    ],
    "race.dryland-rusalka": [
      "Сухопутній русалці радять не довіряти будь-якій рідині, яка голосно себе рекламує.",
      "Якщо піна нагадує море, не ведіться: море не пахне бухгалтерією.",
      "Тримайте драму сухою. Мокра драма ковзає й вимагає музики.",
      "Чайник біля бару може бути союзником. А може бути чайником. Уточніть.",
      "Не співайте Бочці приливну пісню, якщо не готові до відпливу табуретів."
    ],
    "race.intellectual-orc": [
      "Орку-інтелігенту варто бити тезу, а не автора. Але Бочка — теза з обручами.",
      "Якщо Бочка не погоджується з аргументом, застосуйте рецензію плечем.",
      "Не починайте з передмови. Піна не дочитує, вона розлітається.",
      "Сила з дипломом добре працює проти дерев’яної самовпевненості.",
      "Якщо доведення зайшло в кут, кут можна ввічливо посунути."
    ],
    "race.molfar-soul": [
      "Мольфарській душі краще прив’язати туман до лави. Минулого разу він пішов у рейд сам.",
      "Оберіг від піни працює, якщо не забути, в якій кишені другий оберіг.",
      "Не слухайте вітер у корчмі. Він повторює те, що почув від рахунків.",
      "Туман чудово приховує паніку, але погано приховує мокрі чоботи.",
      "Якщо Бочка бачить майбутнє, покажіть їй варіянт із сухою підлогою."
    ]
  };
}

function comboRaidTips(): Record<string, string[]> {
  return {
    "race.human-ish:class.warrior": ["Людисько-воїн має простий бонус: Бочка недооцінює тих, хто виглядає як інструкція до стільця."],
    "race.human-ish:class.bard": ["Людисько-бард може переконати Бочку, що приспів уже був і треба перейти до фіналу."],
    "race.human-ish:class.kharakternyk": ["Людисько-характерник дивиться майже звичайно. Саме це й лякає піну."],
    "race.human-ish:class.varenyk-mancer": ["Людисько-вареник-мант знає: якщо ситуація липне до рук, це ще не провал, а заготовка."],
    "race.human-ish:class.bureaucramancer": ["Людисько-бюрокромант — це коли звичайність отримала печатку й тепер має повноваження."],
    "race.dwarf:class.warrior": ["Гном-воїн нижчий за більшість бризок, але переконливіший за більшість планів."],
    "race.dwarf:class.ranger": ["Гном-єгер читає сліди піни знизу. Там, на жаль, багато правди."],
    "race.dwarf:class.bureaucramancer": ["Гном-бюрокромант ставить печатку так важко, що Бочка на мить вірить у гравітацію."],
    "race.elf:class.mage": ["Ельф-маг може підсвітити слабке місце Бочки й одразу поскаржитись на його дизайн."],
    "race.elf:class.bard": ["Ельф-бард не фальшивить. Фальшивить Бочка, і це треба використати проти неї."],
    "race.elf:class.rogue": ["Ельф-злодій краде момент настільки витончено, що Бочка помічає тільки після титрів."],
    "race.elf:class.priest": ["Ельф-жрець благословляє терпіння союзників. Корчмі теж не завадить."],
    "race.bisyny:class.bard": ["Бісини-бард може зробити з рейду дискусійний концерт. Бочка програє на питанні термінів."],
    "race.bisyny:class.rogue": ["Бісини-злодій краде не предмети, а контекст. У Бочки цього контексту забагато."],
    "race.bisyny:class.kharakternyk": ["Бісини-характерник сперечається поглядом. Піна просить письмову відповідь."],
    "race.bisyny:class.varenyk-mancer": ["Бісини-вареник-мант може назвати начинку правильно. Це вже половина контролю."],
    "race.bisyny:class.bureaucramancer": ["Бісини-бюрокромант небезпечний тим, що править форму й реальність одночасно."],
    "race.drantohor:class.warrior": ["Дрантогор-воїн іноді б’є не туди, але якщо влучає, географія погоджується заднім числом."],
    "race.drantohor:class.mage": ["Дрантогор-маг питає іскри про дорогу. Іскри показують напрямок до проблеми."],
    "race.drantohor:class.rogue": ["Дрантогор-злодій обходить Бочку таким шляхом, що Бочка сама губиться в обороні."],
    "race.drantohor:class.kharakternyk": ["Дрантогор-характерник у рейді — це коли туман має карту, але карта не має сміливості."],
    "race.drantohor:class.bureaucramancer": ["Дрантогор-бюрокромант може оформити навіть неправильний поворот. Бочка цього боїться."],
    "race.drantohor:class.ranger": ["Дрантогор-єгер знаходить слід, губить слід і все одно виходить до потрібної піни."],
    "race.domovyk:class.rogue": ["Домовик-злодій не краде в корчмі. Він тимчасово перерозподіляє речі по правильних полицях."],
    "race.domovyk:class.priest": ["Домовик-жрець благословляє підлогу. Після цього падати стає соромно."],
    "race.domovyk:class.bureaucramancer": ["Домовик-бюрокромант знає: якщо Бочка стоїть у хаті, вона має бути в реєстрі."],
    "race.domovyk:class.ranger": ["Домовик-єгер знаходить сліди там, де інші бачать пил і привід чхнути."],
    "race.dryland-rusalka:class.mage": ["Сухопутна русалка-маг може зробити вологість аргументом, але краще не казати це корчмарю."],
    "race.dryland-rusalka:class.bard": ["Сухопутна русалка-бард співає так, що піна на мить згадує береги."],
    "race.dryland-rusalka:class.priest": ["Сухопутна русалка-жриця молиться за сухі шкарпетки. Це практична теологія."],
    "race.dryland-rusalka:class.varenyk-mancer": ["Сухопутна русалка-вареник-мант знає, що сметана теж може бути стихією."],
    "race.intellectual-orc:class.warrior": ["Орк-інтелігент-воїн спершу формулює тезу, а потім дуже переконливо ставить крапку."],
    "race.intellectual-orc:class.mage": ["Орк-інтелігент-маг доводить формулу до стану, коли Бочка просить коротший висновок."],
    "race.intellectual-orc:class.priest": ["Орк-інтелігент-жрець лікує так етично, що синці починають самокритику."],
    "race.intellectual-orc:class.kharakternyk": ["Орк-інтелігент-характерник дивиться на Бочку як на слабко аргументований семінар."],
    "race.intellectual-orc:class.bureaucramancer": ["Орк-інтелігент-бюрокромант — це протокол, який уміє підняти лаву."],
    "race.molfar-soul:class.mage": ["Мольфарська душа-маг знає: якщо туман світиться, хтось забув техніку безпеки."],
    "race.molfar-soul:class.bard": ["Мольфарська душа-бард співає так, ніби приспів знайшли в оберезі."],
    "race.molfar-soul:class.rogue": ["Мольфарська душа-злодій зникає між двома оберегами й повертається з чужою впевненістю."],
    "race.molfar-soul:class.priest": ["Мольфарська душа-жрець благословляє оберіг, оберіг благословляє план, план нервує."],
    "race.molfar-soul:class.kharakternyk": ["Мольфарська душа-характерник не входить у туман. Туман сам підсувається ближче."],
    "race.molfar-soul:class.bureaucramancer": ["Мольфарська душа-бюрокромант може поставити печатку на туман. Туман робить вигляд, що так і треба."]
  };
}

function universalRaidTips(): Record<string, string[]> {
  return {
    general: [
      "Не ставайте між Бочкою й корчмарем, якщо не хочете стати пунктом у кошторисі.",
      "Піна виглядає м’якою, доки не починає мати власну думку про вашу зачіску.",
      "Якщо рейд здається легким, перевірте, чи Бочка не читає сценарій наперед.",
      "Кран — не ручка дверей. Не смикайте його з надією на вихід.",
      "Табурети мовчать не тому, що нічого не знають. Вони просто втомились свідчити.",
      "Коли корчмар каже «максимум», запитайте, для кого саме.",
      "Не називайте Бочку меблями при ній. Вона чутлива до кар’єрних ярликів.",
      "Якщо підлога стала слизькою, це не ландшафт. Це аргумент за обережність.",
      "Урочистий вигляд тримайте до кінця. Навіть якщо кінець тимчасово тримає вас.",
      "Після рейду перевірте кишені: піна не краде золото, але краде пояснення."
    ]
  };
}

function rangerUniversalActions(): Record<string, string[]> {
  return {
    general: [
      "Єгер у капюшоні не втручається. Тільки курить трубку й дивиться так, ніби вже знає, кому дістанеться піна.",
      "Єгер повільно пересуває кухоль подалі від Бочки. Це або тактика, або досвід.",
      "Єгер креслить щось на серветці. Серветка виглядає так, ніби вже шкодує.",
      "Єгер примружується на кран і мовчки киває, як людина, що бачила гірші крани й гірших пригодників.",
      "Єгер перевіряє стрілу, не встаючи. Стріла теж не хоче вставати.",
      "Єгер легенько стукає люлькою по столу. Піна на мить поводиться вихованіше.",
      "Єгер дивиться на підлогу. Підлога вдає, що її тут немає.",
      "Єгер підсуває табурет у безпечніше місце. Табурет приймає це як підвищення.",
      "Єгер нюхає повітря й робить обличчя «я ж казав», хоча ніхто нічого не питав.",
      "Єгер записує щось у маленький нотатник. Можливо, ваш некролог. Можливо, рецепт."
    ]
  };
}

function rangerClassActions(): Record<string, string[]> {
  return {
    "class.warrior": [
      "Єгер оцінює вашу стійку й мовчки прибирає ламкий табурет із траєкторії.",
      "Єгер відсовує кухоль від лінії удару. Кухоль виглядає вдячним і трохи досвідченим.",
      "Єгер киває вашому плечу, ніби саме воно зараз веде переговори з Бочкою."
    ],
    "class.mage": [
      "Єгер накриває кухоль долонею, щойно ви починаєте вимовляти складні склади.",
      "Єгер перевіряє, чи серветки не спалахнули від самої інтонації. Серветки нервово лежать.",
      "Єгер дивиться на піну так, ніби вона вже стала побічним ефектом закляття."
    ],
    "class.bard": [
      "Єгер тримає ритм пальцем по столу, але робить вигляд, що це просто нерви.",
      "Єгер мовчки відсуває люльку від майбутнього приспіву. Навіть дим хоче мати вибір.",
      "Єгер дивиться на Бочку так, ніби перевіряє, чи вона не збирається підспівувати."
    ],
    "class.rogue": [
      "Єгер дивиться не на вас, а на місце, де ви, ймовірно, будете через секунду.",
      "Єгер кладе долоню на кишеню, у якій нічого немає. Профілактика — теж ремесло.",
      "Єгер переводить погляд з вас на тінь і назад. Тінь поводиться підозріло чесно."
    ],
    "class.priest": [
      "Єгер знімає капюшон на пів пальця, ніби готується поважати майбутнє диво.",
      "Єгер відставляє кухоль і робить вигляд, що не підслуховує благословення.",
      "Єгер дивиться на Бочку з обережною повагою, яку зазвичай тримають для чудес і податкових перевірок."
    ],
    "class.varenyk-mancer": [
      "Єгер відсуває серветки подалі від тіста. Він уже бачив, як тісто бере заручників.",
      "Єгер перевіряє, чи біля Бочки немає сметани. Стратегія має межі.",
      "Єгер дивиться на ваші руки так, ніби зараз там може з’явитися вареник із планом."
    ],
    "class.bureaucramancer": [
      "Єгер дістає олівець. Якщо буде форма, він хоче бути далеко від графи «свідок».",
      "Єгер ховає нотатник під кухоль. Бюрокромантія не має бачити слабкі місця паперу.",
      "Єгер примружується на Бочку, ніби шукає печатку там, де в нормальних людей кран."
    ],
    "class.ranger": [
      "Єгер у кутку дивиться на єгеря в рейді. У повітрі стає забагато професійної тиші.",
      "Єгер поправляє капюшон синхронно з вами. Корчма на мить отримує зайву змову.",
      "Єгер дивиться на сліди піни й не каже вам очевидного. Професійна етика."
    ],
    "class.kharakternyk": [
      "Єгер перестає курити на мить. Навіть люлька хоче подивитись, хто кого передивиться.",
      "Єгер відсуває табурет від вашого погляду. Табурет не просив випробувань характеру.",
      "Єгер дивиться на Бочку, потім на вас, потім знову на Бочку. Ніхто першим не кліпає."
    ]
  };
}

function rangerRaceActions(): Record<string, string[]> {
  return {
    "race.human-ish": [
      "Єгер дивиться на вас як на майже нормальний ризик. Найпідозріліший різновид ризику.",
      "Єгер робить позначку «майже людина, майже план». У його нотатнику це комплімент."
    ],
    "race.dwarf": [
      "Єгер ставить кухоль нижче, ніби поважає гномську траєкторію удару.",
      "Єгер прибирає з підлоги зайву сіль. Гноми й так добре пам’ятають, де слизько."
    ],
    "race.elf": [
      "Єгер непомітно витирає стіл рукавом. Ельфійське несхвалення він відчув наперед.",
      "Єгер відсуває подряпаний кухоль у тінь. Ельфійські очі не заслужили всього одразу."
    ],
    "race.bisyny": [
      "Єгер затуляє нотатник, щоб бісини не почали правити його терміни.",
      "Єгер дивиться на словник біля бару й тихо зсуває його подалі від піни."
    ],
    "race.drantohor": [
      "Єгер повертає стрілку намальованої карти в бік Бочки. Дрантогорські маршрути не дрімають.",
      "Єгер перевіряє, чи вихід усе ще там, де був. З дрантогорцями це не формальність."
    ],
    "race.domovyk": [
      "Єгер піднімає ноги з підлоги. Домовик у рейді означає, що підлога може мати позицію.",
      "Єгер перепрошує у табурета перед тим, як його посунути. Домова дипломатія складна."
    ],
    "race.dryland-rusalka": [
      "Єгер перевіряє, чи чайник не став стратегічним об’єктом. З русалками краще завчасно.",
      "Єгер відсовує кухоль від краю столу. Сухопутна вода все одно має амбіції."
    ],
    "race.intellectual-orc": [
      "Єгер відкладає люльку, ніби готується слухати коротку, але важку доповідь.",
      "Єгер присуває серветку для тез. Орк-інтелігент у рейді може потребувати структури."
    ],
    "race.molfar-soul": [
      "Єгер дивиться в туман біля ваших плечей і ввічливо не питає, скільки вас там.",
      "Єгер ставить кухоль так, щоб туман не бачив дна. З мольфарськими душами краще чемно."
    ]
  };
}

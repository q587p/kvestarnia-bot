import type { CharacterSummary } from "../domain/characters/characterSummary";
import type { CharacterPath } from "../domain/characters/path";
import { getComboTitle } from "./characterOptions";
import { classes } from "./classes";
import { korchmaGreetingLines } from "./flavor/korchmaGreetings";
import { activeRaces } from "./races";
import type { Pronoun } from "./schema";

export type FlavorPlacement =
  | "korchma.greeting"
  | "quest.start"
  | "quest.outcome"
  | "raid.prep-hint"
  | "raid.ranger-action";

export type FlavorScene = "shawarma" | "fight" | "cellar" | "barrel";

export const BARD_FULL_RAID_DAILY_TIP =
  "Барди у повному рейді дають бафи, дебафи й відповідають за моральний стан табуретів.";

export const BARD_BIG_BARREL_SUPPORT_TIP =
  "Перед рейдом Бард може надихнути товариство виступом, а в самому рейді — послабити Старшого Брата журливою баладою. За моральний стан табуретів він усе одно відповідає.";

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

  return renderCharacterFlavorLine(
    pickDeterministic(candidates, buildFlavorSeed(character, query)),
    character
  );
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
    selected.push(renderCharacterFlavorLine(specific, character));
  }

  const fallback = selectBestFromTier(scored, (tier) => tier === 1, character, query, "fallback");

  if (fallback && !selected.some((line) => line.id === fallback.id)) {
    selected.push(renderCharacterFlavorLine(fallback, character));
  }

  return selected.slice(0, limit);
}

type KorchmaGreetingBucket = "combo" | "class" | "race" | "path" | "fallback";

const KORCHMA_GREETING_BUCKET_WEIGHTS: Array<{
  bucket: KorchmaGreetingBucket;
  weight: number;
}> = [
  { bucket: "combo", weight: 30 },
  { bucket: "class", weight: 30 },
  { bucket: "race", weight: 25 },
  { bucket: "path", weight: 5 },
  { bucket: "fallback", weight: 10 }
];

export function selectKorchmaGreetingLine(
  character: CharacterSummary,
  seed: string
): CharacterFlavorLine | null {
  const buckets = bucketKorchmaGreetingLines(character);
  const available = KORCHMA_GREETING_BUCKET_WEIGHTS.filter(
    (entry) => buckets[entry.bucket].length > 0
  );

  if (available.length === 0) {
    return null;
  }

  const totalWeight = available.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = hashString(buildKorchmaGreetingSeed(character, seed, "bucket")) % totalWeight;
  let selectedBucket = available[0]?.bucket ?? "fallback";

  for (const entry of available) {
    if (roll < entry.weight) {
      selectedBucket = entry.bucket;
      break;
    }

    roll -= entry.weight;
  }

  const candidates = buckets[selectedBucket].sort((left, right) =>
    left.id.localeCompare(right.id)
  );

  if (candidates.length === 0) {
    return null;
  }

  return renderCharacterFlavorLine(
    pickDeterministic(candidates, buildKorchmaGreetingSeed(character, seed, selectedBucket)),
    character
  );
}

function bucketKorchmaGreetingLines(
  character: CharacterSummary
): Record<KorchmaGreetingBucket, CharacterFlavorLine[]> {
  const buckets: Record<KorchmaGreetingBucket, CharacterFlavorLine[]> = {
    combo: [],
    class: [],
    race: [],
    path: [],
    fallback: []
  };

  for (const line of characterFlavorLines) {
    if (line.placement !== "korchma.greeting") {
      continue;
    }

    const selector = line.selector;

    if (!selector) {
      buckets.fallback.push(line);
      continue;
    }

    if (
      selector.combos?.some(
        (combo) => combo.raceId === character.raceId && combo.classId === character.classId
      )
    ) {
      buckets.combo.push(line);
      continue;
    }

    if (selector.classIds?.includes(character.classId)) {
      buckets.class.push(line);
      continue;
    }

    if (selector.raceIds?.includes(character.raceId)) {
      buckets.race.push(line);
      continue;
    }

    if (selector.pronouns?.includes(character.pronoun) || selector.paths?.includes(character.path)) {
      buckets.path.push(line);
    }
  }

  return buckets;
}

function buildKorchmaGreetingSeed(
  character: CharacterSummary,
  seed: string,
  suffix: string
): string {
  return [
    seed,
    character.name,
    character.raceId,
    character.classId,
    character.pronoun,
    character.path,
    character.title,
    suffix
  ].join("|");
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

function renderCharacterFlavorLine(
  line: CharacterFlavorLine,
  character: CharacterSummary
): CharacterFlavorLine {
  if (!line.text.includes("{title}")) {
    return line;
  }

  return {
    ...line,
    text: line.text.split("{title}").join(character.title)
  };
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
    text: shawarmaStartRaceText(race.id)
  }));
}

function buildShawarmaStartClassLines(): CharacterFlavorLine[] {
  return classes.map((heroClass) => ({
    id: `shawarma.start.class-pool.${contentSlug(heroClass.id)}`,
    placement: "quest.start",
    scene: "shawarma",
    selector: { classIds: [heroClass.id] },
    priority: -1,
    text: shawarmaStartClassText(heroClass.id)
  }));
}

function buildShawarmaStartComboLines(): CharacterFlavorLine[] {
  return availableRaceClassCombos().map(({ raceId, classId }) => ({
    id: `shawarma.start.combo.${contentSlug(raceId)}-${contentSlug(classId)}`,
    placement: "quest.start",
    scene: "shawarma",
    selector: { combos: [{ raceId, classId }] },
    text: `${shawarmaComboRaceBeat(raceId)} ${shawarmaComboClassBeat(classId)}`
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
      text: shawarmaOutcomeRaceText(race.id, action)
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
      text: shawarmaOutcomeClassText(heroClass.id, action)
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
    text: fightStartRaceText(race.id)
  }));
}

function buildFightStartClassLines(): CharacterFlavorLine[] {
  return classes.map((heroClass) => ({
    id: `fight.start.class-pool.${contentSlug(heroClass.id)}`,
    placement: "quest.start",
    scene: "fight",
    selector: { classIds: [heroClass.id] },
    priority: -1,
    text: fightStartClassText(heroClass.id)
  }));
}

function buildFightStartComboLines(): CharacterFlavorLine[] {
  return availableRaceClassCombos().map(({ raceId, classId }) => ({
    id: `fight.start.combo.${contentSlug(raceId)}-${contentSlug(classId)}`,
    placement: "quest.start",
    scene: "fight",
    selector: { combos: [{ raceId, classId }] },
    text: `{title} навпроти підозрілого монстра.\n\n${fightComboRaceBeat(raceId)} ${fightComboClassBeat(classId)}`
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
      text: fightOutcomeRaceText(race.id, action)
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
      text: fightOutcomeClassText(heroClass.id, heroClass.name, action)
    }))
  );
}

function buildCellarStartRaceLines(): CharacterFlavorLine[] {
  return activeRaces.map((race) => ({
    id: `cellar.start.race-pool.${contentSlug(race.id)}`,
    placement: "quest.start",
    scene: "cellar",
    selector: { raceIds: [race.id] },
    priority: -1,
    text: cellarStartRaceText(race.id)
  }));
}

function buildCellarStartClassLines(): CharacterFlavorLine[] {
  return classes.map((heroClass) => ({
    id: `cellar.start.class-pool.${contentSlug(heroClass.id)}`,
    placement: "quest.start",
    scene: "cellar",
    selector: { classIds: [heroClass.id] },
    priority: -1,
    text: cellarStartClassText(heroClass.id)
  }));
}

function buildCellarStartComboLines(): CharacterFlavorLine[] {
  return availableRaceClassCombos().map(({ raceId, classId }) => ({
    id: `cellar.start.combo.${contentSlug(raceId)}-${contentSlug(classId)}`,
    placement: "quest.start",
    scene: "cellar",
    selector: { combos: [{ raceId, classId }] },
    text: `${cellarComboRaceBeat(raceId)} ${cellarComboClassBeat(classId)}`
  }));
}

function buildCellarOutcomeRaceLines(): CharacterFlavorLine[] {
  return activeRaces.flatMap((race) =>
    cellarActions().map((action) => ({
      id: `cellar.outcome.race-pool.${contentSlug(race.id)}.${action}`,
      placement: "quest.outcome",
      scene: "cellar",
      selector: { raceIds: [race.id], actions: [action] },
      priority: -1,
      text: cellarOutcomeRaceText(race.id, action)
    }))
  );
}

function buildCellarOutcomeClassLines(): CharacterFlavorLine[] {
  return classes.flatMap((heroClass) =>
    cellarActions().map((action) => ({
      id: `cellar.outcome.class-pool.${contentSlug(heroClass.id)}.${action}`,
      placement: "quest.outcome",
      scene: "cellar",
      selector: { classIds: [heroClass.id], actions: [action] },
      priority: -1,
      text: cellarOutcomeClassText(heroClass.id, action)
    }))
  );
}

function buildCellarOutcomeComboLines(): CharacterFlavorLine[] {
  return availableRaceClassCombos().flatMap(({ raceId, classId }) =>
    cellarActions().map((action) => ({
      id: `cellar.outcome.combo.${contentSlug(raceId)}-${contentSlug(classId)}.${action}`,
      placement: "quest.outcome",
      scene: "cellar",
      selector: { combos: [{ raceId, classId }], actions: [action] },
      text: `{title}: ${cellarOutcomeActionBeat(action)} ${cellarOutcomeRaceBeat(raceId)} ${cellarOutcomeClassBeat(classId)}`
    }))
  );
}

function shawarmaStartRaceText(raceId: string): string {
  return (
    {
      "race.human-ish": "Людисько дивиться на шаурму з тим самим виразом, з яким дивляться на підозрілу знижку: хочеться, але є питання.",
      "race.dwarf": "Гном оцінює шаурму по вазі, шву лаваша й готовності пережити прямий аргумент об стіл.",
      "race.elf": "Ельф помічає, що соус ліг негармонійно. Гірше того, соус це помітив теж.",
      "race.bisyny": "Бісини вже хочуть виправити назву страви, але шаурма ворушиться першою. Це граматична ескалація.",
      "race.drantohor": "Дрантогор бачить у шаурмі короткий шлях до проблеми. Короткі шляхи, як завжди, мають зуби.",
      "race.domovyk": "Домовик дивиться на крихти під шаурмою як на порушення хатнього статуту.",
      "race.dryland-rusalka": "Сухопутна русалка чує, як соус удає море. Дуже мале, дуже часникове, але нахабне.",
      "race.intellectual-orc": "Орк-інтелігент формулює до шаурми перше питання. Шаурма відповідає парою, що вважається слабким аргументом.",
      "race.molfar-soul": "Мольфарська душа відчуває над лавашем дрібний туман наміру. Туман пахне куркою й поганими рішеннями."
    } satisfies Record<string, string>
  )[raceId] ?? "Шаурма поводиться як проблема, яка ще не обрала жанр.";
}

function shawarmaStartClassText(classId: string): string {
  return (
    {
      "class.warrior": "Воїн бачить лаваш, який занадто впевнено тримає форму. Так починаються прості плани.",
      "class.mage": "Маг помічає, що пара над шаурмою складається в знак, якого точно не було в меню.",
      "class.bard": "Бард чує з шаурми ритм. На жаль, це не вступ до пісні, а підготовка до укусу.",
      "class.rogue": "Злодій бачить, що шаурма лежить так, ніби ховає гаманець. Або зуби. Можливо, і те, і те.",
      "class.priest": "Жрець відчуває спокусу назвати це вечерею, але суворий погляд уже дістав кадило.",
      "class.varenyk-mancer": "Вареник-мант не довіряє цій начинці. Вона не має честі, форми й нормального краю тіста.",
      "class.bureaucramancer": "Бюрокромант шукає на шаурмі походження, дату, печатку й відповідального за дихання.",
      "class.ranger": "Єгер читає слід соусу від тарілки до краю стола. Слід явно збирався втекти.",
      "class.kharakternyk": "Козак-характерник мовчки дивиться на шаурму. Лаваш робить вигляд, що йому не страшно, і провалює перевірку."
    } satisfies Record<string, string>
  )[classId] ?? "Шаурма не схожа на вечерю. Вечері рідко оцінюють дистанцію до пальців.";
}

function shawarmaOutcomeRaceText(
  raceId: string,
  action: "poke" | "receipt" | "flee"
): string {
  const actionBeat = shawarmaActionBeat(action);

  return (
    {
      "race.human-ish": `Людисько ${actionBeat} лишає шаурмі найстрашніше: майже нормальне пояснення, чому так не можна.`,
      "race.dwarf": `Гном ${actionBeat} доводить, що навіть мʼякий лаваш може зустріти тверду позицію.`,
      "race.elf": `Ельф ${actionBeat} завершує сцену так акуратно, що соус соромиться власної композиції.`,
      "race.bisyny": `Бісини ${actionBeat} редагують поведінку шаурми до стану «не кусається без примітки».`,
      "race.drantohor": `Дрантогор ${actionBeat} показує шаурмі обхідний маршрут до поразки. Вона знаходить його одразу.`,
      "race.domovyk": `Домовик ${actionBeat} нагадує лавашу, що на чужому столі треба поводитися як гість, а не як сюжет.`,
      "race.dryland-rusalka": `Сухопутна русалка ${actionBeat} залишає соус без морських претензій і з побутовою тривогою.`,
      "race.intellectual-orc": `Орк-інтелігент ${actionBeat} розкладає інцидент на тези, крихти й один дуже переконливий висновок.`,
      "race.molfar-soul": `Мольфарська душа ${actionBeat} загортає підозру в туман. Шаурма вже не певна, чи була головною.`
    } satisfies Record<string, string>
  )[raceId] ?? `Пригодник ${actionBeat} лишає шаурму з короткою біографією поразки.`;
}

function shawarmaOutcomeClassText(
  classId: string,
  action: "poke" | "receipt" | "flee"
): string {
  const actionBeat = shawarmaActionBeat(action);

  return (
    {
      "class.warrior": `Воїн ${actionBeat} пояснює лавашу головне правило пригод: якщо дихаєш на стіл, тримай удар.`,
      "class.mage": `Маг ${actionBeat} знімає з шаурми зайву містичність. Лишається часник, пара й дуже винний вигляд.`,
      "class.bard": `Бард ${actionBeat} ставить фінальну ноту. Шаурма хотіла вкусити, але потрапила в приспів.`,
      "class.rogue": `Злодій ${actionBeat} виходить зі справи так тихо, що шаурма підозрює власну кишеню.`,
      "class.priest": `Жрець ${actionBeat} дає шаурмі урок покаяння. Лаваш слухає, бо іншого виходу вже немає.`,
      "class.varenyk-mancer": `Вареник-мант ${actionBeat} виносить начинковий вирок: ця конструкція не пройшла родинну перевірку тіста.`,
      "class.bureaucramancer": `Бюрокромант ${actionBeat} закриває шаурму актом про самовільне дихання в громадському місці.`,
      "class.ranger": `Єгер ${actionBeat} читає сліди соусу й знаходить там відповідь: не треба було повзти до пальців.`,
      "class.kharakternyk": `Козак-характерник ${actionBeat} лишає на столі тишу. Шаурма в цій тиші виглядає менш хоробро.`
    } satisfies Record<string, string>
  )[classId] ?? `Справу ${actionBeat} закрито так, що шаурма просить менший шрифт у легенді.`;
}

function fightStartRaceText(raceId: string): string {
  return (
    {
      "race.human-ish": "Людисько дивиться на підозрілого монстра й бачить проблему, яка ще не знає, що стала навчальною.",
      "race.dwarf": "Гном чує, як підлога просить не робити різких рухів. Підлога, як завжди, спізнилась.",
      "race.elf": "Ельф бачить у монстрі поганий силует, гіршу поставу й абсолютно неприйнятні наміри.",
      "race.bisyny": "Бісини помічають, що монстр названий неточно. Монстр помічає, що це небезпечніше за зброю.",
      "race.drantohor": "Дрантогор стає так, ніби знає два виходи й один із них веде прямо через монстра.",
      "race.domovyk": "Домовик зиркає на монстра як на істоту, що зайшла в хату без стуку й з зубами.",
      "race.dryland-rusalka": "Сухопутна русалка відчуває драму в повітрі. Повітря просить не робити його мокрим.",
      "race.intellectual-orc": "Орк-інтелігент оцінює монстра як слабко структуровану загрозу з надлишком щелепи.",
      "race.molfar-soul": "Мольфарська душа бачить, як тінь монстра нервово шукає іншу роботу."
    } satisfies Record<string, string>
  )[raceId] ?? "Підозрілий монстр робить перший висновок: сьогодні буде не меню.";
}

function fightStartClassText(classId: string): string {
  return (
    {
      "class.warrior": "Воїн не питає, чому монстр шкіриться. Воїн питає, куди краще поставити відповідь.",
      "class.mage": "Маг бачить, що монстр погано заземлений. Це звучить як запрошення до експерименту.",
      "class.bard": "Бард оцінює акустику сутички. Монстр, на жаль, уже вибрав жанр гарчання.",
      "class.rogue": "Злодій шукає спину, тінь або хоча б морально слабкий кут. У монстра є всі три.",
      "class.priest": "Жрець розрізняє в монстрі гріх, апетит і погану поставу. Лікується все, але не однаково.",
      "class.varenyk-mancer": "Вареник-мант бачить, що перед ним не начинка. Отже, можна не шкодувати.",
      "class.bureaucramancer": "Бюрокромант відкриває справу про самовільну загрозу. Монстр не має права мовчати, але гарчить.",
      "class.ranger": "Єгер відмічає дистанцію, сліди й дурне місце для засідки. Монстр стоїть у всіх трьох пунктах.",
      "class.kharakternyk": "Козак-характерник дає монстру довгу паузу. Монстр не витримує і моргає першим."
    } satisfies Record<string, string>
  )[classId] ?? "Сутичка вже має зуби. Тепер їй бракує лише поганого рішення.";
}

function fightOutcomeRaceText(raceId: string, action: "attack" | "receipt" | "flee"): string {
  const actionBeat = fightActionBeat(action);

  return (
    {
      "race.human-ish": `Людисько ${actionBeat} виходить із сутички майже буденно. Саме це найбільше ображає монстра.`,
      "race.dwarf": `Гном ${actionBeat} залишає по собі тверду думку й мʼяке здивування супротивника.`,
      "race.elf": `Ельф ${actionBeat} поправляє фінал сцени так, щоб навіть поразка монстра виглядала охайно.`,
      "race.bisyny": `Бісини ${actionBeat} доводять, що правильно назвати проблему інколи болючіше, ніж її вдарити.`,
      "race.drantohor": `Дрантогор ${actionBeat} завершує бій трохи не там, де починав, але саме там, де треба.`,
      "race.domovyk": `Домовик ${actionBeat} нагадує монстру: у хаті можна шуміти тільки тим, хто потім прибирає.`,
      "race.dryland-rusalka": `Сухопутна русалка ${actionBeat} лишає після себе сухий підсумок і вологу драму.`,
      "race.intellectual-orc": `Орк-інтелігент ${actionBeat} формулює перемогу так чітко, що монстру бракує аргументів і зубів.`,
      "race.molfar-soul": `Мольфарська душа ${actionBeat} відпускає тінь сутички першою. Монстр відстає від власної тіні.`
    } satisfies Record<string, string>
  )[raceId] ?? `Сутичку ${actionBeat} завершено з виглядом, що так і мало бути.`;
}

function cellarStartRaceText(raceId: string): string {
  return (
    {
      "race.human-ish": "Людисько спускається в льох із виразом «я зараз швидко». Льох тихо сміється пилом.",
      "race.dwarf": "Гном у льосі почувається майже вдома, доки миша не починає сперечатися про право на сир.",
      "race.elf": "Ельф бачить павутиння, пил і дизайнерську катастрофу. Миша бачить проблему вдвічі вищу за себе.",
      "race.bisyny": "Бісини ще не спустилися, а миша вже ховає всі таблички з назвами запасів.",
      "race.drantohor": "Дрантогор бачить у льосі короткий маршрут до крихт, плінтуса й потенційної державної межі.",
      "race.domovyk": "Домовик заходить у льох так, ніби це він дозволив сходам існувати.",
      "race.dryland-rusalka": "Сухопутна русалка чує, як вологий куток удає стародавню затоку. Дуже маленьку.",
      "race.intellectual-orc": "Орк-інтелігент бачить льохову проблему й одразу шукає, де в миші слабка теза.",
      "race.molfar-soul": "Мольфарська душа помічає тінь під шафою. Тінь помічає сир і вдає, що не з мишею."
    } satisfies Record<string, string>
  )[raceId] ?? "Льох зустрічає пригодника запахом пилу й малою політичною кризою.";
}

function cellarStartClassText(classId: string): string {
  return (
    {
      "class.warrior": "Воїн дивиться на віник як на зброю з поганим маркетингом.",
      "class.mage": "Маг бачить, що пил лежить не хаотично, а майже ритуально. Це гірше, бо доведеться думати.",
      "class.bard": "Бард чує писк, риму й дуже поганий вступ до льохової балади.",
      "class.rogue": "Злодій одразу помічає сир, нору й те місце, де всі роблять вигляд, що нічого не зникло.",
      "class.priest": "Жрець благословляє сходи, бо вони бачили надто багато героїв із впевненістю в колінах.",
      "class.varenyk-mancer": "Вареник-мант відчуває сирну політику. Це не кухня, але вже близько до конфлікту начинок.",
      "class.bureaucramancer": "Бюрокромант дивиться на льох і розуміє: тут давно не було форми, а дарма.",
      "class.ranger": "Єгер читає сліди миші, сиру й того, хто впустив крихту, але вдає невинність.",
      "class.kharakternyk": "Козак-характерник спускається мовчки. Пил сам шукає, куди б йому лягти рівніше."
    } satisfies Record<string, string>
  )[classId] ?? "Льох відкриває справу. Миша не просила адвоката, але вже думає.";
}

function cellarOutcomeRaceText(
  raceId: string,
  action: "cheese-trap" | "sweep-bravely" | "negotiate"
): string {
  const actionBeat = cellarActionBeat(action);

  return (
    {
      "race.human-ish": `Людисько ${actionBeat} робить льох трохи менш дивним. Це ненадовго, але журналу вистачить.`,
      "race.dwarf": `Гном ${actionBeat} лишає льох міцнішим у моральному сенсі й підозрілим у сирному.`,
      "race.elf": `Ельф ${actionBeat} доводить павутинню, що навіть хаос може мати кращу композицію.`,
      "race.bisyny": `Бісини ${actionBeat} виправляють мишачу політику до стану, де сир уже боїться термінів.`,
      "race.drantohor": `Дрантогор ${actionBeat} переносить межу безладу на одну крихту далі від сходів.`,
      "race.domovyk": `Домовик ${actionBeat} ставить льох на місце. Льох не сперечається, бо знає орендаря.`,
      "race.dryland-rusalka": `Сухопутна русалка ${actionBeat} лишає в кутку драму, яка майже навчилась бути сухою.`,
      "race.intellectual-orc": `Орк-інтелігент ${actionBeat} переконує мишу так ґрунтовно, що крихти просять конспект.`,
      "race.molfar-soul": `Мольфарська душа ${actionBeat} прибирає тінь конфлікту під шафу. Там їй і місце.`
    } satisfies Record<string, string>
  )[raceId] ?? `Льох ${actionBeat} погоджується бути трохи спокійнішим.`;
}

function cellarOutcomeClassText(
  classId: string,
  action: "cheese-trap" | "sweep-bravely" | "negotiate"
): string {
  const actionBeat = cellarActionBeat(action);

  return (
    {
      "class.warrior": `Воїн ${actionBeat} доводить, що навіть льохова справа іноді потребує плечей і впертого віника.`,
      "class.mage": `Маг ${actionBeat} змушує пил світитися достатньо, щоб миша зрозуміла натяк без лекції.`,
      "class.bard": `Бард ${actionBeat} завершує сцену так, що миша просить не робити з цього куплет.`,
      "class.rogue": `Злодій ${actionBeat} лишає льох без зайвого шуму, зате з новими підозрами щодо сиру.`,
      "class.priest": `Жрець ${actionBeat} благословляє порядок. Пил приймає це як особисту образу.`,
      "class.varenyk-mancer": `Вареник-мант ${actionBeat} пояснює сирній кризі, що начинка без дисципліни довго не живе.`,
      "class.bureaucramancer": `Бюрокромант ${actionBeat} закриває льохове питання так, що миша сама шукає додаток до угоди.`,
      "class.ranger": `Єгер ${actionBeat} читає фінальний слід і бачить: миша пішла, сир нервує, льох дихає.`,
      "class.kharakternyk": `Козак-характерник ${actionBeat} залишає плінтус у стані дисциплінованого мовчання.`
    } satisfies Record<string, string>
  )[classId] ?? `Льохову справу ${actionBeat} закрито з виглядом, що все було під контролем.`;
}

function shawarmaActionBeat(action: "poke" | "receipt" | "flee"): string {
  return (
    {
      poke: "після сміливого тицяння",
      receipt: "після чекової атаки",
      flee: "після стратегічного відходу від соусу"
    } satisfies Record<typeof action, string>
  )[action];
}

function fightActionBeat(action: "attack" | "receipt" | "flee"): string {
  return (
    {
      attack: "після прямого зіткнення",
      receipt: "після удару адміністративним доказом",
      flee: "після відступу з легендою для свідків"
    } satisfies Record<typeof action, string>
  )[action];
}

function cellarActionBeat(action: "cheese-trap" | "sweep-bravely" | "negotiate"): string {
  return (
    {
      "cheese-trap": "через сирну пастку",
      "sweep-bravely": "після хороброго підмітання",
      negotiate: "після переговорів із малою сирною владою"
    } satisfies Record<typeof action, string>
  )[action];
}

function shawarmaComboRaceBeat(raceId: string): string {
  return (
    {
      "race.human-ish": "Серветка отримує людиськовий погляд: співчутливий, але вже з підозрою.",
      "race.dwarf": "Стіл тихенько просідає від гномської готовности розв’язувати харчові питання ґрунтовно.",
      "race.elf": "Лаваш раптом згадує, що міг би бути естетичнішим, і це його нервує.",
      "race.bisyny": "Назва страви відчуває, що зараз її почнуть правити без попередження.",
      "race.drantohor": "Пів шаурми дивиться на схід, пів — на захід, і обидві половини винні.",
      "race.domovyk": "Крихти під столом шикуються так, ніби зараз буде домовий аудит.",
      "race.dryland-rusalka": "Соус робить вигляд, що він море. Ніхто йому не вірить, але всі поважають амбіцію.",
      "race.intellectual-orc": "Запах часнику отримує тезу, антитезу і шанс здатися до висновків.",
      "race.molfar-soul": "Над лавашем згущується туман, який дуже просить не називати його соусом."
    } satisfies Record<string, string>
  )[raceId] ?? "Шаурма розуміє, що біографія пригодника може бути гіршою за ніж.";
}

function shawarmaComboClassBeat(classId: string): string {
  return (
    {
      "class.warrior": "План простий: знайти слабке місце й переконати його силою.",
      "class.mage": "Магічна частина плану вже світиться; побутова частина плану поки в серветці.",
      "class.bard": "Перший куплет ще не прозвучав, а шаурма вже просить не римувати її з травмою.",
      "class.rogue": "Кут атаки знайдено там, де порядна вечеря не мала б мати кутів.",
      "class.priest": "Моральна перевага підготовлена, освячена й трохи пахне часником.",
      "class.varenyk-mancer": "Начинка підозрює, що її зараз порівняють із варениками, і це справедливо.",
      "class.bureaucramancer": "Справа відкривається без печатки, але з дуже тривожним додатком із соусу.",
      "class.ranger": "Слід веде від тарілки до проблеми; проблема прикидається гарніром.",
      "class.kharakternyk": "Погляд такий степовий, що шаурма на мить хоче стати куренем."
    } satisfies Record<string, string>
  )[classId] ?? "План є. Він поганий, але достатньо героїчний.";
}

function fightComboRaceBeat(raceId: string): string {
  return (
    {
      "race.human-ish": "Зала бачить звичайного пригодника, а монстр — уже не зовсім звичайну проблему.",
      "race.dwarf": "Підлога готується тримати удар, бо гномські аргументи рідко бувають невагомими.",
      "race.elf": "Навіть небезпека намагається стояти красивіше, коли на неї так дивляться.",
      "race.bisyny": "Монстр ще не знає, що його назву можуть відредагувати болючіше за щелепу.",
      "race.drantohor": "Простір навколо сутички трохи плутається, де саме має бути центр подій.",
      "race.domovyk": "Усі раптом згадують, що битися в чужій хаті треба акуратно.",
      "race.dryland-rusalka": "Повітря стає вологішим від самої думки про драму.",
      "race.intellectual-orc": "Монстр отримує погляд, який уже поставив йому незадовільну оцінку.",
      "race.molfar-soul": "Туман стоїть поруч і робить вигляд, що це технічна підтримка."
    } satisfies Record<string, string>
  )[raceId] ?? "Монстр нервує так, ніби прочитав наступний абзац.";
}

function fightComboClassBeat(classId: string): string {
  return (
    {
      "class.warrior": "Зараз буде просте пояснення, яке зазвичай залишає вм’ятину.",
      "class.mage": "Іскри вже записались у свідки й відмовляються мовчати.",
      "class.bard": "Сцена готова, публіка не дуже, монстр узагалі не голосував.",
      "class.rogue": "Нечесний кут сутички знайдено, підписано й приховано в рукаві.",
      "class.priest": "Благословення напоготові; осуд теж, але він дешевший.",
      "class.varenyk-mancer": "Начинка бойового плану тримається на чесному тісті й сумнівній сметані.",
      "class.bureaucramancer": "Якщо монстр виживе, йому доведеться пояснити це в трьох примірниках.",
      "class.ranger": "Слід є, дистанція є, підозра має форму зубів.",
      "class.kharakternyk": "Степовий спокій робить паузу страшнішою за перший удар."
    } satisfies Record<string, string>
  )[classId] ?? "У плану є початок, середина й дуже гучне «ой».";
}

function fightOutcomeClassText(
  classId: string,
  className: string,
  action: "attack" | "receipt" | "flee"
): string {
  const actionBeat =
    {
      attack: "після прямого аргументу",
      receipt: "після небезпечної бюрократії",
      flee: "після стратегічного збереження репутації"
    } satisfies Record<typeof action, string>;

  return (
    {
      "class.warrior": `Воїн ${actionBeat[action]} лишає монстра з новим розумінням слова «ближче».`,
      "class.mage": `Маг ${actionBeat[action]} збирає іскри докупи. Монстр теж хотів би зібратися, але частинами думки.`,
      "class.bard": `Бард ${actionBeat[action]} завершує номер так, що монстр просить тиші й окремий рахунок.`,
      "class.rogue": `Злодій ${actionBeat[action]} виходить із сутички з виглядом людини, яка не була тут офіційно.`,
      "class.priest": `Жрець ${actionBeat[action]} демонструє милосердя дозовано. Монстру дісталась навчальна порція.`,
      "class.varenyk-mancer": `Вареник-мант ${actionBeat[action]} доводить: правильна начинка плану теж може бути бойовою.`,
      "class.bureaucramancer": `Бюрокромант ${actionBeat[action]} закриває інцидент формою, шумом і підписом монстра не там, де треба.`,
      "class.ranger": `Єгер ${actionBeat[action]} читає сліди сутички й знаходить у них короткий висновок: не стояти зубами вперед.`,
      "class.kharakternyk": `Козак-характерник ${actionBeat[action]} лишає в повітрі степовий спокій і дуже неспокійного монстра.`
    } satisfies Record<string, string>
  )[classId] ?? `${className} ${actionBeat[action]} завершує сутичку так, що проблема просить менший шрифт.`;
}

function cellarComboRaceBeat(raceId: string): string {
  return (
    {
      "race.human-ish": "Пил поводиться майже пристойно, бо людиськовий погляд уже шукає винного.",
      "race.dwarf": "Сходи скриплять із повагою: гном у льосі завжди звучить як інвентаризація каменю.",
      "race.elf": "Навіть павутиння намагається висіти елегантніше.",
      "race.bisyny": "Миша ховає табличку з назвою нори, бо відчуває редакційну небезпеку.",
      "race.drantohor": "Льох раптом здається прикордонною територією з сирним питанням.",
      "race.domovyk": "Кожна полиця згадує, хто тут насправді має право грюкати.",
      "race.dryland-rusalka": "Вологість у кутку робить невдалу спробу стати легендою.",
      "race.intellectual-orc": "Мишача позиція отримує шанс бути розібраною етично й дуже переконливо.",
      "race.molfar-soul": "Тінь під шафою шепоче, що сир — це теж оберіг, якщо достатньо голодний."
    } satisfies Record<string, string>
  )[raceId] ?? "Льох робить вигляд, що це не він.";
}

function cellarComboClassBeat(classId: string): string {
  return (
    {
      "class.warrior": "План пахне хоробрістю й легким ризиком для меблів.",
      "class.mage": "Пил світиться настільки, наскільки дозволяє бюджет льоху.",
      "class.bard": "Миша вже боїться не пастки, а другого куплету.",
      "class.rogue": "Сир охороняють так, ніби він сам просив конспірації.",
      "class.priest": "Благословення лягає на підлогу обережно, щоб не налякати крихти.",
      "class.varenyk-mancer": "Кухня підозрює, що льох зараз втягнуть у начинкову політику.",
      "class.bureaucramancer": "Протокол нори відкрито; миша вимагає адвоката й зернятко.",
      "class.ranger": "Слід від крихти до нори стає майже офіційною картою.",
      "class.kharakternyk": "Плінтус відчуває степову дисципліну й намагається не скрипіти."
    } satisfies Record<string, string>
  )[classId] ?? "Миша бачить героя і вже жаліє, що не лишила записку коротшою.";
}

function cellarOutcomeActionBeat(action: "cheese-trap" | "sweep-bravely" | "negotiate"): string {
  return (
    {
      "cheese-trap": "сирна пастка стає доказом, що дипломатія інколи пахне краще за меч.",
      "sweep-bravely": "підмітання проходить із таким пафосом, ніби пил сам підписав капітуляцію.",
      negotiate: "переговори доходять до пункту, де навіть миша визнає: це вже майже угода."
    } satisfies Record<typeof action, string>
  )[action];
}

function cellarOutcomeRaceBeat(raceId: string): string {
  return (
    {
      "race.human-ish": "Корчма отримує ще одну людиськову історію, яку ніхто не просив, але всі слухають.",
      "race.dwarf": "Льох стає міцнішим морально, хоча технічно це не гарантія.",
      "race.elf": "Павутиння виглядає так, ніби його щойно критикували за композицію.",
      "race.bisyny": "Термінологія мишачої автономії тремтить, але тримається.",
      "race.drantohor": "Кордон між порядком і хаосом пересунуто на одну крихту.",
      "race.domovyk": "Полиці схвально мовчать, а це в домових справах майже овація.",
      "race.dryland-rusalka": "Сухість льоху переживає маленьку драму й просить не розголошувати.",
      "race.intellectual-orc": "Аргументи стають настільки чіткими, що миша ховає контраргументи за шафу.",
      "race.molfar-soul": "Туман під плінтусом поводиться як свідок, який усе бачив, але не підписувався."
    } satisfies Record<string, string>
  )[raceId] ?? "Льох лишається льохом, але вже з досвідом.";
}

function cellarOutcomeClassBeat(classId: string): string {
  return (
    {
      "class.warrior": "Сила тут не головна, але дуже переконлива в примітках.",
      "class.mage": "Магічні залишки підмітають окремо, бо вони ще сперечаються.",
      "class.bard": "Фінальний акорд миша просить не повторювати після десятої.",
      "class.rogue": "Ніхто не бачив, як зник зайвий сир, і це найкращий доказ професіоналізму.",
      "class.priest": "Крихти отримують благословення коротше, ніж попередній договір.",
      "class.varenyk-mancer": "Начинкова логіка перемагає там, де звичайна логіка просила перерву.",
      "class.bureaucramancer": "Печатка не потрібна, але всі поводяться так, ніби вона вже десь є.",
      "class.ranger": "Слід до нори закрито, але залишено для майбутніх легенд.",
      "class.kharakternyk": "Льох ще довго стоїть рівніше, ніж до цього хотів."
    } satisfies Record<string, string>
  )[classId] ?? "Справа закрита, а льох робить вигляд, що завжди так умів.";
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

function cellarActions(): Array<"cheese-trap" | "sweep-bravely" | "negotiate"> {
  return ["cheese-trap", "sweep-bravely", "negotiate"];
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
    text: "Форми 13-А сьогодні не видаємо. Тільки 13-А/пінне і то під розпис."
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
    text: "{title} під музику. Нарешті в нас буде культурний скандал."
  },
  {
    id: "korchma.greeting.combo.drantohor-kharakternyk",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.drantohor", classId: "class.kharakternyk" }] },
    text: "{title} на порозі. Остромаг і корчма щойно посперечались за карту."
  },
  {
    id: "korchma.greeting.combo.domovyk-bureaucramancer",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.domovyk", classId: "class.bureaucramancer" }] },
    text: "{title}? Шафа за баром уже подала заяву на родинні звʼязки."
  },
  {
    id: "korchma.greeting.combo.dryland-rusalka-varenyk-mancer",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.dryland-rusalka", classId: "class.varenyk-mancer" }] },
    text: "{title}. Море не прийшло, зате кухня нервує."
  },
  {
    id: "korchma.greeting.combo.intellectual-orc-warrior",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.intellectual-orc", classId: "class.warrior" }] },
    text: "{title}? Тільки не рецензуйте двері обома руками."
  },
  {
    id: "korchma.greeting.combo.molfar-soul-mage",
    placement: "korchma.greeting",
    selector: { combos: [{ raceId: "race.molfar-soul", classId: "class.mage" }] },
    text: "{title}? Не складайте туман біля вікна, він знову втече в кредит."
  },
  ...korchmaGreetingLines,
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
    text: "Льох дивиться на вас як на законного, хоч і неоформленого, керівника житлового питання."
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
    text: "Льох нагадує короткий шлях до Остромагу: темно, сирно й ніхто не гарантує виходу."
  },
  {
    id: "cellar.outcome.domovyk.negotiate",
    placement: "quest.outcome",
    scene: "cellar",
    selector: { raceIds: ["race.domovyk"], actions: ["negotiate"] },
    text: "Миша визнала ваші права на льох, але попросила автономію за шафою. Компроміс пахне сиром."
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
  ...buildCellarStartRaceLines(),
  ...buildCellarStartClassLines(),
  ...buildCellarStartComboLines(),
  ...buildCellarOutcomeRaceLines(),
  ...buildCellarOutcomeClassLines(),
  ...buildCellarOutcomeComboLines(),
  // Shared raid-prep flavor must remain safe on unrelated Fight and Duel surfaces.
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
    text: "Бардам у повному рейді довірять ритм, настрій і табурети. Принаймні один із цих пунктів переживе Бочку."
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
    text: "Бюрокромантам у повному рейді: без форми 13-А бочка не має права бути босом. Нагадуйте їй боляче."
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
    text: "Характерникам у повному рейді: дивіться на боса так, щоб він сам згадав перерву між діями."
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
    text: "{title} у рейді — це коли розташування боса сперечається з географією."
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
    ...recordLines("barrel.raid-hint.combo", titleTemplateComboTips(comboRaidTips()), (combo) => {
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

function titleTemplateComboTips(record: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(record).map(([key, texts]) => [
      key,
      texts.map((text) => replaceComboLabelWithTitleTemplate(key, text))
    ])
  );
}

function replaceComboLabelWithTitleTemplate(comboKeyValue: string, text: string): string {
  const [raceId, classId] = comboKeyValue.split(":");

  if (!raceId || !classId) {
    return text;
  }

  const race = activeRaces.find((candidate) => candidate.id === raceId);
  const heroClass = classes.find((candidate) => candidate.id === classId);

  if (!race || !heroClass) {
    return text;
  }

  for (const label of comboLabelVariants(race.name, heroClass.name, raceId, classId)) {
    const replaced = text.replace(new RegExp(`^${escapeRegex(label)}`, "iu"), "{title}");

    if (replaced !== text) {
      return replaced;
    }
  }

  return text;
}

function comboLabelVariants(
  raceName: string,
  className: string,
  raceId: string,
  classId: string
): string[] {
  const classLabels = classLabelVariants(className);
  const raceLabels =
    raceName === "Русалка сухопутна" ? [raceName, "Сухопутна русалка"] : [raceName];
  const pronouns: Pronoun[] = ["he", "she", "they"];
  const titleLabels = pronouns.flatMap((pronoun) => {
    const title = getComboTitle(raceId, classId, pronoun);

    return [title, lowerFirst(title), upperFirst(title.toLocaleLowerCase("uk-UA"))];
  });

  return [
    ...raceLabels.flatMap((raceLabel) =>
      classLabels.map((classLabel) => `${raceLabel}-${classLabel}`)
    ),
    ...titleLabels
  ];
}

function classLabelVariants(className: string): string[] {
  const classLabel = lowerFirst(className);
  const [, ...tailParts] = classLabel.split("-");
  const labels = [classLabel, ...classAlternativeLabels(classLabel)];

  if (tailParts.length === 0) {
    return labels;
  }

  return [...labels, tailParts.join("-")];
}

function classAlternativeLabels(classLabel: string): string[] {
  if (classLabel === "жрець") {
    return ["жриця"];
  }

  return [];
}

function lowerFirst(value: string): string {
  const [first = "", ...rest] = [...value];

  return `${first.toLocaleLowerCase("uk-UA")}${rest.join("")}`;
}

function upperFirst(value: string): string {
  const [first = "", ...rest] = [...value];

  return `${first.toLocaleUpperCase("uk-UA")}${rest.join("")}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      "Форма 13-А не зупиняє Бочку, але змушує її булькати з повагою.",
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
      "Після рейду перевірте кишені: піна не краде золото, але краде пояснення.",
      "Перед першим ударом подивіться на вихід. Не для втечі, а щоб вихід теж нервував.",
      "Якщо монстр занадто впевнений, спитайте, хто його тестував. Це збиває пафос краще за табурет.",
      "Не витрачайте героїчну позу на порожню ману. Позу теж треба годувати.",
      "Коли навичка відсапується, зробіть мудрий вигляд. Монстри рідко відрізняють мудрість від затримки.",
      "Не сперечайтесь із люком. Люк бачив більше падінь, ніж ваша автобіографія.",
      "Якщо Низ гарчить ритмічно, це не музика. Це попередження з почуттям такту.",
      "Перед боєм перевірте чоботи: героїзм любить тверду підлогу й підозрює слиз.",
      "Не розкривайте монстру весь план. Особливо якщо план складається з одного здивованого вигуку.",
      "Коли Корчмар каже «звичайний монстр», уточніть, для кого звичайний.",
      "Якщо перемога пахне зарано, можливо, це не перемога, а чиясь мокра пастка."
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

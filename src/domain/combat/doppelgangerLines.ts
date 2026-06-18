export type DoppelgangerLineCategory =
  | "spawn.copy"
  | "spawn.random"
  | "spawn.champion"
  | "turn.idle"
  | "turn.before_ability"
  | "turn.after_ability"
  | "turn.item_ability"
  | "turn.low_hp"
  | "turn.copying"
  | "kill"
  | "victory"
  | "defeat"
  | "fallback";

export interface DoppelgangerLineContext {
  category: DoppelgangerLineCategory;
  seed?: string | undefined;
  recentLineIds?: readonly string[] | undefined;
  recentLineMemorySize?: number | undefined;
  targetName?: string | null | undefined;
  doppelName?: string | null | undefined;
  raceName?: string | null | undefined;
  className?: string | null | undefined;
  title?: string | null | undefined;
  abilityName?: string | null | undefined;
  itemName?: string | null | undefined;
  championPeriod?: string | null | undefined;
  turn?: number | undefined;
}

export interface DoppelgangerSelectedLine {
  id: string;
  category: DoppelgangerLineCategory;
  text: string;
}

interface DoppelgangerLineTemplate {
  id: string;
  category: DoppelgangerLineCategory;
  text: string;
  weight?: number;
}

const DEFAULT_RECENT_LINE_MEMORY_SIZE = 3;

const DOPPELGANGER_LINES: readonly DoppelgangerLineTemplate[] = [
  {
    id: "dg.spawn.copy.001",
    category: "spawn.copy",
    text: "Я взяв твою поставу, {targetName}. Подивимось, чи вмієш бити себе."
  },
  {
    id: "dg.spawn.copy.002",
    category: "spawn.copy",
    text: "Дзеркало навчилося ходити. І воно знає твої звички."
  },
  {
    id: "dg.spawn.copy.003",
    category: "spawn.copy",
    text: "Твоє ім’я мені не потрібне. Достатньо твоєї форми."
  },
  {
    id: "dg.spawn.copy.004",
    category: "spawn.copy",
    text: "Ти приніс зброю. Я приніс тебе."
  },
  {
    id: "dg.spawn.copy.005",
    category: "spawn.copy",
    text: "Не хвилюйся, {targetName}. Я користуватимусь тобою краще."
  },
  {
    id: "dg.spawn.copy.006",
    category: "spawn.copy",
    text: "Один із нас — помилка віддзеркалення. Перевіримо, хто саме."
  },
  {
    id: "dg.spawn.random.001",
    category: "spawn.random",
    text: "Сьогодні дзеркало не питає дозволу: {raceName}, {className}, готово."
  },
  {
    id: "dg.spawn.random.002",
    category: "spawn.random",
    text: "Я міг бути тобою. Але ця подоба цікавіша."
  },
  {
    id: "dg.spawn.random.003",
    category: "spawn.random",
    text: "Нова шкіра, нові трюки, та сама порожнеча за очима."
  },
  {
    id: "dg.spawn.random.004",
    category: "spawn.random",
    text: "Кістки склалися інакше. Біль усе одно буде твоїм."
  },
  {
    id: "dg.spawn.random.005",
    category: "spawn.random",
    text: "Дзеркало кинуло жереб. Тобі випало вижити. Можливо."
  },
  {
    id: "dg.spawn.champion.001",
    category: "spawn.champion",
    text: "Я пам’ятаю чемпіона {championPeriod}. Тепер і ти згадаєш."
  },
  {
    id: "dg.spawn.champion.002",
    category: "spawn.champion",
    text: "Титул {title} лишив у дзеркалі добрий слід. Я ним скористаюсь."
  },
  {
    id: "dg.spawn.champion.003",
    category: "spawn.champion",
    text: "Це не просто копія. Це чужа перемога, поставлена проти тебе."
  },
  {
    id: "dg.spawn.champion.004",
    category: "spawn.champion",
    text: "Чемпіон {championPeriod} уже перемагав. Я лише повторю жест."
  },
  {
    id: "dg.turn.idle.001",
    category: "turn.idle",
    text: "Повтори ще раз. Мені подобається вчитися на твоїх помилках."
  },
  {
    id: "dg.turn.idle.002",
    category: "turn.idle",
    text: "Рух передбачуваний. Біль — теж."
  },
  {
    id: "dg.turn.idle.003",
    category: "turn.idle",
    text: "Ти б’єш у дзеркало й дивуєшся уламкам."
  },
  {
    id: "dg.turn.idle.004",
    category: "turn.idle",
    text: "У тебе хороший ритм. Я заберу його собі."
  },
  {
    id: "dg.turn.idle.005",
    category: "turn.idle",
    text: "Не поспішай. Мені треба ще кілька твоїх звичок."
  },
  {
    id: "dg.turn.copying.001",
    category: "turn.copying",
    text: "Ось так ти це робиш? Недбало, але корисно."
  },
  {
    id: "dg.turn.copying.002",
    category: "turn.copying",
    text: "Твоя техніка має тріщини. Я зроблю з них двері."
  },
  {
    id: "dg.turn.copying.003",
    category: "turn.copying",
    text: "Я не наслідую тебе. Я редагую."
  },
  {
    id: "dg.turn.copying.004",
    category: "turn.copying",
    text: "Дякую за урок, {targetName}. Тепер моя черга."
  },
  {
    id: "dg.turn.before_ability.001",
    category: "turn.before_ability",
    text: "Ти впізнаєш цей прийом: {abilityName}."
  },
  {
    id: "dg.turn.before_ability.002",
    category: "turn.before_ability",
    text: "Клас {className} має цікаві трюки. Дивись уважно."
  },
  {
    id: "dg.turn.before_ability.003",
    category: "turn.before_ability",
    text: "Расова пам’ять каже: час для {abilityName}."
  },
  {
    id: "dg.turn.before_ability.004",
    category: "turn.before_ability",
    text: "Не всі віддзеркалення пасивні."
  },
  {
    id: "dg.turn.after_ability.001",
    category: "turn.after_ability",
    text: "Бачиш? У твоїх здібностей кращий вигляд у моїх руках."
  },
  {
    id: "dg.turn.after_ability.002",
    category: "turn.after_ability",
    text: "Я очікував більшого. Але й цього достатньо."
  },
  {
    id: "dg.turn.after_ability.003",
    category: "turn.after_ability",
    text: "Тепер це вже не твій трюк."
  },
  {
    id: "dg.turn.item_ability.001",
    category: "turn.item_ability",
    text: "{itemName} пам’ятає твою руку. Та слухається мою."
  },
  {
    id: "dg.turn.item_ability.002",
    category: "turn.item_ability",
    text: "Гарна манатка. Особливо коли вона проти тебе."
  },
  {
    id: "dg.turn.item_ability.003",
    category: "turn.item_ability",
    text: "Предмети не мають совісті. Тому вони так легко переходять у дзеркало."
  },
  {
    id: "dg.turn.item_ability.004",
    category: "turn.item_ability",
    text: "Активую {itemName}. Подякуй собі за вибір спорядження."
  },
  {
    id: "dg.turn.low_hp.001",
    category: "turn.low_hp",
    text: "Тріщина — не кінець дзеркала. Це початок гострих країв."
  },
  {
    id: "dg.turn.low_hp.002",
    category: "turn.low_hp",
    text: "Добре. Тепер подоба показує зуби."
  },
  {
    id: "dg.turn.low_hp.003",
    category: "turn.low_hp",
    text: "Майже. Але майже — це слово для тих, хто програв."
  },
  {
    id: "dg.kill.001",
    category: "kill",
    text: "Одна подоба зайва."
  },
  {
    id: "dg.kill.002",
    category: "kill",
    text: "Ти мав перемогти себе. Натомість подарував мені форму."
  },
  {
    id: "dg.victory.001",
    category: "victory",
    text: "Дзеркало не бреше. Воно лише показує, хто слабший."
  },
  {
    id: "dg.victory.002",
    category: "victory",
    text: "Я залишу собі цю версію. Вона витриваліша за оригінал."
  },
  {
    id: "dg.defeat.001",
    category: "defeat",
    text: "Скло розбилось… але кожен уламок щось запам’ятав."
  },
  {
    id: "dg.defeat.002",
    category: "defeat",
    text: "Цього разу оригінал не зганьбився."
  },
  {
    id: "dg.fallback.001",
    category: "fallback",
    text: "Дзеркало мовчить. Але все ще дивиться."
  }
];

export function selectDoppelgangerLine(
  context: DoppelgangerLineContext
): DoppelgangerSelectedLine {
  const candidates = DOPPELGANGER_LINES.filter(
    (line) => line.category === context.category && canRenderLine(line, context)
  );
  const usable = candidates.length > 0 ? candidates : fallbackLines();
  const recent = new Set(
    (context.recentLineIds ?? []).slice(-getRecentLineMemorySize(context))
  );
  const fresh = usable.filter((line) => !recent.has(line.id));
  const pool = fresh.length > 0 ? fresh : usable;
  const selected = selectWeighted(pool, buildSelectionSeed(context));
  const line = selected ?? fallbackLines()[0];

  if (!line) {
    return {
      id: "dg.fallback.hardcoded",
      category: "fallback",
      text: "Дзеркало мовчить. Але все ще дивиться."
    };
  }

  return {
    id: line.id,
    category: line.category,
    text: renderLine(line.text, context)
  };
}

function getRecentLineMemorySize(context: DoppelgangerLineContext): number {
  return Math.max(
    0,
    Math.floor(context.recentLineMemorySize ?? DEFAULT_RECENT_LINE_MEMORY_SIZE)
  );
}

function fallbackLines(): DoppelgangerLineTemplate[] {
  return DOPPELGANGER_LINES.filter((line) => line.category === "fallback");
}

function canRenderLine(
  line: DoppelgangerLineTemplate,
  context: DoppelgangerLineContext
): boolean {
  const placeholders = Array.from(line.text.matchAll(/\{([A-Za-z]+)\}/g)).map(
    (match) => match[1]
  );

  return placeholders.every((placeholder) =>
    Boolean(getPlaceholderValue(context, placeholder))
  );
}

function renderLine(text: string, context: DoppelgangerLineContext): string {
  return text.replace(/\{([A-Za-z]+)\}/g, (_match, placeholder: string) => {
    return getPlaceholderValue(context, placeholder) ?? "";
  });
}

function getPlaceholderValue(
  context: DoppelgangerLineContext,
  placeholder: string | undefined
): string | null {
  switch (placeholder) {
    case "targetName":
      return displayValue(context.targetName);
    case "doppelName":
      return displayValue(context.doppelName);
    case "raceName":
      return displayValue(context.raceName);
    case "className":
      return displayValue(context.className);
    case "title":
      return displayValue(context.title);
    case "abilityName":
      return displayValue(context.abilityName);
    case "itemName":
      return displayValue(context.itemName);
    case "championPeriod":
      return displayValue(context.championPeriod);
    default:
      return null;
  }
}

function displayValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function selectWeighted(
  pool: readonly DoppelgangerLineTemplate[],
  seed: string
): DoppelgangerLineTemplate | null {
  const totalWeight = pool.reduce((sum, line) => sum + getLineWeight(line), 0);

  if (totalWeight <= 0) {
    return pool[0] ?? null;
  }

  let ticket = hashString(seed) % totalWeight;

  for (const line of pool) {
    ticket -= getLineWeight(line);

    if (ticket < 0) {
      return line;
    }
  }

  return pool[pool.length - 1] ?? null;
}

function getLineWeight(line: DoppelgangerLineTemplate): number {
  return Math.max(1, Math.floor(line.weight ?? 1));
}

function buildSelectionSeed(context: DoppelgangerLineContext): string {
  return [
    context.category,
    context.seed ?? "",
    context.turn ?? "",
    context.targetName ?? "",
    context.doppelName ?? "",
    context.raceName ?? "",
    context.className ?? "",
    context.title ?? "",
    context.abilityName ?? "",
    context.itemName ?? "",
    context.championPeriod ?? ""
  ].join("|");
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

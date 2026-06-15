import type { CharacterFlavorSelector } from "./characterFlavor";
import type { CharacterPath } from "../domain/characters/path";
import type { Pronoun } from "./schema";

export type MonsterFlavorPlacement = "monster.start" | "monster.action" | "monster.outcome" | "monster.loot-note";

export interface MonsterFlavorCharacter {
  raceId: string;
  classId: string;
  pronoun: Pronoun;
  path: CharacterPath;
}

export interface MonsterFlavorLine {
  id: string;
  monsterId: string;
  placement: MonsterFlavorPlacement;
  selector?: CharacterFlavorSelector;
  action?: string;
  priority?: number;
  text: string;
}

export interface MonsterFlavorQuery {
  monsterId: string;
  placement: MonsterFlavorPlacement;
  action?: string;
  seed?: string;
}

export function selectMonsterFlavorLine(
  character: MonsterFlavorCharacter,
  query: MonsterFlavorQuery
): MonsterFlavorLine | null {
  const scored = monsterFlavorLines
    .filter((line) => line.monsterId === query.monsterId)
    .filter((line) => line.placement === query.placement)
    .filter((line) => !line.action || line.action === query.action)
    .map((line) => ({
      line,
      score: scoreMonsterFlavorLine(line, character, query.action)
    }))
    .filter((entry) => entry.score.tier > 0);

  if (scored.length === 0) {
    return null;
  }

  const bestTier = Math.max(...scored.map((entry) => entry.score.tier));
  const bestPriority = Math.max(
    ...scored.filter((entry) => entry.score.tier === bestTier).map((entry) => entry.score.priority)
  );
  const candidates = scored
    .filter((entry) => entry.score.tier === bestTier && entry.score.priority === bestPriority)
    .map((entry) => entry.line)
    .sort((left, right) => left.id.localeCompare(right.id));

  return pickDeterministic(candidates, buildMonsterFlavorSeed(character, query));
}

function scoreMonsterFlavorLine(
  line: MonsterFlavorLine,
  character: MonsterFlavorCharacter,
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
    throw new Error("No monster flavor candidates.");
  }

  return item;
}

function buildMonsterFlavorSeed(character: MonsterFlavorCharacter, query: MonsterFlavorQuery): string {
  return [
    query.seed ?? currentUtcDateSeed(),
    query.monsterId,
    query.placement,
    query.action ?? "",
    character.raceId,
    character.classId,
    character.pronoun,
    character.path
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

export const monsterLoot = {
  "monster.mimic-shawarma": [
    "item.suspicious-shawarma-wrapper",
    "item.receipt-of-formal-suspicion",
    "item.stamp-of-minor-authority"
  ],
  "monster.basement-mouse-with-title": [
    "item.cheese-of-procedural-doubt",
    "item.napkin-of-mouse-diplomacy",
    "item.cork-ring-of-serious-business"
  ],
  "monster.stamp-doorkeeper-skeleton": [
    "item.stamp-pad-of-last-warning",
    "item.bone-key-of-half-access"
  ],
  "monster.spreadsheet-goblin": [
    "item.cell-of-responsible-pain",
    "item.formula-of-small-losses"
  ],
  "monster.deadline-spider": [
    "item.web-of-tomorrow-promise",
    "item.hourglass-with-deadline-teeth"
  ],
  "monster.preapproval-dragonling": [
    "item.scale-of-preliminary-approval",
    "item.tiny-fire-permit"
  ],
  "monster.unread-rules-ghost": [
    "item.bookmark-of-unread-courage",
    "item.sigh-of-regulation"
  ],
  "monster.anxious-slippers-swarm": [
    "item.left-slipper-of-tactical-retreat",
    "item.sole-of-nervous-mobility"
  ],
  "monster.borshch-slime": [
    "item.beet-of-thermal-doubt",
    "item.apron-stain-of-courage"
  ],
  "monster.conditionally-sliced-loaf-bandit": [
    "item.crust-of-conditional-surrender",
    "item.bread-knife-of-polite-boundaries"
  ],
  "monster.queue-counter-gargoyle": [
    "item.ticket-number-never-called",
    "item.gargoyle-chip-of-patience"
  ],
  "monster.audit-mosquito": [
    "item.proboscis-of-small-audit",
    "item.buzzing-receipt-copy"
  ],
  "monster.archival-knysh-eater": [
    "item.crumb-of-archival-knysh",
    "item.folder-with-bite-marks"
  ],
  "monster.final-comment-troll": [
    "item.comment-pebble-of-final-word",
    "item.underbridge-moderation-badge"
  ],
  "monster.report-jellyfish": [
    "item.tentacle-of-soft-reporting",
    "item.ink-bubble-of-quarterly-panic"
  ],
  "monster.no-change-merchantling": [
    "item.button-of-exact-change",
    "item.receipt-folded-into-accusation"
  ],
  "monster.self-critique-mirror": [
    "item.shard-of-constructive-offense",
    "item.frame-of-almost-confidence"
  ],
  "monster.dry-sea-teapot": [
    "item.whistle-of-dry-tide",
    "item.lid-of-maritime-overthinking"
  ],
  "monster.cabbage-knight-on-break": [
    "item.leaf-of-folded-honor",
    "item.sauerkraut-squire-badge"
  ],
  "monster.zero-declaration-tax-dragon": [
    "item.scale-of-zero-declaration",
    "item.candle-of-fiscal-dread"
  ],
  "monster.complaint-lantern": [
    "item.wick-of-complaint-light"
  ],
  "monster.ledger-boar": [
    "item.hoofprint-ledger-scrap"
  ],
  "monster.salted-oath-pretzel": [
    "item.salt-knot-of-oath"
  ],
  "monster.liar-corridor-map": [
    "item.folded-wrong-turn"
  ],
  "monster.foam-auditor-boots": [
    "item.foam-stained-checklist"
  ],
  "monster.three-signature-chimera": [
    "item.third-signature-scale"
  ],
  "monster.cheese-vault-warden": [
    "item.cold-cheese-key"
  ],
  "monster.calendar-hydra": [
    "item.weekday-slip-of-postponement"
  ],
  "monster.inventory-prophet": [
    "item.missing-label-prophecy"
  ],
  "monster.quiet-catastrophe-clerk": [
    "item.calm-apocalypse-memo"
  ]
} as const;

export const monsterFlavorLines: MonsterFlavorLine[] = [
  {
    "id": "monster-flavor.mimic-shawarma.fallback.start",
    "monsterId": "monster.mimic-shawarma",
    "placement": "monster.start",
    "text": "Мімік-шаурма зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.mimic-shawarma.race.bisyny",
    "monsterId": "monster.mimic-shawarma",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    },
    "text": "Шаурма чує вашу назву й починає сперечатись про правопис начинки. Це її перша помилка."
  },
  {
    "id": "monster-flavor.mimic-shawarma.class.bureaucramancer",
    "monsterId": "monster.mimic-shawarma",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    },
    "text": "На лаваші немає печатки походження. Він дихає ще до заповнення форми. Нахабство."
  },
  {
    "id": "monster-flavor.mimic-shawarma.path-c",
    "monsterId": "monster.mimic-shawarma",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "Корчмарська шухляда відкрилась просто на лаваш. Лаваш нервово згорнувся сам у себе."
  },
  {
    "id": "monster-flavor.mimic-shawarma.combo.dryland-rusalka-varenyk-mancer",
    "monsterId": "monster.mimic-shawarma",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.varenyk-mancer"
        }
      ]
    },
    "text": "Лаваш проти тіста, море проти соусу. Кухня просить не називати це родинною вечерею."
  },
  {
    "id": "monster-flavor.mimic-shawarma.loot-note",
    "monsterId": "monster.mimic-shawarma",
    "placement": "monster.loot-note",
    "text": "Мімік не падає — він розгортається у докази."
  },
  {
    "id": "monster-flavor.basement-mouse-with-title.fallback.start",
    "monsterId": "monster.basement-mouse-with-title",
    "placement": "monster.start",
    "text": "Підвальна Миша з Титулом зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.basement-mouse-with-title.race.domovyk",
    "monsterId": "monster.basement-mouse-with-title",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    },
    "text": "Миша визнає у вас місцеву владу, але просить автономію за шафою. Сирну."
  },
  {
    "id": "monster-flavor.basement-mouse-with-title.class.ranger",
    "monsterId": "monster.basement-mouse-with-title",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    },
    "text": "Сліди ведуть до крихти, крихта — до миші, миша — до власного герба на серветці."
  },
  {
    "id": "monster-flavor.basement-mouse-with-title.path-a",
    "monsterId": "monster.basement-mouse-with-title",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "text": "Анкета стоїть так рівно, що миша просить поставити підпис під її титулом."
  },
  {
    "id": "monster-flavor.basement-mouse-with-title.combo.domovyk-bureaucramancer",
    "monsterId": "monster.basement-mouse-with-title",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.bureaucramancer"
        }
      ]
    },
    "text": "Ви оголошуєте підвал житловою комісією. Миша просить сир як адміністративний збір."
  },
  {
    "id": "monster-flavor.basement-mouse-with-title.loot-note",
    "monsterId": "monster.basement-mouse-with-title",
    "placement": "monster.loot-note",
    "text": "Лут пахне сиром, але поводиться як документ."
  },
  {
    "id": "monster-flavor.stamp-doorkeeper-skeleton.fallback.start",
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "placement": "monster.start",
    "text": "Скелет-вахтер печаток зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.stamp-doorkeeper-skeleton.race.dwarf",
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    },
    "text": "Скелет нахиляється нижче полиці й питає, чи маєте дозвіл на такий компактний авторитет."
  },
  {
    "id": "monster-flavor.stamp-doorkeeper-skeleton.class.priest",
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    },
    "text": "Ваш суворий погляд уже майже відспівав його бейджик. Бейджик нервує."
  },
  {
    "id": "monster-flavor.stamp-doorkeeper-skeleton.path-b",
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Чорнило в анкеті шелестить так тихо, що кістки самі стають у шеренгу."
  },
  {
    "id": "monster-flavor.stamp-doorkeeper-skeleton.combo.molfar-soul-priest",
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.molfar-soul",
          "classId": "class.priest"
        }
      ]
    },
    "text": "Оберіг прочитав табличку «прохід заборонено» і благословив коротший шлях через логіку."
  },
  {
    "id": "monster-flavor.stamp-doorkeeper-skeleton.loot-note",
    "monsterId": "monster.stamp-doorkeeper-skeleton",
    "placement": "monster.loot-note",
    "text": "Кістки не забираємо. Забираємо те, чим вони заважали."
  },
  {
    "id": "monster-flavor.spreadsheet-goblin.fallback.start",
    "monsterId": "monster.spreadsheet-goblin",
    "placement": "monster.start",
    "text": "Гоблін з Електронною Табличкою зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.spreadsheet-goblin.race.intellectual-orc",
    "monsterId": "monster.spreadsheet-goblin",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    },
    "text": "Гоблін відкриває таблицю. Ви відкриваєте рецензію. У кімнаті стає академічно небезпечно."
  },
  {
    "id": "monster-flavor.spreadsheet-goblin.class.bureaucramancer",
    "monsterId": "monster.spreadsheet-goblin",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    },
    "text": "Формула болю не має печатки. Ви відмовляєте їй у бойовій силі до усунення недоліків."
  },
  {
    "id": "monster-flavor.spreadsheet-goblin.path-c",
    "monsterId": "monster.spreadsheet-goblin",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "У таблиці зʼявляється зайва графа «а що, як ні?». Гоблін втрачає впевненість у клітинках."
  },
  {
    "id": "monster-flavor.spreadsheet-goblin.combo.intellectual-orc-bureaucramancer",
    "monsterId": "monster.spreadsheet-goblin",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.intellectual-orc",
          "classId": "class.bureaucramancer"
        }
      ]
    },
    "text": "Ви називаєте його формулу методологічно сирою. Гоблін уперше просить битися простіше."
  },
  {
    "id": "monster-flavor.spreadsheet-goblin.loot-note",
    "monsterId": "monster.spreadsheet-goblin",
    "placement": "monster.loot-note",
    "text": "Трофей дрібний, зате порахований із зайвою точністю."
  },
  {
    "id": "monster-flavor.deadline-spider.fallback.start",
    "monsterId": "monster.deadline-spider",
    "placement": "monster.start",
    "text": "Павук дедлайнів зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.deadline-spider.race.elf",
    "monsterId": "monster.deadline-spider",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    },
    "text": "Павутина майже симетрична. Майже. Ельфійське око отримує моральну шкоду."
  },
  {
    "id": "monster-flavor.deadline-spider.class.rogue",
    "monsterId": "monster.deadline-spider",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    },
    "text": "Ви бачите слабке місце в павутині. Павук бачить, що ви бачите. Неввічливо."
  },
  {
    "id": "monster-flavor.deadline-spider.path-a",
    "monsterId": "monster.deadline-spider",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "text": "Рівна анкетна поличка стоїть проти липкого хаосу. Хаос просить перенести дедлайн."
  },
  {
    "id": "monster-flavor.deadline-spider.combo.elf-rogue",
    "monsterId": "monster.deadline-spider",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.elf",
          "classId": "class.rogue"
        }
      ]
    },
    "text": "Ви зникаєте настільки естетично, що павук на мить забуває, кого мав ловити."
  },
  {
    "id": "monster-flavor.deadline-spider.loot-note",
    "monsterId": "monster.deadline-spider",
    "placement": "monster.loot-note",
    "text": "Павутина липне до планів, але продається як сувенір."
  },
  {
    "id": "monster-flavor.preapproval-dragonling.fallback.start",
    "monsterId": "monster.preapproval-dragonling",
    "placement": "monster.start",
    "text": "Дракончик попереднього погодження зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.preapproval-dragonling.race.dwarf",
    "monsterId": "monster.preapproval-dragonling",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    },
    "text": "Дракончик оцінює вашу стійкість, як двері шахти. Двері зазвичай програють."
  },
  {
    "id": "monster-flavor.preapproval-dragonling.class.mage",
    "monsterId": "monster.preapproval-dragonling",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    },
    "text": "Вогонь упізнав магію й попросив не робити його стажером без контракту."
  },
  {
    "id": "monster-flavor.preapproval-dragonling.path-b",
    "monsterId": "monster.preapproval-dragonling",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Анкетне чорнило тихо гасить зайвий пафос. Дракончик шипить уже канцелярськи."
  },
  {
    "id": "monster-flavor.preapproval-dragonling.combo.dwarf-bureaucramancer",
    "monsterId": "monster.preapproval-dragonling",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dwarf",
          "classId": "class.bureaucramancer"
        }
      ]
    },
    "text": "Ви вимагаєте техпаспорт на полум’я. Дракончик уперше дихає не вогнем, а пояснювальною запискою."
  },
  {
    "id": "monster-flavor.preapproval-dragonling.loot-note",
    "monsterId": "monster.preapproval-dragonling",
    "placement": "monster.loot-note",
    "text": "Гаряче, але погоджено. Майже."
  },
  {
    "id": "monster-flavor.unread-rules-ghost.fallback.start",
    "monsterId": "monster.unread-rules-ghost",
    "placement": "monster.start",
    "text": "Привид непрочитаних правил зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.unread-rules-ghost.race.molfar-soul",
    "monsterId": "monster.unread-rules-ghost",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    },
    "text": "Оберіг шепоче, що правило було мертвим ще до публікації. Привид ображається професійно."
  },
  {
    "id": "monster-flavor.unread-rules-ghost.class.priest",
    "monsterId": "monster.unread-rules-ghost",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    },
    "text": "Ви благословляєте дрібний шрифт. Він уперше стає читабельним і трохи винним."
  },
  {
    "id": "monster-flavor.unread-rules-ghost.path-b",
    "monsterId": "monster.unread-rules-ghost",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Тиха анкетна шухляда шелестить сторінкою. Привид згадує, що сам її не дочитав."
  },
  {
    "id": "monster-flavor.unread-rules-ghost.combo.molfar-soul-priest",
    "monsterId": "monster.unread-rules-ghost",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.molfar-soul",
          "classId": "class.priest"
        }
      ]
    },
    "text": "Туман читає правило вголос, оберіг ставить наголос, привид просить коротку версію."
  },
  {
    "id": "monster-flavor.unread-rules-ghost.loot-note",
    "monsterId": "monster.unread-rules-ghost",
    "placement": "monster.loot-note",
    "text": "Упав не привид, а закладка. Вона теж втомилась."
  },
  {
    "id": "monster-flavor.anxious-slippers-swarm.fallback.start",
    "monsterId": "monster.anxious-slippers-swarm",
    "placement": "monster.start",
    "text": "Зграя капців тривожної мобільности зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.anxious-slippers-swarm.race.human-ish",
    "monsterId": "monster.anxious-slippers-swarm",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    },
    "text": "Капці бачать у вас майже нормальність і вирішують, що це найпідозріліша швидкість."
  },
  {
    "id": "monster-flavor.anxious-slippers-swarm.class.rogue",
    "monsterId": "monster.anxious-slippers-swarm",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    },
    "text": "Ви крадете крок. Капці подають заяву, бо крок був їхній."
  },
  {
    "id": "monster-flavor.anxious-slippers-swarm.path-c",
    "monsterId": "monster.anxious-slippers-swarm",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "Анкетна шухляда відкривається боком. Капці розбігаються, бо це вже нова геометрія."
  },
  {
    "id": "monster-flavor.anxious-slippers-swarm.combo.human-ish-rogue",
    "monsterId": "monster.anxious-slippers-swarm",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.rogue"
        }
      ]
    },
    "text": "Майже звичайний злодій проти зовсім незвичайного взуття. Ніхто не пишається, але всі рухаються."
  },
  {
    "id": "monster-flavor.anxious-slippers-swarm.loot-note",
    "monsterId": "monster.anxious-slippers-swarm",
    "placement": "monster.loot-note",
    "text": "Один капець завжди тікає. Саме тому трофей один."
  },
  {
    "id": "monster-flavor.borshch-slime.fallback.start",
    "monsterId": "monster.borshch-slime",
    "placement": "monster.start",
    "text": "Борщовий слизень правильної температури зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.borshch-slime.race.dryland-rusalka",
    "monsterId": "monster.borshch-slime",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    },
    "text": "Слизень вологий, але не морський. Ви обоє на мить розчаровані професійно."
  },
  {
    "id": "monster-flavor.borshch-slime.class.varenyk-mancer",
    "monsterId": "monster.borshch-slime",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    },
    "text": "Тісто в душі каже, що борщ — союзник. Ложка не така впевнена."
  },
  {
    "id": "monster-flavor.borshch-slime.path-b",
    "monsterId": "monster.borshch-slime",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Тиха анкетна шухляда остуджує драму. Слизень вимагає термометр свідком."
  },
  {
    "id": "monster-flavor.borshch-slime.combo.dryland-rusalka-varenyk-mancer",
    "monsterId": "monster.borshch-slime",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.varenyk-mancer"
        }
      ]
    },
    "text": "Ви називаєте це припливом сметани. Слизень не погоджується, але стає смачніше переможним."
  },
  {
    "id": "monster-flavor.borshch-slime.loot-note",
    "monsterId": "monster.borshch-slime",
    "placement": "monster.loot-note",
    "text": "Не їсти без корчмарського дозволу. Носити як доказ — можна."
  },
  {
    "id": "monster-flavor.conditionally-sliced-loaf-bandit.fallback.start",
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "placement": "monster.start",
    "text": "Буханець-бандит умовної нарізки зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.conditionally-sliced-loaf-bandit.race.dwarf",
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    },
    "text": "Буханець називає себе монолітом. Гноми мають досвід із монолітами та правильним інструментом."
  },
  {
    "id": "monster-flavor.conditionally-sliced-loaf-bandit.class.warrior",
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    },
    "text": "Ваш план прямий: пояснити хлібу, що скоринка — не броня."
  },
  {
    "id": "monster-flavor.conditionally-sliced-loaf-bandit.path-a",
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "text": "Анкета стоїть рівно, ніж лежить рівно, буханець уперше розуміє слово «неминучість»."
  },
  {
    "id": "monster-flavor.conditionally-sliced-loaf-bandit.combo.dwarf-warrior",
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dwarf",
          "classId": "class.warrior"
        }
      ]
    },
    "text": "Гном-воїн дивиться на буханець як на малу фортецю. Фортеця просить не бити по крихтах."
  },
  {
    "id": "monster-flavor.conditionally-sliced-loaf-bandit.loot-note",
    "monsterId": "monster.conditionally-sliced-loaf-bandit",
    "placement": "monster.loot-note",
    "text": "Скоринка здалась окремо від середини. Формально це перемога."
  },
  {
    "id": "monster-flavor.queue-counter-gargoyle.fallback.start",
    "monsterId": "monster.queue-counter-gargoyle",
    "placement": "monster.start",
    "text": "Ґарґулья лічильника черги зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.queue-counter-gargoyle.race.drantohor",
    "monsterId": "monster.queue-counter-gargoyle",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    },
    "text": "Ґарґулья видає вам номерок до Остромагу. На ньому написано «невідомий напрям»."
  },
  {
    "id": "monster-flavor.queue-counter-gargoyle.class.bureaucramancer",
    "monsterId": "monster.queue-counter-gargoyle",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    },
    "text": "Ви питаєте, за якою формою видають чергу. Камінь уперше відчуває адміністративний страх."
  },
  {
    "id": "monster-flavor.queue-counter-gargoyle.path-c",
    "monsterId": "monster.queue-counter-gargoyle",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "Шухляда анкети відкривається між двома віконцями. Черга не знає, куди ставати."
  },
  {
    "id": "monster-flavor.queue-counter-gargoyle.combo.drantohor-bureaucramancer",
    "monsterId": "monster.queue-counter-gargoyle",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.bureaucramancer"
        }
      ]
    },
    "text": "Ви оформлюєте маршрут до Остромагу через віконце «інше». Ґарґулья тріскається від поваги."
  },
  {
    "id": "monster-flavor.queue-counter-gargoyle.loot-note",
    "monsterId": "monster.queue-counter-gargoyle",
    "placement": "monster.loot-note",
    "text": "Номерок не викликали, отже він ваш назавжди."
  },
  {
    "id": "monster-flavor.audit-mosquito.fallback.start",
    "monsterId": "monster.audit-mosquito",
    "placement": "monster.start",
    "text": "Комар-ревізор дрібних витрат зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.audit-mosquito.race.elf",
    "monsterId": "monster.audit-mosquito",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    },
    "text": "Комар дзижчить фальшиво. Ельфійське вухо просить дозволу на сувору відповідь."
  },
  {
    "id": "monster-flavor.audit-mosquito.class.rogue",
    "monsterId": "monster.audit-mosquito",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    },
    "text": "Він питає про монети. Ви питаєте, які саме монети. Обидва робите вигляд, що це не підозріло."
  },
  {
    "id": "monster-flavor.audit-mosquito.path-a",
    "monsterId": "monster.audit-mosquito",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "text": "Анкета тримається рівно. Комар не знаходить, де присмоктатися до пояснення."
  },
  {
    "id": "monster-flavor.audit-mosquito.combo.human-ish-bureaucramancer",
    "monsterId": "monster.audit-mosquito",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.bureaucramancer"
        }
      ]
    },
    "text": "Майже нормальна людина з печаткою — найгірший сон дрібного аудитора."
  },
  {
    "id": "monster-flavor.audit-mosquito.loot-note",
    "monsterId": "monster.audit-mosquito",
    "placement": "monster.loot-note",
    "text": "Дзижчання лишилось у копії чека. На жаль, воно теж трофей."
  },
  {
    "id": "monster-flavor.archival-knysh-eater.fallback.start",
    "monsterId": "monster.archival-knysh-eater",
    "placement": "monster.start",
    "text": "Архівний книшоїд зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.archival-knysh-eater.race.domovyk",
    "monsterId": "monster.archival-knysh-eater",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    },
    "text": "Книшоїд їсть документи у вашій майже-хаті. Це вже не монстр, а квартирне питання."
  },
  {
    "id": "monster-flavor.archival-knysh-eater.class.varenyk-mancer",
    "monsterId": "monster.archival-knysh-eater",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    },
    "text": "Ви відчуваєте спорідненість тіста, але книшоїд явно з тієї гілки, яку не кличуть на свята."
  },
  {
    "id": "monster-flavor.archival-knysh-eater.path-b",
    "monsterId": "monster.archival-knysh-eater",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Чорнило шелестить у крихтах. Архів робить вигляд, що так і було каталогізовано."
  },
  {
    "id": "monster-flavor.archival-knysh-eater.combo.bisyny-varenyk-mancer",
    "monsterId": "monster.archival-knysh-eater",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.varenyk-mancer"
        }
      ]
    },
    "text": "Ви сперечаєтесь, чи це книш, пиріжок чи доказ. Книшоїд нервово доїдає аргумент."
  },
  {
    "id": "monster-flavor.archival-knysh-eater.loot-note",
    "monsterId": "monster.archival-knysh-eater",
    "placement": "monster.loot-note",
    "text": "Крихта має інвентарний номер. Не питайте чому."
  },
  {
    "id": "monster-flavor.final-comment-troll.fallback.start",
    "monsterId": "monster.final-comment-troll",
    "placement": "monster.start",
    "text": "Троль останнього коментаря зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.final-comment-troll.race.bisyny",
    "monsterId": "monster.final-comment-troll",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    },
    "text": "Троль відкриває суперечку про назву. Ви вже стоїте в ній по коліна й чомусь перемагаєте."
  },
  {
    "id": "monster-flavor.final-comment-troll.class.bard",
    "monsterId": "monster.final-comment-troll",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    },
    "text": "Ви берете риму на «коментар». Троль шкодує, що не лишився під мостом."
  },
  {
    "id": "monster-flavor.final-comment-troll.path-c",
    "monsterId": "monster.final-comment-troll",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "Шухляда анкети відкривається між «так» і «не так». Троль просить модератора, але модератор — це ви."
  },
  {
    "id": "monster-flavor.final-comment-troll.combo.bisyny-bard",
    "monsterId": "monster.final-comment-troll",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.bard"
        }
      ]
    },
    "text": "Суперечка стає куплетом, куплет — правкою, правка — критичним успіхом по самовпевненості троля."
  },
  {
    "id": "monster-flavor.final-comment-troll.loot-note",
    "monsterId": "monster.final-comment-troll",
    "placement": "monster.loot-note",
    "text": "Останній коментар тепер у торбі. Він усе ще намагається відповісти."
  },
  {
    "id": "monster-flavor.report-jellyfish.fallback.start",
    "monsterId": "monster.report-jellyfish",
    "placement": "monster.start",
    "text": "Медузка звітности зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.report-jellyfish.race.dryland-rusalka",
    "monsterId": "monster.report-jellyfish",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    },
    "text": "Медузка не з моря, але поводиться так, ніби має диплом із хвильової драми."
  },
  {
    "id": "monster-flavor.report-jellyfish.class.mage",
    "monsterId": "monster.report-jellyfish",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    },
    "text": "Її прозорість занадто магічна. Ви підозрюєте, що це просто пункт плану в мантії."
  },
  {
    "id": "monster-flavor.report-jellyfish.path-b",
    "monsterId": "monster.report-jellyfish",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Тиха шухляда анкети гасить її світіння. Звітність стає менш медузною, але не менш докучливою."
  },
  {
    "id": "monster-flavor.report-jellyfish.combo.dryland-rusalka-mage",
    "monsterId": "monster.report-jellyfish",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.mage"
        }
      ]
    },
    "text": "Ви говорите з нею мовою уявного моря й реальної магії. Медузка здає звіт про відступ."
  },
  {
    "id": "monster-flavor.report-jellyfish.loot-note",
    "monsterId": "monster.report-jellyfish",
    "placement": "monster.loot-note",
    "text": "Щупальце не жалить, якщо не питати про квартальні цілі."
  },
  {
    "id": "monster-flavor.no-change-merchantling.fallback.start",
    "monsterId": "monster.no-change-merchantling",
    "placement": "monster.start",
    "text": "Крамарик без здачі зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.no-change-merchantling.race.intellectual-orc",
    "monsterId": "monster.no-change-merchantling",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    },
    "text": "Крамарик пояснює ціни. Ви пояснюєте етику. Він раптом знаходить дрібні монети."
  },
  {
    "id": "monster-flavor.no-change-merchantling.class.bard",
    "monsterId": "monster.no-change-merchantling",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    },
    "text": "Ви співаєте баладу про здачу. Крамарик плаче в чек, але дрібні не віддає одразу."
  },
  {
    "id": "monster-flavor.no-change-merchantling.path-a",
    "monsterId": "monster.no-change-merchantling",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "text": "Рівна анкетна поличка вимагає рівного рахунку. Крамарик відчуває небезпечну арифметику."
  },
  {
    "id": "monster-flavor.no-change-merchantling.combo.intellectual-orc-bard",
    "monsterId": "monster.no-change-merchantling",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.intellectual-orc",
          "classId": "class.bard"
        }
      ]
    },
    "text": "Ваша рецензія на прейскурант має приспів. Крамарик визнає поразку як промоакцію."
  },
  {
    "id": "monster-flavor.no-change-merchantling.loot-note",
    "monsterId": "monster.no-change-merchantling",
    "placement": "monster.loot-note",
    "text": "Здачі не було. Був ґудзик із позицією."
  },
  {
    "id": "monster-flavor.self-critique-mirror.fallback.start",
    "monsterId": "monster.self-critique-mirror",
    "placement": "monster.start",
    "text": "Дзеркальце зайвої самокритики зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.self-critique-mirror.race.elf",
    "monsterId": "monster.self-critique-mirror",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    },
    "text": "Дзеркальце намагається критикувати вашу естетику. Це помилка рівня «самоушкодження скла»."
  },
  {
    "id": "monster-flavor.self-critique-mirror.class.priest",
    "monsterId": "monster.self-critique-mirror",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    },
    "text": "Ви благословляєте відображення. Воно вперше каже щось конструктивне й соромиться."
  },
  {
    "id": "monster-flavor.self-critique-mirror.path-b",
    "monsterId": "monster.self-critique-mirror",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "text": "Шухляда анкети ховає зайві докори в тінь. Дзеркальце бачить тільки власну надмірність."
  },
  {
    "id": "monster-flavor.self-critique-mirror.combo.elf-priest",
    "monsterId": "monster.self-critique-mirror",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.elf",
          "classId": "class.priest"
        }
      ]
    },
    "text": "Ельфійська гідність і святий спокій зустрічають дзеркало. Дзеркало просить менш блискучу правду."
  },
  {
    "id": "monster-flavor.self-critique-mirror.loot-note",
    "monsterId": "monster.self-critique-mirror",
    "placement": "monster.loot-note",
    "text": "Скалка критикує торбу, але лежить чемно."
  },
  {
    "id": "monster-flavor.dry-sea-teapot.fallback.start",
    "monsterId": "monster.dry-sea-teapot",
    "placement": "monster.start",
    "text": "Чайник сухого моря зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.dry-sea-teapot.race.dryland-rusalka",
    "monsterId": "monster.dry-sea-teapot",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    },
    "text": "Чайник свистить про море. Ви впізнаєте жанр, але не погоджуєтесь із виконанням."
  },
  {
    "id": "monster-flavor.dry-sea-teapot.class.priest",
    "monsterId": "monster.dry-sea-teapot",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    },
    "text": "Ви благословляєте чай на спокій. Чайник відповідає маленьким штормом у кришечці."
  },
  {
    "id": "monster-flavor.dry-sea-teapot.path-c",
    "monsterId": "monster.dry-sea-teapot",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "Анкетна шухляда відкривається там, де мала бути вода. Чайник називає це протокою."
  },
  {
    "id": "monster-flavor.dry-sea-teapot.combo.dryland-rusalka-priest",
    "monsterId": "monster.dry-sea-teapot",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.priest"
        }
      ]
    },
    "text": "Ви проводите обряд для сухого моря. Чайник видихає пару й офіційно стає калюжею настрою."
  },
  {
    "id": "monster-flavor.dry-sea-teapot.loot-note",
    "monsterId": "monster.dry-sea-teapot",
    "placement": "monster.loot-note",
    "text": "Свисток досі кличе приплив, але приходить тільки чай."
  },
  {
    "id": "monster-flavor.cabbage-knight-on-break.fallback.start",
    "monsterId": "monster.cabbage-knight-on-break",
    "placement": "monster.start",
    "text": "Капустяний лицар на перерві зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.cabbage-knight-on-break.race.dwarf",
    "monsterId": "monster.cabbage-knight-on-break",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    },
    "text": "Капустяна броня шарувата. Гном схвально оцінює конструкцію й одразу шукає слабкий листок."
  },
  {
    "id": "monster-flavor.cabbage-knight-on-break.class.warrior",
    "monsterId": "monster.cabbage-knight-on-break",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    },
    "text": "Лицар піднімає лист. Ви піднімаєте аргумент. Обидва зелені від серйозности."
  },
  {
    "id": "monster-flavor.cabbage-knight-on-break.path-a",
    "monsterId": "monster.cabbage-knight-on-break",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "text": "Рівна анкетна поличка вимагає чесного двобою. Капуста просить перерву продовжити."
  },
  {
    "id": "monster-flavor.cabbage-knight-on-break.combo.dwarf-ranger",
    "monsterId": "monster.cabbage-knight-on-break",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.dwarf",
          "classId": "class.ranger"
        }
      ]
    },
    "text": "Ви читаєте сліди в грядці, як карту шахти. Капуста розуміє, що її обійшли з флангу."
  },
  {
    "id": "monster-flavor.cabbage-knight-on-break.loot-note",
    "monsterId": "monster.cabbage-knight-on-break",
    "placement": "monster.loot-note",
    "text": "Честь згорнута в листок. Зберігати в сухому місці."
  },
  {
    "id": "monster-flavor.zero-declaration-tax-dragon.fallback.start",
    "monsterId": "monster.zero-declaration-tax-dragon",
    "placement": "monster.start",
    "text": "Податковий дракон нульової декларації зʼявляється з виглядом істоти, яка давно чекала на вашу погану ідею."
  },
  {
    "id": "monster-flavor.zero-declaration-tax-dragon.race.human-ish",
    "monsterId": "monster.zero-declaration-tax-dragon",
    "placement": "monster.start",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    },
    "text": "Дракон бачить майже нормального платника пригод. Це його улюблений жанр підозри."
  },
  {
    "id": "monster-flavor.zero-declaration-tax-dragon.class.bureaucramancer",
    "monsterId": "monster.zero-declaration-tax-dragon",
    "placement": "monster.start",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    },
    "text": "Ви розкладаєте форми. Дракон уперше розуміє, що вогонь — не найстрашніша стихія."
  },
  {
    "id": "monster-flavor.zero-declaration-tax-dragon.path-c",
    "monsterId": "monster.zero-declaration-tax-dragon",
    "placement": "monster.start",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "text": "Анкетна шухляда відкривається між «скарб» і «не скарб». Дракон просить не ускладнювати прекрасне."
  },
  {
    "id": "monster-flavor.zero-declaration-tax-dragon.combo.human-ish-bureaucramancer",
    "monsterId": "monster.zero-declaration-tax-dragon",
    "placement": "monster.start",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.bureaucramancer"
        }
      ]
    },
    "text": "Майже звичайний бюрокромант проти фіскального дракона. Корчмар робить вигляд, що не знає переможця."
  },
  {
    "id": "monster-flavor.zero-declaration-tax-dragon.loot-note",
    "monsterId": "monster.zero-declaration-tax-dragon",
    "placement": "monster.loot-note",
    "text": "Дракон не віддав скарб. Він видав «тимчасово не заборонено»."
  },
  {
    "id": "monster-flavor.complaint-lantern.fallback.start",
    "monsterId": "monster.complaint-lantern",
    "placement": "monster.start",
    "text": "Скаргова лампа спалахує над столом і підсвічує все, що ви ще не встигли поскаржити."
  },
  {
    "id": "monster-flavor.complaint-lantern.loot-note",
    "monsterId": "monster.complaint-lantern",
    "placement": "monster.loot-note",
    "text": "Світло лишилося в скарзі. Воно, здається, теж незадоволене."
  },
  {
    "id": "monster-flavor.ledger-boar.fallback.start",
    "monsterId": "monster.ledger-boar",
    "placement": "monster.start",
    "text": "Кабан прибутково-видаткової книги риє нісом у рахунках і шукає, де ви сховали дрібні витрати."
  },
  {
    "id": "monster-flavor.ledger-boar.loot-note",
    "monsterId": "monster.ledger-boar",
    "placement": "monster.loot-note",
    "text": "Кабан лишив сліди копит і один дуже товстий запис."
  },
  {
    "id": "monster-flavor.salted-oath-pretzel.fallback.start",
    "monsterId": "monster.salted-oath-pretzel",
    "placement": "monster.start",
    "text": "Крендель солоної обіцянки лежить на таці так, ніби він уже поклявся бути небезпечним."
  },
  {
    "id": "monster-flavor.salted-oath-pretzel.loot-note",
    "monsterId": "monster.salted-oath-pretzel",
    "placement": "monster.loot-note",
    "text": "Крендель тримає обіцянку тільки поки не проголодніє."
  },
  {
    "id": "monster-flavor.liar-corridor-map.fallback.start",
    "monsterId": "monster.liar-corridor-map",
    "placement": "monster.start",
    "text": "Мапа коридору, яка бреше, уже показала вихід. Тому виходу тут, звісно, нема."
  },
  {
    "id": "monster-flavor.liar-corridor-map.loot-note",
    "monsterId": "monster.liar-corridor-map",
    "placement": "monster.loot-note",
    "text": "Мапа переклала коридор на власну версію реальности."
  },
  {
    "id": "monster-flavor.foam-auditor-boots.fallback.start",
    "monsterId": "monster.foam-auditor-boots",
    "placement": "monster.start",
    "text": "Пінний ревізор у чоботях заходить у залу так, ніби зараз перевірятиме кружки на відповідність."
  },
  {
    "id": "monster-flavor.foam-auditor-boots.loot-note",
    "monsterId": "monster.foam-auditor-boots",
    "placement": "monster.loot-note",
    "text": "Ревізія лишила тільки піну. Вона теж рахується."
  },
  {
    "id": "monster-flavor.three-signature-chimera.fallback.start",
    "monsterId": "monster.three-signature-chimera",
    "placement": "monster.start",
    "text": "Химера трьох підписів складається з трьох різних поглядів на одну й ту саму форму."
  },
  {
    "id": "monster-flavor.three-signature-chimera.loot-note",
    "monsterId": "monster.three-signature-chimera",
    "placement": "monster.loot-note",
    "text": "Три підписи сховалися в одній тіні. Дивно, але законно."
  },
  {
    "id": "monster-flavor.cheese-vault-warden.fallback.start",
    "monsterId": "monster.cheese-vault-warden",
    "placement": "monster.start",
    "text": "Наглядач сирного сховку виходить із тіні й ставить між вами та запасами офіційний запах."
  },
  {
    "id": "monster-flavor.cheese-vault-warden.loot-note",
    "monsterId": "monster.cheese-vault-warden",
    "placement": "monster.loot-note",
    "text": "Сирний сховок відчинився, але не визнав провини."
  },
  {
    "id": "monster-flavor.calendar-hydra.fallback.start",
    "monsterId": "monster.calendar-hydra",
    "placement": "monster.start",
    "text": "Гідра календарних переносів уже з’їла понеділок і пропонує перенести вівторок на вчора."
  },
  {
    "id": "monster-flavor.calendar-hydra.loot-note",
    "monsterId": "monster.calendar-hydra",
    "placement": "monster.loot-note",
    "text": "Перенос календаря зламався об стіну. Стіна не винна."
  },
  {
    "id": "monster-flavor.inventory-prophet.fallback.start",
    "monsterId": "monster.inventory-prophet",
    "placement": "monster.start",
    "text": "Пророк інвентарної недостачі чує брязкіт торби й одразу знає, що зникне ще до пошуку."
  },
  {
    "id": "monster-flavor.inventory-prophet.loot-note",
    "monsterId": "monster.inventory-prophet",
    "placement": "monster.loot-note",
    "text": "Інвентар шепоче про недостачу, але дуже ввічливо."
  },
  {
    "id": "monster-flavor.quiet-catastrophe-clerk.fallback.start",
    "monsterId": "monster.quiet-catastrophe-clerk",
    "placement": "monster.start",
    "text": "Писар тихої катастрофи сидить рівно, як новий штамп, і називає це спокоєм перед оформленням."
  },
  {
    "id": "monster-flavor.quiet-catastrophe-clerk.loot-note",
    "monsterId": "monster.quiet-catastrophe-clerk",
    "placement": "monster.loot-note",
    "text": "Писар зберіг катастрофу в папці. Папка все заперечує."
  }
];

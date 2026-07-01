export type LoreCanonicalRefType = "race" | "class" | "monster" | "location" | "item";

export interface LoreCanonicalRef {
  type: LoreCanonicalRefType;
  id: string;
}

export interface LoreCategory {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}

export interface LoreEntry {
  id: string;
  categoryId: string;
  title: string;
  source: string;
  body: string;
  canonicalRefs?: readonly LoreCanonicalRef[];
}

export interface LoreContentValidationInput {
  categories?: readonly LoreCategory[];
  entries?: readonly LoreEntry[];
  knownRefs?: Partial<Record<LoreCanonicalRefType, ReadonlySet<string>>>;
}

export const loreCategories = [
  {
    id: "kvestarnia",
    title: "🏚 Про Квестарню",
    description: "Корчма, дошка, правила й те, чому сюди весь час заходять пригодники.",
    sortOrder: 10
  },
  {
    id: "places",
    title: "🪧 Місцини корчми",
    description: "Поточні місця Квестарні: зала, Шинок, Стіл зі справами, Льох, Бочка, Низ і сусідні кутки.",
    sortOrder: 20
  },
  {
    id: "races",
    title: "🧝 Раси пригодників",
    description: "Активні раси з анкети пригодника, без вигаданих народів поза поточною грою.",
    sortOrder: 30
  },
  {
    id: "classes",
    title: "⚔️ Класи пригодників",
    description: "Поточні класи персонажа й те, як вони звучать у корчмі.",
    sortOrder: 40
  },
  {
    id: "bestiary",
    title: "🧌 Бестіарій",
    description: "Вибрані істоти з поточного списку монстрів. Повний список хай ще трохи шарудить у Низі.",
    sortOrder: 50
  },
  {
    id: "loot",
    title: "🎒 Манатки",
    description: "Лут, трофеї й речі, які іноді краще не нюхати перед екіпіруванням.",
    sortOrder: 60
  },
  {
    id: "customs",
    title: "📜 Звичаї й чутки",
    description: "Як Квестарня пояснює рівні, дошки, поразки, пошук і корчмарську бухгалтерію.",
    sortOrder: 70
  }
] as const satisfies readonly LoreCategory[];

export const loreEntries = [
  {
    id: "tavern-threshold-current",
    categoryId: "kvestarnia",
    title: "Квестарня, що стоїть на порозі",
    source: "зі слів корчмаря, записано на звороті рахунку",
    body: "Квестарня стоїть не між містами, а між «я на хвилинку» і «чому в мене вже 13 рівень». Двері скриплять так, ніби впізнають кожного, хто заходив без плану, без зброї або з надлишком хоробрости."
  },
  {
    id: "notice-board-current",
    categoryId: "kvestarnia",
    title: "Дошка корчми",
    source: "прибито кривим цвяхом біля входу",
    body: "Дошка корчми не любить, коли її називають просто меню. На ній живуть новини, перекази, зарубки видатних жителів, підозрілі стрілочки й папірці, які самі не пам’ятають, хто їх прибив.",
    canonicalRefs: [{ type: "location", id: "location.korchma.news_corner" }]
  },
  {
    id: "place-front",
    categoryId: "places",
    title: "Перед корчмою",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Перед корчмою пригодники ще мають шанс сказати: «та я тільки подивлюся». Двері терпляче чекають. Вони бачили цю фразу стільки разів, що вже мають на неї окрему петлю.",
    canonicalRefs: [{ type: "location", id: "location.korchma.front" }]
  },
  {
    id: "place-bar",
    categoryId: "places",
    title: "Шинок",
    source: "польова нотатка з місцини: Корчма Квестарні",
    body: "Шинок знає, що напої — це не лише золота яма, а й соціяльний ритуал. Тут Бард може виступити, пригодник — пригостити всіх пивом, а корчмар — зробити вигляд, що це економіка, а не драматична піна.",
    canonicalRefs: [{ type: "location", id: "location.korchma.bar" }]
  },
  {
    id: "place-deep-level1",
    categoryId: "places",
    title: "Сутерени Корчми",
    source: "польова нотатка з місцини: Низ",
    body: "Сутерени Корчми — перший ярус Низу, де коридори ще вдають пристойність. Якщо мапа тут бреше, це не баг. Це місцева форма ввічливости.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1" }]
  },
  {
    id: "race-human-ish",
    categoryId: "races",
    title: "Людисько",
    source: "з корчмарської анкети пригодника",
    body: "Людисько в Квестарні — це не «звичайна людина», а майстер виживання в анкетах, чергах і ситуаціях, де інші вже шукають мітологічне пояснення.",
    canonicalRefs: [{ type: "race", id: "race.human-ish" }]
  },
  {
    id: "race-bisyny",
    categoryId: "races",
    title: "Бісини",
    source: "з корчмарської анкети пригодника",
    body: "Бісини ходять так, ніби словники досі сперечаються, хто їх випустив. Вони спритні, кмітливі й харизматичні рівно настільки, щоб будь-яка називальна суперечка стала пригодою.",
    canonicalRefs: [{ type: "race", id: "race.bisyny" }]
  },
  {
    id: "race-dryland-rusalka",
    categoryId: "races",
    title: "Русалка сухопутна",
    source: "з корчмарської анкети пригодника",
    body: "Сухопутна русалка магічна, харизматична й підозріло уважна до чайників. Вона вже не питає, де море, але кожна калюжа поводиться біля неї чемніше.",
    canonicalRefs: [{ type: "race", id: "race.dryland-rusalka" }]
  },
  {
    id: "class-warrior",
    categoryId: "classes",
    title: "Воїн",
    source: "з навчальної полиці класів",
    body: "Воїн має простий план: стояти рівно й переконливо махати залізом. У Квестарні це не найгірша філософія, бо частина монстрів справді розуміє лише аргументи, які залишають вм’ятини.",
    canonicalRefs: [{ type: "class", id: "class.warrior" }]
  },
  {
    id: "class-bureaucramancer",
    categoryId: "classes",
    title: "Бюрокромант",
    source: "з навчальної полиці класів",
    body: "Бюрокромант знерухомлює ворогів формами, печатками й дуже серйозним виглядом. У Квестарні це майже бойова магія, бо половина істот складається з паперу, правил або страху перед пунктом 13-Б.",
    canonicalRefs: [{ type: "class", id: "class.bureaucramancer" }]
  },
  {
    id: "class-kharakternyk",
    categoryId: "classes",
    title: "Козак-характерник",
    source: "з навчальної полиці класів",
    body: "Козак-характерник дивиться на проблему так, що проблема сама шукає собі іншу пригоду. Це вже не раса старих записів, а клас: туман, вдача, контратака й репліка.",
    canonicalRefs: [{ type: "class", id: "class.kharakternyk" }]
  },
  {
    id: "monster-mimic-shawarma",
    categoryId: "bestiary",
    title: "Мімік-шаурма",
    source: "польова нотатка бестіарію, рівень 1",
    body: "Першою ознакою міміка-шаурми є те, що він уважно слухає замовлення. Другою — що замовляє тебе у відповідь. У Квестарні це стартовий урок: якщо вечеря дивиться першою, вона вже не вечеря.",
    canonicalRefs: [{ type: "monster", id: "monster.mimic-shawarma" }]
  },
  {
    id: "monster-deadline-spider",
    categoryId: "bestiary",
    title: "Павук дедлайнів",
    source: "польова нотатка бестіарію, рівень 2",
    body: "Павук дедлайнів плете павутину з фраз «сьогодні швиденько» і «там на п’ять хвилин». Його ловлять не мечем, а здатністю не повірити власному плану.",
    canonicalRefs: [{ type: "monster", id: "monster.deadline-spider" }]
  },
  {
    id: "monster-quiet-catastrophe-clerk",
    categoryId: "bestiary",
    title: "Писар тихої катастрофи",
    source: "польова нотатка бестіарію, рівень 13",
    body: "Писар тихої катастрофи записує кінець світу так акуратно, ніби це внутрішня службова. Найстрашніше в ньому не катастрофа, а спокійний тон: «не панікуйте, просто підпишіть тут».",
    canonicalRefs: [{ type: "monster", id: "monster.quiet-catastrophe-clerk" }]
  },
  {
    id: "loot-mantok-definition",
    categoryId: "loot",
    title: "Що таке манатки",
    source: "пояснення з торби, яка бачила забагато",
    body: "Манатки — це не просто предмети. Це доказ, що пригода справді сталася й не все вдалося замʼяти під килим. Пательня переконання, корок пінного переобліку й чек формальної підозри можуть бути механічно дрібними, але історично важливими.",
    canonicalRefs: [
      { type: "item", id: "item.pan-of-persuasion" },
      { type: "item", id: "item.foam-cork-of-accounting" },
      { type: "item", id: "item.receipt-of-formal-suspicion" }
    ]
  },
  {
    id: "loot-apology-items",
    categoryId: "loot",
    title: "Вибачальні манатки",
    source: "занотовано після технічної пригоди",
    body: "Коли корчма чхає деплоєм, у торбах можуть з’являтися речі з вибаченнями: Квитанція відкоченої міграції, Корок повторного деплою або Печатка P3009 «Уже лагодимо».",
    canonicalRefs: [
      { type: "item", id: "item.apology.rollback-receipt" },
      { type: "item", id: "item.apology.redeploy-cork" },
      { type: "item", id: "item.apology.p3009-stamp" }
    ]
  },
  {
    id: "custom-search-deep",
    categoryId: "customs",
    title: "Пошукати в Низі",
    source: "з нотатки, знайденої біля Сутеренів",
    body: "У Низі можна пошукати, але Низ теж може пошукати вас. Безпечний обшук знаходить дрібниці або нічого; ризикований прохід іноді нагадує, що монстр уже стояв поруч і просто чекав вашого жесту.",
    canonicalRefs: [{ type: "location", id: "location.korchma.deep.level1" }]
  },
  {
    id: "custom-no-p2w",
    categoryId: "customs",
    title: "Про гроші й силу",
    source: "написано на дні Бочки підтримки",
    body: "У Квестарні реальні монети можуть підтримати корчму, сервер і корчмареві нерви, але не купують бойову силу, лут чи прогрес. За підтримку можна отримати тепле «дякуємо» й Тост із Бочки."
  }
] as const satisfies readonly LoreEntry[];

export function getLoreCategory(categoryId: string): LoreCategory | undefined {
  return loreCategories.find((category) => category.id === categoryId);
}

export function getLoreEntry(entryId: string): LoreEntry | undefined {
  return loreEntries.find((entry) => entry.id === entryId);
}

export function getLoreEntriesForCategory(categoryId: string): readonly LoreEntry[] {
  return loreEntries.filter((entry) => entry.categoryId === categoryId);
}

export function selectRandomLoreEntry(
  entries: readonly LoreEntry[] = loreEntries,
  rng: () => number = Math.random
): LoreEntry | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  const index = Math.min(entries.length - 1, Math.floor(Math.max(0, rng()) * entries.length));
  return entries[index];
}

export function selectRandomLoreEntryForCategory(
  categoryId: string,
  rng: () => number = Math.random
): LoreEntry | undefined {
  return selectRandomLoreEntry(getLoreEntriesForCategory(categoryId), rng);
}

export function validateLoreBoardContent(input: LoreContentValidationInput = {}): string[] {
  const categories: readonly LoreCategory[] = input.categories ?? loreCategories;
  const entries: readonly LoreEntry[] = input.entries ?? loreEntries;
  const errors: string[] = [];
  const categoryIds = new Set<string>();
  const entryIds = new Set<string>();

  for (const category of categories) {
    if (!category.id.trim()) {
      errors.push("Lore category has empty id.");
    }
    if (!category.title.trim()) {
      errors.push(`Lore category ${category.id} has empty title.`);
    }
    if (!category.description.trim()) {
      errors.push(`Lore category ${category.id} has empty description.`);
    }
    if (categoryIds.has(category.id)) {
      errors.push(`Duplicate lore category id: ${category.id}.`);
    }
    categoryIds.add(category.id);
  }

  for (const entry of entries) {
    if (!entry.id.trim()) {
      errors.push("Lore entry has empty id.");
    }
    if (entryIds.has(entry.id)) {
      errors.push(`Duplicate lore entry id: ${entry.id}.`);
    }
    entryIds.add(entry.id);
    if (!categoryIds.has(entry.categoryId)) {
      errors.push(`Lore entry ${entry.id} references unknown category ${entry.categoryId}.`);
    }
    if (!entry.title.trim()) {
      errors.push(`Lore entry ${entry.id} has empty title.`);
    }
    if (!entry.source.trim()) {
      errors.push(`Lore entry ${entry.id} has empty source.`);
    }
    if (!entry.body.trim()) {
      errors.push(`Lore entry ${entry.id} has empty body.`);
    }

    const canonicalRefs: readonly LoreCanonicalRef[] = entry.canonicalRefs ?? [];

    for (const ref of canonicalRefs) {
      if (!ref.id.trim()) {
        errors.push(`Lore entry ${entry.id} has empty canonical ref.`);
        continue;
      }

      const knownIds = input.knownRefs?.[ref.type];
      if (knownIds && !knownIds.has(ref.id)) {
        errors.push(`Lore entry ${entry.id} references unknown ${ref.type} id ${ref.id}.`);
      }
    }
  }

  for (const category of categories) {
    if (!entries.some((entry) => entry.categoryId === category.id)) {
      errors.push(`Lore category ${category.id} has no entries.`);
    }
  }

  return errors;
}

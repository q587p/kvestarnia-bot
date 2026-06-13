import type {
  CellarErrandAction,
  CellarErrandLookupResult,
  CellarErrandResult
} from "../../services/cellarErrandService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentCellarStart(
  result: Extract<CellarErrandLookupResult, { state: "ready" }>
): string {
  return [
    "🐭 Підвальна справа",
    "",
    "Корчмар показує на люк під баром.",
    "",
    npcQuote("Корчмар", "Там миша. Вона мала бути побічним квестом, але вже вимагає титул."),
    "",
    npcQuote("Миша", selectCellarStartMouseQuote(result.character)),
    ...presentCharacterFlavor(result.character, "quest.start", "cellar"),
    "",
    `${escapeHtml(result.character.name)}, що робимо?`
  ].join("\n");
}

export function presentCellarNoCharacter(): string {
  return "Спершу створіть героя через /start. Підвал не видає доручень тіням без анкети.";
}

export function presentCellarCooldown(
  result:
    | Extract<CellarErrandLookupResult, { state: "on-cooldown" }>
    | Extract<CellarErrandResult, { state: "on-cooldown" }>
): string {
  return [
    "🐭 Підвал тимчасово тихий.",
    "",
    "Миша взяла паузу на переосмислення сирної політики.",
    "",
    `Можна повернутись за ${formatCooldown(result.availableAt, result.now)}.`
  ].join("\n");
}

export function presentCellarResult(
  result: Exclude<CellarErrandResult, { state: "no-character" }>
): string {
  if (result.state === "on-cooldown") {
    return presentCellarCooldown(result);
  }

  const lines = [
    ...presentCellarOutcome(result.action, result.character),
    ...presentCharacterFlavor(result.character, "quest.outcome", "cellar", result.action),
    "",
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  lines.push("", `Підвал знову чекатиме за ${formatCooldown(result.availableAt, result.now)}.`);

  return lines.join("\n");
}

function presentCharacterFlavor(
  character: CharacterSummary,
  placement: "quest.start" | "quest.outcome",
  scene: "cellar",
  action?: CellarErrandAction
): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement,
    scene,
    ...(action ? { action } : {})
  });

  return flavor ? ["", escapeHtml(flavor.text)] : [];
}

function presentCellarOutcome(action: CellarErrandAction, character: CharacterSummary): string[] {
  const variant = selectCellarOutcomeVariant(action, character);
  const lines = [variant.title, variant.description];

  if (variant.quote) {
    lines.push(npcQuote("Миша", variant.quote));
  }

  return lines;
}

function presentItemGrantLines(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return itemGrants.map((grant) =>
    presentRewardItemGrant({
      name: escapeHtml(grant.name),
      quantity: grant.quantity
    })
  );
}

function formatCooldown(availableAt: Date, now: Date): string {
  const remainingMs = Math.max(0, availableAt.getTime() - now.getTime());
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return `${minutes} ${pluralize(minutes, "хвилину", "хвилини", "хвилин")}`;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

interface CellarOutcomeVariant {
  title: string;
  description: string;
  quote?: string;
}

interface CellarCharacterMatcher {
  raceIds?: readonly string[];
  classIds?: readonly string[];
  pronouns?: readonly CharacterSummary["pronoun"][];
}

interface CellarMouseQuoteGroup extends CellarCharacterMatcher {
  quotes: readonly string[];
}

interface CellarContextualOutcomeGroup extends CellarCharacterMatcher {
  action?: CellarErrandAction;
  variants: readonly CellarOutcomeVariant[];
}

const cellarStartMouseQuotes = [
  "Вітаю у моїй автономній сирній зоні. Ноги витирайте об павутину, вона теж у штаті.",
  "Якщо ви з податкової, я крихта. Якщо з пригоди, я бос підвалу.",
  "Підвал тимчасово мій. Тимчасово почалося давно, але не чіпляймося до дат.",
  "Я не краду сир. Я проводжу перерозподіл молочного впливу."
] as const;

const cellarContextualMouseQuoteGroups: readonly CellarMouseQuoteGroup[] = [
  {
    raceIds: ["race.domovyk"],
    classIds: ["class.bureaucramancer"],
    quotes: [
      "Домовик із паперами? Нарешті рівний суперник. Я вже підготувала форму «шафа-7-б»."
    ]
  },
  {
    raceIds: ["race.drantohor"],
    classIds: ["class.kharakternyk"],
    quotes: [
      "Остромаг і характерництво? Підвал просив героя, а отримав міжвідомчу легенду."
    ]
  },
  {
    raceIds: ["race.domovyk"],
    quotes: [
      "Домовик у підвалі? Прошу не плутати мою автономію з вашим житловим фондом.",
      "Якщо ви тут як домовик, то шафа вже зайнята. Я підписала її лапкою."
    ]
  },
  {
    raceIds: ["race.bisyny"],
    quotes: [
      "Бісини? Якщо почнете редагувати назву сиру, я вимагатиму моральну компенсацію крихтами.",
      "Я поважаю бісівську дискусію, але коментарі до мого підвалу приймаю тільки на серветках."
    ]
  },
  {
    raceIds: ["race.drantohor"],
    quotes: [
      "Дрантогор у підвалі — це вже майже геополітика. Не наступіть на мою крихту-амбасаду.",
      "Остромаг далеко, але запах пригоди той самий: темно, сирно й хтось робить вигляд, що це план."
    ]
  },
  {
    raceIds: ["race.dryland-rusalka"],
    quotes: [
      "Русалка суходолу в підвалі? Води нема, зате є сирна течія впливу.",
      "Не хвилюйтесь, тут сухо. Я перевірила: навіть павуки скриплять."
    ]
  },
  {
    raceIds: ["race.intellectual-orc"],
    quotes: [
      "Орк-інтелігент? Чудово. Брутальну силу лишіть нагорі, а тут сперечайтесь із сиром етично.",
      "Якщо це буде круглий стіл, я наполягаю на квадратному сирі для балансу."
    ]
  },
  {
    raceIds: ["race.molfar-soul"],
    quotes: [
      "Мольфарська душа? Не чаклуйте на мій сир. Він і так підозрює, що має долю.",
      "Я бачила іскри в кутку. Якщо це оберіг, нехай охороняє мою серветку."
    ]
  },
  {
    classIds: ["class.bard"],
    quotes: [
      "Бардові дозволено співати тільки куплети до трьох рядків. Мій сир не витримає приспіву.",
      "Якщо буде балада про мишу, роялті сиром і без рими «підвал — скандал»."
    ]
  },
  {
    classIds: ["class.rogue"],
    quotes: [
      "Злодій? Я вже порахувала крихти. Якщо зникне сьома, це буде сюжет.",
      "Тіньові проходи тут мої. Ваші тіні можуть стати в чергу біля банки."
    ]
  },
  {
    classIds: ["class.bureaucramancer"],
    quotes: [
      "Бюрокромант? Нарешті хтось зрозуміє, що сир без додатку — це просто хаос.",
      "Перед переговорами заповніть форму «не гризти дошку». Дрібний шрифт я вже зʼїла."
    ]
  },
  {
    classIds: ["class.ranger"],
    quotes: [
      "Єгерю, сліди свіжі, але це не доказ. Це моя художня інсталяція з пилу.",
      "Якщо ви за слідами, то мишачий ліворуч, сирний праворуч, драматичний прямо."
    ]
  },
  {
    classIds: ["class.warrior"],
    quotes: [
      "Воїне, мечі в підвалі звучать голосно. Спробуйте аргумент розміром із сир.",
      "Сила — це добре. Але чи може вона відкрити банку крихт без свідків?"
    ]
  },
  {
    classIds: ["class.mage"],
    quotes: [
      "Магія дозволена, якщо не перетворює сир на метафору. Минулого разу було липко.",
      "Якщо це закляття світла, попереджайте. Мій пил має право на приватність."
    ]
  },
  {
    classIds: ["class.varenyk-mancer"],
    quotes: [
      "Вареникомант? Сир визнає вас далеким родичем, але спадщину не обіцяє.",
      "Начинка начинкою, а підвальна автономія окремо. Не плутайте кулінарію з політикою."
    ]
  },
  {
    classIds: ["class.priest"],
    quotes: [
      "Жрець у підвалі — це добре. Благословіть крихти, вони пережили важкий тиждень.",
      "Якщо будете зцілювати дошку, почніть із кутка, який я не гризла. Таких мало."
    ]
  },
  {
    pronouns: ["he"],
    quotes: [
      "Він прийшов? Добре. У протоколі буде «герой упевнено дивився на люк, люк не злякався»."
    ]
  },
  {
    pronouns: ["she"],
    quotes: [
      "Вона прийшла? Чудово. Підвал любить героїнь із поглядом «я зараз наведу лад, але смішно»."
    ]
  },
  {
    pronouns: ["they"],
    quotes: [
      "Вони прийшли? Прекрасно. Одним героєм більше, однією анкетою менше, сир нервує."
    ]
  }
] as const;

const cellarOutcomeVariants: Record<CellarErrandAction, readonly CellarOutcomeVariant[]> = {
  "cheese-trap": [
    {
      title: "🧀 Пастка спрацювала частково.",
      description: "Миша лишила сир і записку, а сама пішла подавати апеляцію за шафу.",
      quote: "Ваші умови смішні, але сир переконливий."
    },
    {
      title: "🧀 Сирна пастка отримала підпис.",
      description: "Миша зайшла, прочитала дрібний шрифт і забрала тільки моральну перевагу.",
      quote: "Це не пастка, це переговорна кімната з запахом."
    },
    {
      title: "🧀 Пастка клацнула дуже офіційно.",
      description: "Сир зник, механізм пишається, миша залишила вам процедурний сумнів.",
      quote: "Дякую за snack-пастку. Зауваження надішлю лапкою."
    }
  ],
  "sweep-bravely": [
    {
      title: "🧹 Ви підмели підвал.",
      description: "Пил отримав моральну поразку, миша — простір для маневру.",
      quote: "Підмітати можна. Пересувати мою крихту номер сім — ні."
    },
    {
      title: "🧹 Підвал побачив підлогу й здивувався.",
      description: "Миша оцінила чистоту, але попросила не робити з цього режим.",
      quote: "Чисто. Підозріло чисто. Я занотую."
    },
    {
      title: "🧹 Віник провів малий рейд.",
      description: "Павутиння відійшло на стратегічні позиції, миша видала щетину як трофей.",
      quote: "Це не сміття, це архів підвалу."
    }
  ],
  negotiate: [
    {
      title: "🤝 Переговори завершено.",
      description: "Миша погодилась не гризти квестові дошки до наступного інциденту.",
      quote: "Пишіть: автономія за шафою, сир за графіком, герой без різких жестів."
    },
    {
      title: "🤝 Дипломатія пролізла під бочку.",
      description: "Миша поставила лапку на серветці й назвала це міжнародним документом.",
      quote: "Печатки нема, бо я її зʼїла. Це не скасовує угоду."
    },
    {
      title: "🤝 Ви майже домовились.",
      description: "Миша прийняла ваші аргументи, крім тих, де сир не згадано поіменно.",
      quote: "Усна угода чинна до першого хрумкого доказу."
    }
  ]
};

const contextualCellarOutcomeGroups: readonly CellarContextualOutcomeGroup[] = [
  {
    action: "negotiate",
    raceIds: ["race.domovyk"],
    variants: [
      {
        title: "🤝 Підвальна житлова комісія засідала стоячи.",
        description: "Домовик і миша поділили шафу на «законну полицю» та «тимчасово гризену територію».",
        quote: "Я визнаю ваше право на дім, якщо ви визнаєте моє право на крихту з видом."
      },
      {
        title: "🤝 Домовик відкрив переговори ключем від повітря.",
        description: "Миша погодилась на автономію за шафою, але попросила не називати це суборендою.",
        quote: "Суборенда звучить дорого. Пишіть «сирне самоврядування»."
      }
    ]
  },
  {
    action: "negotiate",
    classIds: ["class.bureaucramancer"],
    variants: [
      {
        title: "🤝 Переговори стали документом, а документ — підозрою.",
        description: "Бюрокромант склав сирний меморандум. Миша зʼїла печатку й оголосила це ратифікацією.",
        quote: "Якщо печатка всередині мене, документ має внутрішню силу."
      },
      {
        title: "🤝 Форма «М-И-Ш-А» нарешті знайшла адресата.",
        description: "Миша заповнила графу «причина гризіння» словом «історична» й дуже собою пишалась.",
        quote: "Дрібний шрифт смачний. Це не скарга, це відгук."
      }
    ]
  },
  {
    action: "negotiate",
    classIds: ["class.bard"],
    variants: [
      {
        title: "🤝 Бард узяв переговори в тональність сиру.",
        description: "Миша вислухала куплет, заборонила приспів і погодилась на мир за роялті крихтами.",
        quote: "Рима «миша — тиша» приймається тільки один раз за cooldown."
      },
      {
        title: "🤝 Дипломатія отримала акомпанемент.",
        description: "Після третьої ноти підвал сам попросив угоду, аби це не стало мюзиклом.",
        quote: "Я підписую, тільки заберіть лютню від банки."
      }
    ]
  },
  {
    action: "cheese-trap",
    classIds: ["class.rogue"],
    variants: [
      {
        title: "🧀 Пастка стала настільки непомітною, що образилась.",
        description: "Злодій заховав сир професійно. Миша знайшла його за запахом і лишила записку без підпису.",
        quote: "Гарна спроба. Я теж працюю в тіні, просто нижче плінтуса."
      },
      {
        title: "🧀 Сир зник до того, як пастка зрозуміла свою роль.",
        description: "Миша підозрює всіх, включно з героєм, автором квесту й самим сиром.",
        quote: "Якщо доказ смачний, він перестає бути доказом."
      }
    ]
  },
  {
    action: "cheese-trap",
    classIds: ["class.ranger"],
    variants: [
      {
        title: "🧀 Єгер розклав маршрут пастки по слідах.",
        description: "Миша пройшла його навпаки, похвалила навігацію й забрала сир як плату за консультацію.",
        quote: "Карта добра. Де тут позначено запасний вихід для дуже малої гордости?"
      },
      {
        title: "🧀 Сліди вели до сиру, сир — до висновків.",
        description: "Пастка лишилась чистою, зате миша попросила копію маршруту для своїх племінників.",
        quote: "Ви стежили за мною, я стежила за сиром. Усі при справі."
      }
    ]
  },
  {
    action: "cheese-trap",
    raceIds: ["race.bisyny"],
    variants: [
      {
        title: "🧀 Сир назвали неправильно. Пастка спрацювала з образи.",
        description: "Бісини почали дискусію про «молочний артефакт», і миша вийшла захищати термінологію.",
        quote: "Це сир. Не концепт, не носій смаку, не артефакт. Сир."
      }
    ]
  },
  {
    action: "sweep-bravely",
    raceIds: ["race.drantohor"],
    variants: [
      {
        title: "🧹 Дрантогор підмів так, ніби шукав кордон.",
        description: "Пил відступив у туманну смугу, а миша оголосила її нейтральною територією.",
        quote: "Не переходьте лінію крихт без сирного паспорта."
      }
    ]
  },
  {
    action: "sweep-bravely",
    classIds: ["class.mage"],
    variants: [
      {
        title: "🧹 Магічне підмітання дало іскру й питання.",
        description: "Пил зібрався в маленьку хмару, миша назвала її погодою й зажадала прогноз.",
        quote: "Якщо це закляття чистоти, чому воно дивиться на мене?"
      }
    ]
  },
  {
    action: "sweep-bravely",
    classIds: ["class.warrior"],
    variants: [
      {
        title: "🧹 Воїн узяв віник як дворучну зброю.",
        description: "Пил упав без честі, миша аплодувала однією лапкою й не визнала капітуляції.",
        quote: "Сильно. Тепер спробуйте перемогти крихту дипломатично."
      }
    ]
  },
  {
    action: "sweep-bravely",
    pronouns: ["she"],
    variants: [
      {
        title: "🧹 Героїня навела лад без зайвої церемонії.",
        description: "Миша зробила вигляд, що саме так і планувала, але швидко прибрала хвіст із проходу.",
        quote: "Я не поступилась. Я стратегічно перемістилась у чистіше місце."
      }
    ]
  },
  {
    action: "negotiate",
    pronouns: ["he"],
    variants: [
      {
        title: "🤝 Герой спробував говорити офіційно.",
        description: "Миша вислухала, виправила інтонацію й дозволила називати це перемовинами.",
        quote: "Він старається. Запишемо це як помʼякшувальну обставину."
      }
    ]
  },
  {
    action: "cheese-trap",
    pronouns: ["they"],
    variants: [
      {
        title: "🧀 Герої розставили пастку з колективною відповідальністю.",
        description: "Миша оцінила командний підхід і звинуватила всіх одразу, щоб не дробити протокол.",
        quote: "Вони принесли сир. Вони ж і відповідатимуть за його зникнення."
      }
    ]
  }
];

function selectCellarStartMouseQuote(character: CharacterSummary): string {
  const contextualGroup = cellarContextualMouseQuoteGroups.find((group) =>
    matchesCharacterMatcher(group, character)
  );
  const quotes = contextualGroup?.quotes ?? cellarStartMouseQuotes;

  return selectStableVariant(
    quotes,
    `${character.pronoun}:${character.name}:${character.raceId}:${character.classId}`
  );
}

function selectCellarOutcomeVariant(
  action: CellarErrandAction,
  character: CharacterSummary
): CellarOutcomeVariant {
  const contextualGroup = contextualCellarOutcomeGroups.find((group) =>
    matchesContextualOutcomeGroup(group, action, character)
  );
  const variants = contextualGroup?.variants ?? cellarOutcomeVariants[action];

  return selectStableVariant(
    variants,
    `${action}:${character.pronoun}:${character.name}:${character.raceId}:${character.classId}:${character.level}`
  );
}

function selectStableVariant<T>(variants: readonly T[], seed: string): T {
  const index = [...seed].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % variants.length;

  const variant = variants[index];

  if (variant === undefined) {
    throw new Error("Cellar flavor variants must not be empty.");
  }

  return variant;
}

function matchesCharacterMatcher(group: CellarCharacterMatcher, character: CharacterSummary): boolean {
  if (group.raceIds && !group.raceIds.includes(character.raceId)) {
    return false;
  }

  if (group.classIds && !group.classIds.includes(character.classId)) {
    return false;
  }

  if (group.pronouns && !group.pronouns.includes(character.pronoun)) {
    return false;
  }

  return true;
}

function matchesContextualOutcomeGroup(
  group: CellarContextualOutcomeGroup,
  action: CellarErrandAction,
  character: CharacterSummary
): boolean {
  if (group.action && group.action !== action) {
    return false;
  }

  return matchesCharacterMatcher(group, character);
}

import type { EquipmentSlotContent, ItemContent, ItemEffectContent } from "./schema";
type WeightedMonsterLootEntry = string | { itemId: string; weight?: number };
export type MantokSetBonusKind = "stats";
export interface MantokSetBonusDefinition {
  pieces: number;
  kind: MantokSetBonusKind;
  name: string;
  description: string;
  effect: Partial<ItemEffectContent>;
}
export interface MantokSetPieceDefinition {
  itemId: string;
  role: string;
  slot: EquipmentSlotContent;
}
export interface MantokSetDefinition {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  sourceMonsterIds: readonly string[];
  pieces: readonly MantokSetPieceDefinition[];
  bonuses: readonly MantokSetBonusDefinition[];
}

export const mantokSetItemContents = [
  {
    id: "item.set.red-line.left-dagger",
    name: "Кинджал червоного рядка",
    description: "Лівий край леза виглядає як редакторська правка, яку краще не ігнорувати. Частина комплекту «Парні кинджали червоного рядка»: 1/2.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 124,
    tags: ["soulbound"],
    effect: {
          "weaponDamage": 4,
          "dexterity": 1
    }
  },
  {
    id: "item.set.red-line.margin-dagger",
    name: "Кинджал червоного поля",
    description: "Праве лезо лишає на супротивнику поле для зауважень. Зауваження кровить. Частина комплекту «Парні кинджали червоного рядка»: 2/2.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "offhand",
    goldValue: 124,
    tags: ["offhand", "soulbound"],
    effect: {
          "weaponDamage": 3,
          "luck": 1
    }
  },
  {
    id: "item.set.barrel-brother.helm",
    name: "Шолом бочкового дзвону",
    description: "Дзвенить лише тоді, коли по голові прилітає аргумент. Тобто часто. Частина комплекту «Бочковий панцир старшого Брата»: 1/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 118,
    tags: ["soulbound"],
    effect: {
          "armor": 2,
          "resist": 1
    }
  },
  {
    id: "item.set.barrel-brother.cuirass",
    name: "Нагрудник старшого обруча",
    description: "Тримає ребра разом і робить вигляд, що це було погоджено комісією. Частина комплекту «Бочковий панцир старшого Брата»: 2/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 134,
    tags: ["soulbound"],
    effect: {
          "armor": 3,
          "hpMax": 5
    }
  },
  {
    id: "item.set.barrel-brother.greaves",
    name: "Поножі нижнього обруча",
    description: "Йдуть повільно, зате кожен крок звучить як службове попередження. Частина комплекту «Бочковий панцир старшого Брата»: 3/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 126,
    tags: ["soulbound"],
    effect: {
          "armor": 2,
          "hpMax": 3
    }
  },
  {
    id: "item.set.barrel-brother.shield",
    name: "Щит бочкового контраргументу",
    description: "Підсилює захист так, ніби за вами стоїть вся Бочка і питає «а доказ є?». Частина комплекту «Бочковий панцир старшого Брата»: 4/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "offhand",
    goldValue: 141,
    tags: ["offhand", "soulbound"],
    effect: {
          "armor": 3,
          "resist": 1
    }
  },
  {
    id: "item.set.yeger-shadow.hood",
    name: "Каптур тихого сліду",
    description: "Ховає не обличчя, а намір пояснювати, звідки ви знаєте цю стежку. Частина комплекту «Єгерська тіньова стежка»: 1/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 137,
    tags: ["soulbound"],
    effect: {
          "dexterity": 2,
          "luck": 1
    }
  },
  {
    id: "item.set.yeger-shadow.cloak",
    name: "Єгерський плащ чужої справи",
    description: "Не робить вас Єгерем, але змушує бинти дивитися з повагою і легкою знижкою. Частина комплекту «Єгерська тіньова стежка»: 2/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 155,
    tags: ["soulbound"],
    effect: {
          "dexterity": 1,
          "resist": 1,
          "hpMax": 3
    }
  },
  {
    id: "item.set.yeger-shadow.boots",
    name: "Чоботи сліду, що не свідчить",
    description: "Залишають слід так акуратно, що його хочеться допитати окремо. Частина комплекту «Єгерська тіньова стежка»: 3/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 131,
    tags: ["soulbound"],
    effect: {
          "dexterity": 2,
          "luck": 1
    }
  },
  {
    id: "item.set.yeger-shadow.longbow",
    name: "Лук останньої зарубки",
    description: "Дворучний лук, який натягується тільки після того, як стежка погодила маршрут. Частина комплекту «Єгерська тіньова стежка»: 4/4.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 166,
    tags: ["twohand", "soulbound"],
    effect: {
          "weaponDamage": 5,
          "dexterity": 2
    }
  },
  {
    id: "item.set.couplet.harp",
    name: "Арфа куплету без дозволу",
    description: "Звучить так, ніби таверна не замовляла виступ, але вже плескає з безвиході. Частина комплекту «Набір незапланованого куплету»: 1/3.",
    rarity: "epic",
    slot: "accessory",
    equipmentSlot: "accessory",
    goldValue: 139,
    tags: ["soulbound"],
    effect: {
          "charisma": 2,
          "manaMax": 2
    }
  },
  {
    id: "item.set.couplet.cap",
    name: "Капелюх репетиційної сміливости",
    description: "Перо в ньому пережило більше куплетів, ніж деякі монстри пережили ударів. Частина комплекту «Набір незапланованого куплету»: 2/3.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 92,
    effect: {
          "charisma": 1,
          "luck": 1
    }
  },
  {
    id: "item.set.couplet.boots",
    name: "Чоботи сцени, що скрипить",
    description: "Скриплять у ритм навіть тоді, коли ритм подав заяву на звільнення. Частина комплекту «Набір незапланованого куплету»: 3/3.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 91,
    effect: {
          "charisma": 1,
          "dexterity": 1
    }
  },
  {
    id: "item.set.asclepius.staff",
    name: "Посох Асклепія з інструкцією",
    description: "На пососі є змія, інструкція і маленьке «не лікувати супротивника, якщо не впевнені». Частина комплекту «Черга до посоха Асклепія»: 1/3.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 161,
    tags: ["twohand", "soulbound"],
    effect: {
          "spellPower": 3,
          "manaMax": 3
    }
  },
  {
    id: "item.set.asclepius.badge",
    name: "Жетон черги до благословення",
    description: "Дає право бути наступним, якщо наступний не помер до того. Частина комплекту «Черга до посоха Асклепія»: 2/3.",
    rarity: "rare",
    slot: "accessory",
    equipmentSlot: "accessory",
    goldValue: 97,
    effect: {
          "charisma": 1,
          "manaMax": 2
    }
  },
  {
    id: "item.set.asclepius.band",
    name: "Повʼязка суворого огляду",
    description: "Так суворо лежить на голові, що синці самі стають у чергу. Частина комплекту «Черга до посоха Асклепія»: 3/3.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 93,
    effect: {
          "resist": 1,
          "manaMax": 2
    }
  },
  {
    id: "item.set.form13bis.seal",
    name: "Печатка форми 13-біс",
    description: "Ставиться на все, що рухається. Якщо не рухається — тим більше ставиться. Частина комплекту «Форма 13-біс у трьох примірниках»: 1/3.",
    rarity: "epic",
    slot: "accessory",
    equipmentSlot: "tool",
    goldValue: 137,
    tags: ["soulbound"],
    effect: {
          "intelligence": 2,
          "resist": 1
    }
  },
  {
    id: "item.set.form13bis.folder",
    name: "Папка повернення без розгляду",
    description: "Друга рука стає офіційною причиною, чому ворог ще почекає. Частина комплекту «Форма 13-біс у трьох примірниках»: 2/3.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "offhand",
    goldValue: 88,
    tags: ["offhand"],
    effect: {
          "armor": 1,
          "intelligence": 1
    }
  },
  {
    id: "item.set.form13bis.spectacles",
    name: "Окуляри дрібного шрифту",
    description: "Показують умови там, де інші бачать лише загрозу. Частина комплекту «Форма 13-біс у трьох примірниках»: 3/3.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 84,
    effect: {
          "intelligence": 1,
          "luck": 1
    }
  },
  {
    id: "item.set.siege-filling.ladle",
    name: "Ополоник облоги начинки",
    description: "Дворучний ополоник. Якщо ним не вдарити, він усе одно виглядає як загроза супу. Частина комплекту «Облогова начинка»: 1/4.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 169,
    tags: ["twohand", "soulbound"],
    effect: {
          "weaponDamage": 4,
          "spellPower": 2
    }
  },
  {
    id: "item.set.siege-filling.colander",
    name: "Друшляковий шолом облоги",
    description: "Пропускає зайве, окрім ударів по самолюбству. Частина комплекту «Облогова начинка»: 2/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 96,
    effect: {
          "armor": 2,
          "resist": 1
    }
  },
  {
    id: "item.set.siege-filling.apronmail",
    name: "Кольчужний фартух сметанної лінії",
    description: "Фартух, який перестав бути тканиною після третього «ой, гаряче». Частина комплекту «Облогова начинка»: 3/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 143,
    tags: ["soulbound"],
    effect: {
          "armor": 3,
          "hpMax": 4
    }
  },
  {
    id: "item.set.siege-filling.boots",
    name: "Чоботи важкої начинки",
    description: "Ідуть так, ніби земля мала подати заявку на вашу присутність. Частина комплекту «Облогова начинка»: 4/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 102,
    effect: {
          "armor": 2,
          "hpMax": 3
    }
  },
  {
    id: "item.set.fog-knot.amulet",
    name: "Оберіг туману, що не дописався",
    description: "Висить мовчки, але іноді моргає так, ніби знає майбутній удар. Частина комплекту «Туманний вузол мольфарської душі»: 1/4.",
    rarity: "epic",
    slot: "accessory",
    equipmentSlot: "accessory",
    goldValue: 132,
    tags: ["soulbound"],
    effect: {
          "luck": 2,
          "resist": 1
    }
  },
  {
    id: "item.set.fog-knot.shawl",
    name: "Шаль невидимого пояснення",
    description: "Голова в ній виглядає так, ніби вже попросила вітер свідчити. Частина комплекту «Туманний вузол мольфарської душі»: 2/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 87,
    effect: {
          "luck": 1,
          "resist": 1
    }
  },
  {
    id: "item.set.fog-knot.cloak",
    name: "Плащ обережного передбачення",
    description: "Плащ не ховає героя. Він ховає погані рішення від монстра. Частина комплекту «Туманний вузол мольфарської душі»: 3/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 139,
    tags: ["soulbound"],
    effect: {
          "resist": 2,
          "hpMax": 3
    }
  },
  {
    id: "item.set.fog-knot.thread",
    name: "Вузлик, що памʼятає відповідь",
    description: "Інструмент для завʼязування проблем у менш переконливу форму. Частина комплекту «Туманний вузол мольфарської душі»: 4/4.",
    rarity: "rare",
    slot: "accessory",
    equipmentSlot: "tool",
    goldValue: 94,
    effect: {
          "luck": 1,
          "manaMax": 2
    }
  },
  {
    id: "item.set.firepost.spear",
    name: "Спис хибної геолокації",
    description: "Дворучний спис, який знаходить адресу навіть тоді, коли адреса тікає. Частина комплекту «Вогнепоштова луска тринадцяти адрес»: 1/4.",
    rarity: "epic",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 172,
    tags: ["twohand", "soulbound"],
    effect: {
          "weaponDamage": 5,
          "luck": 1
    }
  },
  {
    id: "item.set.firepost.visor",
    name: "Забрало поштового полумʼя",
    description: "Показує, куди летить вогонь. Майже завжди занадто пізно. Частина комплекту «Вогнепоштова луска тринадцяти адрес»: 2/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 101,
    effect: {
          "resist": 2,
          "spellPower": 1
    }
  },
  {
    id: "item.set.firepost.mail",
    name: "Кольчуга поверненого листа",
    description: "Кожна луска підписана «адресата не знайдено», але тримається міцно. Частина комплекту «Вогнепоштова луска тринадцяти адрес»: 3/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 151,
    tags: ["soulbound"],
    effect: {
          "armor": 3,
          "resist": 2
    }
  },
  {
    id: "item.set.firepost.boots",
    name: "Чоботи курʼєрського диму",
    description: "Залишають слід, який сам себе доставляє. Частина комплекту «Вогнепоштова луска тринадцяти адрес»: 4/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 103,
    effect: {
          "dexterity": 1,
          "resist": 1
    }
  },
  {
    id: "item.set.dry-tide.kettle",
    name: "Чайник сухого припливу",
    description: "Свистить так, ніби море прийшло в чай, але не встигло намокнути. Частина комплекту «Сухий приплив чайникового моря»: 1/4.",
    rarity: "epic",
    slot: "accessory",
    equipmentSlot: "tool",
    goldValue: 141,
    tags: ["soulbound"],
    effect: {
          "intelligence": 2,
          "manaMax": 2
    }
  },
  {
    id: "item.set.dry-tide.circlet",
    name: "Вінець мушлі без берега",
    description: "Сидить на голові так, ніби пляж мусив бути десь поруч. Частина комплекту «Сухий приплив чайникового моря»: 2/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 96,
    effect: {
          "intelligence": 1,
          "charisma": 1
    }
  },
  {
    id: "item.set.dry-tide.wrap",
    name: "Піна, що поводиться як мантія",
    description: "Піна тримається купи, бо їй соромно розлитися без наказу. Частина комплекту «Сухий приплив чайникового моря»: 3/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 139,
    tags: ["soulbound"],
    effect: {
          "resist": 2,
          "manaMax": 3
    }
  },
  {
    id: "item.set.dry-tide.sandals",
    name: "Сандалі калюжі на суші",
    description: "Залишають після себе не слід, а підозру, що тут щойно було море. Частина комплекту «Сухий приплив чайникового моря»: 4/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 94,
    effect: {
          "dexterity": 1,
          "intelligence": 1
    }
  },
  {
    id: "item.set.stone-accountant.helm",
    name: "Шолом камʼяної відомости",
    description: "На ньому все записано. Навіть удар, якого ще не було. Частина комплекту «Камʼяний облік відповідального блоку»: 1/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 91,
    effect: {
          "armor": 2,
          "intelligence": 1
    }
  },
  {
    id: "item.set.stone-accountant.apron",
    name: "Камʼяний фартух збитків",
    description: "Важкий доказ, що кухонний захист теж може бути бухгалтерським. Частина комплекту «Камʼяний облік відповідального блоку»: 2/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 142,
    tags: ["soulbound"],
    effect: {
          "armor": 3,
          "hpMax": 5
    }
  },
  {
    id: "item.set.stone-accountant.greaves",
    name: "Поножі графи «разом»",
    description: "Крокують повільно, але підсумовують переконливо. Частина комплекту «Камʼяний облік відповідального блоку»: 3/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 99,
    effect: {
          "armor": 2,
          "hpMax": 2
    }
  },
  {
    id: "item.set.stone-accountant.abacus-shield",
    name: "Щит-рахівниця поверненого удару",
    description: "Кожна кісточка рахує, скільки разів ворог пошкодує про ініціятиву. Частина комплекту «Камʼяний облік відповідального блоку»: 4/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "offhand",
    goldValue: 148,
    tags: ["offhand", "soulbound"],
    effect: {
          "armor": 3,
          "resist": 1
    }
  },
  {
    id: "item.set.border-map.compass",
    name: "Компас чужої Межі",
    description: "Показує не північ, а місце, де реальність не встигла заперечити. Частина комплекту «Межова мапа чужого проходу»: 1/4.",
    rarity: "epic",
    slot: "accessory",
    equipmentSlot: "tool",
    goldValue: 145,
    tags: ["soulbound"],
    effect: {
          "luck": 2,
          "dexterity": 1
    }
  },
  {
    id: "item.set.border-map.cloak",
    name: "Плащ позначеної стежки",
    description: "На підкладці намальована карта, яка запевняє, що ви вже майже тут. Частина комплекту «Межова мапа чужого проходу»: 2/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 106,
    effect: {
          "dexterity": 1,
          "resist": 1
    }
  },
  {
    id: "item.set.border-map.boots",
    name: "Чоботи третього правильного шляху",
    description: "Ідуть трьома дорогами одразу й повертаються тільки двома. Частина комплекту «Межова мапа чужого проходу»: 3/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "legs",
    goldValue: 103,
    effect: {
          "dexterity": 2
    }
  },
  {
    id: "item.set.border-map.buckler",
    name: "Баклер пропуску заднім числом",
    description: "Мала друга рука, яка ставить печатку на ухилення. Частина комплекту «Межова мапа чужого проходу»: 4/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "offhand",
    goldValue: 101,
    tags: ["offhand"],
    effect: {
          "armor": 1,
          "luck": 1
    }
  },
  {
    id: "item.set.inventory-prophet.visor",
    name: "Візор відсутньої етикетки",
    description: "Показує не те, що є, а те, що скоро всі шукатимуть. Частина комплекту «Недостача інвентарного пророка»: 1/4.",
    rarity: "epic",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 131,
    tags: ["soulbound"],
    effect: {
          "luck": 2,
          "intelligence": 1
    }
  },
  {
    id: "item.set.inventory-prophet.ledger",
    name: "Книга майбутньої недостачі",
    description: "У ній уже є сторінка про вас, але номер сторінки загубився. Частина комплекту «Недостача інвентарного пророка»: 2/4.",
    rarity: "epic",
    slot: "accessory",
    equipmentSlot: "tool",
    goldValue: 146,
    tags: ["soulbound"],
    effect: {
          "intelligence": 2,
          "luck": 1
    }
  },
  {
    id: "item.set.inventory-prophet.keyring",
    name: "Брелок ключів, яких не вистачає",
    description: "Дзвенить тільки тоді, коли потрібний ключ точно не серед них. Частина комплекту «Недостача інвентарного пророка»: 3/4.",
    rarity: "rare",
    slot: "accessory",
    equipmentSlot: "accessory",
    goldValue: 97,
    effect: {
          "luck": 2
    }
  },
  {
    id: "item.set.inventory-prophet.coat",
    name: "Пальто кишенькової ревізії",
    description: "Кишені рахують себе самі й усе одно знаходять нестачу. Частина комплекту «Недостача інвентарного пророка»: 4/4.",
    rarity: "rare",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 109,
    effect: {
          "resist": 1,
          "hpMax": 4
    }
  },
] satisfies ItemContent[];

export const mantokSetDefinitions = [
  {
    id: "mantok-set.red-line-duel",
    name: "Парні кинджали червоного рядка",
    description: "Пара дрібних лез для тих, хто править супротивника у два стовпчики: головний і болючий.",
    minLevel: 10,
    sourceMonsterIds: ["monster.deep-estimate-sawfish", "monster.inventory-prophet"],
    pieces: [
      { itemId: "item.set.red-line.left-dagger", role: "Кинджал червоного рядка", slot: "weapon" },
      { itemId: "item.set.red-line.margin-dagger", role: "Кинджал червоного поля", slot: "offhand" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Подвійна редактура",
        description: "Коли обидва кинджали в руках, пригодник отримує +1 DEX.",
        effect: {
                  "dexterity": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.barrel-brother-bulwark",
    name: "Бочковий панцир старшого Брата",
    description: "Повний оборонний набір для тих, хто пережив бочку і тепер хоче пережити пояснення.",
    minLevel: 9,
    sourceMonsterIds: ["monster.three-signature-chimera", "monster.cheese-vault-warden", "monster.siege-iron-varenyk"],
    pieces: [
      { itemId: "item.set.barrel-brother.helm", role: "Шолом бочкового дзвону", slot: "head" },
      { itemId: "item.set.barrel-brother.cuirass", role: "Нагрудник старшого обруча", slot: "chest" },
      { itemId: "item.set.barrel-brother.greaves", role: "Поножі нижнього обруча", slot: "legs" },
      { itemId: "item.set.barrel-brother.shield", role: "Щит бочкового контраргументу", slot: "offhand" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Обруч не питає",
        description: "Дві частини дають +1 armor і +2 max HP.",
        effect: {
                  "armor": 1,
                  "hpMax": 2
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Бочка тримає форму",
        description: "Три частини дають +1 resist.",
        effect: {
                  "resist": 1
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Старший захист",
        description: "Повний комплект дає +1 armor і +1 resist.",
        effect: {
                  "armor": 1,
                  "resist": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.yeger-shadow-path",
    name: "Єгерська тіньова стежка",
    description: "Набір для тих, хто ще не Єгер, але вже дуже переконливо мовчить біля дошки Єгеря.",
    minLevel: 12,
    sourceMonsterIds: ["monster.service-path-lisovyk", "monster.forest-loss-aurochs", "monster.inventory-prophet"],
    pieces: [
      { itemId: "item.set.yeger-shadow.hood", role: "Каптур тихого сліду", slot: "head" },
      { itemId: "item.set.yeger-shadow.cloak", role: "Єгерський плащ чужої справи", slot: "chest" },
      { itemId: "item.set.yeger-shadow.boots", role: "Чоботи сліду, що не свідчить", slot: "legs" },
      { itemId: "item.set.yeger-shadow.longbow", role: "Лук останньої зарубки", slot: "weapon" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Стежка бачить раніше",
        description: "Дві частини дають +1 DEX і +1 LUCK.",
        effect: {
                  "dexterity": 1,
                  "luck": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Не-Єгерський допуск",
        description: "Три частини дають +1 resist.",
        effect: {
                  "resist": 1
        }
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Рикошет тіньової стежки",
        description: "Повний набір дає +1 weaponDamage.",
        effect: {
                  "weaponDamage": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.unplanned-couplet",
    name: "Набір незапланованого куплету",
    description: "Сценічний комплект для пригодника, який не бард, але вже заважає тиші професійно.",
    minLevel: 10,
    sourceMonsterIds: ["monster.promo-perelesnyk", "monster.quarterly-report-pan-kotsky", "monster.final-approval-raven"],
    pieces: [
      { itemId: "item.set.couplet.harp", role: "Арфа куплету без дозволу", slot: "accessory" },
      { itemId: "item.set.couplet.cap", role: "Капелюх репетиційної сміливости", slot: "head" },
      { itemId: "item.set.couplet.boots", role: "Чоботи сцени, що скрипить", slot: "legs" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Публіка вже винна",
        description: "Дві частини дають +1 CHA.",
        effect: {
                  "charisma": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Небезпечний не-бардовий куплет",
        description: "Повний набір дає +1 CHA і +1 max mana.",
        effect: {
                  "charisma": 1,
                  "manaMax": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.asclepius-clinic",
    name: "Черга до посоха Асклепія",
    description: "Медично-релігійний комплект, який лікує за ману і просить не називати це страховим випадком.",
    minLevel: 11,
    sourceMonsterIds: ["monster.calendar-hydra", "monster.quiet-catastrophe-clerk", "monster.tide-accountant-vodyanyk"],
    pieces: [
      { itemId: "item.set.asclepius.staff", role: "Посох Асклепія з інструкцією", slot: "weapon" },
      { itemId: "item.set.asclepius.badge", role: "Жетон черги до благословення", slot: "accessory" },
      { itemId: "item.set.asclepius.band", role: "Повʼязка суворого огляду", slot: "head" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Лікувальна черга рухається",
        description: "Дві частини дають +2 max mana.",
        effect: {
                  "manaMax": 2
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Суворе не-жрецьке благословення",
        description: "Повний набір дає +1 spellPower і +1 CHA.",
        effect: {
                  "spellPower": 1,
                  "charisma": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.form-thirteen-bis",
    name: "Форма 13-біс у трьох примірниках",
    description: "Комплект для тих, хто хоче перемагати паперами, але ще не має повної бюрокромантської ліцензії.",
    minLevel: 11,
    sourceMonsterIds: ["monster.three-signature-chimera", "monster.calendar-hydra", "monster.inventory-prophet"],
    pieces: [
      { itemId: "item.set.form13bis.seal", role: "Печатка форми 13-біс", slot: "tool" },
      { itemId: "item.set.form13bis.folder", role: "Папка повернення без розгляду", slot: "offhand" },
      { itemId: "item.set.form13bis.spectacles", role: "Окуляри дрібного шрифту", slot: "head" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Дрібний шрифт працює",
        description: "Дві частини дають +1 INT.",
        effect: {
                  "intelligence": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Форма 13-біс",
        description: "Повний набір дає +1 INT і +1 resist.",
        effect: {
                  "intelligence": 1,
                  "resist": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.siege-filling",
    name: "Облогова начинка",
    description: "Вареничний комплект для повільної, гарячої і трохи броньованої аргументації.",
    minLevel: 12,
    sourceMonsterIds: ["monster.siege-iron-varenyk", "monster.strategic-reserve-potato", "monster.quiet-catastrophe-clerk"],
    pieces: [
      { itemId: "item.set.siege-filling.ladle", role: "Ополоник облоги начинки", slot: "weapon" },
      { itemId: "item.set.siege-filling.colander", role: "Друшляковий шолом облоги", slot: "head" },
      { itemId: "item.set.siege-filling.apronmail", role: "Кольчужний фартух сметанної лінії", slot: "chest" },
      { itemId: "item.set.siege-filling.boots", role: "Чоботи важкої начинки", slot: "legs" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Тісто тримає стрій",
        description: "Дві частини дають +1 armor і +2 HP.",
        effect: {
                  "armor": 1,
                  "hpMax": 2
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Пара під контролем",
        description: "Три частини дають +1 spellPower.",
        effect: {
                  "spellPower": 1
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Кипляча не-начинка",
        description: "Повний набір дає +1 weaponDamage і +1 HP.",
        effect: {
                  "weaponDamage": 1,
                  "hpMax": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.fog-amulet-knot",
    name: "Туманний вузол мольфарської душі",
    description: "Обереговий комплект, який ставить між вами і проблемою не стіну, а ввічливий густий туман.",
    minLevel: 11,
    sourceMonsterIds: ["monster.calendar-hydra", "monster.quiet-catastrophe-clerk", "monster.tide-accountant-vodyanyk"],
    pieces: [
      { itemId: "item.set.fog-knot.amulet", role: "Оберіг туману, що не дописався", slot: "accessory" },
      { itemId: "item.set.fog-knot.shawl", role: "Шаль невидимого пояснення", slot: "head" },
      { itemId: "item.set.fog-knot.cloak", role: "Плащ обережного передбачення", slot: "chest" },
      { itemId: "item.set.fog-knot.thread", role: "Вузлик, що памʼятає відповідь", slot: "tool" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Оберіг знає коротший шлях",
        description: "Дві частини дають +1 LUCK і +1 resist.",
        effect: {
                  "luck": 1,
                  "resist": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Туман тримається купи",
        description: "Три частини дають +2 max mana.",
        effect: {
                  "manaMax": 2
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Туманний не-оберіг",
        description: "Повний набір дає +1 resist.",
        effect: {
                  "resist": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.firepost-scale",
    name: "Вогнепоштова луска тринадцяти адрес",
    description: "Драконяче спорядження для доставки болю за адресою, яку ворог необачно назвав обличчям.",
    minLevel: 12,
    sourceMonsterIds: ["monster.thirteen-address-dragon-courier", "monster.archive-ventilation-dragon", "monster.quiet-catastrophe-clerk"],
    pieces: [
      { itemId: "item.set.firepost.spear", role: "Спис хибної геолокації", slot: "weapon" },
      { itemId: "item.set.firepost.visor", role: "Забрало поштового полумʼя", slot: "head" },
      { itemId: "item.set.firepost.mail", role: "Кольчуга поверненого листа", slot: "chest" },
      { itemId: "item.set.firepost.boots", role: "Чоботи курʼєрського диму", slot: "legs" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Адреса горить обережно",
        description: "Дві частини дають +1 resist і +1 spellPower.",
        effect: {
                  "resist": 1,
                  "spellPower": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Доставка з підписом",
        description: "Три частини дають +1 weaponDamage.",
        effect: {
                  "weaponDamage": 1
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Підпал за хибною адресою",
        description: "Повний набір дає +1 LUCK.",
        effect: {
                  "luck": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.dry-tide-teapot",
    name: "Сухий приплив чайникового моря",
    description: "Русалчин набір для тих, хто хоче влаштувати приплив без води, але з дуже мокрою інтонацією.",
    minLevel: 13,
    sourceMonsterIds: ["monster.tide-accountant-vodyanyk", "monster.calendar-hydra", "monster.quiet-catastrophe-clerk"],
    pieces: [
      { itemId: "item.set.dry-tide.kettle", role: "Чайник сухого припливу", slot: "tool" },
      { itemId: "item.set.dry-tide.circlet", role: "Вінець мушлі без берега", slot: "head" },
      { itemId: "item.set.dry-tide.wrap", role: "Піна, що поводиться як мантія", slot: "chest" },
      { itemId: "item.set.dry-tide.sandals", role: "Сандалі калюжі на суші", slot: "legs" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Пара замість хвилі",
        description: "Дві частини дають +2 manaMax.",
        effect: {
                  "manaMax": 2
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Приплив уже свариться",
        description: "Три частини дають +1 spellPower.",
        effect: {
                  "spellPower": 1
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Сухий не-приплив",
        description: "Повний набір дає +1 INT.",
        effect: {
                  "intelligence": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.stone-accountant",
    name: "Камʼяний облік відповідального блоку",
    description: "Твердий комплект для тих, хто хоче не лише пережити удар, а й виставити йому рахунок.",
    minLevel: 11,
    sourceMonsterIds: ["monster.forest-loss-aurochs", "monster.basement-pipe-stone-catfish", "monster.inventory-prophet"],
    pieces: [
      { itemId: "item.set.stone-accountant.helm", role: "Шолом камʼяної відомости", slot: "head" },
      { itemId: "item.set.stone-accountant.apron", role: "Камʼяний фартух збитків", slot: "chest" },
      { itemId: "item.set.stone-accountant.greaves", role: "Поножі графи «разом»", slot: "legs" },
      { itemId: "item.set.stone-accountant.abacus-shield", role: "Щит-рахівниця поверненого удару", slot: "offhand" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Сума тримає удар",
        description: "Дві частини дають +1 armor.",
        effect: {
                  "armor": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Рахунок сходиться",
        description: "Три частини дають +1 resist і +2 HP.",
        effect: {
                  "resist": 1,
                  "hpMax": 2
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Контррахунок",
        description: "Повний набір дає +1 armor.",
        effect: {
                  "armor": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.border-map",
    name: "Межова мапа чужого проходу",
    description: "Комплект для тих, хто йде короткою дорогою туди, де довга дорога ще заповнює анкету.",
    minLevel: 12,
    sourceMonsterIds: ["monster.service-path-lisovyk", "monster.inventory-prophet", "monster.tide-accountant-vodyanyk"],
    pieces: [
      { itemId: "item.set.border-map.compass", role: "Компас чужої Межі", slot: "tool" },
      { itemId: "item.set.border-map.cloak", role: "Плащ позначеної стежки", slot: "chest" },
      { itemId: "item.set.border-map.boots", role: "Чоботи третього правильного шляху", slot: "legs" },
      { itemId: "item.set.border-map.buckler", role: "Баклер пропуску заднім числом", slot: "offhand" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Межа підморгнула",
        description: "Дві частини дають +1 DEX і +1 LUCK.",
        effect: {
                  "dexterity": 1,
                  "luck": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Карта перестає сперечатись",
        description: "Три частини дають +1 resist.",
        effect: {
                  "resist": 1
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Крок чужою мапою",
        description: "Повний набір дає +1 DEX.",
        effect: {
                  "dexterity": 1
        }
      },
    ]
  },
  {
    id: "mantok-set.inventory-prophet",
    name: "Недостача інвентарного пророка",
    description: "Комплект для тих, хто ще не загубив манатку, але вже знає, як вона буде пояснюватися.",
    minLevel: 12,
    sourceMonsterIds: ["monster.inventory-prophet", "monster.quiet-catastrophe-clerk", "monster.calendar-hydra"],
    pieces: [
      { itemId: "item.set.inventory-prophet.visor", role: "Візор відсутньої етикетки", slot: "head" },
      { itemId: "item.set.inventory-prophet.ledger", role: "Книга майбутньої недостачі", slot: "tool" },
      { itemId: "item.set.inventory-prophet.keyring", role: "Брелок ключів, яких не вистачає", slot: "accessory" },
      { itemId: "item.set.inventory-prophet.coat", role: "Пальто кишенькової ревізії", slot: "chest" },
    ],
    bonuses: [
      {
        pieces: 2,
        kind: "stats",
        name: "Зникло за планом",
        description: "Дві частини дають +1 LUCK.",
        effect: {
                  "luck": 1
        },
      },
      {
        pieces: 3,
        kind: "stats",
        name: "Пророцтво в кишені",
        description: "Три частини дають +1 resist.",
        effect: {
                  "resist": 1
        },
      },
      {
        pieces: 4,
        kind: "stats",
        name: "Сторінка, якої бракувало",
        description: "Повний набір дає +1 LUCK і +1 INT.",
        effect: {
                  "luck": 1,
                  "intelligence": 1
        }
      },
    ]
  },
] as const satisfies readonly MantokSetDefinition[];

export const mantokSetLootAdditions = {
  "monster.deep-estimate-sawfish": [
    {
      "itemId": "item.set.red-line.left-dagger",
      "weight": 0.05
    }
  ],
  "monster.inventory-prophet": [
    {
      "itemId": "item.set.red-line.margin-dagger",
      "weight": 0.05
    },
    {
      "itemId": "item.set.yeger-shadow.boots",
      "weight": 0.05
    },
    {
      "itemId": "item.set.form13bis.spectacles",
      "weight": 0.05
    },
    {
      "itemId": "item.set.stone-accountant.greaves",
      "weight": 0.05
    },
    {
      "itemId": "item.set.border-map.cloak",
      "weight": 0.05
    },
    {
      "itemId": "item.set.inventory-prophet.visor",
      "weight": 0.05
    },
    {
      "itemId": "item.set.inventory-prophet.coat",
      "weight": 0.05
    }
  ],
  "monster.three-signature-chimera": [
    {
      "itemId": "item.set.barrel-brother.helm",
      "weight": 0.05
    },
    {
      "itemId": "item.set.barrel-brother.shield",
      "weight": 0.05
    },
    {
      "itemId": "item.set.form13bis.seal",
      "weight": 0.05
    }
  ],
  "monster.cheese-vault-warden": [
    {
      "itemId": "item.set.barrel-brother.cuirass",
      "weight": 0.05
    }
  ],
  "monster.siege-iron-varenyk": [
    {
      "itemId": "item.set.barrel-brother.greaves",
      "weight": 0.05
    },
    {
      "itemId": "item.set.siege-filling.ladle",
      "weight": 0.05
    },
    {
      "itemId": "item.set.siege-filling.boots",
      "weight": 0.05
    }
  ],
  "monster.service-path-lisovyk": [
    {
      "itemId": "item.set.yeger-shadow.hood",
      "weight": 0.05
    },
    {
      "itemId": "item.set.yeger-shadow.longbow",
      "weight": 0.05
    },
    {
      "itemId": "item.set.border-map.compass",
      "weight": 0.05
    },
    {
      "itemId": "item.set.border-map.buckler",
      "weight": 0.05
    }
  ],
  "monster.forest-loss-aurochs": [
    {
      "itemId": "item.set.yeger-shadow.cloak",
      "weight": 0.05
    },
    {
      "itemId": "item.set.stone-accountant.helm",
      "weight": 0.05
    },
    {
      "itemId": "item.set.stone-accountant.abacus-shield",
      "weight": 0.05
    }
  ],
  "monster.promo-perelesnyk": [
    {
      "itemId": "item.set.couplet.harp",
      "weight": 0.05
    }
  ],
  "monster.quarterly-report-pan-kotsky": [
    {
      "itemId": "item.set.couplet.cap",
      "weight": 0.05
    }
  ],
  "monster.final-approval-raven": [
    {
      "itemId": "item.set.couplet.boots",
      "weight": 0.05
    }
  ],
  "monster.calendar-hydra": [
    {
      "itemId": "item.set.asclepius.staff",
      "weight": 0.05
    },
    {
      "itemId": "item.set.form13bis.folder",
      "weight": 0.05
    },
    {
      "itemId": "item.set.fog-knot.amulet",
      "weight": 0.05
    },
    {
      "itemId": "item.set.fog-knot.thread",
      "weight": 0.05
    },
    {
      "itemId": "item.set.dry-tide.circlet",
      "weight": 0.05
    },
    {
      "itemId": "item.set.inventory-prophet.keyring",
      "weight": 0.05
    }
  ],
  "monster.quiet-catastrophe-clerk": [
    {
      "itemId": "item.set.asclepius.badge",
      "weight": 0.05
    },
    {
      "itemId": "item.set.siege-filling.apronmail",
      "weight": 0.05
    },
    {
      "itemId": "item.set.fog-knot.shawl",
      "weight": 0.05
    },
    {
      "itemId": "item.set.firepost.mail",
      "weight": 0.05
    },
    {
      "itemId": "item.set.dry-tide.wrap",
      "weight": 0.05
    },
    {
      "itemId": "item.set.inventory-prophet.ledger",
      "weight": 0.05
    }
  ],
  "monster.tide-accountant-vodyanyk": [
    {
      "itemId": "item.set.asclepius.band",
      "weight": 0.05
    },
    {
      "itemId": "item.set.fog-knot.cloak",
      "weight": 0.05
    },
    {
      "itemId": "item.set.dry-tide.kettle",
      "weight": 0.05
    },
    {
      "itemId": "item.set.dry-tide.sandals",
      "weight": 0.05
    },
    {
      "itemId": "item.set.border-map.boots",
      "weight": 0.05
    }
  ],
  "monster.strategic-reserve-potato": [
    {
      "itemId": "item.set.siege-filling.colander",
      "weight": 0.05
    }
  ],
  "monster.thirteen-address-dragon-courier": [
    {
      "itemId": "item.set.firepost.spear",
      "weight": 0.05
    },
    {
      "itemId": "item.set.firepost.boots",
      "weight": 0.05
    }
  ],
  "monster.archive-ventilation-dragon": [
    {
      "itemId": "item.set.firepost.visor",
      "weight": 0.05
    }
  ],
  "monster.basement-pipe-stone-catfish": [
    {
      "itemId": "item.set.stone-accountant.apron",
      "weight": 0.05
    }
  ]
} as const satisfies Readonly<Record<string, readonly WeightedMonsterLootEntry[]>>;

export function mergeMonsterLootAdditions<T extends Readonly<Record<string, readonly WeightedMonsterLootEntry[]>>>(
  base: T,
  additions: Readonly<Record<string, readonly WeightedMonsterLootEntry[]>>
): Readonly<Record<string, readonly WeightedMonsterLootEntry[]>> {
  const merged: Record<string, readonly WeightedMonsterLootEntry[]> = { ...base };

  for (const [monsterId, entries] of Object.entries(additions)) {
    merged[monsterId] = [...(merged[monsterId] ?? []), ...entries];
  }

  return merged;
}

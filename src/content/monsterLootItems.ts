import type { ItemContent } from "./schema";

export const monsterLootItemAdditions = [
  {
    id: "item.stamp-pad-of-last-warning",
    name: "Штемпельна подушка останнього попередження",
    description: "М’яка, чорнильна й суворіша за більшість дверей.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.bone-key-of-half-access",
    name: "Кістяний ключ напівдоступу",
    description: "Відчиняє не всі двері, зате дуже переконливо бряжчить біля зачинених.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 9
  },
  {
    id: "item.cell-of-responsible-pain",
    name: "Клітинка відповідального болю",
    description: "Маленький квадратик, у якому біль нарешті має адресу.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.formula-of-small-losses",
    name: "Формула дрібних втрат",
    description: "Пояснює, чому мінус три HP виглядають як план.",
    rarity: "uncommon",
    slot: "junk",
    goldValue: 5
  },
  {
    id: "item.web-of-tomorrow-promise",
    name: "Павутинка обіцянки «завтра»",
    description: "Липне до пальців і до всіх планів, які «точно швидко».",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.hourglass-with-deadline-teeth",
    name: "Пісочний годинник із дедлайновими зубами",
    description: "Не кусає, доки ви не скажете «ще п’ять хвилин».",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 12
  },
  {
    id: "item.scale-of-preliminary-approval",
    name: "Луска попереднього погодження",
    description: "Блищить тільки після усного дозволу, але не чекає письмового.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.tiny-fire-permit",
    name: "Дозвіл на мале полум’я",
    description: "Згорів би, якби не був такий юридично обережний.",
    rarity: "uncommon",
    slot: "junk",
    goldValue: 7
  },
  {
    id: "item.bookmark-of-unread-courage",
    name: "Закладка непрочитаної хоробрости",
    description: "Смілива, бо ніколи не доходила до страшного розділу.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.sigh-of-regulation",
    name: "Зітхання регламенту в пляшечці",
    description: "Відкривається тільки біля правил, які ніхто не хотів читати.",
    rarity: "uncommon",
    slot: "junk",
    goldValue: 6
  },
  {
    id: "item.left-slipper-of-tactical-retreat",
    name: "Лівий капець тактичного відступу",
    description: "Правий утік першим, але цей зробив вигляд, що прикривав маневр.",
    rarity: "common",
    slot: "cosmetic",
    goldValue: 3
  },
  {
    id: "item.sole-of-nervous-mobility",
    name: "Підошва тривожної мобільности",
    description: "Стоїть на місці так, ніби вже запізнюється.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.beet-of-thermal-doubt",
    name: "Бурячок температурного сумніву",
    description: "Не гарячий, не холодний, а процесуально ображений.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.apron-stain-of-courage",
    name: "Пляма хоробрости на фартуху",
    description: "Сміливо не відпирається й натякає на кулінарний подвиг.",
    rarity: "common",
    slot: "cosmetic",
    goldValue: 4
  },
  {
    id: "item.crust-of-conditional-surrender",
    name: "Скоринка умовної капітуляції",
    description: "Здалася тільки після того, як її назвали краєм конфлікту.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.bread-knife-of-polite-boundaries",
    name: "Ніж хлібних кордонів",
    description: "Ріже тільки після ввічливого «можна?» і дуже серйозного кивка.",
    rarity: "uncommon",
    slot: "weapon",
    goldValue: 15
  },
  {
    id: "item.ticket-number-never-called",
    name: "Номерок, який не викликали",
    description: "Чекає своєї черги так довго, що став реліквією малого терпіння.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.gargoyle-chip-of-patience",
    name: "Скол терпіння ґарґульї",
    description: "Камінчик, який бачив більше черг, ніж деякі корчмарі.",
    rarity: "uncommon",
    slot: "junk",
    goldValue: 5
  },
  {
    id: "item.proboscis-of-small-audit",
    name: "Хоботок малого аудиту",
    description: "Підозріло тонкий інструмент для надто великих питань.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.buzzing-receipt-copy",
    name: "Дзижчача копія чека",
    description: "Копія правильна, але чомусь постійно питає «а це точно все?».",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.crumb-of-archival-knysh",
    name: "Крихта архівного книша",
    description: "Занадто стара для перекусу, занадто важлива для смітника.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.folder-with-bite-marks",
    name: "Тека зі слідами укусу",
    description: "Документальна база того, що хтось мав апетит до справи.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.comment-pebble-of-final-word",
    name: "Камінчик останнього коментаря",
    description: "Малий, важкий і переконаний, що після нього тему закрито.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.underbridge-moderation-badge",
    name: "Підмостовий жетон модерації",
    description: "Блищить тільки тоді, коли хтось пише «останнє повідомлення».",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 8
  },
  {
    id: "item.tentacle-of-soft-reporting",
    name: "Щупальце м’якої звітности",
    description: "Ніжно торкається плану й одразу додає ще один пункт.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.ink-bubble-of-quarterly-panic",
    name: "Чорнильна бульбашка квартальної паніки",
    description: "Лопається тільки біля слів «підсумковий документ».",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.button-of-exact-change",
    name: "Ґудзик точної здачі",
    description: "Завжди дрібний, завжди доречний, завжди в іншій кишені.",
    rarity: "common",
    slot: "accessory",
    goldValue: 6
  },
  {
    id: "item.receipt-folded-into-accusation",
    name: "Чек, складений в обвинувачення",
    description: "Паперовий літачок, який летить прямо в сумління крамарика.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.shard-of-constructive-offense",
    name: "Скалка конструктивної образи",
    description: "Ріже не руку, а впевненість, і ще просить подякувати за фідбек.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.frame-of-almost-confidence",
    name: "Рамка майже впевнености",
    description: "Підходить для портрета того, хто вже майже не сумнівається.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 11
  },
  {
    id: "item.whistle-of-dry-tide",
    name: "Свисток сухого припливу",
    description: "Кличе хвилю, але приходить тільки чай із характером.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.lid-of-maritime-overthinking",
    name: "Кришечка морської тривоги",
    description: "Закриває чайник і відкриває три зайві думки про океан.",
    rarity: "common",
    slot: "accessory",
    goldValue: 5
  },
  {
    id: "item.leaf-of-folded-honor",
    name: "Листок згорнутої честі",
    description: "Капустяний, але тримається як лицарський прапор у маленькій кризі.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.sauerkraut-squire-badge",
    name: "Жетон квашеного зброєносця",
    description: "Пахне присягою, грядкою і майбутньою закускою.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 7
  },
  {
    id: "item.scale-of-zero-declaration",
    name: "Луска нульової декларації",
    description: "Блищить так, ніби нічого не приховує. Саме це й підозріло.",
    rarity: "rare",
    slot: "junk",
    goldValue: 20
  },
  {
    id: "item.candle-of-fiscal-dread",
    name: "Свічка фіскального трепету",
    description: "Горить тихо, але змушує монети ставати рівніше.",
    rarity: "uncommon",
    slot: "cosmetic",
    goldValue: 10
  }
] satisfies ItemContent[];

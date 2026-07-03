import type { ItemContent } from "./schema";

export const monsterLootItemAdditions = [
  {
    id: "item.stamp-pad-of-last-warning",
    name: "Штемпельна подушка останнього попередження",
    description: "М’яка, чорнильна й суворіша за більшість дверей.",
    rarity: "common",
    slot: "weapon",
    goldValue: 2,
    effect: {
      weaponDamage: 1
    }
  },
  {
    id: "item.bone-key-of-half-access",
    name: "Кістяний ключ напівдоступу",
    description: "Відчиняє не всі двері, зате дуже переконливо бряжчить біля зачинених.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 9,
    effect: {
      dexterity: 1,
      luck: 1
    }
  },
  {
    id: "item.cell-of-responsible-pain",
    name: "Клітинка відповідального болю",
    description: "Маленький квадратик, у якому біль нарешті має адресу.",
    rarity: "common",
    slot: "armor",
    goldValue: 2,
    effect: {
      hpMax: 1,
      armor: 1
    }
  },
  {
    id: "item.formula-of-small-losses",
    name: "Формула дрібних втрат",
    description: "Пояснює, чому мінус три HP виглядають як план.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 5,
    effect: {
      intelligence: 1,
      manaMax: 1
    }
  },
  {
    id: "item.web-of-tomorrow-promise",
    name: "Павутинка обіцянки «завтра»",
    description: "Липне до пальців і до всіх планів, які «точно швидко».",
    rarity: "common",
    slot: "accessory",
    goldValue: 2,
    effect: {
      dexterity: 1
    }
  },
  {
    id: "item.hourglass-with-deadline-teeth",
    name: "Пісочний годинник із дедлайновими зубами",
    description: "Не кусає, доки ви не скажете «ще п’ять хвилин».",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 12,
    effect: {
      dexterity: 1,
      manaMax: 2
    }
  },
  {
    id: "item.scale-of-preliminary-approval",
    name: "Луска попереднього погодження",
    description: "Блищить тільки після усного дозволу, але не чекає письмового.",
    rarity: "common",
    slot: "accessory",
    goldValue: 4,
    effect: {
      resist: 1
    }
  },
  {
    id: "item.tiny-fire-permit",
    name: "Дозвіл на мале полум’я",
    description: "Згорів би, якби не був такий юридично обережний.",
    rarity: "uncommon",
    slot: "weapon",
    goldValue: 7,
    effect: {
      spellPower: 1,
      intelligence: 1
    }
  },
  {
    id: "item.bookmark-of-unread-courage",
    name: "Закладка непрочитаної хоробрости",
    description: "Смілива, бо ніколи не доходила до страшного розділу.",
    rarity: "common",
    slot: "accessory",
    goldValue: 2,
    effect: {
      intelligence: 1
    }
  },
  {
    id: "item.sigh-of-regulation",
    name: "Зітхання регламенту в пляшечці",
    description: "Відкривається тільки біля правил, які ніхто не хотів читати.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 6,
    effect: {
      charisma: 1,
      resist: 1
    }
  },
  {
    id: "item.left-slipper-of-tactical-retreat",
    name: "Лівий капець тактичного відступу",
    description: "Правий утік першим, але цей зробив вигляд, що прикривав маневр.",
    rarity: "common",
    slot: "accessory",
    goldValue: 3,
    effect: {
      dexterity: 1
    }
  },
  {
    id: "item.sole-of-nervous-mobility",
    name: "Підошва тривожної мобільности",
    description: "Стоїть на місці так, ніби вже запізнюється.",
    rarity: "common",
    slot: "accessory",
    goldValue: 3,
    effect: {
      dexterity: 1
    }
  },
  {
    id: "item.beet-of-thermal-doubt",
    name: "Бурячок температурного сумніву",
    description: "Не гарячий, не холодний, а процесуально ображений.",
    rarity: "common",
    slot: "armor",
    goldValue: 2,
    effect: {
      hpMax: 2
    }
  },
  {
    id: "item.apron-stain-of-courage",
    name: "Пляма хоробрости на фартуху",
    description: "Сміливо не відпирається й натякає на кулінарний подвиг.",
    rarity: "common",
    slot: "armor",
    goldValue: 4,
    effect: {
      hpMax: 1,
      armor: 1
    }
  },
  {
    id: "item.crust-of-conditional-surrender",
    name: "Скоринка умовної капітуляції",
    description: "Здалася тільки після того, як її назвали краєм конфлікту.",
    rarity: "common",
    slot: "armor",
    goldValue: 1,
    effect: {
      hpMax: 1
    }
  },
  {
    id: "item.bread-knife-of-polite-boundaries",
    name: "Ніж хлібних кордонів",
    description: "Ріже тільки після ввічливого «можна?» і дуже серйозного кивка.",
    rarity: "uncommon",
    slot: "weapon",
    goldValue: 15,
    effect: {
      weaponDamage: 2,
      dexterity: 1
    }
  },
  {
    id: "item.ticket-number-never-called",
    name: "Номерок, який не викликали",
    description: "Чекає своєї черги так довго, що став реліквією малого терпіння.",
    rarity: "common",
    slot: "accessory",
    goldValue: 2,
    effect: {
      charisma: 1
    }
  },
  {
    id: "item.gargoyle-chip-of-patience",
    name: "Скол терпіння ґарґульї",
    description: "Камінчик, який бачив більше черг, ніж деякі корчмарі.",
    rarity: "uncommon",
    slot: "armor",
    goldValue: 5,
    effect: {
      hpMax: 2,
      armor: 1
    }
  },
  {
    id: "item.proboscis-of-small-audit",
    name: "Хоботок малого аудиту",
    description: "Підозріло тонкий інструмент для надто великих питань.",
    rarity: "common",
    slot: "weapon",
    goldValue: 2,
    effect: {
      weaponDamage: 1
    }
  },
  {
    id: "item.buzzing-receipt-copy",
    name: "Дзижчача копія чека",
    description: "Копія правильна, але чомусь постійно питає «а це точно все?».",
    rarity: "common",
    slot: "accessory",
    goldValue: 3,
    effect: {
      intelligence: 1
    }
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
    slot: "accessory",
    goldValue: 3,
    effect: {
      intelligence: 1
    }
  },
  {
    id: "item.comment-pebble-of-final-word",
    name: "Камінчик останнього коментаря",
    description: "Малий, важкий і переконаний, що після нього тему закрито.",
    rarity: "common",
    slot: "weapon",
    goldValue: 2,
    effect: {
      weaponDamage: 1
    }
  },
  {
    id: "item.underbridge-moderation-badge",
    name: "Підмостовий жетон модерації",
    description: "Блищить тільки тоді, коли хтось пише «останнє повідомлення».",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 8,
    effect: {
      armor: 1,
      charisma: 1
    }
  },
  {
    id: "item.tentacle-of-soft-reporting",
    name: "Щупальце м’якої звітности",
    description: "Ніжно торкається плану й одразу додає ще один пункт.",
    rarity: "common",
    slot: "weapon",
    goldValue: 3,
    effect: {
      spellPower: 1
    }
  },
  {
    id: "item.ink-bubble-of-quarterly-panic",
    name: "Чорнильна бульбашка квартальної паніки",
    description: "Лопається тільки біля слів «підсумковий документ».",
    rarity: "common",
    slot: "accessory",
    goldValue: 4,
    effect: {
      intelligence: 1,
      manaMax: 1
    }
  },
  {
    id: "item.button-of-exact-change",
    name: "Ґудзик точної здачі",
    description: "Завжди дрібний, завжди доречний, завжди в іншій кишені.",
    rarity: "common",
    slot: "accessory",
    goldValue: 6,
    effect: {
      luck: 1
    }
  },
  {
    id: "item.receipt-folded-into-accusation",
    name: "Чек, складений в обвинувачення",
    description: "Паперовий літачок, який летить прямо в сумління крамарика.",
    rarity: "common",
    slot: "weapon",
    goldValue: 3,
    effect: {
      charisma: 1,
      weaponDamage: 1
    }
  },
  {
    id: "item.shard-of-constructive-offense",
    name: "Скалка конструктивної образи",
    description: "Ріже не руку, а впевненість, і ще просить подякувати за фідбек.",
    rarity: "common",
    slot: "weapon",
    goldValue: 3,
    effect: {
      charisma: 1,
      weaponDamage: 1
    }
  },
  {
    id: "item.frame-of-almost-confidence",
    name: "Рамка майже впевнености",
    description: "Підходить для портрета того, хто вже майже не сумнівається.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 11,
    effect: {
      charisma: 1,
      luck: 1
    }
  },
  {
    id: "item.whistle-of-dry-tide",
    name: "Свисток сухого припливу",
    description: "Кличе хвилю, але приходить тільки чай із характером.",
    rarity: "common",
    slot: "accessory",
    goldValue: 2,
    effect: {
      dexterity: 1
    }
  },
  {
    id: "item.lid-of-maritime-overthinking",
    name: "Кришечка морської тривоги",
    description: "Закриває чайник і відкриває три зайві думки про океан.",
    rarity: "common",
    slot: "accessory",
    goldValue: 5,
    effect: {
      manaMax: 1,
      resist: 1
    }
  },
  {
    id: "item.leaf-of-folded-honor",
    name: "Листок згорнутої честі",
    description: "Капустяний, але тримається як лицарський прапор у маленькій кризі.",
    rarity: "common",
    slot: "armor",
    goldValue: 2,
    effect: {
      hpMax: 2
    }
  },
  {
    id: "item.sauerkraut-squire-badge",
    name: "Жетон квашеного зброєносця",
    description: "Пахне присягою, грядкою і майбутньою закускою.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 7,
    effect: {
      charisma: 1,
      hpMax: 2
    }
  },
  {
    id: "item.scale-of-zero-declaration",
    name: "Луска нульової декларації",
    description: "Блищить так, ніби нічого не приховує. Саме це й підозріло.",
    rarity: "rare",
    slot: "accessory",
    goldValue: 20,
    effect: {
      luck: 1,
      resist: 2
    }
  },
  {
    id: "item.candle-of-fiscal-dread",
    name: "Свічка фіскального трепету",
    description: "Горить тихо, але змушує монети ставати рівніше.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 10,
    effect: {
      charisma: 1,
      spellPower: 1
    }
  },
  {
    id: "item.wick-of-complaint-light",
    name: "Гніт скаржної лампи",
    description: "Ще теплий від чужого невдоволення й трохи образи.",
    rarity: "common",
    slot: "weapon",
    goldValue: 3,
    effect: {
      spellPower: 1
    }
  },
  {
    id: "item.hoofprint-ledger-scrap",
    name: "Копито-чернетка книги витрат",
    description: "На ній видно, куди побігли цифри. Самі цифри теж протестують.",
    rarity: "common",
    slot: "armor",
    goldValue: 2,
    effect: {
      strength: 1
    }
  },
  {
    id: "item.salt-knot-of-oath",
    name: "Сольовий вузлик обіцянки",
    description: "Скрипить сухо, але все одно наполягає, що це була клятва.",
    rarity: "common",
    slot: "accessory",
    goldValue: 2,
    effect: {
      hpMax: 2
    }
  },
  {
    id: "item.paperclip-of-unfinished-closure",
    name: "Скріпка незакритого закриття",
    description: "Тримає разом те, що давно мало розійтися по архіву.",
    rarity: "common",
    slot: "accessory",
    goldValue: 3,
    effect: {
      intelligence: 1
    }
  },
  {
    id: "item.folded-wrong-turn",
    name: "Складений хибний поворот",
    description: "Нібито карта, але більше схоже на дуже вперту помилку.",
    rarity: "common",
    slot: "accessory",
    goldValue: 3,
    effect: {
      dexterity: 1
    }
  },
  {
    id: "item.foam-stained-checklist",
    name: "Чеклист у пивній плямі",
    description: "Залишок ревізії, яка пішла трохи далі, ніж мала б.",
    rarity: "common",
    slot: "accessory",
    goldValue: 4,
    effect: {
      intelligence: 1
    }
  },
  {
    id: "item.third-signature-scale",
    name: "Луска третього підпису",
    description: "Блищить лише тоді, коли двох погоджень уже недостатньо для спокою.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 8,
    effect: {
      charisma: 1,
      resist: 1
    }
  },
  {
    id: "item.cold-cheese-key",
    name: "Холодний сирний ключ",
    description: "Відмикає не двері, а право підійти ближче до сховку.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 7,
    effect: {
      dexterity: 1,
      luck: 1
    }
  },
  {
    id: "item.weekday-slip-of-postponement",
    name: "Квиток відкладеного будня",
    description: "Дрібний, мокрий і вперто просить перенести все на завтра.",
    rarity: "common",
    slot: "accessory",
    goldValue: 2,
    effect: {
      manaMax: 1
    }
  },
  {
    id: "item.missing-label-prophecy",
    name: "Пророцтво про бракуючу етикетку",
    description: "Каже, що річ уже не там, де її шукатимуть першою.",
    rarity: "uncommon",
    slot: "accessory",
    goldValue: 5,
    effect: {
      intelligence: 1,
      luck: 1
    }
  },
  {
    id: "item.calm-apocalypse-memo",
    name: "Службова записка тихої катастрофи",
    description: "Офіційно підтверджує кінець світу в максимально ввічливій формі.",
    rarity: "common",
    slot: "armor",
    goldValue: 3,
    effect: {
      hpMax: 1,
      resist: 1
    }
  }
] satisfies ItemContent[];

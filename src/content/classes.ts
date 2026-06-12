import type { ClassContent } from "./schema";

export const classes = [
  {
    id: "class.warrior",
    name: "Воїн",
    description: "Простий план: стояти рівно й переконливо махати залізом.",
    primaryStat: "strength",
    allowedRaces: [
      "race.human-ish",
      "race.dwarf",
      "race.kharakternyk",
      "race.intellectual-orc"
    ],
    unavailableReasons: {
      "race.domovyk": "Домовик воює інакше: ховає ложки, скрипить підлогою і морально тисне.",
      "race.dryland-rusalka": "Хвіст уявний, але тактичні незручності реальні.",
      "race.molfar-soul": "Мольфарська душа не танкує. Вона ставить оберіг і відходить на безпечну відстань."
    }
  },
  {
    id: "class.mage",
    name: "Маг",
    description: "Каже складні слова, після яких у кімнаті стає гарячіше.",
    primaryStat: "intelligence",
    allowedRaces: [
      "race.human-ish",
      "race.dwarf",
      "race.elf",
      "race.kharakternyk",
      "race.dryland-rusalka",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.domovyk": "Магія магією, а пилюку хто витре?"
    }
  },
  {
    id: "class.bard",
    name: "Бард",
    description: "Перемагає харизмою, куплетами й небезпечною впевненістю.",
    primaryStat: "charisma",
    allowedRaces: [
      "race.human-ish",
      "race.elf",
      "race.kharakternyk",
      "race.dryland-rusalka",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.dwarf": "Гноми співають тільки коли рахують каміння. Публіка не витримала.",
      "race.domovyk": "Домовик не виступає. Домовик бурчить з-за печі."
    }
  },
  {
    id: "class.rogue",
    name: "Злодій",
    description: "Зникає швидше, ніж рахунок після походу в таверну.",
    primaryStat: "dexterity",
    allowedRaces: ["race.human-ish", "race.dwarf", "race.elf", "race.domovyk", "race.molfar-soul"],
    unavailableReasons: {
      "race.kharakternyk": "Він не краде. Він тактично переміщує здобич у правильний бік.",
      "race.dryland-rusalka": "Занадто драматично заходить у кімнату, щоб красти непомітно.",
      "race.intellectual-orc": "Орк-інтелігент спершу пише етичне обґрунтування крадіжки. Жертва встигає піти."
    }
  },
  {
    id: "class.priest",
    name: "Жрець",
    description: "Лікує союзників і суворо дивиться на нежить.",
    primaryStat: "charisma",
    allowedRaces: [
      "race.human-ish",
      "race.elf",
      "race.kharakternyk",
      "race.domovyk",
      "race.dryland-rusalka",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.dwarf": "Гноми не люблять стояти навколішки, якщо поруч немає корисних копалин."
    }
  },
  {
    id: "class.varenyk-mancer",
    name: "Вареник-мант",
    description: "Керує тістом, долею й легким відчуттям ситості.",
    primaryStat: "intelligence",
    allowedRaces: ["race.human-ish", "race.dryland-rusalka"],
    unavailableReasons: {
      "race.dwarf": "Тісто занадто швидко набуває форми бойового молота.",
      "race.elf": "Ельфи кажуть, що це неестетично. Вареники кажуть, що ельфи душні.",
      "race.kharakternyk": "Гетьман Начинки ще чекає окремого дозволу від кухні.",
      "race.domovyk": "Домовик сховав качалку й відмовляється свідчити.",
      "race.intellectual-orc": "Орк-інтелігент застряг на рецензії до начинки.",
      "race.molfar-soul": "Обереги заплутались у тісті й тепер вимагають окремої миски."
    }
  },
  {
    id: "class.bureaucramancer",
    name: "Бюрокромант",
    description: "Знерухомлює ворогів формами, печатками й дуже серйозним виглядом.",
    primaryStat: "intelligence",
    allowedRaces: [
      "race.human-ish",
      "race.dwarf",
      "race.domovyk",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.elf": "Ельфійське терпіння довге, але не настільки.",
      "race.kharakternyk": "Характерник не заповнює форму. Форма сама має здогадатися.",
      "race.dryland-rusalka": "Канцелярія змокла від одного погляду на анкету."
    }
  },
  {
    id: "class.ranger",
    name: "Єгер",
    description: "Знає стежки, пастки й де ховається ваша остання стріла.",
    primaryStat: "dexterity",
    allowedRaces: ["race.human-ish", "race.dwarf", "race.elf", "race.kharakternyk", "race.domovyk"],
    unavailableReasons: {
      "race.dryland-rusalka": "Сухопутна русалка знаходить сліди тільки якщо ті ведуть до калюжі.",
      "race.intellectual-orc": "Сліди він читає, але потім пише на них рецензію.",
      "race.molfar-soul": "Може знайти кого завгодно, але спершу питає вітер, чи він не проти."
    }
  }
] satisfies ClassContent[];

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
      "race.bisyny",
      "race.drantohor",
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
    description: "Каже складні слова, гріє кімнату й краще за інших розуміє, чому манатки іскрять.",
    primaryStat: "intelligence",
    allowedRaces: [
      "race.human-ish",
      "race.dwarf",
      "race.elf",
      "race.bisyny",
      "race.drantohor",
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
      "race.bisyny",
      "race.dryland-rusalka",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.dwarf": "Гноми співають тільки коли рахують каміння. Публіка не витримала.",
      "race.drantohor": "Дрантогор почав баладу з середини карти. Публіка не знайшла приспів.",
      "race.domovyk": "Домовик не виступає. Домовик бурчить з-за печі."
    }
  },
  {
    id: "class.rogue",
    name: "Злодій",
    description: "Зникає швидше, ніж рахунок після походу в таверну.",
    primaryStat: "dexterity",
    allowedRaces: [
      "race.human-ish",
      "race.dwarf",
      "race.elf",
      "race.bisyny",
      "race.drantohor",
      "race.domovyk",
      "race.molfar-soul"
    ],
    unavailableReasons: {
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
      "race.bisyny",
      "race.domovyk",
      "race.dryland-rusalka",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.dwarf": "Гноми не люблять стояти навколішки, якщо поруч немає корисних копалин.",
      "race.drantohor": "Дрантогор переплутав храм із прикордонною канцелярією. Формально близько, але ні."
    }
  },
  {
    id: "class.varenyk-mancer",
    name: "Вареник-мант",
    description: "Керує тістом, настроєм і легким відчуттям ситості.",
    primaryStat: "intelligence",
    allowedRaces: ["race.human-ish", "race.bisyny", "race.dryland-rusalka"],
    unavailableReasons: {
      "race.dwarf": "Тісто занадто швидко набуває форми бойового молота.",
      "race.elf": "Ельфи кажуть, що це неестетично. Вареники кажуть, що ельфи душні.",
      "race.drantohor": "Дрантогор приніс рецепт з іншого королівства. Тісто подало скаргу.",
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
      "race.bisyny",
      "race.drantohor",
      "race.domovyk",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.elf": "Ельфійське терпіння довге, але не настільки.",
      "race.dryland-rusalka": "Канцелярія змокла від одного погляду на анкету."
    }
  },
  {
    id: "class.ranger",
    name: "Єгер",
    description: "Знає стежки, пастки й де ховається ваша остання стріла.",
    primaryStat: "dexterity",
    allowedRaces: [
      "race.human-ish",
      "race.dwarf",
      "race.elf",
      "race.bisyny",
      "race.drantohor",
      "race.domovyk"
    ],
    unavailableReasons: {
      "race.dryland-rusalka": "Сухопутна русалка знаходить сліди тільки якщо ті ведуть до калюжі.",
      "race.intellectual-orc": "Сліди він читає, але потім пише на них рецензію.",
      "race.molfar-soul": "Може знайти кого завгодно, але спершу питає вітер, чи він не проти."
    }
  },
  {
    id: "class.kharakternyk",
    name: "Козак-характерник",
    description: "Дивиться на проблему так, що проблема сама шукає собі іншу пригоду.",
    primaryStat: "luck",
    allowedRaces: [
      "race.human-ish",
      "race.bisyny",
      "race.drantohor",
      "race.intellectual-orc",
      "race.molfar-soul"
    ],
    unavailableReasons: {
      "race.dwarf": "Гном спробував характерництво, але закопав туман у шахті.",
      "race.elf": "Ельф хотів бути характерником красиво. Туман не витримав очікувань.",
      "race.domovyk": "Домовик уже характерник у межах однієї хати. На виїзди не погоджується.",
      "race.dryland-rusalka": "Сухопутна русалка подивилась на степ і попросила хоча б калюжу для драматизму."
    }
  }
] satisfies ClassContent[];

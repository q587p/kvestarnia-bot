import type { CharacterFlavorLine } from "../characterFlavor";

// Korchma hall greetings intentionally live outside the main catalog so the
// Корчмар can grow a large rotating line bank without bloating quest flavor.
export const korchmaGreetingLines = [
  {
    "id": "korchma.greeting.v2.fallback.01",
    "placement": "korchma.greeting",
    "text": "Заходьте тихо. Двері сьогодні образливі."
  },
  {
    "id": "korchma.greeting.v2.fallback.02",
    "placement": "korchma.greeting",
    "text": "У корчмі все чесно: пригоди зліва, наслідки всюди."
  },
  {
    "id": "korchma.greeting.v2.fallback.03",
    "placement": "korchma.greeting",
    "text": "Сідайте ближче до виходу. Не для безпеки — просто там менше слухає бочка."
  },
  {
    "id": "korchma.greeting.v2.fallback.04",
    "placement": "korchma.greeting",
    "text": "Стіл зі справами сьогодні ворушився. Ми домовились називати це мотивацією."
  },
  {
    "id": "korchma.greeting.v2.fallback.05",
    "placement": "korchma.greeting",
    "text": "Чай гарячий, пиво холодне, квести юридично теплі."
  },
  {
    "id": "korchma.greeting.v2.fallback.06",
    "placement": "korchma.greeting",
    "text": "Якщо вас вкусить мебля — не кричіть. Це старий інтерʼєр, він звикає."
  },
  {
    "id": "korchma.greeting.v2.fallback.07",
    "placement": "korchma.greeting",
    "text": "Корчма рада вам майже офіційно. Печатка втекла, але намір є."
  },
  {
    "id": "korchma.greeting.v2.fallback.08",
    "placement": "korchma.greeting",
    "text": "У нас сьогодні безпечно. Тобто небезпечно, але знайомо."
  },
  {
    "id": "korchma.greeting.v2.fallback.09",
    "placement": "korchma.greeting",
    "text": "Не годуйте бочку після півночі. І до півночі теж, але вона вмовляє."
  },
  {
    "id": "korchma.greeting.v2.fallback.10",
    "placement": "korchma.greeting",
    "text": "Квести свіжі. Принаймні так написано на тій серветці, яка їх принесла."
  },
  {
    "id": "korchma.greeting.v2.fallback.11",
    "placement": "korchma.greeting",
    "text": "Якщо щось шепоче з-під столу — спершу перевірте, чи це не рахунок."
  },
  {
    "id": "korchma.greeting.v2.fallback.12",
    "placement": "korchma.greeting",
    "text": "Ласкаво просимо. Сьогодні корчма робить вигляд, що має план."
  },
  {
    "id": "korchma.greeting.v2.fallback.13",
    "placement": "korchma.greeting",
    "text": "Не питаю, звідки ви. Двері вже дали суперечливі свідчення."
  },
  {
    "id": "korchma.greeting.v2.fallback.14",
    "placement": "korchma.greeting",
    "text": "Пиво справа, проблеми зліва, здоровий глузд десь виходив."
  },
  {
    "id": "korchma.greeting.v2.fallback.15",
    "placement": "korchma.greeting",
    "text": "Сідайте. Якщо стілець сперечатиметься — це не ви, це його характер."
  },
  {
    "id": "korchma.greeting.v2.fallback.16",
    "placement": "korchma.greeting",
    "text": "У нас тут тихо, доки хтось не натисне правильну кнопку."
  },
  {
    "id": "korchma.greeting.v2.fallback.17",
    "placement": "korchma.greeting",
    "text": "Корчма бачила різне. Але сьогодні вона робить вигляд, що здивована."
  },
  {
    "id": "korchma.greeting.v2.fallback.18",
    "placement": "korchma.greeting",
    "text": "Якщо прийшли за пригодою — не поспішайте. Вона вже шукає вас у журналі."
  },
  {
    "id": "korchma.greeting.v2.fallback.19",
    "placement": "korchma.greeting",
    "text": "Бар чистий. Підозріло чистий. Я теж занепокоєний."
  },
  {
    "id": "korchma.greeting.v2.fallback.20",
    "placement": "korchma.greeting",
    "text": "Заходьте. Ваша біографія ще не встигла посваритися з нашою бухгалтерією."
  },
  {
    "id": "korchma.greeting.v2.pronoun.he.01",
    "placement": "korchma.greeting",
    "text": "У графі звертання поставив «він». Якщо бочка заперечить — бочка не має доступу до анкети.",
    "selector": {
      "pronouns": [
        "he"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.he.02",
    "placement": "korchma.greeting",
    "text": "Записав: «він». Корчма кивнула так, ніби розуміє граматику й податкові ризики.",
    "selector": {
      "pronouns": [
        "he"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.he.03",
    "placement": "korchma.greeting",
    "text": "«Він», кажете? Добре. Двері просили передати, що теж намагались бути ввічливими.",
    "selector": {
      "pronouns": [
        "he"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.she.01",
    "placement": "korchma.greeting",
    "text": "У графі звертання поставив «вона». Табурет хотів підвестися, але згадав, що він табурет.",
    "selector": {
      "pronouns": [
        "she"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.she.02",
    "placement": "korchma.greeting",
    "text": "Записав: «вона». Корчма одразу стала трішки чемнішою. Ненадовго.",
    "selector": {
      "pronouns": [
        "she"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.she.03",
    "placement": "korchma.greeting",
    "text": "«Вона» — ясно. Піч уже робить вигляд, що чекала саме на вас.",
    "selector": {
      "pronouns": [
        "she"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.they.01",
    "placement": "korchma.greeting",
    "text": "У графі звертання поставив «вони». Стільці попросили уточнити кількість, але їм не платять.",
    "selector": {
      "pronouns": [
        "they"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.they.02",
    "placement": "korchma.greeting",
    "text": "«Вони»? Чудово. Бокова шухляда анкети сама відкрилась і вдає, що так було завжди.",
    "selector": {
      "pronouns": [
        "they"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.pronoun.they.03",
    "placement": "korchma.greeting",
    "text": "Записав: «вони». Двері пропустили з другого разу, бо перший раз рахували вас як сюжетний гурт.",
    "selector": {
      "pronouns": [
        "they"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.sun.01",
    "placement": "korchma.greeting",
    "text": "Тепла шухляда вашої анкети блищить так, ніби її протерли відвагою. Я цього не робив.",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.sun.02",
    "placement": "korchma.greeting",
    "text": "Ваш папірець ліг у верхню шухляду. Там тепло, сухо й підозріло багато викликів.",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.sun.03",
    "placement": "korchma.greeting",
    "text": "Журнал блимнув жовтим чорнилом. Не хвилюйтесь, це не пророцтво: максимум адміністративний прогноз.",
    "selector": {
      "paths": [
        "sun"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.moon.01",
    "placement": "korchma.greeting",
    "text": "Тиха шухляда прийняла вашу анкету й попросила говорити обережніше. Вона драматична.",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.moon.02",
    "placement": "korchma.greeting",
    "text": "Ваш запис пахне ніччю, чаєм і старими обіцянками, які хтось загубив між полицями.",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.moon.03",
    "placement": "korchma.greeting",
    "text": "Журнал підморгнув нічним чорнилом. Я його закрив, бо не люблю, коли папір має міміку.",
    "selector": {
      "paths": [
        "moon"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.boundary.01",
    "placement": "korchma.greeting",
    "text": "Бокова шухляда сама відкрилась. Я нічого не бачив, і ви нічого не підписували.",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.boundary.02",
    "placement": "korchma.greeting",
    "text": "Вашу анкету занесло в бокову вкладку. Вона повернулась із печаткою, якої в нас немає.",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.path.boundary.03",
    "placement": "korchma.greeting",
    "text": "Журнал привітався першим. Якщо він почне відповідати: кличте мене, але не голосно.",
    "selector": {
      "paths": [
        "boundary"
      ]
    },
    "priority": -1
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.01",
    "placement": "korchma.greeting",
    "text": "Людисько в корчмі — це класика. Найгірше, що саме класика зазвичай тягне сюжет.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.02",
    "placement": "korchma.greeting",
    "text": "Від вас пахне нормальністю. У нас це рахується бойовою маскою.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.03",
    "placement": "korchma.greeting",
    "text": "Майже звичайні пригодники найнебезпечніші: їм усі вірять до першої шаурми.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.04",
    "placement": "korchma.greeting",
    "text": "Сідайте. Для людиськ у нас окремий тариф: «якось буде». Він ніколи не закінчується.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.05",
    "placement": "korchma.greeting",
    "text": "Корчма любить людиськ. Вони не завжди розуміють попередження на дверях.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.06",
    "placement": "korchma.greeting",
    "text": "О, людисько. Нарешті хтось, кого можна підозрювати без словника.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.07",
    "placement": "korchma.greeting",
    "text": "Ваш вигляд каже: «я просто зайшов». Це найстаріша форма героїзму.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.human-ish.08",
    "placement": "korchma.greeting",
    "text": "Людиськам легше пояснити меню. Важче пояснити, чому меню дихає.",
    "selector": {
      "raceIds": [
        "race.human-ish"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.01",
    "placement": "korchma.greeting",
    "text": "Полиці сьогодні нижчі. Не дякуйте, це вони самі злякались.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.02",
    "placement": "korchma.greeting",
    "text": "Гном у корчмі — це добре: хтось має перевірити, чи підлога достатньо вперта.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.03",
    "placement": "korchma.greeting",
    "text": "Не бийте кухоль об стіл для перевірки якості. Стіл ще з минулого разу вразливий.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.04",
    "placement": "korchma.greeting",
    "text": "У нас немає шахти, але є підвал. Він просить не називати це карʼєрним ростом.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.05",
    "placement": "korchma.greeting",
    "text": "Сідайте ближче до бочки. Вона поважає тих, хто звучить як аргумент.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.06",
    "placement": "korchma.greeting",
    "text": "Якщо щось занадто високо — це не наша помилка, це вертикальний квест.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.07",
    "placement": "korchma.greeting",
    "text": "Гноми не падають із табуретів. Табурети просто інколи втрачають підтримку.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dwarf.08",
    "placement": "korchma.greeting",
    "text": "Каміння в стінах нервує. Каже, ви дивитесь на нього професійно.",
    "selector": {
      "raceIds": [
        "race.dwarf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.01",
    "placement": "korchma.greeting",
    "text": "Підлогу мили. Не ідеально, але ми залишили місце для вашого розчарування.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.02",
    "placement": "korchma.greeting",
    "text": "Ельфи в корчмі — це коли пил раптом згадує про естетику.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.03",
    "placement": "korchma.greeting",
    "text": "Не дивіться на наші штори. Вони й так знають, що провалили життя.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.04",
    "placement": "korchma.greeting",
    "text": "Сідайте там, де світло драматичніше. Ми спеціально не лагодили ту свічку.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.05",
    "placement": "korchma.greeting",
    "text": "Ваші чоботи вже засудили нашу підлогу. Підлога подала апеляцію.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.06",
    "placement": "korchma.greeting",
    "text": "У меню є салат. Ми не знаємо, навіщо, але він дуже старається.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.07",
    "placement": "korchma.greeting",
    "text": "Ельфійське терпіння довге, але наша черга до бару довша.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.elf.08",
    "placement": "korchma.greeting",
    "text": "Якщо музика фальшивить — це не бард, це стіна підспівує.",
    "selector": {
      "raceIds": [
        "race.elf"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.01",
    "placement": "korchma.greeting",
    "text": "Словник у мене під замком. Ображатися будемо за розкладом.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.02",
    "placement": "korchma.greeting",
    "text": "Бісини? Не біси, кажете? Чудово. Тоді бісити гостей можна без ліцензії.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.03",
    "placement": "korchma.greeting",
    "text": "Після вашої появи табличка «без суперечок про переклад» сама впала. Збіг, певно.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.04",
    "placement": "korchma.greeting",
    "text": "Я записав назву олівцем. Так безпечніше для локалізації столу.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.05",
    "placement": "korchma.greeting",
    "text": "Якщо хтось почне сперечатись про назву — відправляйте до бочки. Вона любить безплідні дискусії.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.06",
    "placement": "korchma.greeting",
    "text": "У нас усі рівні перед рахунком. Але деякі ще й бісинять касу.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.07",
    "placement": "korchma.greeting",
    "text": "Кухня просила не редагувати меню. Минулого разу борщ став юридичною істотою.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.bisyny.08",
    "placement": "korchma.greeting",
    "text": "Назва в журналі трохи димиться. Я зробив вигляд, що це стиль.",
    "selector": {
      "raceIds": [
        "race.bisyny"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.01",
    "placement": "korchma.greeting",
    "text": "О, з Остромагу? Карта справа. Вона бреше, але впевнено.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.02",
    "placement": "korchma.greeting",
    "text": "Дрантогор у корчмі — це коли двері не певні, чи ви зайшли, чи прибули через побічний сюжет.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.03",
    "placement": "korchma.greeting",
    "text": "Якщо шукаєте Королівство Остромаг, не питайте бочку. Вона всі королівства міряє піною.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.04",
    "placement": "korchma.greeting",
    "text": "Ваш пропуск через Межу ще теплий. Я не питатиму, хто його підписав. Він теж не знає.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.05",
    "placement": "korchma.greeting",
    "text": "Сідайте так, щоб не перекривати шлях назад. Хоча з вашим досвідом це не допоможе.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.06",
    "placement": "korchma.greeting",
    "text": "Дрантогори не губляться. Вони просто знаходять місця, які ще не знали, що їм потрібні.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.07",
    "placement": "korchma.greeting",
    "text": "Остромаг знову не коментує. Ми залишили для нього табурет і склянку дипломатії.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.drantohor.08",
    "placement": "korchma.greeting",
    "text": "Якщо Межа питатиме, ви тут за справою. Я ще не придумав, за якою.",
    "selector": {
      "raceIds": [
        "race.drantohor"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.01",
    "placement": "korchma.greeting",
    "text": "Якщо це тепер ваша хата, рахунок за ремонт теж ваш.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.02",
    "placement": "korchma.greeting",
    "text": "Домовик у корчмі — це або благословення, або інвентаризація ложок. Я хвилююсь.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.03",
    "placement": "korchma.greeting",
    "text": "Піч вас помітила й випрямилась. Ніколи не бачив, щоб цегла так нервувала.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.04",
    "placement": "korchma.greeting",
    "text": "Не переселяйте наш пил без акту приймання. Він тут із характером.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.05",
    "placement": "korchma.greeting",
    "text": "Сідайте ближче до полиці. Вона хоче справити враження.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.06",
    "placement": "korchma.greeting",
    "text": "Якщо знайдете чужі речі — це не лут, це початок домової дипломатії.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.07",
    "placement": "korchma.greeting",
    "text": "Корчма не ваша. Поки що. Не дивіться так на дах.",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.domovyk.08",
    "placement": "korchma.greeting",
    "text": "Миша в підвалі уже просить житлову комісію. Це ви так швидко працюєте?",
    "selector": {
      "raceIds": [
        "race.domovyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.01",
    "placement": "korchma.greeting",
    "text": "Води в нас тільки в чаї. Море не завезли, бо воно не влізло в накладну.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.02",
    "placement": "korchma.greeting",
    "text": "Сухопутна русалка — це коли калюжа отримує шанс на карʼєру.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.03",
    "placement": "korchma.greeting",
    "text": "Не слухайте чайник. Він удає прибій, щоб не мити посуд.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.04",
    "placement": "korchma.greeting",
    "text": "Якщо раптом стане сумно без моря — у нас є бочка. Вона теж шумить і створює проблеми.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.05",
    "placement": "korchma.greeting",
    "text": "Сідайте там, де протягу менше. Драма й так знайде дорогу.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.06",
    "placement": "korchma.greeting",
    "text": "У корчмі сухо. Це не принцип, просто дах поки тримає сюжет.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.07",
    "placement": "korchma.greeting",
    "text": "Ваш погляд на чайник змусив його закипіти з поваги.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.dryland-rusalka.08",
    "placement": "korchma.greeting",
    "text": "Кухня просила передати: соус — не водойма, навіть якщо дуже старається.",
    "selector": {
      "raceIds": [
        "race.dryland-rusalka"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.01",
    "placement": "korchma.greeting",
    "text": "Табурети без захисту дисертацій не ламати.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.02",
    "placement": "korchma.greeting",
    "text": "Орк-інтелігент у корчмі — це коли аргумент має біцепс і список джерел.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.03",
    "placement": "korchma.greeting",
    "text": "Не рецензуйте меню занадто суворо. Воно вже пережило дві правки й одну шаурму.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.04",
    "placement": "korchma.greeting",
    "text": "Якщо хтось сперечатиметься, у нас є окремий стіл для прикладної ввічливості.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.05",
    "placement": "korchma.greeting",
    "text": "Сідайте. Ваш кухоль уже відчув потребу мати позицію.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.06",
    "placement": "korchma.greeting",
    "text": "У нас заборонено бити співрозмовника тезами по обличчю. Спершу тези, потім обличчя.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.07",
    "placement": "korchma.greeting",
    "text": "Бочка просила не цитувати їй класиків. Вона після цього піниться абзацами.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.intellectual-orc.08",
    "placement": "korchma.greeting",
    "text": "Ваш диплом лишайте при собі. Минулого разу хтось відкрив ним підвал.",
    "selector": {
      "raceIds": [
        "race.intellectual-orc"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.01",
    "placement": "korchma.greeting",
    "text": "Туман лишайте біля входу. Минулого разу він не заплатив.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.02",
    "placement": "korchma.greeting",
    "text": "Мольфарська душа в корчмі — це коли оберігів більше, ніж гачків у квесті.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.03",
    "placement": "korchma.greeting",
    "text": "Ваші кишені дзвенять так, ніби там маленький комітет передчуттів.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.04",
    "placement": "korchma.greeting",
    "text": "Не радьтеся з туманом щодо рахунку. Він завжди каже «потім». ",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.05",
    "placement": "korchma.greeting",
    "text": "Сідайте там, де свічка не підморгує. Хоча вона вже почала.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.06",
    "placement": "korchma.greeting",
    "text": "Якщо оберіг сам замовить пиво — я запишу на вас. Він хитрий.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.07",
    "placement": "korchma.greeting",
    "text": "Корчмарський журнал від вашої появи трохи запітнів. Це або містика, або суп.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.race.molfar-soul.08",
    "placement": "korchma.greeting",
    "text": "Не ховайте туман у кухоль. Минулого разу він вийшов із відсотками.",
    "selector": {
      "raceIds": [
        "race.molfar-soul"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.01",
    "placement": "korchma.greeting",
    "text": "Залізо тримайте спокійно. Меблі сьогодні без броні.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.02",
    "placement": "korchma.greeting",
    "text": "Воїн у корчмі — це добре: двері самі відчиняються, бо не хочуть пояснень.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.03",
    "placement": "korchma.greeting",
    "text": "Якщо план простий, не кажіть його біля барда. Він зробить куплет.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.04",
    "placement": "korchma.greeting",
    "text": "Ваш меч дивиться на бочку. Бочка робить вигляд, що це взаємно.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.05",
    "placement": "korchma.greeting",
    "text": "Сідайте там, де стіл міцніший. Це не образа, це страховка.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.06",
    "placement": "korchma.greeting",
    "text": "Якщо хтось скаже «поговорімо», не бийте одразу. У нас спершу меню.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.07",
    "placement": "korchma.greeting",
    "text": "Меблі підписали петицію за мирний вечір. Я їм не вірю.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.08",
    "placement": "korchma.greeting",
    "text": "Ваша присутність додає корчмі захисту і трішки страхового випадку.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.09",
    "placement": "korchma.greeting",
    "text": "Не перевіряйте кухоль на міцність лобом. Кухоль уже програв морально.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.warrior.10",
    "placement": "korchma.greeting",
    "text": "У нас сьогодні без бійок. Тобто бійки за попереднім записом.",
    "selector": {
      "classIds": [
        "class.warrior"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.01",
    "placement": "korchma.greeting",
    "text": "Складні слова — надворі. Усередині вони підпалюють серветки.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.02",
    "placement": "korchma.greeting",
    "text": "Маг у корчмі — це коли свічки працюють нервово й понаднормово.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.03",
    "placement": "korchma.greeting",
    "text": "Не чаклуйте над рахунком. Він і так росте зловісно.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.04",
    "placement": "korchma.greeting",
    "text": "Якщо щось вибухне, кажіть, що це була дегустація нової спеції.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.05",
    "placement": "korchma.greeting",
    "text": "Ваш посох уже сперечається з віником. Я ставлю на віник, він місцевий.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.06",
    "placement": "korchma.greeting",
    "text": "Пара над супом не є порталом. Принаймні юридично.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.07",
    "placement": "korchma.greeting",
    "text": "Сідайте подалі від штор. Вони ще памʼятають попереднього мага.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.08",
    "placement": "korchma.greeting",
    "text": "Корчма не проти магії, доки магія платить за пошкоджений посуд.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.09",
    "placement": "korchma.greeting",
    "text": "Якщо руни на столі почнуть світитись — це не бонус, це рахунок старого клієнта.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.mage.10",
    "placement": "korchma.greeting",
    "text": "Ваші закляття звучать дорого. Бар просив не робити їх без авансу.",
    "selector": {
      "classIds": [
        "class.mage"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.01",
    "placement": "korchma.greeting",
    "text": "Співати можна. Але якщо бочка підхопить приспів — ви її заспокоюєте.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.02",
    "placement": "korchma.greeting",
    "text": "Бард у корчмі — це коли тиша йде у відпустку без попередження.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.03",
    "placement": "korchma.greeting",
    "text": "Не римуйте «пиво» з «дивом». Бочка після цього вимагає гонорар.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.04",
    "placement": "korchma.greeting",
    "text": "Якщо пісня стане квестом, я не відповідальний за третій куплет.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.05",
    "placement": "korchma.greeting",
    "text": "Сідайте ближче до сцени. Сцена — це той стілець, який ще не впав.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.06",
    "placement": "korchma.greeting",
    "text": "Ваш інструмент уже злякав мишу. Миша не проти, але просить афішу.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.07",
    "placement": "korchma.greeting",
    "text": "Корчма любить бардів. Особливо коли вони співають після оплати.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.08",
    "placement": "korchma.greeting",
    "text": "Публіка сьогодні складна: два табурети, бочка й єгер, який не плескає принципово.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.09",
    "placement": "korchma.greeting",
    "text": "Якщо хтось кине монету — це чайові. Якщо кухоль — це критика.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bard.10",
    "placement": "korchma.greeting",
    "text": "Не починайте баладу про двері. Вони в нас плаксиві.",
    "selector": {
      "classIds": [
        "class.bard"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.01",
    "placement": "korchma.greeting",
    "text": "Руки покажіть. Дякую. Тепер покажіть ті, якими ви справді працюєте.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.02",
    "placement": "korchma.greeting",
    "text": "Злодій у корчмі — це коли кишені самі перевіряють, чи вони на місці.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.03",
    "placement": "korchma.greeting",
    "text": "Не крадіть меню. Воно й так повертається з поганими новинами.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.04",
    "placement": "korchma.greeting",
    "text": "Якщо щось зникне, я спершу подумаю на вас. Це комплімент професії.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.05",
    "placement": "korchma.greeting",
    "text": "Сідайте спиною до стіни. Стіна вже нервує, але звикне.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.06",
    "placement": "korchma.greeting",
    "text": "Ключі від підвалу не губились. Вони просто ховаються від таланту.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.07",
    "placement": "korchma.greeting",
    "text": "Шинок під наглядом. Нагляд під вашим наглядом. Я бачу проблему.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.08",
    "placement": "korchma.greeting",
    "text": "Не беріть чужі квести без дозволу. Вони кусаються гірше за гаманці.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.09",
    "placement": "korchma.greeting",
    "text": "Ваш плащ виглядає так, ніби має алібі. Дуже підозріло.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.rogue.10",
    "placement": "korchma.greeting",
    "text": "Якщо хтось не помітить, що ви зайшли, я все одно запишу. Для балансу.",
    "selector": {
      "classIds": [
        "class.rogue"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.01",
    "placement": "korchma.greeting",
    "text": "Благословення приймаємо. Але бочку не відспівувати — вона ще корисна.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.02",
    "placement": "korchma.greeting",
    "text": "Жрець у корчмі — це коли навіть рахунок намагається виглядати морально.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.03",
    "placement": "korchma.greeting",
    "text": "Якщо будете кропити кутки, почніть із того, де бард репетирує.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.04",
    "placement": "korchma.greeting",
    "text": "Не благословляйте шаурму без її письмової згоди. Був прецедент.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.05",
    "placement": "korchma.greeting",
    "text": "Сідайте ближче до світла. Воно сьогодні потребує духовного нагляду.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.06",
    "placement": "korchma.greeting",
    "text": "Кадило тримайте подалі від кухні. Минулого разу суп отримав характер.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.07",
    "placement": "korchma.greeting",
    "text": "У нас тут грішать помірно: пиво, квести, інколи меблі.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.08",
    "placement": "korchma.greeting",
    "text": "Якщо нежить зайде, скажіть їй замовляти біля вікна. Там краще провітрюється.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.09",
    "placement": "korchma.greeting",
    "text": "Бочка просила не називати її посудиною гріха. Вона вразлива.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.priest.10",
    "placement": "korchma.greeting",
    "text": "Ваш суворий погляд уже поставив у кут три серветки. Вражає.",
    "selector": {
      "classIds": [
        "class.priest"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.01",
    "placement": "korchma.greeting",
    "text": "Кухня просила не піднімати тісто без дозволу. Минулого разу воно мало вимоги.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.02",
    "placement": "korchma.greeting",
    "text": "Вареник-мант у корчмі — це коли начинка шепоче, а кухар робить вигляд, що не чує.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.03",
    "placement": "korchma.greeting",
    "text": "Не дивіться так на меню. Пельмені в ньому ще не готові до революції.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.04",
    "placement": "korchma.greeting",
    "text": "Сметану видаємо за потребою, а не за покликом долі.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.05",
    "placement": "korchma.greeting",
    "text": "Сідайте ближче до кухні. Тісто хоче знати, чи ви його родина.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.06",
    "placement": "korchma.greeting",
    "text": "Якщо вареники почнуть маршувати — я скажу, що це сезонна акція.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.07",
    "placement": "korchma.greeting",
    "text": "Шаурма вас боїться. Каже, ви дивитесь на неї як на невдалий родовід.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.08",
    "placement": "korchma.greeting",
    "text": "Не сперечайтесь із качалкою. Вона старша за половину квестів.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.09",
    "placement": "korchma.greeting",
    "text": "Кухня сьогодні під охороною. Від вас чи для вас — ще зʼясовуємо.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.varenyk-mancer.10",
    "placement": "korchma.greeting",
    "text": "Ваші тістологічні погляди вже змусили пиріжки стояти рівніше.",
    "selector": {
      "classIds": [
        "class.varenyk-mancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.01",
    "placement": "korchma.greeting",
    "text": "Форми 13-Б сьогодні не видаємо. Тільки 13-Б/пінне і то під розпис.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.02",
    "placement": "korchma.greeting",
    "text": "Бюрокромант у корчмі — це коли навіть пил шукає правильний додаток.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.03",
    "placement": "korchma.greeting",
    "text": "Не оформлюйте табурет як тимчасову перешкоду. Він і так має самооцінку.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.04",
    "placement": "korchma.greeting",
    "text": "Якщо бочка проситиме печатку, не давайте. Вона вже раз відкрила відділ піни.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.05",
    "placement": "korchma.greeting",
    "text": "Сідайте біля журналу. Він нервує, але при вас почерк кращий.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.06",
    "placement": "korchma.greeting",
    "text": "Рахунок у двох примірниках: один вам, один для духу внутрішнього контролю.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.07",
    "placement": "korchma.greeting",
    "text": "Не складайте акт про самовільне дихання шаурми без свідків. Свідки ховаються.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.08",
    "placement": "korchma.greeting",
    "text": "Корчма любить документи. Особливо ті, що не можуть втекти зі столу.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.09",
    "placement": "korchma.greeting",
    "text": "Ваш вигляд уже знерухомив три серветки й одну підозру.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.bureaucramancer.10",
    "placement": "korchma.greeting",
    "text": "Якщо квест не має печатки — це не квест, а громадянська ініціатива.",
    "selector": {
      "classIds": [
        "class.bureaucramancer"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.01",
    "placement": "korchma.greeting",
    "text": "Сліди до бару я вже витер. Нові лишайте біля килимка.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.02",
    "placement": "korchma.greeting",
    "text": "Єгер у корчмі — це добре. Хтось має пояснити, чому бочка ходила колами.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.03",
    "placement": "korchma.greeting",
    "text": "Ваші сліди чисті. Підозріло чисті. Я записав.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.04",
    "placement": "korchma.greeting",
    "text": "Якщо знайдете слід від миші до каси — не чіпайте, то бухгалтерія.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.05",
    "placement": "korchma.greeting",
    "text": "Не ставте пастки між столами. Минулого разу впіймали два борги й одного барда.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.06",
    "placement": "korchma.greeting",
    "text": "Лісу тут нема, але є закуток біля печі. Він теж кусається.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.07",
    "placement": "korchma.greeting",
    "text": "Сьогодні в меню: суп, пиво і загадковий лаваш. Третє вистежуйте самі.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.08",
    "placement": "korchma.greeting",
    "text": "Від дверей до бару ведуть три сліди: ваш, мій і комерційний.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.09",
    "placement": "korchma.greeting",
    "text": "Якщо бочка втече, стріляйте не в бочку, а в її самооцінку.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.10",
    "placement": "korchma.greeting",
    "text": "Єгерю, тримайте карту корчми. Вона бреше на ділянці між баром і правдою.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.11",
    "placement": "korchma.greeting",
    "text": "Ви пахнете дорогами. Дороги пахнуть вами у відповідь і вимагають чайових.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.12",
    "placement": "korchma.greeting",
    "text": "Хто вміє читати сліди, той зрозуміє: хтось тягнув табурет до пригоди.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.13",
    "placement": "korchma.greeting",
    "text": "Не дивіться так на крихти. Половина з них під прикриттям.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.14",
    "placement": "korchma.greeting",
    "text": "Сліди пінні, напрямок — нахабний. Це бочка тренується бути босом.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.15",
    "placement": "korchma.greeting",
    "text": "У нас тут не ліс. Але якщо загубитеся між столами, кричіть «рахунок».",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.16",
    "placement": "korchma.greeting",
    "text": "Ваші черевики вже ведуть розслідування. Я їм не заважаю.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.17",
    "placement": "korchma.greeting",
    "text": "Єгеря люблю: ви знаходите проблеми раніше, ніж вони замовляють пиво.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.18",
    "placement": "korchma.greeting",
    "text": "Якщо побачите слід від шаурми — не йдіть за ним голодними.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.19",
    "placement": "korchma.greeting",
    "text": "Миша в підвалі лишила маршрут. Я думав реклама, але там сир.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.ranger.20",
    "placement": "korchma.greeting",
    "text": "Не наступіть на сюжетний гачок. Він біля другого стола, прикидається крихтою.",
    "selector": {
      "classIds": [
        "class.ranger"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.01",
    "placement": "korchma.greeting",
    "text": "Не дивіться так на бочку. Вона вже майже вибачилась.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.02",
    "placement": "korchma.greeting",
    "text": "Характерник у корчмі — це коли туман заходить першим і просить не видавати його.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.03",
    "placement": "korchma.greeting",
    "text": "Ваш погляд поставив двері на місце. Двері, правда, там і були, але тепер упевненіше.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.04",
    "placement": "korchma.greeting",
    "text": "Не характерничте над рахунком. Він після цього починає вірити в себе.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.05",
    "placement": "korchma.greeting",
    "text": "Сідайте так, щоб не налякати кут. Кут у нас молодий.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.06",
    "placement": "korchma.greeting",
    "text": "Бочка щойно згадала всі свої помилки. Дивно, ви ще мовчали.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.07",
    "placement": "korchma.greeting",
    "text": "Якщо туман почне сперечатись із піччю, скажіть йому, що черга після кухні.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.08",
    "placement": "korchma.greeting",
    "text": "У нас тут не степ, але підлога вже старається бути ширшою.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.09",
    "placement": "korchma.greeting",
    "text": "Ваш оселедець має вигляд плану. Я не питатиму, як він працює.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.class.kharakternyk.10",
    "placement": "korchma.greeting",
    "text": "Корчма поважає характерників: ви пояснюєте хаосу, що він не старший у зміні.",
    "selector": {
      "classIds": [
        "class.kharakternyk"
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.human-ish-ranger.01",
    "placement": "korchma.greeting",
    "text": "{title}? О, класика слідопита, який випадково врятує заклад і попросить тільки сухі шкарпетки.",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.human-ish-ranger.02",
    "placement": "korchma.greeting",
    "text": "{title} зайшли так, ніби вистежили корчму за запахом проблем. Чесно, так і було.",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.human-ish-ranger.03",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Сліди ведуть до пригоди, але пригода поки ховається під меню.",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.dwarf-ranger.01",
    "placement": "korchma.greeting",
    "text": "{title}? Сліди низькі, висновки міцні, підлога вже дала свідчення.",
    "selector": {
      "combos": [
        {
          "raceId": "race.dwarf",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.dwarf-ranger.02",
    "placement": "korchma.greeting",
    "text": "{title} дивиться на крихти так, ніби це рудна жила сюжету.",
    "selector": {
      "combos": [
        {
          "raceId": "race.dwarf",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.dwarf-ranger.03",
    "placement": "korchma.greeting",
    "text": "{title} у корчмі: тепер навіть миша лишатиме сліди відповідальної глибини.",
    "selector": {
      "combos": [
        {
          "raceId": "race.dwarf",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.elf-ranger.01",
    "placement": "korchma.greeting",
    "text": "{title} читає сліди красиво. Сліди соромляться й намагаються вирівнятись.",
    "selector": {
      "combos": [
        {
          "raceId": "race.elf",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.elf-ranger.02",
    "placement": "korchma.greeting",
    "text": "{title}? Стежка до бару щойно стала естетичною і трішки зверхньою.",
    "selector": {
      "combos": [
        {
          "raceId": "race.elf",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.elf-ranger.03",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Крихти отримали критику композиції й розбіглися по сюжету.",
    "selector": {
      "combos": [
        {
          "raceId": "race.elf",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.bisyny-ranger.01",
    "placement": "korchma.greeting",
    "text": "{title}? Ви вистежите проблему, а потім змусите її сперечатись про власну назву.",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.bisyny-ranger.02",
    "placement": "korchma.greeting",
    "text": "{title} зайшли. Сліди вже бісиняться, бо не знають, як правильно відмінюватись.",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.bisyny-ranger.03",
    "placement": "korchma.greeting",
    "text": "{title}: корчма отримала слідопита й редактора поганих намірів в одній особі.",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.drantohor-ranger.01",
    "placement": "korchma.greeting",
    "text": "{title}? Якщо знайдете вихід на Остромаг — не ставте його між баром і касою.",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.drantohor-ranger.02",
    "placement": "korchma.greeting",
    "text": "{title} у корчмі. Карта зомліла, компас попросив лікарняний.",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.drantohor-ranger.03",
    "placement": "korchma.greeting",
    "text": "{title} читає сліди через Межу. Сліди нервують, бо вони такого не підписували.",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.domovyk-ranger.01",
    "placement": "korchma.greeting",
    "text": "{title}? Ви знайдете мишу не тому, що слідопит, а тому, що це ваша територіальна справа.",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.domovyk-ranger.02",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Підпіччя отримало польову розвідку й почало поводитись офіційно.",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.domovyk-ranger.03",
    "placement": "korchma.greeting",
    "text": "{title}: сліди ведуть додому, а дім підозріло нагадує всю корчму.",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.ranger"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.human-ish-warrior.01",
    "placement": "korchma.greeting",
    "text": "{title}? Такі заходять просто, а виходять із легендою й чужим табуретом у руці.",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.warrior"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.human-ish-warrior.02",
    "placement": "korchma.greeting",
    "text": "{title} у корчмі. Нарешті хтось пояснить дверям, що вони не бос.",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.warrior"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.human-ish-warrior.03",
    "placement": "korchma.greeting",
    "text": "{title}: найпростіший план у залі щойно став найнадійнішим.",
    "selector": {
      "combos": [
        {
          "raceId": "race.human-ish",
          "classId": "class.warrior"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.bisyny-bard.01",
    "placement": "korchma.greeting",
    "text": "{title} під музику. Нарешті в нас буде культурний скандал із примітками.",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.bard"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.bisyny-bard.02",
    "placement": "korchma.greeting",
    "text": "{title}? Я вже сховав словник і підписав кухлі на випадок рими.",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.bard"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.bisyny-bard.03",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Пісня ще не почалась, а локалізація вже просить води.",
    "selector": {
      "combos": [
        {
          "raceId": "race.bisyny",
          "classId": "class.bard"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.drantohor-kharakternyk.01",
    "placement": "korchma.greeting",
    "text": "{title} на порозі. Остромаг і корчма щойно посперечались за карту.",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.kharakternyk"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.drantohor-kharakternyk.02",
    "placement": "korchma.greeting",
    "text": "{title}? Межа відкрила двері, туман потримав вам місце, бочка образилась.",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.kharakternyk"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.drantohor-kharakternyk.03",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Географія здалася, але попросила не казати при компасі.",
    "selector": {
      "combos": [
        {
          "raceId": "race.drantohor",
          "classId": "class.kharakternyk"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.domovyk-bureaucramancer.01",
    "placement": "korchma.greeting",
    "text": "{title}? Шафа за баром уже подала заяву на родинні звʼязки.",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.bureaucramancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.domovyk-bureaucramancer.02",
    "placement": "korchma.greeting",
    "text": "{title} прийшли — і пил попросив інвентарний номер. Неймовірна влада.",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.bureaucramancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.domovyk-bureaucramancer.03",
    "placement": "korchma.greeting",
    "text": "{title} у корчмі. Тепер навіть кут має прописку й обовʼязки.",
    "selector": {
      "combos": [
        {
          "raceId": "race.domovyk",
          "classId": "class.bureaucramancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.dryland-rusalka-varenyk-mancer.01",
    "placement": "korchma.greeting",
    "text": "{title}. Море не прийшло, зате кухня нервує.",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.varenyk-mancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.dryland-rusalka-varenyk-mancer.02",
    "placement": "korchma.greeting",
    "text": "{title}? Сметана підняла хвилю, але суху й за актом.",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.varenyk-mancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.dryland-rusalka-varenyk-mancer.03",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Чайник удає океан, тісто удає дисципліну.",
    "selector": {
      "combos": [
        {
          "raceId": "race.dryland-rusalka",
          "classId": "class.varenyk-mancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.intellectual-orc-bureaucramancer.01",
    "placement": "korchma.greeting",
    "text": "{title}? Не бийте формою по столу. Стіл уже погодився з аргументом.",
    "selector": {
      "combos": [
        {
          "raceId": "race.intellectual-orc",
          "classId": "class.bureaucramancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.intellectual-orc-bureaucramancer.02",
    "placement": "korchma.greeting",
    "text": "{title} у залі. Канцелярія отримала мʼязи, а мʼязи — порядковий номер.",
    "selector": {
      "combos": [
        {
          "raceId": "race.intellectual-orc",
          "classId": "class.bureaucramancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.intellectual-orc-bureaucramancer.03",
    "placement": "korchma.greeting",
    "text": "{title}: якщо хтось не підпише акт, акт підпише його.",
    "selector": {
      "combos": [
        {
          "raceId": "race.intellectual-orc",
          "classId": "class.bureaucramancer"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.molfar-soul-mage.01",
    "placement": "korchma.greeting",
    "text": "{title}? Не складайте туман біля вікна, він знову втече в кредит.",
    "selector": {
      "combos": [
        {
          "raceId": "race.molfar-soul",
          "classId": "class.mage"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.molfar-soul-mage.02",
    "placement": "korchma.greeting",
    "text": "{title} у корчмі. Свічки шепочуть, оберіги дзвенять, рахунок ховається.",
    "selector": {
      "combos": [
        {
          "raceId": "race.molfar-soul",
          "classId": "class.mage"
        }
      ]
    }
  },
  {
    "id": "korchma.greeting.v2.combo.molfar-soul-mage.03",
    "placement": "korchma.greeting",
    "text": "{title}: магія пахне туманом, туман пахне чаєм, чай відмовляється свідчити.",
    "selector": {
      "combos": [
        {
          "raceId": "race.molfar-soul",
          "classId": "class.mage"
        }
      ]
    }
  }
] satisfies CharacterFlavorLine[];

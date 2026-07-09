import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD,
  isKorchmaInteriorLocation
} from "../services/presenceService";

export const DAILY_KORCHMA_ROUND_CONTENT_VERSION = "v1";
export const DAILY_KORCHMA_ROUND_REQUIRED_STEPS = 2;

export type DailyKorchmaRoundZone = "yard" | "interior";

export interface DailyKorchmaRoundAction {
  id: string;
  label: string;
  description?: string;
  outcome: string;
}

export interface DailyKorchmaRoundScene {
  id: string;
  zone: DailyKorchmaRoundZone;
  locationId: string;
  icon: string;
  title: string;
  hook: string;
  actions: readonly DailyKorchmaRoundAction[];
}

export const dailyKorchmaRoundScenes = [
  {
    id: "yard-sign-career",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🪧",
    title: "Вивіска подала заяву на іншу професію",
    hook: "Вивіска біля дверей наполягає, що відтепер вона «магістр напрямку», а не дошка з цвяхом.",
    actions: [
      {
        id: "add-footnote",
        label: "🖊️ Додати примітку",
        description: "Бюрократичне уточнення без сварки з деревом.",
        outcome: "Ви дописали дрібним шрифтом: «тимчасово дошка». Вивіска зітхнула й погодилась працювати до обіду."
      },
      {
        id: "ask-title",
        label: "🎓 Визнати титул",
        description: "Урочиста поступка, щоб напрямок згадав роботу.",
        outcome: "Ви урочисто назвали її магістром напрямку. Вивіска показала на двері точніше, ніж більшість мап."
      },
      {
        id: "turn-around",
        label: "🔄 Розвернути до корчми",
        description: "Практичний рух без філософії цвяхів.",
        outcome: "Вивіска знову дивиться туди, куди треба. Вона просить не називати це пониженням."
      }
    ]
  },
  {
    id: "yard-rope-philosophy",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🪢",
    title: "Мотузка зав’язала питання без відповіді",
    hook: "Мотузка біля дров скрутилась у вузол і питає, чи тримає вона світ, чи світ тримає її.",
    actions: [
      {
        id: "name-knot",
        label: "🏷️ Назвати вузол",
        description: "Дати проблемі назву, щоб вона стала робочою.",
        outcome: "Ви назвали вузол «робочим». Мотузка вирішила, що це звучить достатньо зайнято, і перестала сперечатися."
      },
      {
        id: "untie-slowly",
        label: "👐 Розплутати повільно",
        description: "Тиха ручна праця без різких висновків.",
        outcome: "Ви розплутали її без зайвої драми. Мотузка лишила собі один маленький вузлик для характеру."
      },
      {
        id: "delegate-post",
        label: "🪵 Передати стовпу",
        description: "Перекласти складну частину на того, хто не заперечує.",
        outcome: "Стовп мовчки взяв філософську частину на себе. Мотузка повернулась до простішої професії."
      }
    ]
  },
  {
    id: "yard-well-echo-audit",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🪣",
    title: "Криниця вимагає аудит відлуння",
    hook: "Криниця повертає кожне слово з печаткою «копія сумнівна» і просить відповідальну особу.",
    actions: [
      {
        id: "stamp-echo",
        label: "📌 Поставити печатку",
        description: "Офіційний звук для неофіційної глибини.",
        outcome: "Ви гупнули порожнім відром як печаткою. Криниця прийняла звук за документ і затихла."
      },
      {
        id: "speak-clearly",
        label: "🗣️ Сказати чітко",
        description: "Перевірка дикції замість повного розслідування.",
        outcome: "Ви вимовили «відлуння в порядку». Криниця повернула це без помилок і дуже собою пишалась."
      },
      {
        id: "lower-bucket",
        label: "🪣 Опустити відро",
        description: "Матеріальний аргумент на мотузці.",
        outcome: "Відро спустилось, піднялось і принесло мокру згоду. Для криниці це майже протокол."
      }
    ]
  },
  {
    id: "yard-dust-delegation",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🌫️",
    title: "Дорожній пил сформував делегацію",
    hook: "Пил під порогом зібрався в купку й заявив, що його постійно обходять без належного вітання.",
    actions: [
      {
        id: "bow-politely",
        label: "🙇 Привітатися чемно",
        description: "Дипломатія з тим, що все одно розсиплеться.",
        outcome: "Ви вклонились пилу. Делегація розсипалась від поваги й трохи від протягу."
      },
      {
        id: "draw-border",
        label: "🧹 Провести межу",
        description: "Віник як карта, кордон і аргумент.",
        outcome: "Віник провів лінію перемовин. Пил визнав територію корчми й неохоче лишив поріг порогом."
      },
      {
        id: "offer-corner",
        label: "📦 Дати куточок",
        description: "Малий простір для великої самоповаги.",
        outcome: "Пил отримав крихітний куточок для засідань. Він одразу оголосив перерву."
      }
    ]
  },
  {
    id: "news-rumor-source",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
    icon: "📰",
    title: "Чутка загубила першоджерело",
    hook: "На дошці вістей висить чутка без автора. Вона виглядає впевнено, що для чутки вже небезпечно.",
    actions: [
      {
        id: "pin-question",
        label: "❓ Приколоти питання",
        description: "Додати сумнів там, де самовпевненість заросла.",
        outcome: "Ви прикололи поруч знак питання. Чутка стала скромнішою й перестала кивати сама собі."
      },
      {
        id: "ask-board",
        label: "🪵 Спитати дошку",
        description: "Опитати свідка, який дуже добре скрипить.",
        outcome: "Дошка скрипнула так, ніби знає все, але має договір про мовчання. Чутка зніяковіла."
      },
      {
        id: "move-bottom",
        label: "⬇️ Пересунути нижче",
        description: "Знизити пафос фізичним переміщенням.",
        outcome: "Чутка опинилась нижче оголошення про загублену ложку й одразу стала менш урочистою."
      }
    ]
  },
  {
    id: "barrel-rent-emptiness",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
    icon: "🛢️",
    title: "Порожнеча вимагає оренду",
    hook: "Всередині Бочки Пінного Міражу щось порожньо бухтить про зайняту площу й неоплачену тишу.",
    actions: [
      {
        id: "knock-twice",
        label: "✊ Постукати двічі",
        description: "Перевірити порожнечу ввічливим ритмом.",
        outcome: "Бочка відповіла третім стуком для балансу. Порожнеча вирішила, що її почули, і зробила паузу."
      },
      {
        id: "offer-receipt",
        label: "🧾 Видати чек",
        description: "Бухгалтерія для того, чого майже нема.",
        outcome: "Ви видали чек на «нуль літрів». Порожнеча прочитала його й стала бухгалтерськи тихою."
      },
      {
        id: "listen-serious",
        label: "👂 Послухати серйозно",
        description: "Поважна тиша проти гучної тиші.",
        outcome: "Ви послухали так серйозно, що порожнеча сама засоромилась своєї гучності."
      }
    ]
  },
  {
    id: "bar-cup-seniority",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BAR,
    icon: "🍺",
    title: "Кухоль вимагає старшинства",
    hook: "На шинку кухоль став поперед інших і стверджує, що бачив більше ліктів, ніж молодий посуд.",
    actions: [
      {
        id: "rotate-shelf",
        label: "🔁 Змінити полицю",
        description: "Почесна перестановка без миття репутації.",
        outcome: "Ви поставили кухоль на почесну середню полицю. Він назвав це компромісом із висоти."
      },
      {
        id: "count-dents",
        label: "🔎 Порахувати вм’ятини",
        description: "Доказ старшинства через сліди служби.",
        outcome: "Ви порахували вм’ятини й зупинились на «достатньо». Кухоль задоволено блиснув краєм."
      },
      {
        id: "appoint-mentor",
        label: "🧑‍🏫 Призначити наставником",
        description: "Посада замість черги за повагою.",
        outcome: "Кухоль отримав посаду наставника дрібних чарок. Шинок вижив, хоч і зітхнув."
      }
    ]
  },
  {
    id: "cellar-bottle-whisper",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    icon: "🍾",
    title: "Пляшка шепоче інвентаризацію",
    hook: "У льосі пляшка шепоче номери, яких немає в жодному списку, і явно насолоджується процесом.",
    actions: [
      {
        id: "repeat-last",
        label: "🔁 Повторити останній",
        description: "Збити інвентаризацію її ж методом.",
        outcome: "Ви повторили останній номер. Пляшка збилась і вирішила почати інвентаризацію з тиші."
      },
      {
        id: "face-wall",
        label: "🧱 Розвернути до стіни",
        description: "Перенаправити шепіт до досвідченого слухача.",
        outcome: "Пляшка тепер шепоче стіні. Стіна має вигляд досвідченого працівника архіву."
      },
      {
        id: "mark-empty",
        label: "✅ Позначити порожньою",
        description: "Офіційно звільнити пляшку від зайвих номерів.",
        outcome: "Ви позначили пляшку порожньою від відповідальності. Вона прийняла це як звільнення."
      }
    ]
  },
  {
    id: "hall-stool-union",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_HALL,
    icon: "🪑",
    title: "Табурет оголосив перерву",
    hook: "Серед зали табурет стоїть набік і пояснює всім ніжкам, що вертикальність має межі.",
    actions: [
      {
        id: "offer-cushion",
        label: "🧺 Запропонувати подушку",
        description: "Мʼяка дипломатія без героїчного ремонту.",
        outcome: "Подушка додала табурету гідності. Він погодився стояти, але тільки з новим поглядом на працю."
      },
      {
        id: "align-legs",
        label: "📐 Вирівняти ніжки",
        description: "Практичний ремонт, який може зачепити меблеву гідність.",
        outcome: "Ви вирівняли ніжки. Табурет буркнув, що це технічна, а не ідеологічна перемога."
      },
      {
        id: "schedule-break",
        label: "🗓️ Записати перерву",
        description: "Бюрократичний мир: перерва існує, але не заважає залу.",
        outcome: "Перерву внесено в уявний графік. Табурет відчув себе почутим і знову став меблями."
      }
    ]
  },
  {
    id: "quest-table-ink-mood",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    icon: "🖋️",
    title: "Чорнило має настрій, але не має підпису",
    hook: "На Столі зі справами пляма чорнила розповзлась у форму печатки й чекає офіційної реакції.",
    actions: [
      {
        id: "draw-smile",
        label: "🙂 Домалювати усміх",
        description: "Мʼяко змінити настрій без нової печатки.",
        outcome: "Пляма стала схожою на дуже зайняту усмішку. Папірець вирішив, що це майже печатка."
      },
      {
        id: "blot-careful",
        label: "🧻 Промокнути край",
        description: "Обережне втручання, щоб характер лишився.",
        outcome: "Ви промокнули край, лишивши плямі трохи характеру. Вона припинила розширювати посаду."
      },
      {
        id: "file-under-mood",
        label: "📁 Занести в настрій",
        description: "Канцелярський мир для плями з амбіціями.",
        outcome: "Чорнило внесено до розділу «настрій столу». Стіл одразу став поважнішим."
      }
    ]
  },
  {
    id: "fighting-corner-glove-form",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
    icon: "🥊",
    title: "Рукавичка подала форму на мир",
    hook: "У Бійцівському кутку рукавичка лежить долонею вгору й натякає, що сьогодні вона за переговори.",
    actions: [
      {
        id: "shake-glove",
        label: "🤝 Потиснути рукавичку",
        description: "Мирний жест у місці з поганою статистикою жестів.",
        outcome: "Ви потиснули рукавичку. Вона визнала жест і не вдарила нікого цілих кілька секунд."
      },
      {
        id: "fold-form",
        label: "📄 Скласти форму",
        description: "Паперова дисципліна для бойового настрою.",
        outcome: "Форму складено в акуратний трикутник. Рукавичка вирішила, що мир теж може бути бойовим."
      },
      {
        id: "hang-high",
        label: "🪝 Повісити вище",
        description: "Підняти аргумент вище рівня випадкового удару.",
        outcome: "Рукавичка висить над кутком як приклад стриманості. Куток вдає, що так і планував."
      }
    ]
  },
  {
    id: "ranger-corner-map-sneeze",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
    icon: "🗺️",
    title: "Мапа чхнула не в той бік",
    hook: "У Єгерському кутку мапа посунула ліс ближче до кухні й робить вигляд, що так було завжди.",
    actions: [
      {
        id: "wipe-path",
        label: "🧽 Витерти стежку",
        description: "Прибрати зайвий маршрут до кухонної географії.",
        outcome: "Ви витерли зайву стежку. Мапа шморгнула компасом і повернула ліс на пристойну відстань."
      },
      {
        id: "pin-north",
        label: "📍 Приколоти північ",
        description: "Зафіксувати напрямок, поки він не передумав.",
        outcome: "Північ приколота. Єгер кивнув так непомітно, що це майже природне явище."
      },
      {
        id: "rename-smudge",
        label: "✏️ Перейменувати пляму",
        description: "Назвати помилку тимчасовою місциною.",
        outcome: "Пляма стала «тимчасовою галявиною». Мапа задоволена, бо тимчасове рідко перевіряють."
      }
    ]
  },
  {
    id: "deep-stair-count",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_DEEP,
    icon: "🪜",
    title: "Сходи сперечаються про кількість",
    hook: "На Спуску до Низу сходинки наполягають, що їх то тринадцять, то трохи більше для драматизму.",
    actions: [
      {
        id: "count-aloud",
        label: "🔢 Порахувати вголос",
        description: "Стабілізувати сходи голосом і впертістю.",
        outcome: "Ви порахували вголос і зупинились на тринадцяти. Решта сходинок зробила вигляд, що була тінню."
      },
      {
        id: "tap-rail",
        label: "🪵 Постукати по перилу",
        description: "Дати перилу роль модератора суперечки.",
        outcome: "Перило взяло роль модератора. Сходинки погодились не міняти кількість до наступної сцени."
      },
      {
        id: "write-note",
        label: "📝 Лишити записку",
        description: "Письмова порада для місця, яке рахує драматично.",
        outcome: "Записка «рахувати повільно» заспокоїла Спуск. Низ поки що не подав апеляцію."
      }
    ]
  },
  {
    id: "yard-bench-migration",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🪑",
    title: "Лава просить сезонний переїзд",
    hook: "Дворова лава стверджує, що бачила достатньо дверей і тепер хоче краєвид на іншу калюжу.",
    actions: [
      { id: "measure-shadow", label: "📏 Поміряти тінь", description: "Знайти нове місце за офіційною тінню, а не за настроєм дошок.", outcome: "Ви поміряли тінь і знайшли лаві кут із повагою до спини. Лава погодилась мігрувати на півметра." },
      { id: "ask-bench", label: "🗣️ Спитати лаву", description: "Дати меблям слово, поки вони не створили комісію.", outcome: "Лава висловилась коротко й деревʼяно. Цього вистачило, щоб усі визнали її право на новий погляд." },
      { id: "leave-plaque", label: "🏷️ Лишити табличку", description: "Пояснити майбутнім сидінням, що це не втеча, а ротація.", outcome: "Табличка «тимчасово поряд» зняла напругу. Стара пляма під лавою відчула себе архівом." }
    ]
  },
  {
    id: "yard-puddle-permit",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "💧",
    title: "Калюжа просить дозвіл на віддзеркалення",
    hook: "Калюжа біля порога показує небо без погодження і дуже пишається неофіційною висотою.",
    actions: [
      { id: "stamp-reflection", label: "📌 Завізувати відбиток", description: "Офіційно визнати небо там, де його можна переступити.", outcome: "Ви поставили умовну печатку на відбиток. Калюжа стала нижчою голосом і вищою статусом." },
      { id: "add-leaf-frame", label: "🍂 Додати рамку", description: "Перетворити випадкову воду на майже експозицію.", outcome: "Листок ліг як рамка. Калюжа вирішила, що тепер вона не безлад, а малий культурний захід." },
      { id: "route-boots", label: "🥾 Позначити обхід", description: "Зменшити драму без повного висушування амбіцій.", outcome: "Ви позначили обхід. Калюжа буркнула, але прийняла роль місцевої памʼятки." }
    ]
  },
  {
    id: "yard-broom-weather",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🧹",
    title: "Віник прогнозує погоду в пилюці",
    hook: "Біля входу віник креслить у пилюці хмари й натякає, що синоптика без щетини неповна.",
    actions: [
      { id: "read-bristles", label: "🔎 Прочитати щетину", description: "Визнати прогноз, не створюючи окремого міністерства пилу.", outcome: "Щетина показала «можливо, вітер». Двір уважно кивнув, бо це завжди корисний прогноз." },
      { id: "sweep-map", label: "🧭 Змести карту", description: "Зняти зайву географію з місця, де ходять чоботи.", outcome: "Ви змели карту в акуратну купку. Віник заявив, що це фронтальна лінія порядку." },
      { id: "hang-under-roof", label: "🪝 Повісити під дах", description: "Дати експерту сухий кабінет і менше стихійної графіки.", outcome: "Віник отримав дах над щетиною. Прогноз одразу став стриманішим і трохи чистішим." }
    ]
  },
  {
    id: "yard-lantern-oath",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "🏮",
    title: "Ліхтар склав присягу світити по черзі",
    hook: "Дворовий ліхтар заявляє, що світло потребує графіка, і моргає так, ніби це вже протокол.",
    actions: [
      { id: "draw-shift", label: "🗓️ Намалювати зміну", description: "Дати мерехтінню робочий розклад без бухгалтерії вогню.", outcome: "Графік зміни зʼявився на клапті паперу. Ліхтар моргнув дисципліновано і перестав сперечатись із вечором." },
      { id: "clean-glass", label: "🧽 Протерти скло", description: "Зменшити пафос присяги простим блиском.", outcome: "Скло стало прозорішим. Ліхтар визнав, що іноді служба починається з ганчірки." },
      { id: "appoint-evening", label: "🌙 Призначити вечір", description: "Пояснити, кому саме він зараз служить.", outcome: "Вечір прийняв призначення без промови. Ліхтар засяяв так, ніби давно чекав керівника." }
    ]
  },
  {
    id: "yard-crate-republic",
    zone: "yard",
    locationId: PRESENCE_LOCATION_KORCHMA_YARD,
    icon: "📦",
    title: "Ящик проголосив республіку кутів",
    hook: "Порожній ящик біля стіни оголосив, що кожен кут має право на власну сторону.",
    actions: [
      { id: "count-corners", label: "🔢 Порахувати кути", description: "Перевірити конституцію геометрії без перевороту.", outcome: "Кутів виявилось рівно стільки, щоб республіка не розпалась до обіду. Ящик задоволено скрипнув." },
      { id: "offer-label", label: "🏷️ Дати назву", description: "Заспокоїти державність простим інвентарним ярликом.", outcome: "Ярлик «ящик службовий» повернув кордони на місце. Республіка стала відділом." },
      { id: "turn-open-side", label: "↪️ Розвернути відкритим боком", description: "Показати ящику, що прозорість теж форма влади.", outcome: "Ящик побачив власну порожнечу й тимчасово відмовився від гучних посад." }
    ]
  },
  {
    id: "hall-napkin-census",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_HALL,
    icon: "🧾",
    title: "Серветка проводить перепис плям",
    hook: "У залі серветка занотовує кожну пляму й дуже хоче зрозуміти, яка з них староста.",
    actions: [
      { id: "circle-chief", label: "⭕ Обвести старосту", description: "Дати плямам старшинство без довгої кампанії.", outcome: "Найстаршу пляму обведено. Решта плям погодилась бути населенням без додаткових скарг." },
      { id: "fold-districts", label: "📐 Скласти райони", description: "Перетворити хаос на адміністративну геометрію.", outcome: "Серветка склалась у райони. Плями тепер мешкають компактно і майже пишаються адресами." },
      { id: "retire-form", label: "📁 Здати форму", description: "Закрити перепис до появи нових крапель.", outcome: "Форму здано до уявного архіву. Серветка з полегшенням повернулась до головної роботи." }
    ]
  },
  {
    id: "hall-spoon-parliament",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_HALL,
    icon: "🥄",
    title: "Ложки відкрили парламент дзенькотом",
    hook: "На столі кілька ложок сперечаються, чи суп має право на тишу, якщо його ще не принесли.",
    actions: [
      { id: "tap-gavel", label: "🔨 Дати молоточок", description: "Перетворити дзенькіт на процедуру.", outcome: "Одна ложка отримала роль молоточка. Парламент став гучним, але принаймні по черзі." },
      { id: "separate-caucus", label: "↔️ Розсадити фракції", description: "Відсунути металеву демократію на безпечну відстань.", outcome: "Фракції розсаджено. Ложки тепер обмінюються поглядами, а не постійними аргументами." },
      { id: "write-agenda", label: "📝 Написати порядок", description: "Дати дебатам тему коротшу за звук.", outcome: "Порядок денний містить один пункт: «не дзвеніти без супу». Ложки прийняли його в першому читанні." }
    ]
  },
  {
    id: "hall-coat-hanger-vote",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_HALL,
    icon: "🧥",
    title: "Вішак голосує за чужі плащі",
    hook: "Біля стіни вішак порахував плащі й вирішив, що має мандат на порядок.",
    actions: [
      { id: "pair-hooks", label: "🪝 Попарувати гачки", description: "Зменшити виборчий шум через симетрію.", outcome: "Гачки стали парами. Вішак визнав, що коаліція плечей працює краще за випадковий нахил." },
      { id: "ask-cloaks", label: "🗳️ Спитати плащі", description: "Почути електорат, який переважно мовчить тканиною.", outcome: "Плащі пошелестіли за порядок. Вішак записав це як переконливу більшість." },
      { id: "mark-guest-row", label: "📍 Позначити ряд", description: "Дати гостям місце без урочистого входу.", outcome: "Гостьовий ряд позначено. Вішак став суворішим, але припинив рахувати кожен рукав." }
    ]
  },
  {
    id: "bar-teapot-union",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BAR,
    icon: "🫖",
    title: "Чайник вимагає профспілку пари",
    hook: "На шинку чайник тихо сопе й натякає, що пара теж хоче перерву без кипіння.",
    actions: [
      { id: "lift-lid", label: "🫧 Підняти кришку", description: "Випустити аргумент до того, як він стане свистом.", outcome: "Пара вийшла з гідністю. Чайник одразу став менш революційним і більш питним." },
      { id: "pour-small", label: "🍵 Налити малий кухоль", description: "Показати, що робота має видимий результат.", outcome: "Малий кухоль прийняв чай без дебатів. Чайник заспокоївся, бо його почули практично." },
      { id: "write-break", label: "🗓️ Записати перерву", description: "Дати парі графік, а шинку тишу.", outcome: "Перерву внесено між «ледь кипить» і «вже всім зрозуміло». Чайник шанобливо булькнув." }
    ]
  },
  {
    id: "bar-foam-forecast",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BAR,
    icon: "🍺",
    title: "Піна на кухлі малює карту настрою",
    hook: "На шинку піна зібралась у форму стрілки й упевнено показує не туди, куди всі дивляться.",
    actions: [
      { id: "turn-mug", label: "🔄 Повернути кухоль", description: "Перевірити, чи карта залежить від географії руки.", outcome: "Стрілка повернулась разом із кухлем і зробила вигляд, що так було задумано." },
      { id: "ask-foam", label: "❔ Спитати піну", description: "Почути прогноз, поки він не зник у напої.", outcome: "Піна прошепотіла «обережно з пафосом». Це виявився найточніший прогноз вечора." },
      { id: "sip-border", label: "🥄 Зняти край", description: "Мʼяко скоротити надмірну картографію.", outcome: "Край піни зник, і карта стала схожа на звичайний кухоль із дуже важливою біографією." }
    ]
  },
  {
    id: "bar-sugar-audit",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BAR,
    icon: "🧂",
    title: "Цукор підозрює себе в пересолодженні",
    hook: "Біля шинку грудочка цукру стоїть окремо й просить незалежну перевірку власної солодкости.",
    actions: [
      { id: "appoint-tea", label: "🫖 Призначити чай", description: "Дати солодкому питанню нейтральне середовище.", outcome: "Чай прийняв грудочку без паніки. Цукор визнав, що перевірка була теплою і справедливою." },
      { id: "split-grain", label: "🔍 Розділити крупинку", description: "Провести аудит у масштабі, де вже соромно сваритись.", outcome: "Крупинка поділилась на аргументи. Усі вони виявились солодкими, але помірними." },
      { id: "file-sweet", label: "📁 Підшити висновок", description: "Закрити справу до появи варення.", outcome: "Висновок підшито: «солодко, але не нахабно». Цукор повернувся до служби." }
    ]
  },
  {
    id: "news-pin-trial",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
    icon: "📌",
    title: "Кнопка на дошці вимагає суду присяжних",
    hook: "У кутку вістей кнопка тримає оголошення й наполягає, що її роль недооцінюють.",
    actions: [
      { id: "hear-pin", label: "👂 Вислухати кнопку", description: "Дати гострому аргументу коротку промову.", outcome: "Кнопка пояснила, що тримає все буквально. Дошка вістей визнала внесок без оплесків." },
      { id: "rotate-paper", label: "🔄 Розвернути аркуш", description: "Зняти напругу з одного героїчного вістря.", outcome: "Аркуш ліг рівніше. Кнопка одразу стала схожа на працівника архіву, а не на бунтівника." },
      { id: "add-second-pin", label: "➕ Додати сусіда", description: "Перетворити самотню відповідальність на зміну.", outcome: "Друга кнопка взяла край аркуша. Перша перестала говорити про конституційну кризу." }
    ]
  },
  {
    id: "news-ink-confession",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
    icon: "🖋️",
    title: "Чорнило зізнається в надмірній драмі",
    hook: "На дошці вістей підпис розтікся так урочисто, ніби оголошення вже стало легендою.",
    actions: [
      { id: "blot-title", label: "🧻 Промокнути титул", description: "Залишити зміст, але прибрати фанфари.", outcome: "Титул став коротшим. Чорнило полегшено зітхнуло і перестало претендувати на монумент." },
      { id: "underline-date", label: "📅 Підкреслити дату", description: "Повернути оголошення з епосу до розкладу.", outcome: "Дата отримала лінію й відповідальність. Оголошення стало схожим на справу, а не на долю." },
      { id: "move-corner", label: "↘️ Зсунути в кут", description: "Дати драмі місце, де вона не перекриває новини.", outcome: "Чорнильна драма переїхала в кут. Там вона виглядає майже культурно." }
    ]
  },
  {
    id: "quest-table-paper-sneeze",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    icon: "📄",
    title: "Папірець зі справою чхає пилом",
    hook: "На Столі зі справами папірець підстрибує від власного пилу й просить не називати це старістю.",
    actions: [
      { id: "dust-margin", label: "🧹 Змести поле", description: "Повернути справі край без зміни суті.", outcome: "Поле стало читабельним. Папірець вдячно чхнув востаннє і прийняв молодший вигляд." },
      { id: "press-flat", label: "✋ Пригладити", description: "Зменшити драму простим тиском долоні.", outcome: "Папірець ліг рівно. Тепер він виглядає як завдання, а не як мапа давнього кашлю." },
      { id: "add-tissue", label: "🧻 Дати серветку", description: "Допомогти документу зберегти гідність.", outcome: "Серветка прийняла пил на себе. Папірець заявив, що це службова підтримка, не слабкість." }
    ]
  },
  {
    id: "quest-table-string-appeal",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    icon: "🧶",
    title: "Нитка подала апеляцію на вузол",
    hook: "На краю Столу зі справами нитка стверджує, що вузол був емоційним і процедурно сумнівним.",
    actions: [
      { id: "loosen-case", label: "🪢 Послабити справу", description: "Дати вузлу простір для меншого пафосу.", outcome: "Вузол послабився і раптом став схожим на компроміс. Нитка відкликала апеляцію." },
      { id: "name-knot-clerk", label: "🏷️ Назвати вузол", description: "Перетворити проблему на службову одиницю.", outcome: "Вузол отримав назву «тимчасовий тримач». Нитка визнала, що з посадою сперечатись важче." },
      { id: "clip-end", label: "📎 Закріпити край", description: "Забрати у нитки привід розповзатися в процес.", outcome: "Край закріплено. Нитка лежить спокійно й удає, що завжди любила порядок." }
    ]
  },
  {
    id: "quest-table-stamp-vacation",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    icon: "🪪",
    title: "Печатка просить відпустку від важливости",
    hook: "Печатка на Столі зі справами лежить боком і натякає, що сьогодні хоче бути просто круглою.",
    actions: [
      { id: "roll-stamp", label: "🔄 Покотити печатку", description: "Дати важливості трохи руху без службового злочину.", outcome: "Печатка прокотилась півоберта й згадала, що круглість теж відповідальна." },
      { id: "pad-ink", label: "🖋️ Оновити чорнило", description: "Повернути їй причину бути серйозною.", outcome: "Свіже чорнило додало печатці настрою. Відпустку скорочено до почесної паузи." },
      { id: "stamp-blank", label: "📄 Поставити на чернетці", description: "Зняти напругу тренувальним ударом.", outcome: "Чернетка отримала красиве коло. Печатка задоволено повернулась до справ." }
    ]
  },
  {
    id: "cellar-candle-queue",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    icon: "🕯️",
    title: "Свічки в льосі стоять у черзі за темрявою",
    hook: "У льосі кілька свічок сперечаються, кому першій пояснювати темряві межі повноважень.",
    actions: [
      { id: "assign-wick", label: "🧵 Призначити ґніт", description: "Дати першій свічці службовий старт.", outcome: "Ґніт отримав чергу й одразу став відповідальнішим. Темрява відступила на крок із повагою." },
      { id: "space-candles", label: "↔️ Розставити свічки", description: "Зменшити конкуренцію світла між сусідами.", outcome: "Свічки отримали місце. Тепер кожна світить так, ніби це колективний проєкт." },
      { id: "note-draft", label: "📝 Занотувати протяг", description: "Визнати невидимого учасника суперечки.", outcome: "Протяг внесено до протоколу. Свічки перестали звинувачувати одна одну в хитанні." }
    ]
  },
  {
    id: "cellar-potato-title",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    icon: "🥔",
    title: "Картоплина взяла собі почесний титул",
    hook: "На полиці льоху картоплина лежить окремо й очікує, що її називатимуть повністю.",
    actions: [
      { id: "shorten-title", label: "✂️ Скоротити титул", description: "Залишити гідність, прибрати зайві склади.", outcome: "Титул скорочено до «пані Картоплина». Полиця видихнула, бо рядок знову вміщується." },
      { id: "seat-basket", label: "🧺 Посадити в кошик", description: "Дати шляхетності практичне крісло.", outcome: "Кошик прийняв титул без реверансу. Картоплина стала поважною частиною запасів." },
      { id: "read-lineage", label: "📜 Прочитати родовід", description: "Урочисто визнати походження з мішка.", outcome: "Родовід виявився коротким і переконливим. Картоплина дозволила іншим лежати поруч." }
    ]
  },
  {
    id: "cellar-shelf-complaint",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    icon: "🪵",
    title: "Полиця скаржиться на надмірну відповідальність",
    hook: "Льохова полиця тримає банки й обурено натякає, що героїзм без перерви шкодить лаку.",
    actions: [
      { id: "redistribute-jars", label: "⚖️ Перерозподілити банки", description: "Повернути рівновагу без промови про долю дерева.", outcome: "Банки переїхали рівніше. Полиця перестала рипіти як маніфест." },
      { id: "add-wedge", label: "🧩 Підкласти клин", description: "Дати опору там, де вже почалась філософія.", outcome: "Клин встав на місце. Полиця відчула підтримку і відклала скаргу." },
      { id: "praise-grain", label: "🌾 Похвалити текстуру", description: "Моральна допомога деревині без нових витрат.", outcome: "Текстуру похвалено. Полиця скромно рипнула і продовжила службу." }
    ]
  },
  {
    id: "barrel-tap-choir",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
    icon: "🚰",
    title: "Кран Бочки набирає хор крапель",
    hook: "У Бочці Пінного Міражу кран капає строєм і чекає, що хтось оцінить дисципліну.",
    actions: [
      { id: "set-rhythm", label: "🥁 Задати ритм", description: "Перетворити крапання на коротку репетицію.", outcome: "Краплі пішли в ритм і швидко втомились від власної організованости. Кран стишився." },
      { id: "tighten-tap", label: "🔧 Підкрутити кран", description: "Практичне рішення для надто музичної сантехніки.", outcome: "Кран підкручено. Хор завершив виступ на високій паузі." },
      { id: "place-cup", label: "🍺 Поставити кухоль", description: "Дати таланту аудиторію з дном.", outcome: "Кухоль прийняв кілька крапель як овації. Кран вирішив, що концерт відбувся." }
    ]
  },
  {
    id: "barrel-echo-lease",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
    icon: "🛢️",
    title: "Луна в Бочці просить договір оренди",
    hook: "Порожня луна всередині Бочки повторює слово «місце» так, ніби вже має юридичний відділ.",
    actions: [
      { id: "answer-once", label: "🗣️ Відповісти один раз", description: "Не годувати повторення зайвою драмою.", outcome: "Ви відповіли один раз. Луна повторила й заспокоїлась, бо діалог формально відбувся." },
      { id: "mark-corner", label: "📍 Позначити кут", description: "Дати луні адресу без права розширення.", outcome: "Кут позначено як «тимчасово порожній». Луна прийняла це за офіс." },
      { id: "close-lid", label: "🪵 Прикрити віко", description: "Зменшити акустику до службового рівня.", outcome: "Віко приглушило повтори. Луна ще щось сказала, але вже без претензії на оренду." }
    ]
  },
  {
    id: "ranger-corner-boot-map",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
    icon: "🥾",
    title: "Чобіт Єгерського кутка знайшов власну мапу",
    hook: "У Єгерському кутку чобіт показує на підошву й переконує всіх, що це топографія досвіду.",
    actions: [
      { id: "brush-sole", label: "🧽 Почистити підошву", description: "Відокремити карту від звичайної дороги.", outcome: "Підошва стала чистішою, а маршрут коротшим. Чобіт визнав, що частина лісу була пилом." },
      { id: "pin-trail", label: "📌 Позначити стежку", description: "Зберегти корисну частину без зайвих грудок.", outcome: "Стежку позначено маленькою подряпиною. Єгерський куток схвально промовчав." },
      { id: "pair-boot", label: "👢 Знайти пару", description: "Перевірити, чи мапа має другу думку.", outcome: "Другий чобіт показав інший маршрут до того самого порога. Обидва назвали це дослідженням." }
    ]
  },
  {
    id: "deep-door-protocol",
    zone: "interior",
    locationId: PRESENCE_LOCATION_KORCHMA_DEEP,
    icon: "🚪",
    title: "Дверцята до Низу вимагають протокол стуку",
    hook: "Біля Спуску до Низу дверцята не зачинені, але дуже хочуть, щоб їх поважали процедурно.",
    actions: [
      { id: "knock-three", label: "✊ Постукати тричі", description: "Дати порогу ритуал без відкриття нової експедиції.", outcome: "Три стуки прозвучали достатньо серйозно. Дверцята стали на мить менш образливими." },
      { id: "oil-hinge", label: "🛢️ Змастити петлю", description: "Прибрати скрип із дипломатії деревини.", outcome: "Петля заспокоїлась. Дверцята тепер мовчать так, ніби це їхній вибір." },
      { id: "write-rule", label: "📜 Написати правило", description: "Перетворити примху на коротку інструкцію.", outcome: "Правило «стукати без пафосу» повішено збоку. Низ поки не оскаржує." }
    ]
  }
] as const satisfies readonly DailyKorchmaRoundScene[];

export type DailyKorchmaRoundSceneId = (typeof dailyKorchmaRoundScenes)[number]["id"];

export function getDailyKorchmaRoundScene(id: string): DailyKorchmaRoundScene | null {
  return dailyKorchmaRoundScenes.find((scene) => scene.id === id) ?? null;
}

export function validateDailyKorchmaRoundContent(): void {
  const scenes: readonly DailyKorchmaRoundScene[] = dailyKorchmaRoundScenes;
  const ids = new Set<string>();
  const interiorLocationIds = new Set<string>();
  let yardSceneCount = 0;

  for (const scene of scenes) {
    assertId(scene.id, `scene ${scene.id}`);

    if (ids.has(scene.id)) {
      throw new Error(`Duplicate daily Korchma round scene id: ${scene.id}`);
    }

    ids.add(scene.id);

    if (scene.zone === "yard") {
      yardSceneCount += 1;

      if (scene.locationId !== PRESENCE_LOCATION_KORCHMA_YARD) {
        throw new Error(`Daily Korchma round yard scene ${scene.id} must use the yard location.`);
      }
    } else if (!isKorchmaInteriorLocation(scene.locationId)) {
      throw new Error(`Daily Korchma round interior scene ${scene.id} must use a Korchma interior location.`);
    } else {
      interiorLocationIds.add(scene.locationId);
    }

    if (scene.actions.length !== 3) {
      throw new Error(`Daily Korchma round scene ${scene.id} must have exactly three actions.`);
    }

    const actionIds = new Set<string>();

    for (const action of scene.actions) {
      assertId(action.id, `action ${scene.id}:${action.id}`);

      if (actionIds.has(action.id)) {
        throw new Error(`Duplicate daily Korchma round action id: ${scene.id}:${action.id}`);
      }

      actionIds.add(action.id);

      if (!action.description?.trim()) {
        throw new Error(`Daily Korchma round action ${scene.id}:${action.id} must have a description.`);
      }

      if (!action.outcome.trim()) {
        throw new Error(`Daily Korchma round action ${scene.id}:${action.id} must have an outcome.`);
      }
    }
  }

  if (yardSceneCount === 0) {
    throw new Error("Daily Korchma round content needs at least one yard scene.");
  }

  if (interiorLocationIds.size < 2) {
    throw new Error("Daily Korchma round content needs at least two interior location groups.");
  }
}

function assertId(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(value)) {
    throw new Error(`Invalid daily Korchma round ${label} id.`);
  }
}

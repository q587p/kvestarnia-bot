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
  PRESENCE_LOCATION_KORCHMA_YARD
} from "../services/presenceService";

export const DAILY_KORCHMA_ROUND_CONTENT_VERSION = "v1";
export const DAILY_KORCHMA_ROUND_REQUIRED_STEPS = 2;

export type DailyKorchmaRoundZone = "yard" | "interior";

export interface DailyKorchmaRoundAction {
  id: string;
  label: string;
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
        outcome: "Ви дописали дрібним шрифтом: «тимчасово дошка». Вивіска зітхнула й погодилась працювати до обіду."
      },
      {
        id: "ask-title",
        label: "🎓 Визнати титул",
        outcome: "Ви урочисто назвали її магістром напрямку. Вивіска показала на двері точніше, ніж більшість мап."
      },
      {
        id: "turn-around",
        label: "🔄 Розвернути до корчми",
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
        outcome: "Ви назвали вузол «робочим». Мотузка вирішила, що це звучить достатньо зайнято, і перестала сперечатися."
      },
      {
        id: "untie-slowly",
        label: "👐 Розплутати повільно",
        outcome: "Ви розплутали її без зайвої драми. Мотузка лишила собі один маленький вузлик для характеру."
      },
      {
        id: "delegate-post",
        label: "🪵 Передати стовпу",
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
        outcome: "Ви гупнули порожнім відром як печаткою. Криниця прийняла звук за документ і затихла."
      },
      {
        id: "speak-clearly",
        label: "🗣️ Сказати чітко",
        outcome: "Ви вимовили «відлуння в порядку». Криниця повернула це без помилок і дуже собою пишалась."
      },
      {
        id: "lower-bucket",
        label: "🪣 Опустити відро",
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
        outcome: "Ви вклонились пилу. Делегація розсипалась від поваги й трохи від протягу."
      },
      {
        id: "draw-border",
        label: "🧹 Провести межу",
        outcome: "Віник провів лінію перемовин. Пил визнав територію корчми й неохоче лишив поріг порогом."
      },
      {
        id: "offer-corner",
        label: "📦 Дати куточок",
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
        outcome: "Ви прикололи поруч знак питання. Чутка стала скромнішою й перестала кивати сама собі."
      },
      {
        id: "ask-board",
        label: "🪵 Спитати дошку",
        outcome: "Дошка скрипнула так, ніби знає все, але має договір про мовчання. Чутка зніяковіла."
      },
      {
        id: "move-bottom",
        label: "⬇️ Пересунути нижче",
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
        outcome: "Бочка відповіла третім стуком для балансу. Порожнеча вирішила, що її почули, і зробила паузу."
      },
      {
        id: "offer-receipt",
        label: "🧾 Видати чек",
        outcome: "Ви видали чек на «нуль літрів». Порожнеча прочитала його й стала бухгалтерськи тихою."
      },
      {
        id: "listen-serious",
        label: "👂 Послухати серйозно",
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
        outcome: "Ви поставили кухоль на почесну середню полицю. Він назвав це компромісом із висоти."
      },
      {
        id: "count-dents",
        label: "🔎 Порахувати вм’ятини",
        outcome: "Ви порахували вм’ятини й зупинились на «достатньо». Кухоль задоволено блиснув краєм."
      },
      {
        id: "appoint-mentor",
        label: "🧑‍🏫 Призначити наставником",
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
        outcome: "Ви повторили останній номер. Пляшка збилась і вирішила почати інвентаризацію з тиші."
      },
      {
        id: "face-wall",
        label: "🧱 Розвернути до стіни",
        outcome: "Пляшка тепер шепоче стіні. Стіна має вигляд досвідченого працівника архіву."
      },
      {
        id: "mark-empty",
        label: "✅ Позначити порожньою",
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
        outcome: "Подушка додала табурету гідності. Він погодився стояти, але тільки з новим поглядом на працю."
      },
      {
        id: "align-legs",
        label: "📐 Вирівняти ніжки",
        outcome: "Ви вирівняли ніжки. Табурет буркнув, що це технічна, а не ідеологічна перемога."
      },
      {
        id: "schedule-break",
        label: "🗓️ Записати перерву",
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
        outcome: "Пляма стала схожою на дуже зайняту усмішку. Папірець вирішив, що це майже печатка."
      },
      {
        id: "blot-careful",
        label: "🧻 Промокнути край",
        outcome: "Ви промокнули край, лишивши плямі трохи характеру. Вона припинила розширювати посаду."
      },
      {
        id: "file-under-mood",
        label: "📁 Занести в настрій",
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
        outcome: "Ви потиснули рукавичку. Вона визнала жест і не вдарила нікого цілих кілька секунд."
      },
      {
        id: "fold-form",
        label: "📄 Скласти форму",
        outcome: "Форму складено в акуратний трикутник. Рукавичка вирішила, що мир теж може бути бойовим."
      },
      {
        id: "hang-high",
        label: "🪝 Повісити вище",
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
        outcome: "Ви витерли зайву стежку. Мапа шморгнула компасом і повернула ліс на пристойну відстань."
      },
      {
        id: "pin-north",
        label: "📍 Приколоти північ",
        outcome: "Північ приколота. Єгер кивнув так непомітно, що це майже природне явище."
      },
      {
        id: "rename-smudge",
        label: "✏️ Перейменувати пляму",
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
        outcome: "Ви порахували вголос і зупинились на тринадцяти. Решта сходинок зробила вигляд, що була тінню."
      },
      {
        id: "tap-rail",
        label: "🪵 Постукати по перилу",
        outcome: "Перило взяло роль модератора. Сходинки погодились не міняти кількість до наступної сцени."
      },
      {
        id: "write-note",
        label: "📝 Лишити записку",
        outcome: "Записка «рахувати повільно» заспокоїла Спуск. Низ поки що не подав апеляцію."
      }
    ]
  }
] as const satisfies readonly DailyKorchmaRoundScene[];

export type DailyKorchmaRoundSceneId = (typeof dailyKorchmaRoundScenes)[number]["id"];

export function getDailyKorchmaRoundScene(id: string): DailyKorchmaRoundScene | null {
  return dailyKorchmaRoundScenes.find((scene) => scene.id === id) ?? null;
}

export function validateDailyKorchmaRoundContent(): void {
  const ids = new Set<string>();

  for (const scene of dailyKorchmaRoundScenes) {
    assertId(scene.id, `scene ${scene.id}`);

    if (ids.has(scene.id)) {
      throw new Error(`Duplicate daily Korchma round scene id: ${scene.id}`);
    }

    ids.add(scene.id);

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
    }
  }

  if (dailyKorchmaRoundScenes.filter((scene) => scene.zone === "yard").length === 0) {
    throw new Error("Daily Korchma round content needs at least one yard scene.");
  }
}

function assertId(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(value)) {
    throw new Error(`Invalid daily Korchma round ${label} id.`);
  }
}

export const MONSTER_BARKS_RULES_VERSION = "monster-barks-v1";

export type MonsterBarkTrigger = "engage" | "early-turn" | "first-ability" | "hp-below";
export type MonsterBarkAudience = "solo" | "party" | "any";

export interface MonsterBarkDefinition {
  id: string;
  monsterId: string;
  trigger: MonsterBarkTrigger;
  audience: MonsterBarkAudience;
  text: string;
  priority: number;
  eligibleOwnActions?: readonly number[];
  mandatoryEarlyCandidate?: boolean;
  hpRatioAtOrBelow?: number;
  oncePerFight?: boolean;
}

export const monsterBarkTextByMonsterId = {
  "monster.mimic-shawarma": {
    solo: "«Не дивіться на соус. Соус дивиться першим.»",
    party: "«О, гуртом на шаурму? Начинка вже рахує вас як добавки.»",
    early: "«Замовлення прийнято: один бій, без гарантії.»",
    firstAbility: "«Соус сьогодні гострий. І юридично самостійний.»",
    hurt: "«Це не кров. Це кетчуп із дуже поганим характером.»"
  },
  "monster.basement-mouse-with-title": {
    solo: "«Прошу звертатися: Ваша Льоховість.»",
    party: "«Делегація без сиру? Дипломатичний провал.»",
    early: "«Ваш титул перевірено. Він підозріло короткий.»",
    firstAbility: "«Податок на повагу сплачується зубами.»",
    hurt: "«Замах на корону! Корона була кришечкою, але все одно.»"
  },
  "monster.stamp-doorkeeper-skeleton": {
    solo: "«Пропуск до перемоги? Немає. Наступний.»",
    party: "«Групові заявки приймаємо по одному черепу.»",
    early: "«Смерть чекала менше, ніж ви стоятимете в цій черзі.»",
    firstAbility: "«Печатка каже: «Не допущено». Я лише виконую.»",
    hurt: "«Кістки скаржаться, але формуляр мовчить.»"
  },
  "monster.spreadsheet-goblin": {
    solo: "«Ваші HP не сходяться з моєю формулою. Зараз виправимо.»",
    party: "«О, ціла таблиця героїв. Нарешті нормальний діапазон.»",
    early: "«Я вже пофарбував вашу поразку червоним.»",
    firstAbility: "«Формула проста: ви мінус упевненість.»",
    hurt: "«Помилка #ДІЛ/НА/МЕЧ. Несподівано боляче.»"
  },
  "monster.deadline-spider": {
    solo: "«Це не павутина. Це «на вчора».»",
    party: "«Усім терміново? Чудово, всіх і заплутаю.»",
    early: "«Ще один хід — і прострочення стане вашим титулом.»",
    firstAbility: "«Дедлайн підповзає. Він не читає виправдань.»",
    hurt: "«Термін посунувся. На вас.»"
  },
  "monster.preapproval-dragonling": {
    solo: "«Вогонь погоджено усно. Цього вам вистачить.»",
    party: "«Три підписи на кожного. Або один дим на всіх.»",
    early: "«Я ще малий, але бюрократія в мені доросла.»",
    firstAbility: "«Укус попередньо схвалено. Оскарження після бою.»",
    hurt: "«Хтось відкликав дозвіл на мою невразливість!»"
  },
  "monster.unread-rules-ghost": {
    solo: "«Ви дочитали правила? Шкода, я — ні.»",
    party: "«Групове ознайомлення завершено без ознайомлення.»",
    early: "«Дрібний шрифт уже стоїть у вас за спиною.»",
    firstAbility: "«Пункт сьомий: герой пропускає спокій.»",
    hurt: "«Цього пошкодження не було в примітках.»"
  },
  "monster.anxious-slippers-swarm": {
    solo: "«Лівий капець б’є. Правий заперечує.»",
    party: "«Нас багато, бо жоден не знає, куди бігти.»",
    early: "«Визначайтесь швидше — ми вже передумали тричі.»",
    firstAbility: "«Маневр «усі в різні боки» розпочато!»",
    hurt: "«Пара розпалась. Але тривога лишилась.»"
  },
  "monster.borshch-slime": {
    solo: "«Скажіть «холодний». Я наполягаю.»",
    party: "«На всіх ложок не вистачить. Ударів — цілком.»",
    early: "«Температура правильна. Неправильні тут ви.»",
    firstAbility: "«Зараз буде гаряче, навіть якщо я кімнатний.»",
    hurt: "«Це ви мене розлили чи я тактичний?»"
  },
  "monster.conditionally-sliced-loaf-bandit": {
    solo: "«Крихти на стіл. Повільно.»",
    party: "«Вас багато — отже, частка з кожного буде тонша.»",
    early: "«Я ще цілий буханець. Не випробовуйте нарізку.»",
    firstAbility: "«Ніж умовний. Наслідки безумовні.»",
    hurt: "«Хтось надкусив кримінальний авторитет.»"
  },
  "monster.queue-counter-gargoyle": {
    solo: "«Ваш номер — після вічности.»",
    party: "«Група отримує один талон. Діліть героїчно.»",
    early: "«Не штовхайтесь. Камінь штовхне у відповідь.»",
    firstAbility: "«Черга рухається назад. Це нова послуга.»",
    hurt: "«На ремонт черги грошей не закладено.»"
  },
  "monster.audit-mosquito": {
    solo: "«Де дві монети? Я відчуваю нестачу.»",
    party: "«Колективна перевірка! Рукави підняти, гаманці відкрити.»",
    early: "«Я не кусаю. Я уточнюю витрати.»",
    firstAbility: "«Ревізія буде дрібною, але дуже особистою.»",
    hurt: "«Цей ляпас не підтверджений чеком.»"
  },
  "monster.archival-knysh-eater": {
    solo: "«Ваш доказ пахне начинкою.»",
    party: "«Принесли архів гуртом? Я не снідав.»",
    early: "«Ще сторінку — і справа стане смачно закритою.»",
    firstAbility: "«З’їдаю пункт перший. Пункт другий тікає.»",
    hurt: "«Крихти свідчать проти вас. І трохи проти мене.»"
  },
  "monster.final-comment-troll": {
    solo: "«Я лише додам останній коментар.»",
    party: "«Стільки думок, а закривати тему все одно мені.»",
    early: "«Не перебивайте: я вже перебиваю.»",
    firstAbility: "«Аргумент прийнято й негайно перекручено.»",
    hurt: "«Тема не закрита. Я просто лежу.»"
  },
  "monster.report-jellyfish": {
    solo: "«Моя прозорість вас зараз ужалить.»",
    party: "«Звітність любить групи: більше пунктів плану.»",
    early: "«Пливу за графіком, якого ніхто не бачив.»",
    firstAbility: "«Ось вам короткий звіт: боляче.»",
    hurt: "«Прозорість дала тріщину. Не записуйте.»"
  },
  "monster.no-change-merchantling": {
    solo: "«Здачі немає. Здавайтесь самі.»",
    party: "«Для гурту є знижка: платите всі.»",
    early: "«Ціна удару плаваюча. Плаває вгору.»",
    firstAbility: "«Решта лишається мені. Разом із вашою рівновагою.»",
    hurt: "«Повернення товару тільки в неушкодженому вигляді. Пізно.»"
  },
  "monster.self-critique-mirror": {
    solo: "«Ви могли б краще. Я покажу, наскільки гірше.»",
    party: "«О, групова самокритика. Відображення ледве вміщує.»",
    early: "«Не дивіться на мене так. Це ви на себе.»",
    firstAbility: "«Сумнів повертається з подвоєним блиском.»",
    hurt: "«Тріщина? Нарешті чесний портрет.»"
  },
  "monster.dry-sea-teapot": {
    solo: "«Море висохло. Претензії закипіли.»",
    party: "«Чаю на всіх нема. Свисту — з запасом.»",
    early: "«Ще мить, і я оголошу шторм у кухлі.»",
    firstAbility: "«Сухий приплив починається зі свистка.»",
    hurt: "«Кришечка тримається краще за гідність.»"
  },
  "monster.cabbage-knight-on-break": {
    solo: "«Перерва скінчилась. Квашення почалось.»",
    party: "«На грядку гуртом? Це вже облога салату.»",
    early: "«Честь хрумтить, але не ламається.»",
    firstAbility: "«Капустяна броня — це не жарт. Жарт — ваш меч.»",
    hurt: "«З мене зняли листок. Це офіційно дуель.»"
  },
  "monster.zero-declaration-tax-dragon": {
    solo: "«Нульова декларація, ненульове полум’я.»",
    party: "«Колективний скарб теж скарб. Дякую за явку.»",
    early: "«Ваші активи виглядають підозріло живими.»",
    firstAbility: "«Заморожую майно. Почну з рухомого.»",
    hurt: "«Це не поразка. Це податкова оптимізація.»"
  },
  "monster.complaint-lantern": {
    solo: "«Я світитиму, доки хтось не визнає провину.»",
    party: "«Скарги приймаються хором. Яскравість подвоєно.»",
    early: "«Говоріть голосніше. Мені треба чимось живитися.»",
    firstAbility: "«Підсвічую головну проблему. Вона тримає зброю.»",
    hurt: "«Лампа не розбита. Вона драматично затемнилась.»"
  },
  "monster.ledger-boar": {
    solo: "«Ваш прихід записано у видатки.»",
    party: "«Гуртовий напад? Проведу одним рядком.»",
    early: "«Копито сходиться з балансом. Ваше обличчя — ні.»",
    firstAbility: "«Звіряю рахунки тараном.»",
    hurt: "«У книзі з’явився незапланований мінус.»"
  },
  "monster.salted-oath-pretzel": {
    solo: "«Обіцяв не бити. Але вузол був складений інакше.»",
    party: "«На всіх солі вистачить. Довіри — ні.»",
    early: "«Не ламайте мене: це порушення форми зобов’язання.»",
    firstAbility: "«Крихти засвідчать, хто почав.»",
    hurt: "«Обіцянка тріснула. Сіль усе запам’ятала.»"
  },
  "monster.unclosed-closure-act": {
    solo: "«Справу закрито. Тому я її відкриваю.»",
    party: "«Групове закриття потребує ще групи підписів.»",
    early: "«Ваш хід повернуто без розгляду.»",
    firstAbility: "«Відмовляю у завершенні цього бою.»",
    hurt: "«Мене порвали, але не завершили.»"
  },
  "monster.liar-corridor-map": {
    solo: "«Вихід прямо. Тобто ліворуч. Тобто за мною.»",
    party: "«Для гурту маю три маршрути й жодного спільного.»",
    early: "«Коридор уже змінив думку про вас.»",
    firstAbility: "«Малюю короткий шлях до довгої проблеми.»",
    hurt: "«Кут пом’ятий. Географія образилась.»"
  },
  "monster.foam-auditor-boots": {
    solo: "«Піна завищена. Чоботи уповноважені.»",
    party: "«Кухлі в ряд, герої в чергу.»",
    early: "«Третю кружку хтось не задекларував.»",
    firstAbility: "«Проводжу пінну перевірку з виїздом на ногу.»",
    hurt: "«Чобіт протік. Це службова таємниця.»"
  },
  "monster.three-signature-chimera": {
    solo: "«Перша голова за бій. Друга — проти. Третя вже підписала.»",
    party: "«На кожного героя по голові. Комусь дістанеться протокол.»",
    early: "«Кворум є. Здорового глузду не вимагали.»",
    firstAbility: "«Вето накладено зубами.»",
    hurt: "«Окрема думка: нам боляче. Більшістю не прийнято.»"
  },
  "monster.cheese-vault-warden": {
    solo: "«Без серветки до сховку не входять.»",
    party: "«Груповий доступ? Покажіть групову тарілку.»",
    early: "«Сир під охороною. Запах — на волі.»",
    firstAbility: "«Замок клацає, скоринка твердішає.»",
    hurt: "«Це не тріщина. Це вентиляція сиру.»"
  },
  "monster.calendar-hydra": {
    solo: "«Відрубали понеділок? Ось вам два вівторки.»",
    party: "«Ваш гурт записано на наступний ніколи.»",
    early: "«Дедлайн перенесено ближче до вас.»",
    firstAbility: "«Календар тече. Не наступайте на дати.»",
    hurt: "«Одна голова пішла у відпустку без погодження.»"
  },
  "monster.inventory-prophet": {
    solo: "«Я знав, що у вас цього бракує. Ви ще не знаєте чого.»",
    party: "«У групі нестача розподіляється справедливіше.»",
    early: "«Наступний удар уже списано.»",
    firstAbility: "«Пророцтво: рядок зникне разом із вашою перевагою.»",
    hurt: "«Цього ушкодження не було в інвентаризації.»"
  },
  "monster.quiet-catastrophe-clerk": {
    solo: "«Кінець світу зареєстровано. Ви — додаток.»",
    party: "«Колективна катастрофа оформлюється швидше.»",
    early: "«Тихіше. Обвал має бути внутрішнім.»",
    firstAbility: "«Службова записка: всім лягти переконливо.»",
    hurt: "«Катастрофа відкладена через пошкодження писаря.»"
  }
} as const;

export const monsterBarks = Object.entries(monsterBarkTextByMonsterId).flatMap(
  ([monsterId, text]): MonsterBarkDefinition[] => [
    {
      id: buildMonsterBarkId(monsterId, "engage-solo"),
      monsterId,
      trigger: "engage",
      audience: "solo",
      text: text.solo,
      priority: 100,
      eligibleOwnActions: [1, 2],
      mandatoryEarlyCandidate: true
    },
    {
      id: buildMonsterBarkId(monsterId, "engage-party"),
      monsterId,
      trigger: "engage",
      audience: "party",
      text: text.party,
      priority: 100,
      eligibleOwnActions: [1, 2],
      mandatoryEarlyCandidate: true
    },
    {
      id: buildMonsterBarkId(monsterId, "early-turn"),
      monsterId,
      trigger: "early-turn",
      audience: "any",
      text: text.early,
      priority: 90,
      eligibleOwnActions: [1, 2],
      mandatoryEarlyCandidate: true
    },
    {
      id: buildMonsterBarkId(monsterId, "first-ability"),
      monsterId,
      trigger: "first-ability",
      audience: "any",
      text: text.firstAbility,
      priority: 60,
      oncePerFight: true
    },
    {
      id: buildMonsterBarkId(monsterId, "hurt"),
      monsterId,
      trigger: "hp-below",
      audience: "any",
      text: text.hurt,
      priority: 50,
      hpRatioAtOrBelow: 0.45,
      oncePerFight: true
    }
  ]
);

export function findMonsterBark(barkId: string | undefined): MonsterBarkDefinition | null {
  if (!barkId) {
    return null;
  }

  return monsterBarks.find((bark) => bark.id === barkId) ?? null;
}

function buildMonsterBarkId(monsterId: string, suffix: string): string {
  return `bark.${monsterId.replace(/^monster\./, "")}.${suffix}`;
}

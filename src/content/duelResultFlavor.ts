export interface DuelResultFlavorCharacter {
  name: string;
  raceId: string;
  classId: string;
}

export interface DuelResultFlavorSeed {
  outcome: "challenger" | "target" | "draw";
  challengerScore: number;
  targetScore: number;
  swing: number;
  flavorKey: string;
}

interface DuelResultFlavorInput {
  result: DuelResultFlavorSeed;
  winner: DuelResultFlavorCharacter;
  loser: DuelResultFlavorCharacter;
  winnerName: string;
  loserName: string;
}

interface DuelDrawFlavorInput {
  result: DuelResultFlavorSeed;
  challenger: DuelResultFlavorCharacter;
  target: DuelResultFlavorCharacter;
  challengerName: string;
  targetName: string;
}

type DuelFlavorTemplate = (input: DuelResultFlavorInput) => string;
type DuelDrawFlavorTemplate = (input: DuelDrawFlavorInput) => string;
type DuelFlavorRegistry = Record<string, readonly DuelFlavorTemplate[]>;

export const DUEL_UNIVERSAL_FINISHERS = [
  ({ winnerName, loserName }) =>
    `${winnerName} виграє настільки буденно, що ${loserName} просить хоча б драматичніший шрифт у протоколі.`,
  ({ winnerName, loserName }) =>
    `${winnerName} знаходить у сутичці коротший шлях до перемоги. ${loserName} знаходить довший шлях до лавки.`,
  ({ winnerName, loserName }) =>
    `${winnerName} ставить фінальну крапку. ${loserName} ще шукає, де в реченні був початок.`,
  ({ winnerName, loserName }) =>
    `${winnerName} робить вигляд, що все це було тренуванням. ${loserName} робить вигляд, що погоджується.`,
  ({ winnerName, loserName }) =>
    `${winnerName} перемагає з таким виразом, ніби просто закрив вкладку. ${loserName} лишається відкритим питанням.`,
  ({ winnerName, loserName }) =>
    `${winnerName} бере гору без зайвого пафосу. ${loserName} бере паузу й стілець.`,
  ({ winnerName, loserName }) =>
    `${winnerName} завершує двобій раніше, ніж Корчмар знайшов чистий рядок. ${loserName} підписує край серветки.`,
  ({ winnerName, loserName }) =>
    `${winnerName} переконує залу дією. ${loserName} переконує себе, що це була розвідка боєм.`,
  ({ winnerName, loserName }) =>
    `${winnerName} проходить крізь захист без оголошення. ${loserName} питає, чи це взагалі було в меню.`,
  ({ winnerName, loserName }) =>
    `${winnerName} виграє так швидко, що кухоль не встигає охолонути. ${loserName} зате встигає образитись чемно.`,
  ({ winnerName, loserName }) =>
    `${winnerName} лишає в протоколі жирну риску. ${loserName} лишає біля неї дрібне «потім поясню».`,
  ({ winnerName, loserName }) =>
    `${winnerName} знаходить потрібний момент і натискає на нього. ${loserName} шукає кнопку «скасувати момент».`,
  ({ winnerName, loserName }) =>
    `${winnerName} перемагає, а Корчмар киває так, ніби давно це передбачив. ${loserName} підозрює кухоль.`,
  ({ winnerName, loserName }) =>
    `${winnerName} робить фінальний хід із виглядом людини, якій уже несуть вечерю. ${loserName} отримує рахунок за атмосферу.`,
  ({ winnerName, loserName }) =>
    `${winnerName} знімає питання з порядку денного. ${loserName} просить повернути хоча б порядок.`
] satisfies DuelFlavorTemplate[];

export const DUEL_FLAVOR_KEY_FINISHERS: DuelFlavorRegistry = {
  "direct-hit": [
    ({ winnerName, loserName }) =>
      `${winnerName} заходить прямо й переконливо. ${loserName} раптом згадує, що обережність теж була варіянтом.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не ускладнює план: крок, удар, корчемне «о». ${loserName} не встигає подати ремарку.`,
    ({ winnerName, loserName }) =>
      `${winnerName} б’є по суті. ${loserName} намагається з’ясувати, чому суть така тверда.`
  ],
  "clever-trick": [
    ({ winnerName, loserName }) =>
      `${winnerName} продає залу трюк як стратегію. ${loserName} купує неохоче, але вже без решти.`,
    ({ winnerName, loserName }) =>
      `${winnerName} повертає ситуацію боком, і вона раптом стає перемогою. ${loserName} просить інструкцію до боку.`,
    ({ winnerName, loserName }) =>
      `${winnerName} виграє паузою, жестом і дуже підозрілим «ага». ${loserName} підписує протокол олівцем.`
  ],
  "lucky-upset": [
    ({ winnerName, loserName }) =>
      `${winnerName} перемагає там, де статистика вже зняла плащ і пішла спати. ${loserName} вимагає перерахувати удачу.`,
    ({ winnerName, loserName }) =>
      `${winnerName} ловить шанс за комір. ${loserName} ловить думку, що шанс мав бути на іншому боці.`,
    ({ winnerName, loserName }) =>
      `${winnerName} виграє завдяки нахабній удачі й правильному куту стола. ${loserName} перевіряє кут на змову.`
  ],
  "paperwork-stall": [
    ({ winnerName, loserName }) =>
      `${winnerName} зупиняє сутичку папірцем такого вигляду, що ${loserName} на мить визнає силу документа.`,
    ({ winnerName, loserName }) =>
      `${winnerName} ставить печатку на темп бою. ${loserName} програє в черзі до пояснення.`,
    ({ winnerName, loserName }) =>
      `${winnerName} розгортає форму Б-12 «Перемога попередня». ${loserName} не знаходить поля для заперечень.`
  ]
};

export const DUEL_CLASS_FINISHERS: DuelFlavorRegistry = {
  "class.warrior": [
    ({ winnerName, loserName }) =>
      `${winnerName} вирішує питання чесною силою й нечесною впевненістю. ${loserName} визнає принаймні силу.`,
    ({ winnerName, loserName }) =>
      `${winnerName} ставить щит, крок і аргумент в один ряд. ${loserName} читає ряд знизу.`,
    ({ winnerName, loserName }) =>
      `${winnerName} переконує залізом без довгої передмови. ${loserName} усе одно чує передмову в ребрах.`
  ],
  "class.mage": [
    ({ winnerName, loserName }) =>
      `${winnerName} вимовляє склад, після якого у ${loserName} закінчуються контраргументи й брови.`,
    ({ winnerName, loserName }) =>
      `${winnerName} підпалює не правила, а їхнє тлумачення. ${loserName} програє в теплій атмосфері.`,
    ({ winnerName, loserName }) =>
      `${winnerName} показує магію прикладного характеру. ${loserName} просить відкласти прикладність.`
  ],
  "class.bard": [
    ({ winnerName, loserName }) =>
      `${winnerName} бере перемогу на приспіві. ${loserName} шкодує, що слухав до другого куплета.`,
    ({ winnerName, loserName }) =>
      `${winnerName} римує «герць» із «кінець» і робить це погрозою. ${loserName} аплодує з оборони.`,
    ({ winnerName, loserName }) =>
      `${winnerName} виграє харизмою, темпом і непотрібною паузою перед фіналом. ${loserName} провалюється саме в паузу.`
  ],
  "class.rogue": [
    ({ winnerName, loserName }) =>
      `${winnerName} зникає з лінії удару й з’являється в графі «переможець». ${loserName} шукає підпис дрібним шрифтом.`,
    ({ winnerName, loserName }) =>
      `${winnerName} краде момент, але лишає чек. ${loserName} не знає, за що саме платить.`,
    ({ winnerName, loserName }) =>
      `${winnerName} обходить чесний бій так елегантно, що він сам не ображається. ${loserName} ображається за двох.`
  ],
  "class.priest": [
    ({ winnerName, loserName }) =>
      `${winnerName} благословляє порядок речей, і порядок раптом стає на його бік. ${loserName} подає скаргу на порядок.`,
    ({ winnerName, loserName }) =>
      `${winnerName} дивиться так праведно, що ${loserName} програє з почуттям легкої провини.`,
    ({ winnerName, loserName }) =>
      `${winnerName} лікує ситуацію до власної перемоги. ${loserName} потребує повторного огляду гордости.`
  ],
  "class.varenyk-mancer": [
    ({ winnerName, loserName }) =>
      `${winnerName} скручує хід бою, як край вареника. ${loserName} розуміє, що начинка була тактичною.`,
    ({ winnerName, loserName }) =>
      `${winnerName} подає перемогу гарячою. ${loserName} дмухає на поразку й удає, що так смачніше.`,
    ({ winnerName, loserName }) =>
      `${winnerName} керує тістом, темпом і настроєм залу. ${loserName} лишається без виделки плану.`
  ],
  "class.bureaucramancer": [
    ({ winnerName, loserName }) =>
      `${winnerName} оформлює перемогу в трьох примірниках. ${loserName} підписує не читаючи, бо вже пізно.`,
    ({ winnerName, loserName }) =>
      `${winnerName} викликає форму, яка страшніша за удар. ${loserName} програє на пункті «інші обставини».`,
    ({ winnerName, loserName }) =>
      `${winnerName} ставить печатку там, де мала бути кульмінація. ${loserName} поважає процес, але не наслідки.`
  ],
  "class.ranger": [
    ({ winnerName, loserName }) =>
      `${winnerName} знаходить слабке місце, хоч його щойно не було на мапі. ${loserName} підозрює мапу.`,
    ({ winnerName, loserName }) =>
      `${winnerName} читає сліди на підлозі й фінал на обличчі суперника. ${loserName} читає тільки фінал.`,
    ({ winnerName, loserName }) =>
      `${winnerName} заходить із такого флангу, що Корчмар додає його до плану зали. ${loserName} лишається в старій версії.`
  ],
  "class.kharakternyk": [
    ({ winnerName, loserName }) =>
      `${winnerName} дивиться на двобій так, що двобій сам обирає переможця. ${loserName} не встигає домовитись із туманом.`,
    ({ winnerName, loserName }) =>
      `${winnerName} підкручує долю на пів оберта. ${loserName} каже, що так не рахують, але вже рахують.`,
    ({ winnerName, loserName }) =>
      `${winnerName} робить характерницьке «та ну», і ситуація слухняно змінює бік. ${loserName} лишається з попереднім боком.`
  ]
};

export const DUEL_RACE_FINISHERS: DuelFlavorRegistry = {
  "race.human-ish": [
    ({ winnerName, loserName }) =>
      `${winnerName} перемагає по-людиськи: трохи силою, трохи нервами, трохи «якось буде». ${loserName} бачить, що якось уже було.`,
    ({ winnerName, loserName }) =>
      `${winnerName} бере середній шлях і доходить ним першим. ${loserName} лишається на узбіччі роздумів.`,
    ({ winnerName, loserName }) =>
      `${winnerName} робить звичайну річ із незвичайним наслідком. ${loserName} просить повернути звичайність.`
  ],
  "race.dwarf": [
    ({ winnerName, loserName }) =>
      `${winnerName} стоїть твердо, як борг у знайомого. ${loserName} першим визнає відсотки.`,
    ({ winnerName, loserName }) =>
      `${winnerName} виграє з низького центру ваги й високого рівня впертости. ${loserName} перечіпляється об обидва.`,
    ({ winnerName, loserName }) =>
      `${winnerName} тримає лінію так, ніби під нею корисні копалини. ${loserName} відступає без ліцензії.`
  ],
  "race.elf": [
    ({ winnerName, loserName }) =>
      `${winnerName} перемагає красиво й трохи образливо для меблів. ${loserName} програє менш естетично.`,
    ({ winnerName, loserName }) =>
      `${winnerName} робить точний рух із виразом давнього розчарування. ${loserName} стає його причиною.`,
    ({ winnerName, loserName }) =>
      `${winnerName} влучає в момент, тон і самолюбство. ${loserName} просить лишити хоча б тон.`
  ],
  "race.bisyny": [
    ({ winnerName, loserName }) =>
      `${winnerName} додає до перемоги дрібну бісівську правку. ${loserName} помічає її надто пізно.`,
    ({ winnerName, loserName }) =>
      `${winnerName} виграє з усмішкою, яка точно щось редагувала. ${loserName} не знаходить попередню версію себе.`,
    ({ winnerName, loserName }) =>
      `${winnerName} підсуває фінал на пів кроку ближче. ${loserName} чесно наступає в нього.`
  ],
  "race.drantohor": [
    ({ winnerName, loserName }) =>
      `${winnerName} заходить із межі, якої в плані зали не було. ${loserName} програє географії.`,
    ({ winnerName, loserName }) =>
      `${winnerName} губиться рівно настільки, щоб знайти перемогу. ${loserName} лишається на правильній дорозі, але не там.`,
    ({ winnerName, loserName }) =>
      `${winnerName} приносить у двобій чужу карту й місцевий результат. ${loserName} не встигає оформити візу.`
  ],
  "race.domovyk": [
    ({ winnerName, loserName }) =>
      `${winnerName} виграє з кута, який щойно здавався просто кутом. ${loserName} починає поважати домашній простір.`,
    ({ winnerName, loserName }) =>
      `${winnerName} хазяйновито прибирає зайвий спротив. ${loserName} виявляється зайвим спротивом.`,
    ({ winnerName, loserName }) =>
      `${winnerName} знає, де в залі скрипить підлога. ${loserName} дізнається, де скрипить гордість.`
  ],
  "race.dryland-rusalka": [
    ({ winnerName, loserName }) =>
      `${winnerName} приносить у суху залу хвилю драматизму. ${loserName} промокає репутацією.`,
    ({ winnerName, loserName }) =>
      `${winnerName} виграє так, ніби чайник теж був на його боці. ${loserName} перевіряє воду на підпис.`,
    ({ winnerName, loserName }) =>
      `${winnerName} робить сухопутний поворот із водяним ефектом. ${loserName} не взяв рушник для аргументів.`
  ],
  "race.intellectual-orc": [
    ({ winnerName, loserName }) =>
      `${winnerName} перемагає силою, але з бібліографією. ${loserName} програє ще до списку джерел.`,
    ({ winnerName, loserName }) =>
      `${winnerName} формулює удар так грамотно, що ${loserName} соромиться заперечувати.`,
    ({ winnerName, loserName }) =>
      `${winnerName} додає до аргументу плечі. ${loserName} визнає, що аргумент переконливий.`
  ],
  "race.molfar-soul": [
    ({ winnerName, loserName }) =>
      `${winnerName} дістає оберіг, який нібито нічого не робить. ${loserName} програє саме цьому «нібито».`,
    ({ winnerName, loserName }) =>
      `${winnerName} питає туман, і туман відповідає перемогою. ${loserName} не має перекладача з туману.`,
    ({ winnerName, loserName }) =>
      `${winnerName} перемагає тихо, ніби це була прикмета. ${loserName} тепер вірить у прикмети вибірково.`
  ]
};

export const DUEL_LOSER_CLASS_FINISHERS: DuelFlavorRegistry = {
  "class.warrior": [
    ({ winnerName, loserName }) =>
      `${winnerName} знаходить шпарину в бойовій поставі. ${loserName} чесно тримається, але чесність не броня.`,
    ({ winnerName, loserName }) =>
      `${winnerName} перечікує великий замах. ${loserName} програє в моменті, коли залізо ще переконує повітря.`
  ],
  "class.mage": [
    ({ winnerName, loserName }) =>
      `${winnerName} не дає заклинанню дорости до великої літери. ${loserName} лишається з дуже освіченою поразкою.`,
    ({ winnerName, loserName }) =>
      `${winnerName} перебиває формулу саме на небезпечному складі. ${loserName} домовляє його вже подумки.`
  ],
  "class.bard": [
    ({ winnerName, loserName }) =>
      `${winnerName} заходить між куплетами й забирає фінал. ${loserName} уперше шкодує про паузу для оплесків.`,
    ({ winnerName, loserName }) =>
      `${winnerName} витримує приспів і б’є в тишу після нього. ${loserName} називає це поганою акустикою.`
  ],
  "class.rogue": [
    ({ winnerName, loserName }) =>
      `${winnerName} помічає зникнення ще до того, як воно стало корисним. ${loserName} повертається просто в протокол.`,
    ({ winnerName, loserName }) =>
      `${winnerName} лишає приманку на видному місці. ${loserName} бере її професійно й програє професійно.`
  ],
  "class.priest": [
    ({ winnerName, loserName }) =>
      `${winnerName} не сперечається з вірою, тільки з таймінгом. ${loserName} благословляє неправильну секунду.`,
    ({ winnerName, loserName }) =>
      `${winnerName} витримує суворий погляд. ${loserName} мусить визнати, що суворість теж має перерви.`
  ],
  "class.varenyk-mancer": [
    ({ winnerName, loserName }) =>
      `${winnerName} не дає тісту замкнути дугу. ${loserName} лишається з начинкою плану назовні.`,
    ({ winnerName, loserName }) =>
      `${winnerName} б’є до того, як вареникова логіка доходить до кипіння. ${loserName} сердито накриває каструлю.`
  ],
  "class.bureaucramancer": [
    ({ winnerName, loserName }) =>
      `${winnerName} знаходить поле, яке не треба заповнювати. ${loserName} програє від нестачі бюрократичної поверхні.`,
    ({ winnerName, loserName }) =>
      `${winnerName} проходить між печаткою й підписом. ${loserName} обурено шукає додаток до поразки.`
  ],
  "class.ranger": [
    ({ winnerName, loserName }) =>
      `${winnerName} збиває слід саме там, де він мав бути очевидним. ${loserName} читає підлогу й знаходить тільки гордість.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не йде туди, куди його веде пастка. ${loserName} мусить визнати, що пастка мала поганий сервіс.`
  ],
  "class.kharakternyk": [
    ({ winnerName, loserName }) =>
      `${winnerName} не сперечається з туманом, а просто стає не там, де треба. ${loserName} промахується прикметою.`,
    ({ winnerName, loserName }) =>
      `${winnerName} перечікує характерницьке «зараз буде». ${loserName} з’ясовує, що «зараз» уже було.`
  ]
};

export const DUEL_LOSER_RACE_FINISHERS: DuelFlavorRegistry = {
  "race.human-ish": [
    ({ winnerName, loserName }) =>
      `${winnerName} перемагає попри людиське «якось буде» суперника. ${loserName} дізнається, що якось буває по-різному.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не дає середньому шляху стати рятівним. ${loserName} лишається посередині й трохи збоку.`
  ],
  "race.dwarf": [
    ({ winnerName, loserName }) =>
      `${winnerName} не намагається зрушити ${loserName}, а зрушує саму розмову. Гномська впертість не встигає перебудуватись.`,
    ({ winnerName, loserName }) =>
      `${winnerName} б’є не в стійкість, а поруч із нею. ${loserName} стоїть міцно, просто вже не там.`
  ],
  "race.elf": [
    ({ winnerName, loserName }) =>
      `${winnerName} псує красиву траєкторію рівно настільки, щоб ${loserName} образився професійно.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не сперечається з естетикою. ${loserName} програє красиво, що теж трохи дратує.`
  ],
  "race.bisyny": [
    ({ winnerName, loserName }) =>
      `${winnerName} ловить дрібну бісівську правку до того, як вона стає великою. ${loserName} бурчить про редактуру.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не дає ${loserName} підсунути фінал ближче. Фінал сам підходить, але не з того боку.`
  ],
  "race.drantohor": [
    ({ winnerName, loserName }) =>
      `${winnerName} не губиться в чужій карті. ${loserName} губиться достатньо, щоб не знайти перемогу.`,
    ({ winnerName, loserName }) =>
      `${winnerName} перекриває межову стежку табуретом. ${loserName} визнає, що табурет сьогодні має юрисдикцію.`
  ],
  "race.domovyk": [
    ({ winnerName, loserName }) =>
      `${winnerName} не наступає на скрипучу дошку. ${loserName} розуміє, що домашня перевага теж має межі.`,
    ({ winnerName, loserName }) =>
      `${winnerName} тримає руки подалі від підозрілих кутів. ${loserName} лишається в куті з поганою репутацією.`
  ],
  "race.dryland-rusalka": [
    ({ winnerName, loserName }) =>
      `${winnerName} не тоне в драматизмі. ${loserName} мусить програти на суші, що особливо прикро.`,
    ({ winnerName, loserName }) =>
      `${winnerName} висушує паузу перед фіналом. ${loserName} не встигає додати хвилю.`
  ],
  "race.intellectual-orc": [
    ({ winnerName, loserName }) =>
      `${winnerName} відповідає на аргумент раніше, ніж ${loserName} додає список джерел.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не сперечається з тезою, а обходить її разом із плечима. ${loserName} лишається з сильним висновком і слабким рахунком.`
  ],
  "race.molfar-soul": [
    ({ winnerName, loserName }) =>
      `${winnerName} чемно ігнорує оберіг, і це чомусь спрацьовує. ${loserName} перевіряє кишені на кращу прикмету.`,
    ({ winnerName, loserName }) =>
      `${winnerName} не питає туман дозволу. ${loserName} питає, але відповідь приходить після фіналу.`
  ]
};

export const DUEL_DRAW_FINISHERS = [
  ({ challengerName, targetName }) =>
    `${challengerName} і ${targetName} доводять одне одному все й нічого. Корчмар ставить нічию, бо стіл попросив тиші.`,
  ({ challengerName, targetName }) =>
    `${challengerName} і ${targetName} так синхронно помиляються, що це виглядає як техніка. Протокол обережно пише «нічия».`,
  ({ challengerName, targetName }) =>
    `${challengerName} майже перемагає. ${targetName} теж майже. Квестарня любить слово «майже» лише в малих дозах.`,
  ({ challengerName, targetName }) =>
    `${challengerName} лишає аргумент на столі. ${targetName} кладе поруч такий самий. Стіл не бере сторону.`,
  ({ challengerName, targetName }) =>
    `${challengerName} і ${targetName} доходять до фіналу одночасно й обоє питають, хто це погоджував.`,
  ({ challengerName, targetName }) =>
    `${challengerName} не поступається. ${targetName} теж не поступається. Корчмар поступається здоровим глуздом і пише нічию.`,
  ({ challengerName, targetName }) =>
    `${challengerName} і ${targetName} роблять рівно стільки, щоб ніхто не мав права хвалитися першим.`,
  ({ challengerName, targetName }) =>
    `${challengerName} зустрічає ${targetName} у центрі герцю. Центр герцю просить не втягувати його в це.`,
  ({ challengerName, targetName }) =>
    `${challengerName} має план. ${targetName} має контрплан. Корчмар має головний біль і знак рівности.`
] satisfies DuelDrawFlavorTemplate[];

export function pickDuelResultFlavor(input: DuelResultFlavorInput): string {
  const candidates = [
    ...getFlavorKeyFinishers(input.result.flavorKey),
    ...DUEL_UNIVERSAL_FINISHERS,
    ...(DUEL_CLASS_FINISHERS[input.winner.classId] ?? []),
    ...(DUEL_RACE_FINISHERS[input.winner.raceId] ?? []),
    ...(DUEL_LOSER_CLASS_FINISHERS[input.loser.classId] ?? []),
    ...(DUEL_LOSER_RACE_FINISHERS[input.loser.raceId] ?? [])
  ];
  const index = stableIndex(candidates, [
    input.result.flavorKey,
    input.result.outcome,
    input.result.challengerScore,
    input.result.targetScore,
    input.result.swing,
    input.winner.name,
    input.winner.raceId,
    input.winner.classId,
    input.loser.name,
    input.loser.raceId,
    input.loser.classId
  ]);

  const template = candidates[index];

  return template ? template(input) : DUEL_UNIVERSAL_FINISHERS[0]?.(input) ?? "";
}

export function pickDuelDrawFlavor(input: DuelDrawFlavorInput): string {
  const index = stableIndex(DUEL_DRAW_FINISHERS, [
    input.result.flavorKey,
    input.result.challengerScore,
    input.result.targetScore,
    input.result.swing,
    input.challenger.name,
    input.challenger.raceId,
    input.challenger.classId,
    input.target.name,
    input.target.raceId,
    input.target.classId
  ]);

  const template = DUEL_DRAW_FINISHERS[index];

  return template ? template(input) : DUEL_DRAW_FINISHERS[0]?.(input) ?? "";
}

function getFlavorKeyFinishers(flavorKey: string): readonly DuelFlavorTemplate[] {
  return DUEL_FLAVOR_KEY_FINISHERS[flavorKey] ?? [];
}

function stableIndex<T>(items: readonly T[], seedParts: readonly unknown[]): number {
  if (items.length === 0) {
    return 0;
  }

  const seed = seedParts.join("|");
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % items.length;
}

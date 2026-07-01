import type { ItemContent } from "./schema";

export const MONSTER_TROPHY_TARGET_SHARE = 0.23;

export type MonsterTrophyLootEntry = {
  itemId: string;
  weight: number;
  kind: "trophy" | "fallback";
};

export const MONSTER_TROPHY_FALLBACK_ITEM_IDS = [
  "item.monster-pocket-lint",
  "item.monster-field-note-scrap"
] as const;

const MONSTER_TROPHY_FALLBACK_SHARE =
  (1 - MONSTER_TROPHY_TARGET_SHARE) / MONSTER_TROPHY_FALLBACK_ITEM_IDS.length;

function monsterTrophyDrop(trophyItemId: string): readonly MonsterTrophyLootEntry[] {
  return [
    { itemId: trophyItemId, weight: MONSTER_TROPHY_TARGET_SHARE, kind: "trophy" },
    ...MONSTER_TROPHY_FALLBACK_ITEM_IDS.map((itemId) => ({
      itemId,
      weight: MONSTER_TROPHY_FALLBACK_SHARE,
      kind: "fallback" as const
    }))
  ];
}

export const monsterTrophyLoot = {
  "monster.collective-liability-cauldron": monsterTrophyDrop("item.lid-of-shared-blame"),
  "monster.bypass-sheet-fox": monsterTrophyDrop("item.signature-that-led-nowhere"),
  "monster.sourdough-kvas-golem": monsterTrophyDrop("item.crumb-of-stubborn-fermentation"),
  "monster.tender-committee-frog": monsterTrophyDrop("item.quorum-damp-lily-stamp"),
  "monster.safety-intern-chuhaister": monsterTrophyDrop("item.safety-briefing-leaf"),
  "monster.bulk-discount-zlydni": monsterTrophyDrop("item.receipt-of-wholesale-misery"),
  "monster.fourth-grind-rumor-mill": monsterTrophyDrop("item.flour-of-fourth-rumor"),
  "monster.improper-parking-boar": monsterTrophyDrop("item.parking-hoof-warning"),
  "monster.three-correct-roads-blud": monsterTrophyDrop("item.map-pin-of-third-return"),
  "monster.wet-coal-salamander": monsterTrophyDrop("item.coal-that-refused-fire"),
  "monster.service-key-monkey": monsterTrophyDrop("item.key-tag-with-no-door"),
  "monster.hr-pesyholovets": monsterTrophyDrop("item.interview-collar-toothmark"),
  "monster.licensed-shine-magpie": monsterTrophyDrop("item.licensed-shiny-feather"),
  "monster.diet-menu-sausage-basilisk": monsterTrophyDrop("item.menu-stain-of-sausage-gaze"),
  "monster.dry-fountain-vodyanyk": monsterTrophyDrop("item.coin-for-dry-water"),
  "monster.curfew-stove-lion": monsterTrophyDrop("item.ember-of-submitted-roar"),
  "monster.three-instance-duck": monsterTrophyDrop("item.quack-of-returned-complaint"),
  "monster.promo-perelesnyk": monsterTrophyDrop("item.spark-of-small-print"),
  "monster.basement-pipe-stone-catfish": monsterTrophyDrop("item.pipe-scale-of-building-plan"),
  "monster.final-approval-raven": monsterTrophyDrop("item.raven-silence-approval-slip"),
  "monster.quarterly-report-pan-kotsky": monsterTrophyDrop("item.resume-of-pan-kotsky"),
  "monster.small-business-didko": monsterTrophyDrop("item.horn-signed-contract-copy"),
  "monster.deep-estimate-sawfish": monsterTrophyDrop("item.sawdust-of-unexpected-costs"),
  "monster.treasure-ventilation-copper-snake": monsterTrophyDrop("item.cool-copper-scale"),
  "monster.strategic-reserve-potato": monsterTrophyDrop("item.reserve-potato-eye"),
  "monster.forest-loss-aurochs": monsterTrophyDrop("item.horn-marked-loss-tally"),
  "monster.service-path-lisovyk": monsterTrophyDrop("item.path-interview-moss"),
  "monster.siege-iron-varenyk": monsterTrophyDrop("item.armored-dough-rivet"),
  "monster.thirteen-address-dragon-courier": monsterTrophyDrop("item.scorched-delivery-label"),
  "monster.tide-accountant-vodyanyk": monsterTrophyDrop("item.tide-balance-shell"),
  "monster.failed-tender-pea-giant": monsterTrophyDrop("item.pea-of-unwon-tender"),
  "monster.archive-ventilation-dragon": monsterTrophyDrop("item.dusty-draft-scale"),
  "monster.seven-draft-chuhaister": monsterTrophyDrop("item.seventh-draft-door-chip"),
  "monster.seasonal-defense-pumpkin-hetman": monsterTrophyDrop("item.pumpkin-command-seed"),
  "monster.second-copy-ghost": monsterTrophyDrop("item.pencil-signed-second-copy"),
  "monster.six-hour-meeting-viy": monsterTrophyDrop("item.agenda-eyelid-weight"),
  "monster.state-sluice-beaver": monsterTrophyDrop("item.dam-permit-splinter"),
  "monster.cash-gap-upyr": monsterTrophyDrop("item.liquidity-drop-in-vial"),
  "monster.late-vacation-mavka": monsterTrophyDrop("item.leave-request-fern"),
  "monster.third-reheat-kulish-phoenix": monsterTrophyDrop("item.third-reheat-crust"),
  "monster.night-reservation-mara": monsterTrophyDrop("item.booking-shadow-stub"),
  "monster.storage-silence-reed-king": monsterTrophyDrop("item.reed-of-official-hush"),
  "monster.false-note-bandura-griffin": monsterTrophyDrop("item.false-note-feather"),
  "monster.last-shift-vovkulaka": monsterTrophyDrop("item.timesheet-claw-mark"),
  "monster.mountain-leasing-aridnyk": monsterTrophyDrop("item.pebble-of-growing-interest"),
  "monster.customs-three-whisker-carp": monsterTrophyDrop("item.declared-third-whisker"),
  "monster.hr-intern-necromancer": monsterTrophyDrop("item.rehiring-bone-paperclip"),
  "monster.cold-storage-state-mammoth": monsterTrophyDrop("item.frosted-inventory-tag"),
  "monster.excise-honey-giant-bee": monsterTrophyDrop("item.excise-honey-drop"),
  "monster.overtime-heat-poludnytsia": monsterTrophyDrop("item.overtime-sun-splinter"),
  "monster.spoon-mobilization-iron-raven": monsterTrophyDrop("item.mobilized-spoon-feather"),
  "monster.fire-safety-three-headed-serpent": monsterTrophyDrop("item.three-headed-safety-form"),
  "monster.last-will-dead-auditor": monsterTrophyDrop("item.inheritance-audit-seal"),
  "monster.underground-sea-acceptance-whale": monsterTrophyDrop("item.acceptance-act-barnacle"),
  "monster.collateral-grey-bear": monsterTrophyDrop("item.collateral-fur-receipt"),
  "monster.empty-chamber-lady": monsterTrophyDrop("item.keyhole-of-empty-room"),
  "monster.fair-tax-honey-leviathan": monsterTrophyDrop("item.fair-tax-honey-spoon"),
  "monster.siege-song-stone-skylark": monsterTrophyDrop("item.heavy-siege-note"),
  "monster.written-off-assets-black-booker": monsterTrophyDrop("item.asset-writeoff-ink"),
  "monster.last-route-star-boar": monsterTrophyDrop("item.star-route-bristle"),
  "monster.queue-dragon-prince": monsterTrophyDrop("item.last-place-queue-scale"),
  "monster.expired-archive-upyr-king": monsterTrophyDrop("item.expired-royal-archive-stamp")
} as const;

export const monsterTrophyItemAdditions = [
  {
    id: "item.monster-pocket-lint",
    name: "Кишеньковий пух після сутички",
    description: "Не трофей, а доказ, що бій був досить близько до кишені.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.monster-field-note-scrap",
    name: "Клаптик польової нотатки",
    description: "На ньому написано «можливо, трофей був поруч», але чорнило вчасно злякалося.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.lid-of-shared-blame",
    name: "Кришка спільної відповідальности",
    description: "Накриває проблему так щільно, що винним стає найближчий стілець.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.signature-that-led-nowhere",
    name: "Підпис, що нікуди не привів",
    description: "Усі погодили, що він важливий. Навіщо — лис забрав із собою.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.crumb-of-stubborn-fermentation",
    name: "Крихта впертої закваски",
    description: "Бродить навіть у торбі й вимагає називати це розвитком характеру.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.quorum-damp-lily-stamp",
    name: "Волога печатка кворуму",
    description: "Квакає тільки тоді, коли справу вже можна було вирішити мовчки.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.safety-briefing-leaf",
    name: "Листок інструктажу з безпеки",
    description: "Попереджає про небезпеку так старанно, що сам шелестить тривожно.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.receipt-of-wholesale-misery",
    name: "Чек гуртових злиднів",
    description: "Дрібна біда, оформлена партією. Знижка теж плаче.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.flour-of-fourth-rumor",
    name: "Борошно четвертої чутки",
    description: "Якщо вдихнути, почуєте «кажуть» і одразу пожалкуєте.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.parking-hoof-warning",
    name: "Копитне попередження за паркування",
    description: "Видане вепром, який стояв поперек коридору з великою впевненістю.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.map-pin-of-third-return",
    name: "Шпилька третього повернення",
    description: "Позначає шлях назад так переконливо, що вперед стає підозрілим.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.coal-that-refused-fire",
    name: "Вуглина, що відмовила вогню",
    description: "Мокра з принципу. Саламандра називала це позицією.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.key-tag-with-no-door",
    name: "Бирка ключа без дверей",
    description: "Дзвенить службово й уникає будь-яких конкретних замків.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.interview-collar-toothmark",
    name: "Слід зубів на співбесідному комірі",
    description: "Питає про сильні сторони, а сам уже тримає слабке місце.",
    rarity: "common",
    slot: "cosmetic",
    goldValue: 4
  },
  {
    id: "item.licensed-shiny-feather",
    name: "Ліцензована блискуча пірʼїна",
    description: "Має сертифікат на сяйво. Сертифікат написаний дрібним карканням.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.menu-stain-of-sausage-gaze",
    name: "Пляма ковбасного погляду",
    description: "На меню її вже нема, але кухар досі поводиться дієтично.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.coin-for-dry-water",
    name: "Монетка за суху воду",
    description: "Оплачено послугу, якої не було. Водяник називав це досвідом.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.ember-of-submitted-roar",
    name: "Жаринка поданого рику",
    description: "Рев уже погоджено, але жаринка все ще чекає на відбій.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.quack-of-returned-complaint",
    name: "Кря поверненої скарги",
    description: "Звучить коротко, зате повертає справу на попередній стіл.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.spark-of-small-print",
    name: "Іскра дрібного шрифту",
    description: "Горить саме там, де мало бути чесне пояснення акції.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.pipe-scale-of-building-plan",
    name: "Луска з плану водогону",
    description: "Офіційно труба. Неофіційно сом залишив там своє резюме.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.raven-silence-approval-slip",
    name: "Мовчазний дозвіл ворона",
    description: "Погоджено без «кар». Саме тому всі трохи нервують.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.resume-of-pan-kotsky",
    name: "Резюме Пана Коцького",
    description: "Досвід: усі боялися. Рекомендації: ніхто не перевіряв.",
    rarity: "common",
    slot: "cosmetic",
    goldValue: 4
  },
  {
    id: "item.horn-signed-contract-copy",
    name: "Копія договору, підписана рогом",
    description: "Дідько загубив оригінал так чесно, що копія майже пишається.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.sawdust-of-unexpected-costs",
    name: "Тирса непередбачених витрат",
    description: "Кожна порошинка була в кошторисі. Принаймні тепер так каже.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.cool-copper-scale",
    name: "Мідна луска фінансової прохолоди",
    description: "Шипить так тихо, ніби скарб провітрюється з власної волі.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.reserve-potato-eye",
    name: "Вічко резервної бараболі",
    description: "Дивиться на чорний день і питає, чи він уже достатньо чорний.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.horn-marked-loss-tally",
    name: "Рогова риска лісових збитків",
    description: "Методика проста: якщо дерево сперечається, тур додає ще риску.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.path-interview-moss",
    name: "Мох співбесіди на стежку",
    description: "Знає короткий шлях, але спершу питає про ваші слабкі сторони.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.armored-dough-rivet",
    name: "Заклепка броньованого тіста",
    description: "Тримає начинку в таємниці й дивиться на сметану як на постачання.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.scorched-delivery-label",
    name: "Підпалена доставна наліпка",
    description: "Адреса майже правильна. Вогонь не любить слово «майже».",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.tide-balance-shell",
    name: "Мушля балансу припливів",
    description: "Всередині шумить море й тихо бракує одного берега.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.pea-of-unwon-tender",
    name: "Горошина невиграного тендеру",
    description: "Мала, зате з технічним завданням на кожен майбутній крок.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.dusty-draft-scale",
    name: "Луска архівного протягу",
    description: "Пил здуто так потужно, що стара справа знову кашлянула.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.seventh-draft-door-chip",
    name: "Скол дверей сьомого протягу",
    description: "Шурхотить так, ніби двері теж хотіли танцювати, але їх не питали.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.pumpkin-command-seed",
    name: "Насінина сезонного наказу",
    description: "Командує грядкою пошепки й планує стратегічне пюре.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.pencil-signed-second-copy",
    name: "Другий примірник, підписаний олівцем",
    description: "Привид наполіг: якщо копія прийшла сама, їй теж потрібна повага.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.agenda-eyelid-weight",
    name: "Тягарець повіки з порядку денного",
    description: "Сорок два пункти стислися в одну дуже сонну небезпеку.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.dam-permit-splinter",
    name: "Скіпка дозволеної дамби",
    description: "Бобер погодив перегородку, але вода досі не підписала обхід.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.liquidity-drop-in-vial",
    name: "Крапля ліквідности у склянці",
    description: "Не кров, але торба однаково здригнулася.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.leave-request-fern",
    name: "Папороть заяви на відпустку",
    description: "Кличе в ліс відпочити й не відповідає на питання про повернення.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.third-reheat-crust",
    name: "Скоринка третього підігріву",
    description: "Фенікс казав, що це відродження. Кухар казав: «ще нормальний».",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.booking-shadow-stub",
    name: "Корінець нічного бронювання",
    description: "Усі місця зайняті. Навіть ті, яких у світлиці немає.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.reed-of-official-hush",
    name: "Очерет офіційної тиші",
    description: "Шурхіт засекречено. Очерет просить говорити тихіше про це.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.false-note-feather",
    name: "Пірʼїна фальшивої ноти",
    description: "Охороняє тональність так суворо, що сама трохи фальшивить.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.timesheet-claw-mark",
    name: "Кігтьова риска в табелі",
    description: "Пояснює відсутність колег краще, ніж будь-яка службова записка.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.pebble-of-growing-interest",
    name: "Камінець відсотка, що росте",
    description: "Малий, але вже пропонує гору в розстрочку.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.declared-third-whisker",
    name: "Задекларований третій вус",
    description: "Короп наполягав, що без нього митниця не повірить у став.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.rehiring-bone-paperclip",
    name: "Кістяна скріпка повторного найму",
    description: "Тримає працівника в штаті навіть після дуже переконливого фіналу.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.frosted-inventory-tag",
    name: "Іній на складській бирці",
    description: "Мамонта вже не видно, зате облік змерз професійно.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.excise-honey-drop",
    name: "Крапля акцизного меду",
    description: "Солодка, липка й упевнена, що збір можна приймати натурою.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.overtime-sun-splinter",
    name: "Скіпка понаднормового сонця",
    description: "Пече тільки тих, хто не погодив капелюх із графіком.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.mobilized-spoon-feather",
    name: "Пірʼїна мобілізованої ложки",
    description: "Залізна, дзвінка й переконана, що прибори мають летіти строєм.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.three-headed-safety-form",
    name: "Акт триголової пожежної безпеки",
    description: "Одна графа горить, друга гасить, третя просить підпис.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.inheritance-audit-seal",
    name: "Печатка ревізії спадку",
    description: "Ставить питання так ретельно, що заповіт починає нервувати.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.acceptance-act-barnacle",
    name: "Мушля з акта приймання",
    description: "Кит не помістився в папір, тому папір прилип до кита.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.collateral-fur-receipt",
    name: "Квитанція заставної шерсти",
    description: "Усе, на що впала ця шерстинка, тепер виглядає забезпеченим.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.keyhole-of-empty-room",
    name: "Замкова шпарина порожньої світлиці",
    description: "Дверей немає, але погляд крізь неї усе одно почувається зайвим.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.fair-tax-honey-spoon",
    name: "Ложка ярмаркового медозбору",
    description: "Розміром майже з човен. Левіятан називав це дрібною тарою.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.heavy-siege-note",
    name: "Важка нота облогової пісні",
    description: "Падає на укріплення так чемно, ніби це музична освіта.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.asset-writeoff-ink",
    name: "Чорнило списаного майна",
    description: "Зникає з балансу й повертається плямою з дуже впевненим виглядом.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.star-route-bristle",
    name: "Щетина зоряного маршруту",
    description: "Указує дорогу небом, а потім біжить просто через вас.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.last-place-queue-scale",
    name: "Луска останнього місця в черзі",
    description: "Князь охороняв її так гордо, ніби там видавали саму терплячість.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  },
  {
    id: "item.expired-royal-archive-stamp",
    name: "Королівський штамп простроченого архіву",
    description: "Прокинувся пізно, але одразу попросив довідку за минулий квартал.",
    rarity: "common",
    slot: "junk",
    goldValue: 4
  }
] satisfies ItemContent[];

# Balance Notes

## Балансова мета MVP
MVP має бути веселим, не ідеально збалансованим. Але він не має ламатися від першого power user.

Цілі:
- Бій на рівному рівні триває 2–5 ходів.
- Гравець перемагає звичайного монстра у 75–90% випадків.
- Поразка не карає жорстко.
- Level-up 1–5 швидкий, 6–13 помітно повільніший.
- Рідкісний лут приємний, але не обов’язковий для прогресу.

`0.1.0` закриває Phase 1 як playable first loop, не як фінальний баланс. Поточна крива 1-13, persistent HP/мана, loot replay, Mantok Chest, Манчкін-скупник і перший `/remort` достатні для playtest-у, але числові пороги, win-rate, reward pacing, item pressure і prestige pacing мають лишатися предметом окремих `0.1.x` balance PR після реального smoke/playtest fallout.

Phase 2 додає соціяльний бій та взаємодії до фінального балансу, тому перші runtime-slices мають покладатися на caps, audit rows and replay-safe results, not perfect formulas. Canonical notes: [phase2/UNSTABLE_BALANCE_PRINCIPLES.md](../phase2/UNSTABLE_BALANCE_PRINCIPLES.md).

## Стати MVP
- STR — фізична шкода.
- DEX — ухилення/крит.
- INT — магія/mana.
- CHA — bard/соціяльні ефекти, rewards у квестах.
- LUCK — loot/crit/escape small modifiers.

## Базові формули

### HP
```text
hp_max = 20 + level * 5 + vitality_bonus + class_hp_bonus
```

Якщо немає VIT як окремого стату, class/race дають flat бонус.

### Physical damage
```text
damage = weapon_base + floor(STR * 0.7) + level_bonus - target_armor
minimum_damage = 1
```

### Spell damage
```text
spell_damage = spell_base + floor(INT * 0.9) + level_bonus - target_resist
```

### Бойові варіянти й мана
`0.1.21` починає переносити бій із однієї кнопки `Вдарити` до typed бойових варіянтів:
- `physical`: сила/спритність/зброя, без витрати мани.
- `guard`: захист поточного раунду без прямої шкоди як основного плану.
- `spell`: розум/рівень/магічний focus, мала витрата мани.
- `social` або `trick`: харизма, спритність чи вдача, менша пряма шкода, але debuff/control/reward flavor.
- `class-special`: класова дія з власним cooldown або resource cost, якщо вона сильніша за базову атаку.

Магічні й містичні дії мають показувати витрату в UI, наприклад `🔮 -2 мани`, і не зʼїдати ману, якщо reward callback уже зарахований, дія стала stale, бракує мани або вміння ще на cooldown. У таких випадках action attempt є no-op: без витрати ресурсу, без ходу ворога, без cooldown tick і без RNG advancement.

Race/class/combo modifiers мають бути малими й симульованими. Вони можуть змінювати odds, damage band, crit flavor або доступну назву дії, але не мають робити мага без мани безпорадним чи воїна без spell-кнопки нудним.

Foundation cooldown rule in `0.1.21`: existing class skills use ability-keyed cooldowns and become available after one subsequent own committed action. This replaces the older hidden non-mana `3..5` turn roll for current class actions. Longer milestone abilities should be introduced explicitly by future content, not by restoring a hidden random cooldown.

Monster context rule in `0.1.21`: persistent solo fights freeze a Kyiv-local context snapshot at combat start and may apply up to two small authored monster traits. The modifiers are capped texture for the fight itself; they must not alter XP, gold, loot, Yeger progress, encounter eligibility, authored monster level or replayed rewards. Starter encounters may use context as flavor-only by setting mechanical scale to zero.

Equipment effects для атак мають заходити через один effective-stats/equipment helper:
- weapon впливає на physical base або spell focus, якщо це явно магічна зброя;
- armor впливає на виживання, але не має безкоштовно піднімати шкоду;
- accessory може давати малий situational modifier, resource discount або extra flavor hook;
- priceless/trophy items не дають бойових бонусів, доки контент явно не переведений у equippable/effect item.

`0.2.26` fills the authored Mantok equipment-slot catalog without changing reward sources or combat formulas. The coverage pack ships `101` modest effect-bearing manatky with exact slot counts `18/16/14/12/12/15/14` across `weapon`, `offhand`, `head`, `chest`, `legs`, `accessory` and `tool`, keeps slot spread to `6`, and adds two restricted items per current class, active race and Loot Expansion title/path bucket. Class/race/title gates are equip-time checks, while generated Loot Expansion v1 slot/hand metadata is still materialized from adapter heuristics instead of editing the generated source pack. Detailed counts and risk notes live in [balance/mantok-equipment-slot-coverage.md](./mantok-equipment-slot-coverage.md).

`0.2.28` Mantok set synergies add 13 authored set families as a stat-only foundation. Active thresholds are computed from equipped item ids and enter the existing equipment/effective-stats helper as synthetic contributions, so no combat callback, status, service perk or borrowed class/race ability ships in this slice. Partial bonuses stay tiny, full-set bonuses stay modest because the pieces already have their own effects, and set drops are rare additive extras on current level `9..13` monsters without replacing base, trophy/fallback or Mantok coverage loot. Detailed notes live in [balance/mantok-set-synergies-foundation.md](./mantok-set-synergies-foundation.md).

`0.2.29` Mantok ability grants turn selected epic/soulbound level `9..13` manatky into explicit gear actions rather than hidden power. Gear actions use `source: equipment`, consume the normal committed action in persistent PvE, Big Barrel/party-boss rounds and turn-based duels, spend mana/cooldowns replay-safely and do not mirror native class/race cooldown identity. Quick duels remain instant and do not expose gear actions. Borrowed actions are weaker than native abilities, bleed is tiny refresh-only visible chip damage, and status-terminal kills suppress the extra monster response only when the status itself lands the final damage. The Yeger cloak remains a documented ordinary-bandage service marker only, with no dense-bandage, field-kit or Yeger-board runtime unlock. Detailed notes live in [balance/mantok-ability-grants-foundation.md](./mantok-ability-grants-foundation.md).

`0.3.0` Charkokovalnia item upgrades add a bounded resource sink for selected equipment manatky from the Korchma yard Mage surface. Access starts at level `5+`, or remorted level `3+`, then consumes one `Польова аптечка` for a bounded dynamic XP unlock. Authored upgrade variants use concrete ids from `base.plus-1` through `base.plus-5`; generated Loot Expansion `-plus-N` ids remain possible drops but their weights are now a very rare tail of the generated loot pool. Costs spend gold or mana plus `Іскрокамінь`, chance uses capped luck/pity/donor bonuses, previews stay qualitative before commit, and stale direct attempts reject before spend when the stack, level or pity snapshot has changed. Successful upgrades move exactly one stack unit to the next concrete id and align equipped rows; failed attempts spend and increment pity once. This is not an item-instance rewrite, market, paid power path, broad crafting economy or combat-action change.

`0.0.21` persistent solo `/fight` використовує бойовий рушій у runtime. У цьому slice він навмисно не видавав XP, золото або лут, щоб перевірити session correctness, stale callbacks, mana failure і terminal states без нового economy source. `0.0.22` додає перші малі equipment stat effects через один helper, а `0.0.23` додає малий reward/loot path для won persistent fights.

`0.2.4` keeps one-use healing deliberately small: `Бинт відповідальної паніки` restores a capped fixed HP amount, consumes exactly one item on confirmed use and cannot be used at full HP. In persistent PvE combat it costs the current turn and lets monsters respond, so the heal is a survival tradeoff rather than free throughput. Єгер supply is a narrow gold sink / class-flavor perk, not a broad shop or free power faucet; ranger's advantage is convenience around the same low-power item. Monster-side bandage acquisition uses existing loot/drop mechanics and one authored low-level loot entry rather than a new high-volume reward formula.

`0.2.5` Bard Performance is a tiny social faucet only in Shynok and otherwise a voluntary same-location social action, not a progression engine. A level 3+ Bard can start solo in Shynok, or outside Shynok only with another active same-location character, then rolls one frozen result from `2 * effective CHA + effective LUCK + level + bounded RNG[-6,+6]`; Shynok grades pay house gold `1/3/5/13`, clipped by a per-Bard Kyiv-day cap of `23`, while non-Shynok performances pay `0` house gold. The cooldown is `93` minutes per location and the audience response window is `13` minutes. Voluntary tips of `1/3/5/13` gold move existing player gold only after explicit audience choice and never count toward the house cap. This slice grants no XP, items, buffs, achievements, quest progress or combat advantage.

`0.2.6` Passage Search is a tiny optional side roll, not a primary XP path. Each node has a `13` minute start cooldown; `Спуск до Низу` and `Ярус I: Сутерени Корчми` use `23` second safe searches, while passage cards use a `42` second risky search tied to the frozen passage monster preview. During the short monster-rest window, including the same-passage 3-minute rest after defeating a pending passage monster, a passage can instead start a safe 42-second search with no encounter token and a small passage-tier floor (`left > straight > right`). Search grants no XP, quest progress, buffs, titles or hidden odds preview. Safe location searches find at most tiny gold or one low-power bandage chance; passage searches scale only small gold/bandage odds by passage tier and LUCK. Danger on a risky passage replaces the reward with the stored monster attack, so risk never pays and attacks on the same completion.

`0.2.13` Postal Manatka Delivery is a convenience gold sink, not a player-to-player gold transfer or market price. A package accepts only `1..5` distinct eligible stack types and `1..93` units per type. The delivery fee is charged from the sender at confirmation/send time using the tested formula `5 + selected type count`; if the sender lacks that gold, no package is sent and no item moves. Confirmed items move into postal custody until recipient acceptance, sender cancellation, decline or expiry. Manual postal selection may include owned non-equipped non-reserved stacks that stricter automatic sinks or Safe Gifting skip, including one-use bandages.

`0.2.7` Player Abilities keeps class/race power bounded inside existing combat action surfaces. Race abilities are identity buttons with modest damage or small hero-only support fallback; they use their own cooldowns and should not outpace class skills. Refreshed class AoE skills trade lower per-target damage for hitting every living enemy once, while support-ready ally scopes degrade to the acting hero until party runtime exists. Persistent PvE, training doppelganger player turns and turn-based duel turns use the same current class/race action catalog; quick duel remains its instant formula. Ability costs currently stay in `0..5` mana and `1..4` own-action cooldowns; broader balance tuning should use simulator/playtest results rather than hidden per-class exceptions. Race/class abilities do not alter rewards, Yeger progress, loot, monster selection, quick-duel scoring, remort math or economy.

`0.2.11` is a proof balance pass after player abilities, not a final formula lock. Baseline same-level aggressive simulations over levels `3..13` showed the generic monster stat curve overtaking character growth after level 5: the human-ish sweep fell from roughly `84.6%/88.6%/74.3%` wins at levels 3-5 to about `44.2%` at level 6, then down to single digits by levels 9-13. The fix bounded generic monster HP, attack, armor/resist and dexterity growth after the early ladder while preserving tag bonuses, then tightened a few class ability outliers: Warrior, Bureaucramancer, Rogue, Ranger and Priest constants are now pinned in tests, with Priest keeping a small direct-damage component.

Validation commands used:
- `npm.cmd run simulate:combat -- --levels 3-13 --monster-levels same --runs 100 --classes all --race race.human-ish --policy aggressive --seed 0.2.11-final-humanish-aggressive`
- Inline `runCombatSimulation` aggregate over all active races, levels `3..13`, same-level monsters, `30` runs per matchup, aggressive policy, seed prefix `0.2.11-final-race-sweep`.

Final aggregate signal: the 100-run human-ish sweep finished at `84.2%` overall wins and `5.7` average turns, with level aggregates from `74.1%` to `93.9%`; the all-active-race compact sweep finished at `80.3%` overall wins and `6.1` average turns. Known hard authored outliers remain intentionally visible for future content-specific tuning, especially `monster.zero-declaration-tax-dragon`, `monster.siege-iron-varenyk`, and softer race/class pairings such as `race.bisyny` or `race.molfar-soul` support/control builds. Rewards, loot, XP/gold, Yeger/Shynok/gifting/remort/equipment/title-power semantics and schema remain unchanged.

`0.2.12` adds a two-enemy threat simulation mode and small pressure guards instead of a broad rebalance. `simulate:combat` can run `--encounter two-enemy-threat`, sweep `--races all`, apply `--threat-bonus N`, model remort memory with `--remort N`, and report aggregate level/class/race rows while counting every stored per-enemy action. Production backup threat enemies skip alternating response turns while both enemies live and receive level-scaled backup response mitigation; after the `0.2.25` follow-up they keep full level-derived HP, and the remaining single enemy acts normally after its partner dies. Final human-ish same-level sweeps over levels `3..13`, all classes and `30` runs per matchup landed at `85.9%` wins for one-enemy fights and `48.1%` wins for two-enemy threat fights, with the latter intentionally dangerous but no longer near-zero. The compact all-active-race two-enemy sweep still exposes weak bands, and targeted probes moved `monster.zero-declaration-tax-dragon` to roughly `73.1%` and `monster.siege-iron-varenyk` to roughly `78.0%` wins in focused same-level matrices. A follow-up `monster.inventory-prophet` level 12 probe with five remorts showed `100.0%` one-enemy wins and `99.8%` two-enemy threat wins across active race/class rows, with the worst support/control rows remaining long rather than blocked. Tuning touched only authored pressure points: tax dragon controller/tiny-boss weighting and standard-band actions, siege varenyk shield/counter/tag pressure, and small Bisyny/Molfar Soul guardrails. Rewards, loot, XP/gold, threat history, Yeger/Shynok/gifting/remort/equipment/title-power semantics and schema remain unchanged.

`0.2.31` adds a narrow remort-aware monster pressure guard for persistent PvE after the third remort. One-enemy fights, including Yeger contracts, derive combat stats from a higher internal stat level plus tiny HP/attack pressure while keeping the displayed encounter level unchanged; two-enemy threat fights keep the primary monster authored and put capped HP/attack pressure only on the backup enemy. Active solo fight cards explain the pressure as `Відплата за минулі пригоди` for Yeger sources and `Відлуння минулих пригод` elsewhere, while existing two-enemy cards keep the ordinary `Натиск Низу` language. A compact all-active-race, level `13`, same-level monster sweep with `30` runs per matchup landed at `68.3%`/`54.1%`/`63.7%` wins for one-enemy fights at remorts `5`/`7`/`9`, and `50.0%`/`50.8%`/`56.5%` for two-enemy threat fights at the same remort counts. Rewards, loot/drop odds, Yeger progress, authored monster level, remort XP math, item economy and schema remain unchanged.

`0.2.32` keeps the same pressure formula but applies it to Yeger contracts one remort earlier, so remort `3` hunt monsters no longer stay at base stats. Rewards, loot/drop odds, Yeger progress, authored monster level, remort XP math, item economy and schema remain unchanged.

### Hit chance
MVP можна почати без промахів у звичайній атаці або з дуже простим шансом:

```text
hit_chance = clamp(0.85 + (attacker.DEX - defender.DEX) * 0.01, 0.70, 0.95)
```

### Crit chance
```text
crit_chance = clamp(0.05 + DEX * 0.003 + LUCK * 0.002, 0.05, 0.25)
crit_multiplier = 1.5
```

### Escape chance
```text
escape_chance = clamp(0.45 + (DEX + LUCK - monster_level * 2) * 0.01, 0.25, 0.80)
```

## XP curve
Поточний alpha helper має єдину progression-логіку 1-13, яку використовують rewards, combat-facing summary, hero profile і тести. Робоча alpha-крива:

```text
level 1: 0 total XP
level 2: 10
level 3: 25
level 4: 45
level 5: 70
level 6: 110
level 7: 160
level 8: 225
level 9: 305
level 10: 450
level 11: 650
level 12: 900
level 13: 1300
```

Після 9 рівня крива навмисно стає крутішою: 10-13 мають відчуватися як довший alpha-climb, а не як ще чотири швидкі сходинки. Це не фінальний баланс. Якщо combat simulations покажуть надто швидкий або повільний темп, коригувати в окремому balance PR, а не ховати нові thresholds у feature PR.

Після реморту другий прохід до 13 рівня не має бути таким самим швидким, як перший. Орієнтир із MUD-досвіду: кожне нове життя може піднімати XP-планку за рівень; у Квестарні flat `+200 XP` за рівень було б забагато, тому `0.1.2` використовує просту пропорційну добавку до total XP: `ceil(base_threshold * (1 + 0.23 * remort_count))`. Для першого реморту це дає `1599 total XP` до 13 рівня. Це runtime-правило першого prestige slice, а не фінальний баланс.

## Вага рівня
Рівень має бути одним із головних важелів, бо Квестарня також про приємний ріст циферок. Якщо персонаж отримав новий рівень, це має відчуватися не тільки в `/hero`, а й у формулах.

`0.1.16` залишає той самий бюджет stat points (`level - 1`), але замість одного primary-stat тунелю розподіляє їх deterministic weighted allocator-ом. Class profile лишається головним bias-ом, race stat bonus і hidden path fixed bonus тільки зміщують розподіл; вони не додають extra level points. HP росте на `+4`, мана на `+2` за gained level.

Наступний балансний прохід має перевірити:
- HP і мана ростуть достатньо помітно, щоб рівень здавався справжнім посиленням.
- Бій використовує рівень як окремий коефіцієнт у шкоді, виживанні, доступних діях або порогах монстрів.
- Події й пригоди можуть мати перевірки, варіанти відповіді, обмеження доступу або малі бонуси, залежні від рівня, але без глухої стіни для новачків там, де це не потрібно.
- Рівень не має повністю перекривати расовий і класовий колорит: циферки ростуть, але персонаж усе ще має відрізнятися не лише номером.

Фаза доби може бути окремим балансним важелем. Ніч має підсилювати не всіх, а лише ворогів із відповідними тегами: `night`, `dark`, `underground`, `undead` або подібними. Ранок, день і вечір теж можуть мати дрібні, читабельні модифікатори для своїх типів сцен. Почати краще з невеликих bonus bands, наприклад HP/attack/trait potency, і прогнати combat simulations окремо для `morning`, `day`, `evening`, `night`, щоб нічні вороги були страшнішими, але не ламали 75-90% win-rate для звичайних боїв.

Рівневі рейтинги мають підсилювати відчуття росту, але не тиснути на гравця нескінченною гонитвою. Показувати останні досягнення й важливі віхи, особливо 13 рівень у поточній альфі, краще за сирий список усіх XP. Рейтинг має бути приводом сказати «о, хтось доріс», а не таблицею сорому для тих, хто зайшов випити чаю.

Рівні `14-23` планувати як епічний діапазон із новими важелями, а не лише більшими числами. За прикладом Munchkin, раси й класи можуть відкривати додаткові абілки на milestone-рівнях: другий класовий трюк, расову витівку, тимчасовий bypass для манаток, бонус до конкретного типу подій або кумедний недолік, який іноді стає перевагою. Балансне правило: milestone має бути помітним у грі й тексті, але не робити одну расу/клас обов’язковим вибором.

`0.2.3` ordinary threat pressure не відкриває рівні понад поточну стелю `23`. Кожна поспіль виграна escalated two-enemy пара просить ще `+2` effective levels тільки для другого ворога, але applied рівень дорівнює `min(23, normalEffectiveSecondLevel + requestedBonus)`. У state треба зберігати requested і applied значення окремо, щоб баланс-репорти бачили, де тиск уже вперся в стелю. Це не reward multiplier: вся escalated пара лишається одним encounter settlement.

Same-turn final response не має ставати прихованим defensive comeback. Ворог, якого геройська attack/class-skill дія зводить до `0 HP`, може встигнути один раз відповісти offensive/basic дією, але не може після lethal hit лікуватися, ставити щит, чистити ефекти, сапортити або відновлювати себе. Взаємне `0 HP` проти final enemy рахується перемогою героя; `0 HP` героя за наявности іншого живого ворога — поразка.

Якщо multi-enemy persistent fight програно після знешкодження хоча б одного ворога, спроба дає partial XP: `ceil(0.5 * normal XP)` за кожного знешкодженого ворога, мінімум `1 XP` загалом. Gold, item drops, problem-chain/Yeger progress і ordinary threat win progress не видаються, бо encounter програно.

## Authored quest-resolution checks

`0.1.20` replaces the active Adventure Choice `safe/flair/risky` ladder with authored scene/race/class/signature methods. Quest-resolution checks use the canonical effective stat snapshot, deterministic character/period/scene/method seeding, bounded qualitative chance bands and four grades: `strong-success`, `success`, `mixed-success`, `complication`. Player-facing pre-commit copy stays qualitative: no exact percentages and no exact future rewards.

Reward profiles remain conservative (`modest`, `standard`, `generous`) and consequences vary by authored method: full reward, reduced reward, XP-only, cosmetic mess, paid success or persistent-fight handoff. Small paid methods may cost visible `1..3` gold and must check affordability before claim; `daily_actions.spent_gold` and `result_json` record the chosen method, grade, consequence, cost and check at claim time. Paid adventure/cellar claims debit gold only inside guarded repository transactions, so insufficient gold, stale method ids and duplicate callbacks do not leave partial claims or second charges.

Level 3+ authored Adventure Choice rewards apply a small deterministic post-resolution XP/gold variance around the selected profile and consequence, with bounded LUCK influence. The exact stored reward is written into the daily claim and never rerolled on replay. Non-fight authored Adventure Choice results also have a low LUCK-influenced chance to grant one eligible loot-expansion manatka through the normal item-grant path; starter shawarma keeps its fixed teaching item grants, while the level 2-3 cellar mouse stays intentionally tiny and cannot become a better farm through paid methods.

Starter shawarma and the starter combat probe are onboarding exceptions: each grants `ceil((level_2_start_xp - level_1_start_xp) * 0.75)` using the current remort-adjusted XP curve. Completing both therefore guarantees level 2 from a fresh life without waiting for another daily reset, while either activity alone still leaves room for the second starter step.

## Gold economy MVP
Sources:
- PvE fights.
- Daily.
- Raid rewards.
- Обережний продаж придатних манаток у `🍻 Шинку`: `floor(sum(canonical_gold_value * quantity) * 42 / 100)`, без статів, RNG, торгу або продажу екіпірованого/захищеного.
- Бардівський виступ: у `🍻 Шинку` малий capped house gold payout із cooldown-ом, в інших місцинах лише добровільні чайові без faucet-а.

Sinks:
- Repair після поразки.
- Reroll одного stat на предметі.
- Cosmetic title.
- Створення ґільдії.
- Напої в `🍻 Шинку`: короткі recovery/risk choices за золото, без XP, луту, activity bypass або PvP power.
- Їжа в `🍻 Шинку` з короткими бафами: золото витрачається на підготовку, а не на прямий shortcut до XP, луту або прогресії.

У MVP не давати гравцям багато gold без sinks.

### Напої Шинку

`0.1.24` додає перший вузький drinks slice:
- чай і пиво прискорюють тільки звичайне out-of-combat HP/мана відновлення, сегментовано за часом дії;
- просте/якісне пиво заморожують малий penalty до PvE accuracy roll у новому eligible persistent solo fight;
- горілка з перцем є queued next-fight ризиком: у придатному PvE бою герой і монстр обоє множать додатну шкоду на `1.13`, після чого ефект зникає;
- один персонаж має один current drink slot, без stacking;
- starter, training and PvP fights do not read drink power.

Це gold sink і тактичний вибір, а не обовʼязкова підготовка до 75-90% normal win-rate. No-drink simulations мають лишатися baseline для майбутніх balance reports.

### Їжа шинку і тимчасові бафи

Їжа має бути малою тактичною витратою, а не pay-to-win. Вона може давати:
- малий тимчасовий `hpMax` або shield на наступний бій;
- малий `manaMax`, часткове відновлення мани або швидшу out-of-combat mana recovery;
- короткий бонус до STR/DEX/INT/CHA/LUCK для одного fight/check;
- легкий regeneration/recovery modifier із чіткою тривалістю.

Guardrails:
- до пʼяти active food buffs одночасно; дублі того самого типу не stack-аються без окремого правила, а заміна/оновлення потребує явного підтвердження;
- effect magnitude має бути меншим за добру екіпіровану манатку того ж рівня;
- тривалість має бути обмежена: наступний бій, кілька ходів, одна перевірка або коротке вікно часу;
- HP/mana buff не має приховано refill-ити ресурси понад описаний ефект;
- їжа не дає XP, золото, loot roll, рівень або обхід activity gates;
- ціни мають бути відчутними, але не обовʼязковими для нормального `75-90%` win rate.

Кава у шинку може бути окремим risky cooldown modifier:
- до трьох горнят в одному циклі, тільки поки триває позитивна фаза;
- позитивна фаза приблизно `15-23` хвилини, залежить від `LUCK` і bounded RNG;
- одна/дві/три кави скорочують дозволені cooldown-и до `75%/60%/50%`;
- після цього rebound на `1/2/4` години подовжує cooldown-и до `150%/200%/400%`;
- під час rebound нову каву не продавати, а UI має пояснювати це як втому/кавову помсту, не як технічний lock.

Перші страви краще балансувати як `cheap/funny`, `standard/useful`, `expensive/situational`: дешеві дають малий ефект і добрий жарт, середні допомагають у звичайній сутичці, дорогі мають бути вибором перед складнішою справою, а не щоденним податком на гру.

### Бардівський виступ і золото

Виступ барда може бути малим gold source тільки в шинку, але не основним методом заробітку:
- базовий payout нижчий за expected value звичайної перемоги в бою того ж рівня;
- `CHA` має бути головним модифікатором, `LUCK` — малим swing modifier;
- музична манатка може дати помітний bonus, але в межах cap-а;
- cooldown спершу daily за Києвом; hourly дозволяти тільки після симуляції й playtest-у;
- провал має давати `0` золота або символічну суму без XP;
- repeated callback replay-ить той самий результат і не reroll-ить виступ;
- bard-only specialization не має ставати обовʼязковим gold engine для прогресу інших класів.

Для музичних манаток потрібен окремий budget: universal інструмент дає менший performance bonus, bard-preferred або bard-only — більший, але без прямої бойової сили, якщо предмет не має окремого combat effect.

### Календарні бонуси

Неділі, свята й середові жаби можуть давати малі бонуси, але не мають міняти основну економіку:
- time basis завжди `Europe/Kyiv`;
- bonus до бардівського виступу, social action або recovery має бути меншим за різницю між поганим і добрим спорядженням;
- frog-themed Wednesday може піднімати flavor/weight для `frog`/`frogfolk` content, але не гарантувати rare/epic loot;
- святковий день може дати дешевший тост, кращий NPC mood або малий social bonus, але не безкоштовний рівень, великий XP або обхід fight gates;
- пропуск календарного дня не має відкидати гравця назад.

## Loot tables
Стартова таблиця:
```text
common:   70%
uncommon: 22%
rare:      7%
epic:      1%
```

`0.0.23` підключає цю таблицю як контрольований loot engine для won persistent solo fights:
- базовий шанс item drop: `35%`;
- LUCK дає тільки bounded modifier до drop chance: поточний cap `25-45%`, тож висока вдача не гарантує лут;
- LUCK може підняти rarity максимум на один крок і теж має малий cap, щоб rare/epic не ставали обовʼязковими;
- якщо монстр не має eligible loot candidates, перемога все одно може видати XP/gold без item;
- якщо потрібної rarity немає серед candidates, engine падає до найближчої доступної нижчої rarity, а потім до найближчої вищої, щоб не ламати reward path.

Поточний baseline persistent fight payout навмисно малий:
```text
XP:   clamp(3 + monster.level * 2, 5, 14)
gold: 0..character.level
item: максимум 1 controlled monsterLoot item
```

Для `Низ` passage-втручань `monster.level` у baseline XP формулі означає ефективний рівень після вибору проходу. Після `0.1.19` правий прохід спершу шукає доступного монстра на `3-5` рівнів нижче героя, а якщо такого контенту немає, падає до safe fallback/clamp. Easy/right XP рахується як `0.5x-0.75x` рівня героя з малим bounded LUCK bias до верхнього краю й округленням униз. Прямий прохід лишає baseline XP. Лівий прохід піднімає ризик і рахує XP як `1.25x-1.5x` рівня героя з тим самим bounded LUCK bias, але не нижче center-route baseline для того самого `baseMonsterLevel` плюс `1 XP`; floor не бере hard effective monster level, щоб низькорівневий монстр не платив як справді високорівневий тільки через проходову надбавку. Gold більше не стабільний за проходом або монстром для persistent fight wins: normal, Yeger і adventure fight sources ролять `0..character.level`, а quest turn-ins не використовують цей variable-gold roll. Перша Єгерська turn-in XP нагорода масштабується як `min(80, character.level * 7)`, щоб ранній turn-in не давав одразу два рівні; gold `120` і `Єгерська риска на дощечці` лишаються fixed, а старі completed rows replay-ять уже записаний XP. Друга Єгерська дощечка після першого `5/5` просить наступні `17` неупокоєних цілей, має власні once-per-life keys, дає окрему XP/золоту подяку без повторної сувенірної риски, а реморт скидає обидві дощечки до першого `0/5`. Якщо gold roll дорівнює `0`, item drop chance піднімається до `93%`; далі шанс лінійно повертається до configured max-gold chance: `getItemDropChance(luck) * passage.dropChanceMultiplier`, із фінальним cap у loot engine. Passage loot endpoints повернуті до старих modifiers: easy/right `dropChanceMultiplier=0.65`, `lootPowerOffset=-1`; normal `1`, `0`; hard/left `1.35`, `+1`. Антифарм XP для baseline/recovery перевіряє окремо збережений `baseMonsterLevel` до втручання: якщо базовий монстр уже був надто слабким для героя, лишаються старі стиснуті bands `3 XP` / `2 XP`; якщо розрив зʼявився тільки через легший правий прохід, це не farming.

`0.0.25` додає Loot Expansion v1 як широкий content-backed pool для persistent fight loot: `120` базових сімей манаток і `500` generated variants. Runtime зберігає тільки звичайні `item.*` ids, без нової міграції: базові pack ids перетворюються на `item.loot-v1-*`, а `+1...+5` мають level gates `3/6/10/14/18`. Affinity за класом, расою і титулом є м’якою вагою дропу, не hard-ban для випадіння. Hard requirements застосовуються тільки при екіпіруванні. `legendary` з pack поки мапиться у чинну `epic` rarity, бо поточна публічна item schema ще не має окремої легендарної категорії.
Після `0.2.31` generated `+N` ціни мають soft cap `base + minLevel * 23 * enhancement`, тому високобазові `+4`/`+5` манатки не роздувають `goldValue`, продаж у Шинку, Манчкін-скупника або score Скрині Манаток у пʼятизначний faucet. Це змінює тільки оцінку/економічні поверхні, не бойові ефекти, level gates, rarity або drop odds.

Hand-authored `monsterLoot` trophies still matter alongside the broad pool. The ordinary level `4-13` ladder now has at least one stable small trophy per monster, so specific higher-level problems can leave recognizable evidence without creating a full random loot table. In `0.0.26`, most of those handcrafted trophies also become modest supported equipment when they occupy weapon, armor, or accessory slots; only intentional keepsakes stay pure `junk`/`cosmetic`.

У `0.0.24` вибір монстра для persistent solo fight став ближчим до рівня героя: сервіс спершу шукає звичайних небосів у вікні `рівень героя - 2 ... рівень героя`, а якщо такого контенту ще бракує, бере найвищий доступний нижчий рівень замість випадкової дрібноти. `0.1.16` прибирає старе XP-стискання за різницю між героєм і монстром: baseline XP і broad loot profile дивляться на effective monster level. `0.1.19` відокремлює persistent fight gold у змінний `0..character.level` roll, дає side passages окремі character-level XP ranges, і тримає hard minimum привʼязаним до center baseline для того самого base monster, а не до hard effective level.

Loss отримує тільки малий consolation reward `1 XP` за спробу, без золота, луту або progress у Korchmar problem chain. Flee і expired fights не отримують reward. Repeated callback replay-ить persisted reward summary з `solo_combat_sessions` і не reroll-ить item. `0.1.6` додає stage chain `13 -> 23 -> 42 -> 93`; кожен новий етап рахує тільки звичайні won solo fights після часу видачі етапу, а training doppelganger не рахується.

`0.2.1` multi-enemy foundation не додає нового faucet: dev-only two-enemy fights використовують той самий single-encounter settlement/reward path, без per-enemy XP/gold/item multiplier і без progress scaling.

`0.2.3` threat escalation лишає цей economy contract незмінним. Після трьох eligible one-enemy ordinary wins наступний eligible ordinary бій може стартувати з exactly two enemies, але payout лишається одним stored encounter reward: XP/gold/item rolls не множаться за кількістю ворогів і не використовують deferred `0.75x per enemy` модель. Перемога в escalated two-enemy бою одразу тримає наступний ordinary бій escalated і додає тільки другому ворогу ще `+2` effective levels за кожну поспіль виграну пару; loss/flee/expiry в eligible one-enemy або escalated two-enemy бою скидає ordinary threat до бази. Yeger, Adventure, starter, training, duel і dev-forced `/dev_two_enemies` не впливають на ordinary threat.

Модифікатори LUCK не мають ламати таблицю. Наприклад, LUCK додає не «+10% epic», а маленький бонус до upgrade roll.

## HP/mana persistence and recovery
`0.0.25` робить HP і ману справжнім станом персонажа для persistent solo fights:
- current HP/mana зберігаються в `characters` і більше не відновлюються до максимуму при кожному `/fight` або `/hero`;
- новий старший бій стартує з поточного ресурсу після lazy out-of-combat regeneration;
- terminal fight state записує фактичні залишки HP/mana назад у персонажа й ставить нову точку відліку регенерації;
- якщо HP дорівнює 0, новий persistent fight не стартує, доки пасивне відновлення не поверне хоча б 1 HP;
- active fight не отримує природного відновлення між ходами.

Поточні повні цикли відновлення:
```text
HP:   base 10 хв, clamp 5-13 хв
mana: base 9 хв, clamp 4-13 хв
```

Class/race/title/stat modifiers змінюють саме час повного відновлення, а не максимуми й не бойові формули. STR прискорює HP recovery, INT прискорює mana recovery; класові й расові поправки лишаються малими та затиснутими clamp-ами. Це локальна attrition-система, не повний healing economy.

Не включено в цей slice: зілля, храмове лікування, платне лікування, resource-манатки, combat-time regeneration або штрафи смерті. Будь-який миттєвий heal/refill має бути окремою явною дією з idempotency boundary, а не прихованим побічним ефектом summary або equipment max changes.

## 0.0.26 Phase 1 recovery & balance polish
Після `0.0.25` smoke-прохід дивиться на ті самі 3, 4, 8 і 13 рівні, але вже з меншими монстрами-гігантами та яснішим повідомленням про відпочинок:
- same-level ordinary fights мають лишатися в районі `75-90%` win rate та `2-5` ходів;
- рівні 8 і 13 більше не повинні виглядати як помилка в математиці, де герой просто спостерігає за своєю поразкою;
- `/hero`, `needs-rest`, quest hub і terminal fight copy мають чітко пояснювати, що `HP 0` — це пауза, а не soft-lock;
- `npm run simulate:combat` і `npm run sample:loot` лишаються локальними smoke-інструментами, а не доказом фінального балансу.
- handcrafted monster trophies and generated utility loot should usually carry small supported effects when they are equippable, so item detail does not drown players in «бойового ефекту не виявлено» while fights require real gear.

Цей slice не додає potion economy, temple healing, combat-time regeneration або ручний chest selection. Він лише вирівнює відчуття після attrition/loot expansion, щоб наступні PR-и не працювали проти вже зламаного темпу.

## Pity / захист від невдачі
Навіть у MVP варто вести lightweight pity counter:
- Якщо 20 пригод без rare, наступні 5 пригод мають підвищений шанс rare.
- Не гарантувати epic у ранньому MVP.

## Предмети
Кожен предмет має budget:
```text
item_power_budget = base_by_level + rarity_bonus
```

Не робити предмети з безкоштовними бонусами. Якщо предмет дає сильний ефект, він має нижчі стати або кулдаун.

`0.0.22` робить persistent equipment першим малим балансним важелем. Ефекти йдуть тільки з content metadata через один equipment/effective-stats helper: `/hero`, `/equipment`, item detail і persistent solo combat читають однаковий summary. Нова fight-сесія бере effective HP/ману на старті, а наступні ходи читають live equipment-aware combat stats без прихованого лікування чи refill-а. Поточний budget навмисно скромний:
- `item.pan-of-persuasion`: `weaponDamage +2`;
- `item.stamp-of-minor-authority`: `weaponDamage +1`, `intelligence +1`;
- `item.apron-of-foam-resistance`: `armor +1`, `hpMax +2`;
- `item.pot-helmet-of-early-access`: `armor +1`;
- `item.cork-ring-of-serious-business`: `luck +1`;
- `item.badge-of-thirteen-small-problems`: no power effect.

Junk, cosmetics, priceless trophies і quest badges не мають випадкових power effects. Якщо предмет має впливати на combat, його треба явно перевести в supported equippable content і покрити тестом. Поточний content test вимагає `effect` для кожної `weapon`/`armor`/`accessory` манатки, щоб спорядження не виглядало як порожня обіцянка.

`0.0.15` додає reachable starter gear для всіх видимих слотів: weapon через `/fight`, armor через Бочку Пінного Міражу, accessory через льохову мишу. Це розширює контент і оцінну вартість манаток, але не додає бойових ефектів, sell/trade логіки або нових reward formulas.

Після `0.0.19` starter weapon не є гарантованою baseline для балансування: starter `/fight` закритий після 2 рівня, cellar errands існують на 2-3 рівнях, Hunt Board відкривається з 3 рівня, а gates живуть у `src/domain/progression/activityGates.ts`. Combat math має мати unarmed/basic fallback і не вимагати `item.pan-of-persuasion` або `item.stamp-of-minor-authority` для нормального першого бою.

Hunt Board лишається простим для входу: один контракт на годину і три дії. Після появи рівнів `4-13` дошка не повинна застрягати на старих рівнях `1-3`: вона обирає звичайних небосів поруч із рівнем героя (`рівень - 2 ... рівень`), а якщо persisted або fallback-контракт значно слабший, XP стискається до `1`. Це синхронізує `/hunt` із persistent solo fight selection без перетворення дошки на повний combat loop.

`0.0.20` реалізує перший domain-only combat engine з цим fallback-ом. Поточні numbers навмисно прості: same-level ordinary fight має вкладатися приблизно в 2-5 ходів, skill damage витрачає ману там, де це доречно, flee завершує бій окремим статусом, а loss не означає reward win. До підключення persistent `/fight` ці формули не видавали лут і не змінювали live HP/mana в БД. `0.1.21` adds `defend`: it reduces incoming damage for the current round and can rarely counter in PvE, but repeated defending fatigues the stance so it does not become a stall strategy.

`0.0.16` піднімає raid reward math: Бочка дає deterministic roll `18-26 XP` і `8-14 золота`, плюс фартух і детермінований дрібний trophy item. У `0.0.19` це замінено на duration-based reward: рівень 1 лишається в діапазоні `5-8` хвилин, кожен рівень після першого додає `30` секунд до можливого максимуму, а XP/золото лінійно рахуються від фактичної тривалості pending-рейду. На 1 рівні максимум лишається `26 XP` і `14 золота`; на 13 рівні поточний максимум стає `42 XP` і `26 золота`. Фактичні `rewardXp`/`rewardGold` записуються в claim, тому repeated callback не перекидає нагороду й не дублює прогрес. Reliability-частина лишається важливою: period bucket, audit break, pending completion, notification dedupe і beer gate мають лишатися ідемпотентними, без нових шансів на дубль нагороди або безкоштовне частування.

`0.0.16` також додає content bestiary і monster loot definitions як data contract. З `0.0.23` ці definitions уже можуть падати через контрольований persistent-fight loot engine, але це ще не широка економічна петля: немає продажу, обміну, crafting або consumable use.

Сумарна вартість манаток у `/inventory` і `/hero` — це valuation, не spendable gold. Вона не додається до `character.gold`, не дозволяє купити пиво й не має впливати на gates, доки не з’явиться окрема підтверджена sell/trade/sink дія.

Майбутня оплата пива манатками має бути окремим item sink, а не прихованим продажем. Орієнтовний корчмарський курс: `×5` до ціни пива, тобто selected priced items на `50+` золота можуть закрити простий раунд, `500+` — якісний. Guardrails:
- гравець сам обирає манатки й підтверджує списання;
- `безцінні`, екіпіровані, заблоковані або сюжетно важливі речі не приймаються;
- надлишок вартости не повертається автоматично, якщо UI прямо не пояснює інше;
- дія не має обходити raid gate для `🍻 Всім пива` у шинку і не має давати XP, рівень або бойову перевагу.

Рівневі, расові, класові або path-залежні обмеження не є безкоштовним дозволом робити предмети надто сильними. Вони можуть додати flavor, рідкість і причину для обміну між гравцями, але не мають створювати ситуацію, де один restricted rare item стає обов’язковим для нормального прогресу.

Предмет може випасти до потрібного рівня, але тоді це має бути очікування з ясним UI, а не пастка: показати потрібний рівень, кому річ пасує, і що її пізніше можна буде вдягнути, підлаштувати або передати іншому персонажу.

Більшість манаток має мати вартість, щоб лут був не лише колекцією дивних назв, а й економічним ресурсом. `Безцінні` речі мають бути винятком: сюжетні трофеї, жарти, документи або колекційні штуки, які не можна чесно перетворити на золото чи рівень.

Механіка `🎒 Манчкін-скупник` уже існує як обережний item+gold sink у дусі Munchkin: якщо персонаж здає eligible манатки й докладає золото до визначеної суми `1000`, підозрілий тип надворі може оформити підняття рівня. Це не free-gold loop, не broad selling/trading system і не shortcut до `12 -> 13`. Guardrails:
- тільки явне підтвердження, без автоматичного списання;
- не приймати безцінні або заблоковані речі;
- не дозволяти gold-heavy обмін: у кожному обміні має бути eligible манаток щонайменше на `587` золота, а гаманець може лише добити решту до `1000`;
- не дозволяти перескочити важливі progression gates, якщо вони ще не відкриті;
- не дозволяти купити 13 рівень, бо поточний alpha-cap має братися боями;
- тримати пороги достатньо високими, щоб це було веселим способом спалити зайве, а не основним шляхом прокачки;
- repeated confirm має replay-ити audit row і не списувати речі/золото/рівень вдруге.

## Phase 2 PvP / duel guardrails
- No item loss.
- No gold steal у MVP.
- No wagers in the first duel slice.
- Consent first: target accepts explicitly, decline/expiry is safe and non-punitive.
- Match by level bracket.
- Soft cap на win streak rewards.
- Newbie protection до level 5 або перших 48 годин.
- Для `Бойового кутка` рахувати reward-bearing повтори за ordered або normalized character pair: не більше `3` XP-bearing бійок з тим самим персонажем за день.
- Per-character daily cap має обмежувати сумарний PvP XP, щоб duel loop не став кращим ґріндом за PvE.
- Weekly ranking не має бути raw win count: враховувати різних опонентів, win rate, capped score і abuse flags.
- Race/class edge дозволений і бажаний у тематичних бійках, але симуляції мають ловити крайнощі: воїн-орк може бути фаворитом у кулачній драці, проте бард такого самого рівня не має падати до майже нульового win rate.
- Daily/weekly нагороди для переможців мають бути переважно cosmetic/social: титул, запис на дошці, маленький bonus payout. Не давати чемпіону предмет або buff, який збільшує наступний PvP snowball.

### `0.1.17` instant duel normalization

`⚡ Миттєва дуель` stays rewardless and quick-resolve, but its hidden math no longer lets raw level/remort gaps decide almost every result.

The instant resolver prepares both duelists through `instant-duel-v2`:
- compute a canonical progression budget from level-derived HP max, mana max and the full distributed stat-growth vector used by `buildLevelGrowthBonus(...)`;
- add deterministic remort-memory budget through the canonical `buildRemortMemoryBonus(...)` helper and the level-13 growth budget;
- choose the stronger canonical progression tier as the target;
- prepare each participant at that common target tier with that participant's own class/race/path growth profile, then add only the missing HP max, mana max and per-stat deltas;
- preserve current HP/mana ratios when temporary maxima rise;
- keep real level/remort values for display and flavor;
- keep race, class, title, path, starter distribution, equipped item ids and all equipment/manatka effects personal;
- remove the old raw `level * 10` score term and use equalized prepared progression contribution instead.

Historic cross-class remort memory is not fully reconstructable from the current character row after remort. For instant-duel normalization, remort budget therefore uses the current character's class/race/path growth profile as a deterministic anti-snowball approximation. This is intentionally conservative: it prevents remort count from leaking back through non-primary stats without pretending to recover every previous-life identity exactly.

Current resources matter only through a bounded readiness penalty after sync and normalization:

```text
hpMissingRatio = 1 - hpCurrent / hpMax
manaMissingRatio = manaMax <= 0 ? 0 : 1 - manaCurrent / manaMax
readinessPenalty = round(clamp(0, 12, hpMissingRatio * 8 + manaMissingRatio * 4))
```

Full resources produce zero penalty. HP matters more than mana. The cap keeps tired acceptance disadvantageous but not an automatic loss. Telegram/player-facing copy must stay qualitative and must not print this formula or exact percentages.

### `0.1.18` turn-based duel resources and combat math

`♟️ Покрокова дуель` reuses the same progression-only preparation helper as instant duels, then freezes both accepted participant snapshots into the session. Unlike quick duels, completed turn-based duels grant a tiny XP-only reward because they consume real turn time.

Balance rules:
- race, class, title, path, current build, equipped manatky and equipment effects remain personal;
- temporary progression normalization may raise session maxima while preserving the accepted HP/mana ratios;
- duel HP/mana inside `duel_combat_sessions.state_json` are ephemeral and must not damage, heal or refill persistent character resources;
- participant choices are hidden until both players choose or the timer fills missing choices, so HP/mana spending is applied at round reveal rather than at the first button press;
- the turn-based resolver uses the same `resolveActorCombatAction(...)` primitive as PvE, so basic attack, class skill, mana cost, cooldown, armor/resist, weapon/spell/stat effects and HP clamping do not fork into a duel-only formula set;
- PvP damage uses the normalized effective combat level from the duel progression tier, while visible level/remort in cards stays real;
- the `0.1.21` defend action stays hidden as a participant choice and applies deterministic same-round incoming damage reduction at reveal time;
- class skills with incoming-damage mitigation apply that mitigation to the opponent's damage in the same hidden reveal round, independent of Telegram button order;
- timeout auto-actions are ordinary basic attacks for missing choices, not a separate penalty damage table;
- max-turn safety resolves as a deterministic draw instead of creating an infinite session.
- terminal XP is stored in `result_json` and granted exactly once by the terminal transaction: loss `1 XP`, draw `2-5 XP`, win `4-8 XP`, with a small bounded LUCK chance to nudge within the range;
- same-location targeted invites from `👀 Хто поруч` only change invitation routing; they do not add gold/item rewards, rating, wager or combat-power modifiers.

Player-facing copy may say that the Корчмар keeps the fight moving, but must not print hidden hit/critical/cooldown formulas or exact chances.

### `0.2.7` player ability critical fumbles

Class/race ability fumbles are a hidden humor-and-replay mechanic, not a reward or power economy.

Balance rules:
- only committed player class/race ability uses advance the fumble cycle; stale callbacks, unavailable actions, no-mana/cooldown no-ops and journal/result reopens do not;
- the active combat or turn-based duel JSON stores a deterministic 93-use cycle per ability and stores the selected fumble in the turn summary, so replay never rerolls it;
- this no-migration MVP scopes the cycle to the stored active combat/duel state. A durable per-character/per-ability lifetime counter would need a separate persistence task if global cross-session tracking becomes important;
- fumbles consume the action's normal mana and cooldown, because the player did attempt the ability;
- support-oriented fumbles can heal the enemy, while damage-oriented fumbles can hurt the actor; avoid mapping every future ability to plain self-damage;
- fumble copy should be funny and screenshot-worthy without humiliating the human player.

Do not expose the exact fumble contract, seed, trigger position or authored punchlines in player-facing pre-action copy or `news.md` by default.

## Phase 2 trading/gifting guardrails
- Gift/trade is not a gold source.
- First slice transfers one eligible item unit or one narrow item-for-item offer.
- Gold transfer, if added after nearby player selection, needs a separate cap/audit/idempotency design and must not become a faucet or level-barter bypass.
- Equipped, protected, priceless, story, apology and already-pending items are not eligible.
- No auction house, market pricing or gold add-ons until transfer audit/idempotency is proven.
- Trading should help players move unsuitable манатки, not bypass progression, level gates or anti-abuse rules.

## Remort guardrails
`0.1.2` додає перший `/remort` runtime slice:
- `/remort` is explicit and unavailable below level 13.
- It is not `/restart`: reset/preserve rules must be visible before confirmation and covered by tests.
- First remort slice preserves memory and up to 5 selected owned manatky, including powerful or sentimental ones. If this bends balance too much, fix it with explicit tags, level gates, attunement or remort-only rules rather than silent deletion.
- Remort preserves one unit per selected item id in this MVP. Unknown/archived item ids may be selectable with a fallback label, but they must not be carried invisibly outside the 5-item promise.
- Legacy bonus uses `ceil(previous_level_growth_bonus * 0.23 * remort_number)` for HP, mana and each stat that previous distributed level growth raised. It is visible as `Памʼять минулих пригод`, not a public `x/5` cap; if it snowballs, tune through explicit gates/tags/attunement.
- No paid remort, hidden wipe, automatic prestige, 14+ levels or remort-only power track in this slice.

## Combat simulation harness
Для локальної балансної перевірки запускай:
```bash
npm run simulate:combat -- -- --levels 1-13 --runs 1000
```

Це допоміжний інструмент для playtest-циклу, а не production-фіча і не доказ фінального балансу. Звіт варто читати разом із реальними `/fight` сесіями, поточними equipment effects і майбутнім loot progression.

## Anti-snowball
- Рейдові нагороди: участь + performance, але не winner-takes-all.
- Бонуси ґільдії: convenience/cosmetic/малий бонус, не x2 damage.
- Daily catch-up для гравців, що пропустили день.

## Симуляції
Для довших локальних прогонів:
```bash
npm run simulate:combat -- -- --levels 1-13 --runs 10000
```

Вивід:
- win rate за рівнем.
- average turns.
- damage taken.
- potion usage.
- class/race outliers.

## Балансні червоні прапорці
- Одна раса/клас має win rate на 15%+ вищий за середній.
- Бій триває 8+ ходів у середньому.
- Гравець помирає до того, як зрозумів UI.
- Rare item стає обов’язковим для проходження звичайного контенту.
- Gold накопичується без витрат.

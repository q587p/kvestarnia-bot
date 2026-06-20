# Quest Skills and Checks

## Мета

Цей документ описує, як зробити не-бойові рішення механічними, не створюючи окрему важку skill tree й не дублюючи вже наявну class identity.

Перший принцип: **persistent stats лишаються STR/DEX/INT/CHA/LUCK**. Соціяльні й пригодницькі вміння є похідними technique tags, а не новими колонками в БД.

## 1. Канонічні стати в квестах

| Stat | Що перевіряє поза боєм | Типові методи |
|---|---|---|
| STR | фізичний тиск, утримання, ламання, залякування тілом | бійка, притиснути, підперти, витягти, погрозити |
| DEX | непомітність, пастки, точність, швидка підміна | обман, крадіжка, пастка, відволікання, маніпуляція предметом |
| INT | аналіз, магія, документи, логіка, craft | розслідування, закляття, рецензія, форма, ремонт |
| CHA | переговори, виступ, авторитет, благословення | домовитись, переконати, заспівати, благословити, виступити |
| LUCK | імпровізація, інтуїція, туманні знаки, абсурдний збіг | ризиковий трюк, ворожіння, «подивитись характерно», випадкова знахідка |

LUCK не має заміняти primary stat. Це малий adjustment або primary stat лише для method, який справді про вдачу/інтуїцію.

## 2. Наявні combat skill profiles як class vocabulary

Квести мають reuse-ити stable skill ids та stat mapping, але не damage math.

| Class | Existing combat skill | Stat | Quest technique families | Приклади не-бойових дій |
|---|---|---:|---|---|
| Воїн | `skill.forceful-strike` | STR | `force`, `intimidation` | притримати двері, викликати шолом на чесний двобій, переконати меблі вагою аргументу |
| Маг | `skill.hot-spell` | INT | `arcana`, `alteration`, `investigation` | розплутати портал, переписати закляття, нагріти/охолодити проблему |
| Бард | `skill.dangerous-couplet` | CHA | `performance`, `persuasion`, `deception` | переспівати казанок, підмінити пророцтво римою, відволікти аудиторію |
| Злодій | `skill.trick-shot` | DEX | `finesse`, `deception`, `sneak` | витягти ключ із власної брехні, підмінити чек, замести слід |
| Жрець | `skill.strict-blessing` | CHA | `ritual`, `authority`, `insight` | благословити контракт, вигнати дрібну нечисть, змусити предмет присягнути |
| Вареник-мант | `skill.hot-spell` | INT | `food-magic`, `craft`, `arcana` | домовитись із тістом, запечатати проблему начинкою, провести тістологічну експертизу |
| Бюрокромант | `skill.form-thirteen-b` | INT | `authority`, `investigation`, `paperwork` | оформити форму, провести інвентаризацію, знерухомити суперечку додатком |
| Єгер | `skill.trick-shot` | DEX | `tracking`, `traps`, `finesse` | прочитати слід у пилюці, поставити пастку, знайти справжній напрямок |
| Козак-характерник | `skill.steppe-side-eye` | LUCK | `improvisation`, `intuition`, `intimidation` | подивитися так, щоб предмет передумав, порадитися з туманом, обійти правило боком |

Для Вареник-манта й Мага спільний combat profile не означає спільний player-facing quest text. Quest technique resolver повинен знати class id, а не лише skill id.

## 3. Похідні quest techniques

Techniques — це semantic tags для content matching та малих affinity bonuses.

### 3.1. Core techniques

- `force` — STR; фізично змінити ситуацію.
- `finesse` — DEX; акуратно маніпулювати предметом.
- `arcana` — INT; працювати з магічною природою.
- `investigation` — INT + LUCK; зібрати докази й зрозуміти причину.
- `persuasion` — CHA + INT; домовитись чесно.
- `deception` — DEX + CHA; обманути або підмінити рамку розмови.
- `authority` — CHA або INT; нав’язати правило, документ чи обряд.
- `performance` — CHA + LUCK; змінити сцену виступом.
- `tracking` — DEX + INT; прочитати сліди й поведінку.
- `traps` — DEX + INT; підготувати механічну/сирну пастку.
- `ritual` — CHA + INT; благословення, оберіг, символічна угода.
- `craft` — INT + DEX; полагодити, перешити, перемалювати.
- `domesticity` — LUCK + CHA; хатня юрисдикція, піч, полиця, лад.
- `bribery` — CHA + LUCK; підкуп із visible gold cost.
- `improvisation` — LUCK + будь-який доречний secondary stat.

### 3.2. Не додавати persistent skill ranks у першому slice

Нова таблиця `character_skills` зараз не потрібна. Вона створила б прогресію, respec, UI та балансний борг раніше, ніж перевірено, чи самі рішення цікаві.

Перший runtime шар:

- stat check;
- class technique affinity;
- race motif affinity;
- combo/title signature affinity;
- optional tiny equipment affinity;
- deterministic roll.

Persistent skill ranks можна додати пізніше як окрему progression feature, якщо плейтест покаже, що гравці хочуть розвивати «переговори» чи «пастки» окремо від класу.

## 4. Race motifs

Race motifs визначають **як** персонаж підходить до проблеми, а не обов’язковий primary stat.

| Race | Motifs | Типові affinities | Не перетворювати на |
|---|---|---|---|
| Людисько | практика, анкета, компроміс, «аби працювало» | `investigation`, `persuasion`, `craft` | універсальний найкращий вибір |
| Гном | камінь, вага, конструкція, видобуток | `force`, `craft`, `investigation` | лише удари |
| Ельф | точність, естетика, довге терпіння, критика форми | `finesse`, `investigation`, `performance` | реальний етнічний стереотип |
| Бісини | назви, правки, коментарі, суперечки | `deception`, `authority`, `persuasion` | токсичне приниження |
| Дрантогор | Остромаг, чужі карти, Межа, пропуски | `improvisation`, `tracking`, `deception` | «завжди заблукав і програв» |
| Домовик | хата, пил, піч, ложки, юрисдикція | `domesticity`, `craft`, `persuasion` | автоматична перемога у всіх indoor scenes |
| Русалка сухопутна | чайники, калюжі, хвиля, море без моря | `arcana`, `performance`, `improvisation` | один жарт про воду всюди |
| Орк-інтелігент | диплом, етика, рецензія, аргумент | `investigation`, `authority`, `force` | «розумний попри расу» |
| Мольфарська душа | туман, обереги, вітер, кишені | `ritual`, `intuition`, `improvisation` | серйозний hidden-lore трактат |

Race option не повинна мати більший бонус за class option за замовчуванням. Її головна цінність — інший спосіб взаємодії.

## 5. Signature/combo

Signature method є перетином race motif і class technique.

Приклади:

- Домовик + Бюрокромант: `domesticity + authority` → оформити предмет як незаконного квартиранта.
- Дрантогор + Єгер: `improvisation + tracking` → знайти слід за картою, яка веде не туди, але корисно.
- Бісини + Бард: `deception + performance` → переписати куплет так, що проблема сама просить правку.
- Орк-інтелігент + Воїн: `investigation + force` → подати peer review ударом по тезі, не по автору.
- Мольфарська душа + Жрець: `ritual + authority` → скликати обереги як малу раду.
- Русалка сухопутна + Вареник-мант: `arcana + food-magic` → організувати сметанний приплив.

Signature affinity малий (`0..3 pp`). Унікальність має жити в label/outcome, не в гарантованій перемозі.

## 6. Check math

### 6.1. Base chance

Кожен method сам задає `baseChance` у рекомендованому діапазоні `52..74`.

- straightforward scene-native investigation: 68–74;
- class/race strong fit: 62–70;
- deception/performance: 55–66;
- wild improvisation/fight provocation: 48–60;
- bribe: 70–78, але з cost і нижчою net reward.

### 6.2. Bonuses

```text
primaryBonus = clamp((primary - 5) * 3, -9, +18)
secondaryBonus = secondary ? clamp(secondary - 5, -3, +6) : 0
classAffinity = class supports any method technique ? 6 : 0
raceAffinity = race supports any method technique ? 4 : 0
signatureAffinity = source is signature/title ? 3 : 0
luckAdjustment = primary is LUCK ? 0 : clamp(floor((LUCK - 5) / 2), -2, +4)
equipmentAffinity = 0..2
chance = clamp(sum, 45, 88)
```

Не додавати окремо raw level, якщо effective stats уже ростуть із рівнем. Інакше level подвоїть власний вплив.

### 6.3. Equipment

У першому PR `equipmentAffinity` можна залишити нульовим. Якщо підключати:

- тільки через canonical equipment/effective stats helper;
- максимум +2 pp;
- лише explicit item tags/effects, не name matching;
- trophy/priceless item без effect не дає бонусу;
- presenter не обіцяє бонус, якого немає в content.

## 7. Reward profile vs chance

Не будувати стару шкалу «менше ризику = менше reward» як єдину вісь. Різні trade-offs:

| Method | Chance | Reward | Cost | Typical consequence |
|---|---:|---:|---:|---|
| investigate | високий | modest/standard | 0 | mixed reward, rare fight |
| negotiate | середньо-високий | standard | 0 | agreement with odd condition |
| deceive | середній | standard/generous | 0 | embarrassment or no-gold mixed |
| bribe | високий | modest | 1–3 gold | cost always retained after committed success |
| fight | середній | generous | 0 | fight handoff on complication |
| ritual | середній | standard | 0 | cosmetic magical mess |
| trap | середній | standard/generous | 0 | item omitted on mixed result |
| performance | варіативний | standard/generous | 0 | audience complicates scene |

Risk is authored on the selected method. Careful audit/negotiation methods should normally fail into reduced reward, XP-only or scene mess; reckless force, unstable ritual, trap, deception and fight-shaped methods may own `minor-injury`, `serious-injury` or persistent-fight handoff where the scene supports it. Do not add a global danger roll after the deterministic grade.

Гравець вибирає не лише «найвищий reward», а стиль і наслідок.

## 8. Gold-cost contract для bribery

### 8.1. UI

Method hint має прямо сказати:

```text
Коштує 2 золота. Шанси добрі, винагорода скромніша.
```

Button label може бути:

```text
🪙 Дати дверям 2 золотих «на мастило»
```

### 8.2. Service behavior

1. Load fresh character/resources.
2. Validate current problem/method/period.
3. Compute deterministic grade.
4. If not enough gold, return `insufficient-gold`; do not claim and do not roll a new result later.
5. For a committed resolution, debit cost and claim reward in one DB transaction.
6. Existing claim returns stable replay without a second debit.
7. Fight handoff failure rolls back or avoids both claim and cost.

### 8.3. Caps

- ordinary cost: 1–3 gold;
- no method spends more than its maximum possible gold reward plus 1 in this slice;
- starter level 1–2 methods should cost at most 1 gold or avoid actual bribery;
- no negative wallet.

## 9. Class option examples

Це technique patterns, не тексти, які треба копіювати у всі сцени.

### Воїн

- primary: STR;
- secondary: CHA або DEX;
- methods: втримати, викликати, підперти, переконати прямотою;
- complication: object fights back or creates physical mess.

### Маг

- primary: INT;
- secondary: LUCK;
- methods: розплутати enchantment, змінити температуру/форму, прочитати aura;
- complication: spell solves wrong layer of problem.

### Бард

- primary: CHA;
- secondary: LUCK;
- methods: duet, heckle, rewrite, distract;
- complication: audience joins or remembers wrong chorus.

### Злодій

- primary: DEX;
- secondary: CHA;
- methods: підмінити, витягти, сховати, збрехати предмету;
- complication: succeeds but leaves evidence/no gold.

### Жрець

- primary: CHA;
- secondary: INT;
- methods: благословити, присягнути, вигнати, освятити контракт;
- complication: object becomes too devout/literal.

### Вареник-мант

- primary: INT;
- secondary: CHA або DEX;
- methods: замісити, начинити, запечатати, тістологічно класифікувати;
- complication: dough/food joins scene.

### Бюрокромант

- primary: INT;
- secondary: CHA;
- methods: форма, печатка, акт, інвентаризація;
- complication: paperwork summons another office or delays reward.

### Єгер

- primary: DEX;
- secondary: INT;
- methods: слід, пастка, приманка, маршрут;
- complication: follows the right trace to an inconvenient source.

### Козак-характерник

- primary: LUCK;
- secondary: STR або CHA;
- methods: погляд, туман, обхід, інтуїтивний наказ;
- complication: works sideways and creates a different oddity.

## 10. Коли додавати справжні social skills

Додавати persistent `negotiation/deception/etc.` ranks варто лише після плейтесту, якщо виконуються обидві умови:

1. гравці регулярно розрізняють ці стилі й хочуть спеціалізувати героя;
2. контент має достатньо method coverage, щоб rank не був бонусом до двох випадкових кнопок.

Тоді окремий slice може додати:

- 3–5 broad proficiencies, не 15 вузьких;
- gain через використання або level milestones;
- caps та remort behavior;
- видимий profile summary;
- respec або відсутність hard lock-in.

До цього моменту derived techniques дають потрібну різноманітність без schema/progression боргу.

## 11. Тести

Pure tests повинні перевіряти:

- однаковий seed дає той самий grade;
- інший method id змінює roll, але не claim identity;
- higher relevant stat не зменшує chance;
- irrelevant stat не змінює chance;
- caps 45..88;
- class/race/signature bonuses bounded;
- gold cost не списується при insufficient/stale/fight-start-failed;
- duplicate callback не списує cost вдруге;
- exact percentages не потрапляють у production presenter;
- class method має combat skill id зі stable registry;
- quest code не викликає combat damage resolver.

## 12. Follow-up HP and handoff contracts

Direct quest injury is resolved from the selected method and grade, not from a separate global danger roll. The service passes the canonical effective HP max used by the quest resolver into the repository claim so audit payloads can display `after/effectiveMax` correctly when level or equipped-item bonuses raise max HP. Repositories must not duplicate the effective-stat formula; they only persist and apply the supplied deterministic request.

Concurrent accepted claims with different idempotency keys must apply both HP losses exactly once. Repository HP mutation uses fresh transactional resource state and records the actual committed `before/lost/after/max` audit instead of trusting a stale pre-read.

Fight handoff methods resolve a real eligible encounter target before claim audit persistence. The stored target id must match the id passed into the existing persistent-fight service and the combat session that starts from the handoff.

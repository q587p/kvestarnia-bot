import {
  BARREL_BEER_TUTORIAL_MAX_LEVEL,
  BARREL_BEER_TUTORIAL_STIPEND_GOLD,
  BARREL_BEER_TUTORIAL_TITLE,
  type BarrelBeerTutorialAcceptResult,
  type BarrelBeerTutorialLookupResult,
  type BarrelBeerTutorialProgress,
  type BarrelBeerTutorialTurnInResult
} from "../../services/barrelBeerTutorialService";

export function presentBarrelBeerTutorialLookup(
  result: BarrelBeerTutorialLookupResult
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Записка не довіряє порожнім анкетам.";
  }

  if (result.state === "level-locked") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» відкриється з ${result.requiredLevel} рівня. Бочка поважає юних героїв, але не настільки.`;
  }

  if (result.state === "level-retired") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» лишається новачковою справою до ${result.maxLevel} рівня. Бочка вже робить вигляд, що ви знайомі.`;
  }

  if (result.state === "completed") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» уже виконано. Бочка киває так, ніби памʼятає все краще за тебе.`;
  }

  if (result.state === "available") {
    return [
      `🛢️ <b>${BARREL_BEER_TUTORIAL_TITLE}</b>`,
      "",
      "На столі лежить записка з круглим слідом від кухля: «Новачкам — 39 золота на дорогу до Бочки. Повернутися з піною в голові, але на своїх ногах».",
      "",
      "Дійди до Бочки, пройди новачковий соло-рейд, вистав пива, випий його й повернися до столу, поки діє ефект пива."
    ].join("\n");
  }

  return [
    `🛢️ <b>${BARREL_BEER_TUTORIAL_TITLE}</b>`,
    "",
    "Дійди до Бочки, пройди новачковий соло-рейд, вистав пива, випий його й повернися до столу, поки діє ефект пива.",
    "",
    presentProgressHint(result.progress)
  ].join("\n");
}

export function presentBarrelBeerTutorialAccept(
  result: BarrelBeerTutorialAcceptResult
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Стіл не видає аванси примарам.";
  }

  if (result.state === "level-locked") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» відкриється з ${result.requiredLevel} рівня.`;
  }

  if (result.state === "level-retired") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» можна взяти тільки до ${result.maxLevel} рівня включно. Ця записка любить новачків, а не бухгалтерію досвіду.`;
  }

  if (result.state === "already-completed") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» уже виконано. Повторний аванс не видають навіть під дуже переконливий кухоль.`;
  }

  if (result.state === "already-accepted") {
    return [
      `🛢️ <b>${BARREL_BEER_TUTORIAL_TITLE}</b>`,
      "",
      "Записка вже у журналі, а аванс уже дзвенів. Повторно вона не фінансує кругові прогулянки.",
      "",
      presentProgressHint(result.progress)
    ].join("\n");
  }

  return [
    "Ти береш зі столу записку гномськими рунами, а під нею дзвенить маленький аванс.",
    "",
    "Завдання просте: знайти Бочку, пройти там новачковий соло-рейд, виставити пива, випити кухоль і повернутися до столу, доки хміль ще тримає. На полі лишився припис: «Потрібен зломщик. Або хоча б пригодник, який не питає забагато до першого кухля».",
    "",
    "<i>Отримано:</i>",
    `+${BARREL_BEER_TUTORIAL_STIPEND_GOLD} золота`
  ].join("\n");
}

export function presentBarrelBeerTutorialTurnIn(
  result: BarrelBeerTutorialTurnInResult
): string {
  if (result.state === "no-character") {
    return "Спершу створіть пригодника через /start. Стіл не приймає звіти від невідомих силуетів.";
  }

  if (result.state === "level-locked") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» відкриється з ${result.requiredLevel} рівня.`;
  }

  if (result.state === "level-retired") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» — новачкова справа для ${BARREL_BEER_TUTORIAL_MAX_LEVEL} рівня і нижче. Нову записку стіл уже не видає.`;
  }

  if (result.state === "not-started" || result.state === "missing-progress" || result.state === "wrong-location") {
    if (result.state === "wrong-location") {
      return [
        "Маршрут майже зійшовся, але звітувати треба біля столу зі справами.",
        "",
        presentProgressHint(result.progress)
      ].join("\n");
    }

    return [
      "Стіл мовчить. Записка вперто чекає повного маршруту: Бочка, новачковий соло-рейд, пиво — і тільки тоді назад.",
      "",
      presentProgressHint(result.progress)
    ].join("\n");
  }

  if (result.state === "beer-expired") {
    return [
      "Ти повертаєшся до столу, але пивна відвага вже вивітрилася.",
      "",
      "Записка ніби насміхається: «Бочка, або Туди і звідти — це не прогулянка після компоту. Випий пива й повертайся, поки ефект діє»."
    ].join("\n");
  }

  if (result.state === "already-completed") {
    return `«${BARREL_BEER_TUTORIAL_TITLE}» уже зараховано. Стіл не приймає другі фінальні повернення.`;
  }

  const rewardLines = result.reward.itemGrants.map(
    (grant) => `+${grant.quantity} ${grant.name}`
  );

  return [
    "Ти встигаєш повернутися до столу, поки пивний ефект ще гріє кров.",
    "",
    "Записка на мить темніє від нового кухольного сліду, а потім зникає. Здається, Бочка тепер запамʼятала тебе. Або ти — її.",
    "",
    "Під запискою лишився маленький перстень. Не схоже, що він зробить тебе невидимим, але після Бочки й так не всіх хочеться бачити.",
    "",
    "<i>Отримано:</i>",
    `+${result.reward.xp} XP`,
    ...rewardLines
  ].join("\n");
}

function presentProgressHint(progress: BarrelBeerTutorialProgress): string {
  if (!progress.visitedBarrel) {
    return "Бочка сама себе не знайде. Шукай місце, де наливають голосніше, ніж радять.";
  }

  if (!progress.raidCompleted) {
    return "Ти вже біля Бочки. Для початку доведи, що можеш пройти місцевий новачковий соло-рейд без підказок із-під столу.";
  }

  if (!progress.beerRoundOffered) {
    return "Рейд позаду. Тепер вистав пива іншим і не забудь про власний кухоль.";
  }

  if (!progress.beerDrunk) {
    return "Рейд позаду. Тепер вистав пива й не забудь випити свій кухоль.";
  }

  if (!progress.activeBeer) {
    return "Пивна відвага вже вивітрилася. Випий пива й повертайся, поки ефект діє.";
  }

  return "Піна ще тримається. Повертайся до столу, доки ефект пива не вивітрився.";
}

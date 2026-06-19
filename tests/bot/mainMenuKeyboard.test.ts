import { describe, expect, it } from "vitest";
import {
  buildAdventureParticipantsKeyboard,
  buildAdventureKeyboard,
  buildAdventureResultKeyboard
} from "../../src/bot/keyboards/adventureKeyboard";
import {
  buildCellarKeyboard,
  buildCellarGrownupKeyboard,
  buildCellarParticipantsKeyboard,
  buildCellarResultKeyboard
} from "../../src/bot/keyboards/cellarKeyboard";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import {
  buildFightKeyboard,
  buildFightResultKeyboard,
  buildPersistentFightKeyboard,
  buildPersistentFightResultKeyboard
} from "../../src/bot/keyboards/fightKeyboard";
import { getCombatSkillDisplay, getPersistentFightSkillLabel } from "../../src/services/fightService";
import { buildHuntBoardKeyboard } from "../../src/bot/keyboards/huntKeyboard";
import {
  buildEquipmentKeyboard,
  buildInventoryKeyboard,
  buildItemDetailKeyboard
} from "../../src/bot/keyboards/inventoryKeyboard";
import {
  buildMantokChestManualSelectionKeyboard,
  buildMantokChestOverviewKeyboard,
  buildMantokChestResultKeyboard
} from "../../src/bot/keyboards/mantokChestKeyboard";
import {
  buildDevResetKeyboard,
  buildMainMenuKeyboard,
  buildRestartKeyboard,
  mainMenuButtons
} from "../../src/bot/keyboards/mainMenuKeyboard";
import {
  buildLevelBarterOfferKeyboard,
  buildLevelBarterPreviewKeyboard,
  buildLevelBarterResultKeyboard
} from "../../src/bot/keyboards/levelBarterKeyboard";
import { buildQuestHubKeyboard } from "../../src/bot/keyboards/questHubKeyboard";
import {
  buildEnterKorchmaKeyboard,
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaBarKeyboard,
  buildKorchmaDeepKeyboard,
  buildKorchmaFightingCornerKeyboard,
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaMemorialBoardKeyboard,
  buildKorchmaRoundOfferKeyboard,
  buildKorchmaRoundResultKeyboard,
  buildTavernParticipantsKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../../src/bot/keyboards/tavernKeyboard";
import {
  buildTrainingDoppelgangerKeyboard,
  buildTrainingDoppelgangerStartKeyboard
} from "../../src/bot/keyboards/trainingDoppelgangerKeyboard";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";

describe("main menu and scene keyboards", () => {
  it("builds the universal menu as a persistent reply keyboard", () => {
    const keyboard = buildMainMenuKeyboard();

    expect(replyKeyboardTexts(keyboard.keyboard)).toEqual([
      [mainMenuButtons.hero, mainMenuButtons.tavern],
      [mainMenuButtons.quest, mainMenuButtons.inventory],
      [mainMenuButtons.participants, mainMenuButtons.help]
    ]);
    expect(mainMenuButtons.quest).toBe("🗺️ Квести");
    expect(replyKeyboardTexts(keyboard.keyboard).flat()).not.toContain("👀 Озирнутися");
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });

  it("builds korchma place navigation", () => {
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка",
      "🎒 Манчкін-скупник"
    ]);
    expect(inlineButtonRows(buildKorchmaFrontKeyboard())).toEqual([
      ["🚪 Зайти в корчму"],
      ["📜 Табличка прибулих", "🏅 Пропамʼятна дошка"],
      ["🎒 Манчкін-скупник"]
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaFrontKeyboard())).toEqual([
      "v1:place:hall",
      "v1:place:arrivals",
      "v1:place:memorial",
      "v1:lvlx:open"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard({ yegerAction: "hunt" }))).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих",
      "🏅 Пропамʼятна дошка",
      "🎒 Манчкін-скупник",
      "🏹 До полювання"
    ]);
    expect(inlineButtonRows(buildEnterKorchmaKeyboard())).toEqual([["🚪 Зайти в корчму"]]);
    expect(flatInlineButtonCallbacks(buildEnterKorchmaKeyboard())).toEqual(["v1:place:hall"]);
    expect(flatInlineButtonTexts(buildKorchmaArrivalBoardKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "⬅️ До дверей"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaMemorialBoardKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "⬅️ До дверей"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard())).toEqual([
      "🥊 Бійцівський куток",
      "📋 Стіл зі справами",
      "🛢️ Бочка",
      "🍻 Шинок",
      "🪜 Спуск до Низу",
      "🐭 Льох",
      "📰 Дошка вістей",
      "🚪 Надвір"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard())).toEqual([
      "v1:place:fighting-corner",
      "v1:place:quest-table",
      "v1:place:barrel",
      "v1:place:bar",
      "v1:place:deep",
      "v1:place:cellar",
      "v1:place:news-corner",
      "v1:place:front"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ characterLevel: 13 }))).toEqual([
      "🕯️ Реморт",
      "🥊 Бійцівський куток",
      "📋 Стіл зі справами",
      "🛢️ Бочка",
      "🍻 Шинок",
      "🪜 Спуск до Низу",
      "🐭 Льох",
      "📰 Дошка вістей",
      "🚪 Надвір"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard({ characterLevel: 13 }))).toEqual([
      "v1:rm:open",
      "v1:place:fighting-corner",
      "v1:place:quest-table",
      "v1:place:barrel",
      "v1:place:bar",
      "v1:place:deep",
      "v1:place:cellar",
      "v1:place:news-corner",
      "v1:place:front"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard({ characterLevel: 1 }))).not.toContain(
      "🪜 Спуск до Низу"
    );
    expect(flatInlineButtonCallbacks(buildKorchmaHallKeyboard({ characterLevel: 1 }))).not.toContain(
      "v1:place:deep"
    );
    expect(inlineButtonRows(buildKorchmaHallKeyboard())).toEqual([
      ["🥊 Бійцівський куток", "📋 Стіл зі справами"],
      ["🛢️ Бочка", "🍻 Шинок"],
      ["🪜 Спуск до Низу", "🐭 Льох"],
      ["📰 Дошка вістей", "🚪 Надвір"]
    ]);
    expect(flatInlineButtonTexts(buildKorchmaFightingCornerKeyboard())).toEqual([
      "🥊 Потренуватися",
      "⚡ Миттєва дуель",
      "♟️ Покрокова дуель",
      "🏆 Переможці",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaFightingCornerKeyboard())).toEqual([
      "v1:spar:open",
      "v1:duel:new",
      "v1:duel:new-t",
      "v1:place:duel-winners",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard())).toEqual([
      "🍻 Всім пива",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaBarKeyboard())).toEqual([
      "v1:tavern:round",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaBarKeyboard({ includeBottleTurnIn: true }))).toEqual([
      "🍻 Всім пива",
      "🍾 Здати пляшку",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaBarKeyboard({ includeBottleTurnIn: true }))).toEqual([
      "v1:tavern:round",
      "v1:cellar:grownup-turn-in",
      "v1:place:hall"
    ]);
  });

  it("returns doppelganger training target choice to the fighting corner", () => {
    const keyboard = buildTrainingDoppelgangerStartKeyboard([
      {
        mode: "copy-target",
        buttonLabel: "🪞 Копія поточного",
        title: "Копія поточного",
        description: "Допельґанґер бере поточний образ."
      },
      {
        mode: "random-build",
        buttonLabel: "🎲 Випадковий пригодник",
        title: "Випадковий пригодник",
        description: "Дзеркало збирає випадковий образ."
      }
    ]);

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🪞 Копія поточного",
      "🎲 Випадковий пригодник",
      "🥊 До кутка"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:spar:mode:copy-target",
      "v1:spar:mode:random-build",
      "v1:place:fighting-corner"
    ]);
  });

  it("keeps tavern inline buttons scoped to tavern actions", () => {
    expect(flatInlineButtonTexts(buildTavernKeyboard())).toEqual([
      "🍺 У рейд на бочку",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed"))).toEqual([
      "🍻 Всім пива",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("completed"))).toEqual([
      "v1:tavern:round",
      "v1:tavern:ranger",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("already-completed"))).toEqual([
      "🍻 Всім пива",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("already-completed"))).toEqual([
      "v1:tavern:round",
      "v1:tavern:ranger",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("audit-break"))).toEqual([
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("pending"))).toEqual([
      "🍺 Перевірити бочку"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("pending"))).toEqual([
      "v1:tavern:raid"
    ]);
    expect(flatInlineButtonTexts(buildTavernParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildTavernParticipantsKeyboard())).toEqual(["v1:place:barrel"]);
  });

  it("uses icons for destructive confirmation keyboards", () => {
    expect(flatInlineButtonTexts(buildRestartKeyboard())).toEqual([
      "🔄 Так, почати з початку",
      "⬅️ Ні, лишити персонажа"
    ]);
    expect(flatInlineButtonTexts(buildDevResetKeyboard())).toEqual([
      "✅ Так, скинути",
      "⬅️ Ні, лишити"
    ]);
  });

  it("asks for explicit confirmation before spending korchma round gold", () => {
    expect(
      flatInlineButtonTexts(
        buildKorchmaRoundOfferKeyboard({
          state: "ready",
          character,
          gold: 125,
          canBuySimple: true,
          canBuyFine: true,
          leaderboard: emptyRoundLeaderboard
        })
      )
    ).toEqual(["🍻 Якісне — 100", "🍺 Просте — 10", "⬅️ До шинку"]);
    expect(
      flatInlineButtonCallbacks(
        buildKorchmaRoundOfferKeyboard({
          state: "ready",
          character,
          gold: 25,
          canBuySimple: true,
          canBuyFine: false,
          leaderboard: emptyRoundLeaderboard
        })
      )
    ).toEqual(["v1:tavern:round-simple", "v1:place:bar"]);
  });

  it("keeps Munchkin barter outside the korchma hall", () => {
    expect(flatInlineButtonTexts(buildLevelBarterOfferKeyboard())).toEqual([
      "🧮 Автопідібрати манатки й золото",
      "↩️ До дверей"
    ]);
    expect(flatInlineButtonCallbacks(buildLevelBarterOfferKeyboard())).toEqual([
      "v1:lvlx:auto",
      "v1:place:front"
    ]);
    expect(flatInlineButtonTexts(buildLevelBarterPreviewKeyboard({
      state: "insufficient",
      character,
      eligibleTotalValue: 800,
      gold: 70,
      combinedValue: 870,
      cost: 1000
    }))).toEqual(["↩️ До дверей"]);
    expect(flatInlineButtonTexts(buildLevelBarterResultKeyboard())).toEqual([
      "👤 Персонаж",
      "↩️ До дверей"
    ]);
  });

  it("links to the Barrel and hall when korchma rounds are blocked by an active raid", () => {
    const blockedByBarrel = {
      state: "raid-required" as const,
      character,
      leaderboard: emptyRoundLeaderboard
    };

    expect(flatInlineButtonTexts(buildKorchmaRoundOfferKeyboard(blockedByBarrel))).toEqual([
      "🛢️ До Бочки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaRoundOfferKeyboard(blockedByBarrel))).toEqual([
      "v1:place:barrel",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaRoundResultKeyboard(blockedByBarrel))).toEqual([
      "🛢️ До Бочки",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaRoundResultKeyboard(blockedByBarrel))).toEqual([
      "v1:place:barrel",
      "v1:place:hall"
    ]);
  });

  it("keeps adventure inline buttons scoped to quest actions", () => {
    const actionButtons = [
      "🌯 Тицьнути шаурму",
      "📋 Попросити чек",
      "🏃 Обережно відступити",
      "📋 До справ"
    ];

    expect(flatInlineButtonTexts(buildAdventureKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("completed"))).toEqual([
      "📋 До справ"
    ]);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("already-completed"))).toEqual([
      "📋 До справ"
    ]);
    expect(flatInlineButtonTexts(buildAdventureParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildAdventureParticipantsKeyboard())).toEqual([
      "v1:quest:adventure"
    ]);
  });

  it("adds adventure problem icons without changing problem callbacks", () => {
    const keyboard = buildAdventureKeyboard({
      localDate: "2026-06-12",
      periodToken: "period93",
      expiresAt: new Date("2026-06-12T11:23:00.000Z"),
      choices: [
        { id: "key", title: "Ключ забув, що він відкриває", hook: "Ключ пишається.", client: "Комірник" },
        { id: "door", title: "Двері беруть плату за вихід", hook: "Двері чекають.", client: "Гості" },
        { id: "cloak", title: "Плащ став у чергу замість власника", hook: "Плащ штовхається.", client: "Власник" }
      ]
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🗝️ Ключ забув, що він відкриває",
      "🚪 Двері беруть плату за вихід",
      "🧥 Плащ став у чергу замість власника",
      "📋 До справ"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:adv:p:period93:key",
      "v1:adv:p:period93:door",
      "v1:adv:p:period93:cloak",
      "v1:place:quest-table"
    ]);
  });

  it("keeps character-aware adventure labels on the same callback actions", () => {
    expect(flatInlineButtonTexts(buildAdventureKeyboard({ ...character, classId: "class.rogue" }))).toEqual([
      "🗝️ Перевірити кишені",
      "📋 Виманити чек",
      "🏃 Зникнути за серветкою",
      "📋 До справ"
    ]);
    expect(flatInlineButtonCallbacks(buildAdventureKeyboard({ ...character, classId: "class.rogue" }))).toEqual([
      "v1:adv:mimic:poke",
      "v1:adv:mimic:receipt",
      "v1:adv:mimic:flee",
      "v1:place:quest-table"
    ]);
  });

  it("keeps cellar inline buttons scoped to repeatable errand actions", () => {
    const actionButtons = [
      "🧀 Поставити сирну пастку",
      "🧹 Підмести хоробро",
      "🤝 Домовитись із мишею",
      "⬅️ До зали"
    ];

    expect(flatInlineButtonTexts(buildCellarKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("completed"))).toEqual([
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("on-cooldown"))).toEqual([
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildCellarParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildCellarParticipantsKeyboard())).toEqual(["v1:quest:cellar"]);
  });

  it("keeps character-aware cellar labels on the same callback actions", () => {
    const domovyk = { ...character, raceId: "race.domovyk", classId: "class.rogue" };

    expect(flatInlineButtonTexts(buildCellarKeyboard(domovyk))).toEqual([
      "🧀 Виставити оренду сиром",
      "🧹 Навести хатній лад",
      "🤝 Поділити шафу",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildCellarKeyboard(domovyk))).toEqual([
      "v1:cellar:cheese-trap",
      "v1:cellar:sweep-bravely",
      "v1:cellar:negotiate",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready", domovyk))).toEqual([
      "🧀 Виставити оренду сиром",
      "🧹 Навести хатній лад",
      "🤝 Поділити шафу",
      "⬅️ До зали"
    ]);
  });

  it("keeps fight inline buttons scoped to fight actions", () => {
    const actionButtons = [
      "🗡️ Вдарити",
      "📋 Збити з пантелику чеком",
      "🏃 Відступити красиво"
    ];

    expect(flatInlineButtonTexts(buildFightKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("already-completed"))).toEqual([
      "📋 До справ"
    ]);
  });

  it("keeps character-aware fight labels on the same callback actions", () => {
    expect(flatInlineButtonTexts(buildFightKeyboard({ ...character, classId: "class.bard" }))).toEqual([
      "🎵 Вдарити приспівом",
      "📋 Заспівати про чек",
      "🏃 Піти на біс"
    ]);
    expect(flatInlineButtonCallbacks(buildFightKeyboard({ ...character, classId: "class.bard" }))).toEqual([
      "v1:fight:mimic:attack",
      "v1:fight:mimic:receipt",
      "v1:fight:mimic:flee"
    ]);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed", { ...character, classId: "class.bard" }))).toEqual([
      "🎵 Вдарити приспівом",
      "📋 Заспівати про чек",
      "🏃 Піти на біс"
    ]);
  });

  it("keeps persistent fight buttons scoped to turn callbacks", () => {
    const session = persistentFightSession();

    expect(flatInlineButtonTexts(buildPersistentFightKeyboard(session, character))).toEqual([
      "🗡️ Вдарити",
      "💪 Силовий удар",
      "🏃 Відступити"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaDeepKeyboard())).toEqual([
      "⬆️ Повернутися до зали",
      "⬇️ Спуститися"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaDeepKeyboard())).toEqual([
      "v1:place:hall",
      "v1:place:deep-level1"
    ]);
    expect(flatInlineButtonCallbacks(buildPersistentFightKeyboard(session, character))).toEqual([
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:attack",
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:skill",
      "v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:4:flee"
    ]);
    expect(flatInlineButtonTexts(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        status: "won"
      }
    }, character))).toEqual(["⚔️ Новий бій", "🪜 До Низу"]);
    expect(flatInlineButtonCallbacks(buildPersistentFightResultKeyboard({
      ...session,
      status: "won",
      state: {
        ...session.state!,
        status: "won"
      }
    }, character))).toEqual(["v1:place:deep-level1", "v1:place:deep"]);
  });

  it("keeps active training doppelganger buttons scoped to turn callbacks", () => {
    const session: SoloCombatSessionRecord = {
      ...persistentFightSession(),
      monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
      state: {
        ...persistentFightSession().state!,
        source: "training",
        monster: {
          id: TRAINING_DOPPELGANGER_MONSTER_ID,
          hp: 18,
          hpMax: 18
        }
      }
    };

    expect(flatInlineButtonTexts(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      "🗡️ Вдарити",
      "💪 Силовий удар",
      "🏃 Відступити"
    ]);
    expect(flatInlineButtonCallbacks(buildTrainingDoppelgangerKeyboard(session, character))).toEqual([
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:attack",
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:skill",
      "v1:spar:turn:123e4567-e89b-12d3-a456-426614174000:4:flee"
    ]);
  });

  it("keeps persistent fight skill icons unique and away from common action icons", () => {
    const skillIds = [
      "skill.forceful-strike",
      "skill.hot-spell",
      "skill.form-thirteen-b",
      "skill.dangerous-couplet",
      "skill.trick-shot",
      "skill.strict-blessing",
      "skill.steppe-side-eye",
      "skill.careful-strike"
    ];
    const displays = skillIds.map(getCombatSkillDisplay);
    const reservedActionIcons = new Set(["🗡️", "🏃", "🕯️", "🎵", "🔥", "🏹", "🧾"]);

    expect(new Set(displays.map((display) => display.icon)).size).toBe(displays.length);
    expect(displays.filter((display) => reservedActionIcons.has(display.icon))).toEqual([]);
    expect(getPersistentFightSkillLabel({ ...character, classId: "class.priest" })).toBe(
      "🙏 Суворе благословення · 2 мани"
    );
  });

  it("keeps hunt board inline buttons scoped to hunt actions", () => {
    expect(flatInlineButtonTexts(buildHuntBoardKeyboard(readyHunt()))).toEqual([
      "🗡️ Вдарити по проблемі",
      "🎭 Обдурити проблему",
      "📋 Закрити актом",
      "📖 Запис у бестіарії",
      "📋 До справ"
    ]);
    expect(flatInlineButtonCallbacks(buildHuntBoardKeyboard(readyHunt()))).toEqual([
      "v1:hunt:act:2026-06-14T08:abc1234:strike",
      "v1:hunt:act:2026-06-14T08:abc1234:trick",
      "v1:hunt:act:2026-06-14T08:abc1234:retreat",
      "v1:bst:mon:monster.stamp-doorkeeper-skeleton:0",
      "v1:place:quest-table"
    ]);
  });

  it("builds inventory and equipment preview navigation", () => {
    expect(flatInlineButtonTexts(buildInventoryKeyboard({ state: "no-character" }))).toEqual([]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard({
          state: "found",
          totalGoldValue: 0,
          items: [
            {
              id: "character-item-1",
              itemId: "item.wet-hero-ticket",
              quantity: 1,
              content: {
                id: "item.wet-hero-ticket",
                name: "Квиток мокрого пригодника",
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }
          ]
        })
      )
    ).toEqual(["🛡️ Спорядження", "♻️ До Дружньої Скрині", "🔎 Квиток мокрого пригодника"]);
    expect(
      flatInlineButtonCallbacks(
        buildInventoryKeyboard({
          state: "found",
          totalGoldValue: 0,
          items: [
            {
              id: "character-item-1",
              itemId: "item.wet-hero-ticket",
              quantity: 1,
              content: {
                id: "item.wet-hero-ticket",
                name: "Квиток мокрого пригодника",
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }
          ]
        })
      )
    ).toEqual(["v1:equip:view", "v1:chest:open", "v1:item:detail:item.wet-hero-ticket"]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: Array.from({ length: 9 }, (_, index) => ({
              id: `character-item-${index + 1}`,
              itemId: `item.test-${index + 1}`,
              quantity: 1,
              content: {
                id: `item.test-${index + 1}`,
                name: `Манатка ${index + 1}`,
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }))
          },
          1
        )
      )
    ).toEqual(["🛡️ Спорядження", "♻️ До Дружньої Скрині", "🔎 Манатка 9", "◀️ Назад", "2/2"]);
    expect(
      flatInlineButtonCallbacks(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: Array.from({ length: 9 }, (_, index) => ({
              id: `character-item-${index + 1}`,
              itemId: `item.test-${index + 1}`,
              quantity: 1,
              content: {
                id: `item.test-${index + 1}`,
                name: `Манатка ${index + 1}`,
                description: "Трофей.",
                rarity: "common",
                slot: "junk",
                priceless: true
              }
            }))
          },
          1
        )
      )
    ).toEqual([
      "v1:equip:view",
      "v1:chest:open",
      "v1:item:detail:item.test-9:1",
      "v1:item:inventory",
      "v1:item:inventory:1"
    ]);
    expect(
      flatInlineButtonTexts(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: [
              {
                id: "character-item-1",
                itemId: "item.pan-of-persuasion",
                quantity: 1,
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              {
                id: "character-item-2",
                itemId: "item.wet-hero-ticket",
                quantity: 1,
                content: {
                  id: "item.wet-hero-ticket",
                  name: "Квиток мокрого пригодника",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              }
            ]
          },
          0,
          "weapon"
        )
      )
    ).toEqual(["🛡️ Спорядження", "🎒 Усі манатки", "🔎 Пательня переконання"]);
    expect(
      flatInlineButtonCallbacks(
        buildInventoryKeyboard(
          {
            state: "found",
            totalGoldValue: 0,
            items: [
              {
                id: "character-item-1",
                itemId: "item.pan-of-persuasion",
                quantity: 1,
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              },
              {
                id: "character-item-2",
                itemId: "item.wet-hero-ticket",
                quantity: 1,
                content: {
                  id: "item.wet-hero-ticket",
                  name: "Квиток мокрого пригодника",
                  description: "Трофей.",
                  rarity: "common",
                  slot: "junk",
                  priceless: true
                }
              }
            ]
          },
          0,
          "weapon"
        )
      )
    ).toEqual(["v1:equip:view", "v1:item:inventory", "v1:item:detail:item.pan-of-persuasion:s:w"]);
    expect(flatInlineButtonTexts(buildItemDetailKeyboard({ state: "not-owned" }))).toEqual([
      "⬅️ До манаток",
      "🛡️ Спорядження"
    ]);
    expect(flatInlineButtonTexts(buildItemDetailKeyboard({ state: "no-character" }))).toEqual([]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard({
          state: "found",
          item: {
            id: "character-item-1",
            itemId: "item.pan-of-persuasion",
            quantity: 1,
            content: {
              id: "item.pan-of-persuasion",
              name: "Пательня переконання",
              description: "Важкий аргумент.",
              rarity: "common",
              slot: "weapon",
              goldValue: 25
            }
          }
        })
      )
    ).toEqual(["🧥 Екіпірувати", "⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          "weapon"
        )
      )
    ).toEqual(["Зняти", "⬅️ До манаток", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonTexts(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          "weapon"
        )
      )
    ).toEqual(["🧥 Екіпірувати", "⬅️ До списку слота", "🛡️ Спорядження"]);
    expect(
      flatInlineButtonCallbacks(
        buildItemDetailKeyboard(
          {
            state: "found",
            item: {
              id: "character-item-1",
              itemId: "item.pan-of-persuasion",
              quantity: 1,
              content: {
                id: "item.pan-of-persuasion",
                name: "Пательня переконання",
                description: "Важкий аргумент.",
                rarity: "common",
                slot: "weapon",
                goldValue: 25
              }
            }
          },
          null,
          0,
          "weapon"
        )
      )
    ).toEqual(["v1:equip:item:item.pan-of-persuasion", "v1:item:inventory:s:w", "v1:equip:view"]);
    expect(flatInlineButtonTexts(buildEquipmentKeyboard({ state: "no-character" }))).toEqual([]);
    expect(
      flatInlineButtonTexts(
        buildEquipmentKeyboard({
          state: "ready",
          slots: [
            {
              slot: "weapon",
              item: {
                itemId: "item.pan-of-persuasion",
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              }
            },
            { slot: "head", item: null },
            { slot: "chest", item: null },
            { slot: "legs", item: null },
            {
              slot: "accessory",
              item: {
                itemId: "item.cork-ring-of-serious-business",
                content: {
                  id: "item.cork-ring-of-serious-business",
                  name: "Корковий перстень серйозних справ",
                  description: "Малий гачок обережно блищить.",
                  rarity: "common",
                  slot: "accessory",
                  goldValue: 6
                }
              }
            }
          ]
        })
      )
    ).toEqual([
      "🗡️ Показати зброю",
      "🧥 Показати тулуб",
      "💍 Показати аксесуари",
      "Зняти зброю",
      "Зняти аксесуар",
      "⬅️ До манаток"
    ]);
    expect(
      flatInlineButtonCallbacks(
        buildEquipmentKeyboard({
          state: "ready",
          slots: [
            {
              slot: "weapon",
              item: {
                itemId: "item.pan-of-persuasion",
                content: {
                  id: "item.pan-of-persuasion",
                  name: "Пательня переконання",
                  description: "Важкий аргумент.",
                  rarity: "common",
                  slot: "weapon",
                  goldValue: 25
                }
              }
            },
            { slot: "head", item: null },
            { slot: "chest", item: null },
            { slot: "legs", item: null },
            {
              slot: "accessory",
              item: {
                itemId: "item.cork-ring-of-serious-business",
                content: {
                  id: "item.cork-ring-of-serious-business",
                  name: "Корковий перстень серйозних справ",
                  description: "Малий гачок обережно блищить.",
                  rarity: "common",
                  slot: "accessory",
                  goldValue: 6
                }
              }
            }
          ]
        })
      )
    ).toEqual([
      "v1:item:inventory:s:w",
      "v1:item:inventory:s:c",
      "v1:item:inventory:s:a",
      "v1:equip:clear:weapon",
      "v1:equip:clear:accessory",
      "v1:item:inventory"
    ]);
  });

  it("offers manual Mantok Chest selection and compact item-index callbacks", () => {
    const token = "12345678-1234-4234-9234-123456789abc";

    expect(flatInlineButtonTexts(buildMantokChestOverviewKeyboard())).toEqual([
      "Згодувати 5 найдешевших",
      "Обрати вручну",
      "Що вона робить?",
      "⬅️ До манаток"
    ]);
    expect(flatInlineButtonCallbacks(buildMantokChestOverviewKeyboard())).toEqual([
      "v1:chest:auto",
      "v1:chest:manual",
      "v1:chest:help",
      "v1:chest:inventory"
    ]);

    const keyboard = buildMantokChestManualSelectionKeyboard({
      state: "selection",
      run: {
        id: "run-1",
        characterId: "character-42",
        token,
        status: "pending",
        inputItems: [],
        outputItems: [],
        averageInputScore: 30,
        minimumOutputScore: 31,
        outputScore: null,
        completedAt: null,
        createdAt: new Date("2026-06-15T07:30:00.000Z"),
        updatedAt: new Date("2026-06-15T07:30:00.000Z")
      },
      items: [
        {
          itemId: "item.generated-very-long-loot-id-that-must-not-enter-callback",
          quantity: 2,
          score: 30,
          manualOnly: false,
          index: 12,
          selectedQuantity: 1,
          availableQuantity: 2,
          content: {
            id: "item.generated-very-long-loot-id-that-must-not-enter-callback",
            name: "Довга манатка",
            description: "Тест.",
            rarity: "common",
            slot: "junk"
          }
        }
      ],
      selectedCount: 5,
      requiredCount: 5,
      eligibleCount: 9,
      page: 2,
      pageCount: 3
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "➖ Довга манатка",
      "✅ До підтвердження",
      "◀️ Назад",
      "3/3",
      "⬅️ Не годувати",
      "⬅️ До манаток"
    ]);
    const callbacks = flatInlineButtonCallbacks(keyboard);
    expect(callbacks).toEqual([
      `v1:chest:rm:${token}:2:12`,
      `v1:chest:preview:${token}`,
      `v1:chest:page:${token}:1`,
      `v1:chest:page:${token}:2`,
      `v1:chest:cancel:${token}`,
      "v1:chest:inventory"
    ]);
    expect(callbacks.every((callback) => Buffer.byteLength(callback, "utf8") <= 64)).toBe(true);
  });

  it("links Mantok Chest output directly to item details", () => {
    const keyboard = buildMantokChestResultKeyboard({
      itemId: "item.previous-approval-scale",
      content: {
        name: "Луска попереднього погодження"
      }
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🔎 Луска попереднього погодження",
      "♻️ Ще до Скрині",
      "⬅️ До манаток"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:item:detail:item.previous-approval-scale",
      "v1:chest:open",
      "v1:chest:inventory"
    ]);
  });

  it("links kept grownup cellar bottle directly to item details", () => {
    const keyboard = buildCellarGrownupKeyboard("completed", {
      includeKeptBottle: true
    });

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🔎 Пляшка Пінного Міражу",
      "📋 До справ",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:item:detail:item.cellar.foamy-mirage-bottle",
      "v1:place:quest-table",
      "v1:place:hall"
    ]);
  });

  it("routes an obtained grownup cellar bottle to the Шинок for turn-in", () => {
    const keyboard = buildCellarGrownupKeyboard("bottle-obtained");

    expect(flatInlineButtonTexts(keyboard)).toEqual([
      "🍻 До шинку",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(keyboard)).toEqual([
      "v1:place:bar",
      "v1:place:hall"
    ]);
  });

  it("builds quest hub buttons from available actions", () => {
    const fullHubKeyboard = buildQuestHubKeyboard({
      adventure: { state: "ready", character },
      fight: { state: "ready", character },
      yeger: { state: "offered", character, progress: { wins: 0, target: 5 } },
      cellar: { state: "ready", character }
    });

    expect(
      flatInlineButtonTexts(
        fullHubKeyboard
      )
    ).toEqual([
      "🪧 Обрати пригоду",
      "⚔️ До сутички",
      "🏹 До Єгеря",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);
    expect(inlineButtonRows(fullHubKeyboard)).toContainEqual(["📦 Архів", "📖 Бестіарій"]);

    const level13HubKeyboard = buildQuestHubKeyboard({
      adventure: { state: "level-retired", character, maxLevel: 2 },
      fight: {
        state: "persistent-ready",
        character,
        questProgress: {
          stageId: "13",
          title: "Тринадцять дрібних проблем",
          wins: 13,
          target: 13,
          completed: true,
          rewardClaimed: true,
          issued: true,
          branchComplete: false
        }
      },
      yeger: {
        state: "completed",
        character,
        progress: { wins: 5, target: 5 },
        reward: { xp: 80, gold: 120, itemGrants: [] }
      },
      cellar: { state: "level-retired", character, maxLevel: 3, completed: false },
      characterLevel: 13
    });

    expect(flatInlineButtonTexts(level13HubKeyboard)).toEqual([
      "🕯️ Реморт",
      "🍻 До шинку",
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);
    expect(flatInlineButtonCallbacks(level13HubKeyboard)).toContain("v1:rm:open");

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "persistent-ready",
            character,
            questProgress: {
              stageId: "13",
              title: "Тринадцять дрібних проблем",
              wins: 0,
              target: 13,
              completed: false,
              rewardClaimed: false,
              issued: true,
              branchComplete: false
            }
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: { state: "level-retired", character, maxLevel: 3, completed: false }
        })
      )
    ).toEqual([
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "persistent-active",
            character,
            session: persistentFightSession(),
            monster: {
              id: "monster.test",
              name: "Проблема з тестами",
              description: "Стоїть, чекає.",
              level: 3,
              tags: []
            },
            questProgress: {
              stageId: "13",
              title: "Тринадцять дрібних проблем",
              wins: 4,
              target: 13,
              completed: false,
              rewardClaimed: false,
              issued: true,
              branchComplete: false
            }
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: { state: "level-retired", character, maxLevel: 3, completed: false }
        })
      )
    ).toEqual([
      "🪜 До Низу",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "already-completed",
            character,
            fightAvailable: false
          },
          fight: {
            state: "already-completed",
            character,
            questAvailable: false
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: { state: "ready", character }
        })
      )
    ).toEqual([
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          yeger: { state: "offered", character, progress: { wins: 0, target: 5 } },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3,
            completed: false
          }
        })
      )
    ).toEqual([
      "🏹 До Єгеря",
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3,
            completed: false
          }
        })
      )
    ).toEqual([
      "🧹 У льох",
      "📦 Архів",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);

    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          mode: "archive",
          adventure: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          fight: {
            state: "level-retired",
            character,
            maxLevel: 2
          },
          yeger: {
            state: "completed",
            character,
            progress: { wins: 5, target: 5 },
            reward: { xp: 80, gold: 120, itemGrants: [] }
          },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3,
            completed: false
          }
        })
      )
    ).toEqual(["📋 До справ", "📖 Бестіарій", "🍺 До зали"]);
  });
});

const character = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Пригодники",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: {
      stat: "strength",
      bonus: 0
    }
  }
} as const;

const huntContract = {
  localPeriodId: "2026-06-14T08",
  contractToken: "abc1234",
  monster: {
    id: "monster.stamp-doorkeeper-skeleton",
    name: "Скелет-вахтер печаток",
    description: "Не пускає навіть смерть без пропуску.",
    level: 2,
    tags: ["undead"]
  },
  startFlavor: null
} as const;

const emptyRoundLeaderboard = {
  day: [],
  week: [],
  month: []
};

function readyHunt() {
  return {
    state: "ready",
    character,
    contract: huntContract
  } as const;
}

function persistentFightSession(): SoloCombatSessionRecord {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    characterId: "character-42",
    monsterId: "monster.test",
    status: "active",
    turn: 4,
    state: {
      id: "123e4567-e89b-12d3-a456-426614174000",
      turn: 4,
      status: "active",
      hero: {
        hp: 20,
        hpMax: 20,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: "monster.test",
        hp: 8,
        hpMax: 18
      }
    },
    reward: null,
    createdAt: new Date("2026-06-12T10:30:00.000Z"),
    updatedAt: new Date("2026-06-12T10:30:00.000Z"),
    expiresAt: new Date("2026-06-12T11:00:00.000Z")
  };
}

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function inlineButtonRows(keyboard: { inline_keyboard: { text: string }[][] }): string[][] {
  return keyboard.inline_keyboard.map((row) => row.map((button) => button.text));
}

function flatInlineButtonCallbacks(
  keyboard: { inline_keyboard: { callback_data?: string }[][] }
): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}

function replyKeyboardTexts(keyboard: unknown): string[][] {
  const rows = keyboard as Array<Array<{ text: string }>>;

  return rows.map((row) => row.map((button) => button.text));
}

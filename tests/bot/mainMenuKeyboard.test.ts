import { describe, expect, it } from "vitest";
import {
  buildAdventureParticipantsKeyboard,
  buildAdventureKeyboard,
  buildAdventureResultKeyboard
} from "../../src/bot/keyboards/adventureKeyboard";
import {
  buildCellarKeyboard,
  buildCellarParticipantsKeyboard,
  buildCellarResultKeyboard
} from "../../src/bot/keyboards/cellarKeyboard";
import { buildFightKeyboard, buildFightResultKeyboard } from "../../src/bot/keyboards/fightKeyboard";
import { buildHuntBoardKeyboard } from "../../src/bot/keyboards/huntKeyboard";
import {
  buildEquipmentKeyboard,
  buildInventoryKeyboard,
  buildItemDetailKeyboard
} from "../../src/bot/keyboards/inventoryKeyboard";
import {
  buildDevResetKeyboard,
  buildMainMenuKeyboard,
  buildRestartKeyboard,
  mainMenuButtons
} from "../../src/bot/keyboards/mainMenuKeyboard";
import { buildQuestHubKeyboard } from "../../src/bot/keyboards/questHubKeyboard";
import {
  buildKorchmaArrivalBoardKeyboard,
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
  buildKorchmaRoundOfferKeyboard,
  buildTavernParticipantsKeyboard,
  buildTavernRangerKeyboard,
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../../src/bot/keyboards/tavernKeyboard";

describe("main menu and scene keyboards", () => {
  it("builds the universal menu as a persistent reply keyboard", () => {
    const keyboard = buildMainMenuKeyboard();

    expect(replyKeyboardTexts(keyboard.keyboard)).toEqual([
      [mainMenuButtons.hero, mainMenuButtons.tavern],
      [mainMenuButtons.quest, mainMenuButtons.inventory],
      [mainMenuButtons.guild, mainMenuButtons.help]
    ]);
    expect(replyKeyboardTexts(keyboard.keyboard).flat()).not.toContain("👀 Озирнутися");
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });

  it("builds korchma place navigation", () => {
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "📜 Табличка прибулих"
    ]);
    expect(flatInlineButtonCallbacks(buildKorchmaFrontKeyboard())).toEqual([
      "v1:place:hall",
      "v1:place:arrivals"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaArrivalBoardKeyboard())).toEqual([
      "🚪 Зайти в корчму",
      "⬅️ До дверей"
    ]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard())).toEqual([
      "📋 Стіл зі справами",
      "🛢️ Бочка",
      "🍻 Всім пива",
      "📰 Дошка вістей",
      "🐭 Підвал",
      "🚪 Надвір"
    ]);
  });

  it("keeps tavern inline buttons scoped to tavern actions", () => {
    expect(flatInlineButtonTexts(buildTavernKeyboard())).toEqual([
      "🍺 У рейд на бочку",
      "👥 Учасники",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed"))).toEqual([
      "👥 Учасники",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("already-completed"))).toEqual([
      "👥 Учасники",
      "🧥 Єгер",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("pending"))).toEqual([
      "🍺 Перевірити бочку",
      "👥 Учасники"
    ]);
    expect(flatInlineButtonCallbacks(buildTavernResultKeyboard("pending"))).toEqual([
      "v1:tavern:raid",
      "v1:tavern:participants"
    ]);
    expect(flatInlineButtonTexts(buildTavernParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildTavernParticipantsKeyboard())).toEqual(["v1:place:barrel"]);
    expect(flatInlineButtonTexts(buildTavernRangerKeyboard())).toEqual(["⬅️ До зали"]);
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
    ).toEqual(["🍻 Якісне — 100", "🍺 Просте — 10", "⬅️ До зали"]);
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
    ).toEqual(["v1:tavern:round-simple", "v1:place:hall"]);
  });

  it("keeps adventure inline buttons scoped to quest actions and participants", () => {
    const actionButtons = [
      "🌯 Тицьнути шаурму",
      "📋 Попросити чек",
      "🏃 Обережно відступити",
      "👥 Учасники",
      "⬅️ До столу"
    ];

    expect(flatInlineButtonTexts(buildAdventureKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("completed"))).toEqual([
      "👥 Учасники",
      "⬅️ До столу"
    ]);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("already-completed"))).toEqual([
      "👥 Учасники",
      "⬅️ До столу"
    ]);
    expect(flatInlineButtonTexts(buildAdventureParticipantsKeyboard())).toEqual(["⬅️ Назад"]);
    expect(flatInlineButtonCallbacks(buildAdventureParticipantsKeyboard())).toEqual([
      "v1:quest:adventure"
    ]);
  });

  it("keeps character-aware adventure labels on the same callback actions", () => {
    expect(flatInlineButtonTexts(buildAdventureKeyboard({ ...character, classId: "class.rogue" }))).toEqual([
      "🗝️ Перевірити кишені",
      "📋 Виманити чек",
      "🏃 Зникнути за серветкою",
      "👥 Учасники",
      "⬅️ До столу"
    ]);
    expect(flatInlineButtonCallbacks(buildAdventureKeyboard({ ...character, classId: "class.rogue" }))).toEqual([
      "v1:adv:mimic:poke",
      "v1:adv:mimic:receipt",
      "v1:adv:mimic:flee",
      "v1:adv:mimic:participants",
      "v1:place:quest-table"
    ]);
  });

  it("keeps cellar inline buttons scoped to repeatable errand actions", () => {
    const actionButtons = [
      "🧀 Поставити сирну пастку",
      "🧹 Підмести хоробро",
      "🤝 Домовитись із мишею",
      "👥 Учасники",
      "⬅️ До зали"
    ];

    expect(flatInlineButtonTexts(buildCellarKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("completed"))).toEqual([
      "👥 Учасники",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("on-cooldown"))).toEqual([
      "👥 Учасники",
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
      "👥 Учасники",
      "⬅️ До зали"
    ]);
    expect(flatInlineButtonCallbacks(buildCellarKeyboard(domovyk))).toEqual([
      "v1:cellar:cheese-trap",
      "v1:cellar:sweep-bravely",
      "v1:cellar:negotiate",
      "v1:cellar:participants",
      "v1:place:hall"
    ]);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready", domovyk))).toEqual([
      "🧀 Виставити оренду сиром",
      "🧹 Навести хатній лад",
      "🤝 Поділити шафу",
      "👥 Учасники",
      "⬅️ До зали"
    ]);
  });

  it("keeps fight inline buttons scoped to fight actions", () => {
    const actionButtons = [
      "🗡️ Вдарити",
      "📋 Збити з пантелику чеком",
      "🏃 Відступити красиво",
      "⬅️ До столу"
    ];

    expect(flatInlineButtonTexts(buildFightKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("already-completed"))).toEqual([
      "⬅️ До столу"
    ]);
  });

  it("keeps character-aware fight labels on the same callback actions", () => {
    expect(flatInlineButtonTexts(buildFightKeyboard({ ...character, classId: "class.bard" }))).toEqual([
      "🎵 Вдарити приспівом",
      "📋 Заспівати про чек",
      "🏃 Піти на біс",
      "⬅️ До столу"
    ]);
    expect(flatInlineButtonCallbacks(buildFightKeyboard({ ...character, classId: "class.bard" }))).toEqual([
      "v1:fight:mimic:attack",
      "v1:fight:mimic:receipt",
      "v1:fight:mimic:flee",
      "v1:place:quest-table"
    ]);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed", { ...character, classId: "class.bard" }))).toEqual([
      "🎵 Вдарити приспівом",
      "📋 Заспівати про чек",
      "🏃 Піти на біс",
      "⬅️ До столу"
    ]);
  });

  it("keeps hunt board inline buttons scoped to hunt actions", () => {
    expect(flatInlineButtonTexts(buildHuntBoardKeyboard(readyHunt()))).toEqual([
      "🗡️ Вдарити по проблемі",
      "🎭 Обдурити проблему",
      "📋 Закрити актом",
      "📖 Запис у бестіарії",
      "⬅️ До столу"
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
    ).toEqual(["🛡️ Спорядження", "🔎 Квиток мокрого пригодника"]);
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
    ).toEqual(["v1:equip:view", "v1:item:detail:item.wet-hero-ticket"]);
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
    ).toEqual(["🛡️ Спорядження", "🔎 Манатка 9", "◀️ Назад", "2/2"]);
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
      "v1:item:detail:item.test-9:1",
      "v1:item:inventory",
      "v1:item:inventory:1"
    ]);
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
    ).toEqual(["Зняти зброю", "Зняти аксесуар", "⬅️ До манаток"]);
  });

  it("builds quest hub buttons from available actions", () => {
    expect(
      flatInlineButtonTexts(
        buildQuestHubKeyboard({
          adventure: { state: "ready", character },
          fight: { state: "ready", character },
          hunt: { state: "ready", character, contract: huntContract },
          cellar: { state: "ready", character }
        })
      )
    ).toEqual([
      "🌯 До шаурми",
      "⚔️ До сутички",
      "🏹 До дошки",
      "🧹 У підвал",
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
          hunt: {
            state: "already-completed",
            character,
            contract: huntContract
          },
          cellar: { state: "ready", character }
        })
      )
    ).toEqual(["🧹 У підвал", "📖 Бестіарій", "🍺 До зали"]);

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
          hunt: { state: "ready", character, contract: huntContract },
          cellar: {
            state: "level-retired",
            character,
            maxLevel: 3
          }
        })
      )
    ).toEqual(["🏹 До дошки", "📖 Бестіарій", "🍺 До зали"]);
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

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
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

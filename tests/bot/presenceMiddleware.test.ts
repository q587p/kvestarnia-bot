import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeAdventureCallbackData } from "../../src/bot/callbacks/adventureCallbackData";
import { makeBestiaryMonsterCallbackData } from "../../src/bot/callbacks/bestiaryCallbackData";
import { makeCellarCallbackData } from "../../src/bot/callbacks/cellarCallbackData";
import { makeDuelNewCallbackData } from "../../src/bot/callbacks/duelCallbackData";
import {
  makeFightCallbackData,
  makeFightGearActionCallbackData,
  makeFightTurnCallbackData
} from "../../src/bot/callbacks/fightCallbackData";
import { makeHuntActionCallbackData } from "../../src/bot/callbacks/huntCallbackData";
import {
  makePartyBossGearActionCallbackData,
  makePartyBossItemsMenuCallbackData,
  makePartyBossItemUseCallbackData,
  makePartySessionViewCallbackData
} from "../../src/bot/callbacks/partySessionCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { makeRemortConfirmCallbackData } from "../../src/bot/callbacks/remortCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import type { PartyBossSessionRecord } from "../../src/db/repositories/partyBossRepository";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import { TRAINING_DOPPELGANGER_MONSTER_ID } from "../../src/domain/trainingDoppelganger";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_DUEL_CHALLENGE,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_RAID_FRIDAY_BARREL,
  type MarkPlayerPresenceInput,
  type OnlineSnapshot,
  type PresenceGroup
} from "../../src/services/presenceService";

describe("presence middleware", () => {
  it("marks /quest as an action without forcing a location before routing", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/quest"));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it("marks /fight as an action without forcing a quest-table teleport", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/fight"));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it.each(["list", "archive"] as const)(
    "does not pre-mark quest table for outside quest %s callbacks",
    async (action) => {
      const presence = new CapturingPresenceService();
      const bot = createTestBot(presence, questHubReadyServices());
      await bot.init();

      await bot.handleUpdate(callbackUpdate(makeQuestCallbackData(action)));

      expect(presence.marks).toEqual([
        {
          user: {
            telegramUserId: 42n,
            displayName: "Тест"
          }
        }
      ]);
    }
  );

  it.each(["list", "archive"] as const)(
    "marks quest table for inside quest %s callbacks only after handler gates",
    async (action) => {
      const presence = new CapturingPresenceService();
      presence.currentPlace = {
        state: "ready",
        locationId: PRESENCE_LOCATION_KORCHMA_HALL,
        locationName: "Зала корчми",
        insideKorchma: true
      };
      const bot = createTestBot(presence, questHubReadyServices());
      await bot.init();

      await bot.handleUpdate(callbackUpdate(makeQuestCallbackData(action)));

      expect(presence.marks[0]).toEqual({
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      });
      expect(presence.marks[1]).toMatchObject({
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: null
      });
    }
  );

  it("does not create a duel challenge from a stale outside duel-new callback", async () => {
    const presence = new CapturingPresenceService();
    let createCount = 0;
    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter(() => {
        createCount += 1;
      })
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeDuelNewCallbackData()));

    expect(createCount).toBe(0);
  });

  it("creates a duel challenge from duel-new callbacks inside the korchma", async () => {
    const presence = new CapturingPresenceService();
    presence.currentPlace = {
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      locationName: "Зала корчми",
      insideKorchma: true
    };
    let createCount = 0;
    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter(() => {
        createCount += 1;
      })
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeDuelNewCallbackData()));

    expect(createCount).toBe(1);
    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_DUEL_CHALLENGE
    });
  });

  it("does not teleport presence to the quest table when an outside duel-new callback is blocked", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter()
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeDuelNewCallbackData()));

    expect(presence.marks).toEqual([]);
  });

  it("marks handled callbacks with raid context", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeTavernCallbackData("raid")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
      currentAdventureId: null
    });
  });

  it("marks korchma round callbacks as Шинок actions, not barrel raid presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeTavernCallbackData("round")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks Shynok callbacks as bar actions that clear stale barrel raid presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:sh:round:s"));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it.each([
    ["ranger", "v1:tavern:ranger"],
    ["round", makeTavernCallbackData("round")],
    ["news", "v1:news:latest"]
  ])("keeps active combat presence instead of stamping blocked %s destination", async (_name, callbackData) => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      fight: activePersistentFightService()
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(callbackData));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
    });
  });

  it.each([
    ["/dev_heal 7", "heal"],
    ["/dev_restore_mana 4", "restoreMana"],
    ["/dev_add_bandage 5", "addBandages"],
    ["/dev_add_dense_bandage 2", "addDenseBandages"],
    ["/dev_add_field_kit 3", "addFieldKits"],
    ["/dev_add_iskrokamin 5", "addIskrokamin"],
    ["/dev_add_yeger_line 4", "addYegerLines"],
    ["/dev_reset_yeger_trail", "resetYegerTrackingCooldown"],
    ["/dev_reset_cellar_mouse", "resetCellarMouseCooldown"],
    ["/dev_reset_priest_blessing", "resetPriestBlessingCooldown"],
    ["/dev_reset_quiet_pocket", "resetQuietPocketCooldown"],
    ["/dev_reset_bureaucramancer_protocol", "resetBureaucramancerProtocolCooldown"],
    ["/dev_reset_rogue", "resetRogue"],
    ["/dev_yeger_first_done", "completeFirstYegerQuestProgress"],
    ["/dev_yeger_second_done", "completeSecondYegerQuestProgress"]
  ] as const)("lets %s bypass the active combat lock for local QA", async (command, methodName) => {
    const presence = new CapturingPresenceService();
    const calls: string[] = [];
    const bot = createTestBot(presence, {
      fight: activePersistentFightService(),
      devGrant: {
        isEnabled: () => true,
        heal: () => {
          calls.push("heal");
          return Promise.resolve({
            state: "updated" as const,
            kind: "heal" as const,
            amount: 7,
            character: characterRecord()
          });
        },
        restoreMana: () => {
          calls.push("restoreMana");
          return Promise.resolve({
            state: "updated" as const,
            kind: "mana" as const,
            amount: 4,
            character: characterRecord()
          });
        },
        addBandages: () => {
          calls.push("addBandages");
          return Promise.resolve({
            state: "updated" as const,
            kind: "items" as const,
            amount: 5,
            character: characterRecord(),
            itemGrants: [{
              itemId: "item.responsible-panic-bandage",
              name: "Бинт відповідальної паніки",
              quantity: 5
            }]
          });
        },
        addDenseBandages: () => {
          calls.push("addDenseBandages");
          return Promise.resolve({
            state: "updated" as const,
            kind: "items" as const,
            amount: 2,
            character: characterRecord(),
            itemGrants: [{
              itemId: "item.dense-bandage",
              name: "Щільний бинт",
              quantity: 2
            }]
          });
        },
        addFieldKits: () => {
          calls.push("addFieldKits");
          return Promise.resolve({
            state: "updated" as const,
            kind: "items" as const,
            amount: 3,
            character: characterRecord(),
            itemGrants: [{
              itemId: "item.field-kit",
              name: "Польова аптечка",
              quantity: 3
            }]
          });
        },
        addIskrokamin: () => {
          calls.push("addIskrokamin");
          return Promise.resolve({
            state: "updated" as const,
            kind: "items" as const,
            amount: 5,
            character: characterRecord(),
            itemGrants: [{
              itemId: "item.iskrokamin",
              name: "Іскрокамінь",
              quantity: 5
            }]
          });
        },
        addYegerLines: () => {
          calls.push("addYegerLines");
          return Promise.resolve({
            state: "updated" as const,
            kind: "items" as const,
            amount: 4,
            character: characterRecord(),
            itemGrants: [{
              itemId: "item.yeger.first-notch",
              name: "Єгерська риска на дощечці",
              quantity: 4
            }]
          });
        },
        resetYegerTrackingCooldown: () => {
          calls.push("resetYegerTrackingCooldown");
          return Promise.resolve({
            state: "updated" as const,
            kind: "yeger-tracking-cooldown" as const,
            character: characterRecord(),
            cleared: true
          });
        },
        resetCellarMouseCooldown: () => {
          calls.push("resetCellarMouseCooldown");
          return Promise.resolve({
            state: "updated" as const,
            kind: "cellar-mouse-cooldown" as const,
            character: characterRecord(),
            cleared: true
          });
        },
        completeFirstYegerQuestProgress: () => {
          calls.push("completeFirstYegerQuestProgress");
          return Promise.resolve({
            state: "updated" as const,
            kind: "yeger-quest-progress" as const,
            stage: "first" as const,
            addedWins: 5,
            wins: 5,
            target: 5,
            started: true,
            character: characterRecord()
          });
        },
        resetPriestBlessingCooldown: () => {
          calls.push("resetPriestBlessingCooldown");
          return Promise.resolve({
            state: "updated" as const,
            kind: "priest-blessing-cooldown" as const,
            character: characterRecord(),
            cleared: true
          });
        },
        resetQuietPocketCooldown: () => {
          calls.push("resetQuietPocketCooldown");
          return Promise.resolve({
            state: "updated" as const,
            kind: "quiet-pocket-cooldown" as const,
            character: characterRecord(),
            cleared: true
          });
        },
        resetBureaucramancerProtocolCooldown: () => {
          calls.push("resetBureaucramancerProtocolCooldown");
          return Promise.resolve({
            state: "updated" as const,
            kind: "bureaucramancer-protocol-cooldown" as const,
            character: characterRecord(),
            cleared: true
          });
        },
        resetRogue: () => {
          calls.push("resetRogue");
          return Promise.resolve({
            state: "updated" as const,
            kind: "rogue-reset" as const,
            character: characterRecord(),
            clearedCooldown: true,
            deletedAttempts: 2
          });
        },
        completeSecondYegerQuestProgress: () => {
          calls.push("completeSecondYegerQuestProgress");
          return Promise.resolve({
            state: "updated" as const,
            kind: "yeger-quest-progress" as const,
            stage: "second" as const,
            addedWins: 17,
            wins: 17,
            target: 17,
            started: true,
            character: characterRecord()
          });
        }
      } as unknown as BotServices["devGrant"]
    });
    await bot.init();

    await bot.handleUpdate(commandUpdate(command));

    expect(calls).toContain(methodName);
    expect(presence.marks).not.toContainEqual(expect.objectContaining({
      currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
    }));
  });

  it("lets party boss refresh bypass the active combat lock", async () => {
    const presence = new CapturingPresenceService();
    const boss = activePartyBossSession();
    let refreshed = false;
    const bot = createTestBot(presence, {
      partySessions: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false
      } as NonNullable<BotServices["partySessions"]>,
      partyBoss: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false,
        getActiveForTelegramUser: () => {
          throw new Error("party refresh should not be intercepted by the combat lock");
        },
        getByPartyInviteToken: () => {
          refreshed = true;
          return Promise.resolve(boss);
        },
        hasCombatItemsForTelegramUser: () => Promise.resolve(false)
      } as unknown as NonNullable<BotServices["partyBoss"]>
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePartySessionViewCallbackData(boss.partyInviteToken)));

    expect(refreshed).toBe(true);
  });

  it("lets party boss item-use callbacks bypass the active combat lock", async () => {
    const presence = new CapturingPresenceService();
    const boss = activePartyBossSession();
    const submitItemForTelegramUser = vi.fn().mockResolvedValue({
      state: "queued" as const,
      session: boss
    });
    const bot = createTestBot(presence, {
      partySessions: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false
      } as NonNullable<BotServices["partySessions"]>,
      partyBoss: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false,
        getActiveForTelegramUser: () => {
          throw new Error("party item use should not be intercepted by the combat lock");
        },
        submitItemForTelegramUser,
        hasCombatItemsForTelegramUser: () => Promise.resolve(false)
      } as unknown as NonNullable<BotServices["partyBoss"]>
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePartyBossItemUseCallbackData({
      token: boss.partyInviteToken,
      turn: boss.turn,
      itemKey: "bandage"
    })));

    expect(submitItemForTelegramUser).toHaveBeenCalledWith(42n, boss.partyInviteToken, boss.turn, "bandage");
  });

  it("lets party boss item-menu callbacks bypass the active combat lock", async () => {
    const presence = new CapturingPresenceService();
    const boss = activePartyBossSession();
    const listCombatItemsForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready" as const,
      session: boss,
      items: []
    });
    const bot = createTestBot(presence, {
      partySessions: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false
      } as NonNullable<BotServices["partySessions"]>,
      partyBoss: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false,
        getActiveForTelegramUser: () => {
          throw new Error("party item menu should not be intercepted by the combat lock");
        },
        listCombatItemsForTelegramUser
      } as unknown as NonNullable<BotServices["partyBoss"]>
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePartyBossItemsMenuCallbackData(
      boss.partyInviteToken,
      boss.turn
    )));

    expect(listCombatItemsForTelegramUser).toHaveBeenCalledWith(42n, boss.partyInviteToken, boss.turn);
  });

  it("lets party boss gear callbacks bypass the active combat lock", async () => {
    const presence = new CapturingPresenceService();
    const boss = activePartyBossSession();
    const submitGearForTelegramUser = vi.fn().mockResolvedValue({
      state: "queued" as const,
      session: boss
    });
    const bot = createTestBot(presence, {
      partySessions: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false
      } as NonNullable<BotServices["partySessions"]>,
      partyBoss: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false,
        getActiveForTelegramUser: () => {
          throw new Error("party gear action should not be intercepted by the combat lock");
        },
        submitGearForTelegramUser,
        hasCombatItemsForTelegramUser: () => Promise.resolve(false)
      } as unknown as NonNullable<BotServices["partyBoss"]>
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePartyBossGearActionCallbackData({
      token: boss.partyInviteToken,
      turn: boss.turn,
      grantKey: "rldagr"
    })));

    expect(submitGearForTelegramUser).toHaveBeenCalledWith(42n, boss.partyInviteToken, boss.turn, "rldagr");
  });

  it("keeps active training combat presence instead of stamping blocked tavern destination", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      fight: {
        getFightOverviewForTelegramUser: () =>
          Promise.resolve({
            state: "training-active",
            character,
            session: activeTrainingSession(),
            questProgress: null
          })
      },
      trainingDoppelganger: {
        getStartOptionsForTelegramUser: () =>
          Promise.resolve({
            state: "active",
            character,
            session: activeTrainingSession(),
            monster: {
              id: TRAINING_DOPPELGANGER_MONSTER_ID,
              name: "Сумлінний Допельґанґер",
              raceName: "Людисько",
              className: "Воїн",
              title: "Пересічні Пригодники",
              level: 3,
              spawnMode: "COPY_TARGET",
              source: "target",
              copiedEquipmentCount: 0
            }
          })
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePlaceCallbackData("hall")));

    expect(presence.marks).toHaveLength(1);
    expect(presence.marks[0]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
    });
  });

  it("keeps pending raid guard before combat lock without stamping blocked destination", async () => {
    const presence = new CapturingPresenceService();
    let fightOverviewCalls = 0;
    const bot = createTestBot(presence, {
      tavern: pendingTavernService(),
      fight: {
        getFightOverviewForTelegramUser: () => {
          fightOverviewCalls += 1;
          return Promise.resolve({
            state: "persistent-active",
            character,
            session: activePersistentSession(),
            monster: null,
            questProgress: null
          });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePlaceCallbackData("hall")));

    expect(fightOverviewCalls).toBe(0);
    expect(presence.marks).toEqual([]);
  });

  it("marks korchma place callbacks only after handler gates pass", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: readyTavernService()
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makePlaceCallbackData("hall")));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
    expect(presence.marks[1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks /start as activity without moving the saved location", async () => {
    const presence = new CapturingPresenceService();
    presence.currentPlace = {
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      locationName: "Зала корчми",
      insideKorchma: true
    };
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/start"));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it("keeps duel start deep links at the current location", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("/start duel_abc_DEF12"));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
  });

  it("marks the legacy korchma menu button as the current place", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: readyTavernService()
    });
    await bot.init();

    await bot.handleUpdate(messageUpdate("🍺 Корчма"));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
    expect(presence.marks[1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    });
  });

  it("marks the nearby menu button as a neutral online action", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("👀 Хто поруч"));

    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("shows the party invite picker from the nearby menu button", async () => {
    const presence = new CapturingPresenceService();
    presence.onlineSnapshot = {
      state: "ready",
      globalTotal: 2,
      location: {
        id: PRESENCE_LOCATION_KORCHMA_BAR,
        name: "Шинок",
        people: {
          active: [
            { telegramUserId: 42n, name: "Мандрівник", status: "active" },
            { telegramUserId: 93n, name: "Сусід", status: "active" }
          ],
          idle: [],
          total: 2
        }
      },
      activity: null
    };

    const bot = createTestBot(presence, {
      duel: duelServiceWithCreateCounter(),
      partySessions: {
        isEnabled: () => true,
        areDevHelpersEnabled: () => false,
        getLiveRecruitingByTelegramUser: () => Promise.resolve({ id: "party-1" })
      } as unknown as NonNullable<BotServices["partySessions"]>
    });
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use((prev, method, payload, signal) => {
      calls.push({ method, payload });
      return prev(method, payload, signal);
    });
    await bot.init();

    await bot.handleUpdate(messageUpdate("👀 Хто поруч"));

    const sendMessage = calls.find((call) => call.method === "sendMessage");
    const payload = JSON.stringify(sendMessage?.payload);
    expect(payload).toContain("🧭 Покликати у ватагу");
    expect(payload).toContain("v1:party:no");
    expect(payload).toContain("🥊 Кинути виклик присутнім");
  });

  it("opens the Rogue quiet pocket card from the nearby menu callback", async () => {
    const presence = new CapturingPresenceService();
    const openForTelegramUser = vi.fn().mockResolvedValue({
      state: "ready",
      mode: "rogue",
      character: {
        ...character,
        classId: "class.rogue",
        className: "Злодій",
        level: 3
      },
      actorBlocked: false,
      locationName: "Зала корчми",
      targets: [
        {
          telegramUserId: 93n,
          name: "Сусід",
          remortCount: 0,
          level: 3,
          hpCurrent: 20,
          hpMax: 20,
          manaCurrent: 10,
          manaMax: 10,
          canPriestAid: false,
          canRoguePickpocket: true,
          rogueAttemptedToday: false
        }
      ],
      targetPage: 0,
      targetTotalPages: 1,
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: null,
      roguePickpocketCooldownAvailableAt: null
    });
    const bot = createTestBot(presence, {
      classNoncombat: {
        openForTelegramUser
      } as unknown as NonNullable<BotServices["classNoncombat"]>
    });
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use((prev, method, payload, signal) => {
      calls.push({ method, payload });
      return prev(method, payload, signal);
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:nc:o:r:0"));

    expect(openForTelegramUser).toHaveBeenCalledWith(42n, "rogue", 0);
    expect(calls.some((call) => call.method === "answerCallbackQuery")).toBe(true);
    const editCall = calls.find((call) => call.method === "editMessageText");
    expect(String(editCall?.payload.text)).toContain("🗡️ <b>Тиха кишеня</b>");
    expect(JSON.stringify(editCall?.payload.reply_markup)).toContain("v1:nc:p:2l");
  });

  it("answers unknown callback payloads instead of leaving Telegram blinking", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use((prev, method, payload, signal) => {
      calls.push({ method, payload });
      return prev(method, payload, signal);
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:missing:route"));

    const answer = calls.find((call) => call.method === "answerCallbackQuery");
    expect(answer?.payload.text).toContain("Ця кнопка вже втратила магію");
    expect(answer?.payload.show_alert).toBe(true);
  });

  it("marks successful cellar action callbacks with cellar presence after handler gates", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      cellarErrand: {
        getForTelegramUser: () => Promise.resolve({ state: "ready", character }),
        complete: () =>
          Promise.resolve({
            state: "completed",
            action: "negotiate",
            character,
            reward: {
              xp: 2,
              gold: 1,
              itemGrants: []
            },
            availableAt: new Date("2026-06-13T10:03:00.000Z"),
            now: new Date("2026-06-13T10:00:00.000Z"),
            levelChange: {
              oldLevel: 2,
              newLevel: 2,
              leveledUp: false
            }
          })
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeCellarCallbackData("negotiate")));

    expect(presence.marks[0]).toEqual({
      user: {
        telegramUserId: 42n,
        displayName: "Тест"
      }
    });
    expect(presence.marks[1]).toMatchObject({
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
  });

  it.each([
    {
      name: "korchma menu button",
      update: messageUpdate("🍺 Корчма")
    },
    {
      name: "/tavern command",
      update: commandUpdate("/tavern")
    }
  ])(
    "keeps $name at the barrel during a pending raid",
    async ({ update }) => {
      const presence = new CapturingPresenceService();
      const bot = createTestBot(presence, {
        tavern: pendingTavernService()
      });
      await bot.init();

      await bot.handleUpdate(update);

      expect(presence.marks[0]).toEqual({
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      });
      expect(presence.marks[1]).toMatchObject({
        locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
        currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
        currentAdventureId: null
      });
    }
  );

  it.each([
    {
      name: "adventure",
      callbackData: makeAdventureCallbackData("poke")
    },
    {
      name: "hunt",
      callbackData: makeHuntActionCallbackData("2026-06-14T08", "abc1234", "strike")
    },
    {
      name: "bestiary",
      callbackData: makeBestiaryMonsterCallbackData("monster.deadline-spider", 0)
    },
    {
      name: "cellar",
      callbackData: makeCellarCallbackData("negotiate")
    },
    {
      name: "remort",
      callbackData: makeRemortConfirmCallbackData("0123456789abcdef")
    },
    {
      name: "hall place",
      callbackData: makePlaceCallbackData("hall")
    },
    {
      name: "quest-table place",
      callbackData: makePlaceCallbackData("quest-table")
    },
    {
      name: "cellar place",
      callbackData: makePlaceCallbackData("cellar")
    },
    {
      name: "front place",
      callbackData: makePlaceCallbackData("front")
    }
  ])("does not move presence from stale $name callbacks during a pending barrel raid", async ({ callbackData }) => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: {
        getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
        completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
        getActivePendingFridayBarrelRaidForTelegramUser: () =>
          Promise.resolve({
            state: "pending",
            character,
            availableAt: new Date("2026-06-13T10:33:00.000Z"),
            now: new Date("2026-06-13T10:30:00.000Z")
          }),
        getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(callbackData));

    expect(presence.marks).toEqual([]);
  });

  it.each([
    {
      name: "starter mimic",
      callbackData: makeFightCallbackData("attack")
    },
    {
      name: "persistent turn",
      callbackData: makeFightTurnCallbackData({
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 1,
        action: "attack"
      })
    }
  ])("lets $name combat callbacks keep their neutral heartbeat during pending raid", async ({ callbackData }) => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence, {
      tavern: pendingTavernService()
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(callbackData));

    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("lets persistent gear callbacks bypass the active combat lock", async () => {
    const presence = new CapturingPresenceService();
    const resolvePersistentFightTurn = vi.fn().mockResolvedValue({ state: "not-found" });
    const bot = createTestBot(presence, {
      fight: {
        getFightOverviewForTelegramUser: () => {
          throw new Error("gear callbacks should not be intercepted by the combat lock");
        },
        resolvePersistentFightTurn,
        getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
      } as unknown as NonNullable<BotServices["fight"]>
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeFightGearActionCallbackData({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 1,
      grantKey: "rldagr"
    })));

    expect(resolvePersistentFightTurn).toHaveBeenCalledWith(42n, {
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 1,
      action: "gear",
      grantKey: "rldagr"
    });
  });

  it("blocks hunt action callbacks outside the korchma before claiming the hourly hunt", async () => {
    const presence = new CapturingPresenceService();
    let claimCount = 0;
    const bot = createTestBot(presence, {
      hunt: {
        getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        completeHuntContract: () => {
          claimCount += 1;
          return Promise.resolve({ state: "no-character" });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate(makeHuntActionCallbackData("2026-06-14T08", "abc1234", "strike")));

    expect(claimCount).toBe(0);
    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("gates actual 0.0.17 date-only hunt action callbacks outside without claiming rewards", async () => {
    const presence = new CapturingPresenceService();
    let boardCount = 0;
    let claimCount = 0;
    const bot = createTestBot(presence, {
      hunt: {
        getHuntBoardForTelegramUser: () => {
          boardCount += 1;
          return Promise.resolve({ state: "no-character" });
        },
        completeHuntContract: () => {
          claimCount += 1;
          return Promise.resolve({ state: "no-character" });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:hunt:act:2026-06-14:strike"));

    expect(boardCount).toBe(0);
    expect(claimCount).toBe(0);
    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("refreshes actual 0.0.17 date-only hunt action callbacks inside without claiming rewards", async () => {
    const presence = new CapturingPresenceService();
    presence.currentPlace = {
      state: "ready",
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      locationName: "Стіл зі справами",
      insideKorchma: true
    };
    let boardCount = 0;
    let claimCount = 0;
    const bot = createTestBot(presence, {
      yeger: {
        getForTelegramUser: () => {
          boardCount += 1;
          return Promise.resolve({ state: "no-character" });
        },
        startForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        trackForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        turnInForTelegramUser: () => Promise.resolve({ state: "no-character" })
      },
      hunt: {
        getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
        completeHuntContract: () => {
          claimCount += 1;
          return Promise.resolve({ state: "no-character" });
        }
      }
    });
    await bot.init();

    await bot.handleUpdate(callbackUpdate("v1:hunt:act:2026-06-14:strike"));

    expect(boardCount).toBe(1);
    expect(claimCount).toBe(0);
    expect(presence.marks).toEqual([
      {
        user: {
          telegramUserId: 42n,
          displayName: "Тест"
        }
      }
    ]);
  });

  it("does not mark random unhandled text as presence", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("просто проходив повз"));

    expect(presence.marks).toEqual([]);
  });

  it("does not mark the old invisible look text because /look is command-only", async () => {
    const presence = new CapturingPresenceService();
    const bot = createTestBot(presence);
    await bot.init();

    await bot.handleUpdate(messageUpdate("Озирнутися"));

    expect(presence.marks).toEqual([]);
  });
});

class CapturingPresenceService {
  readonly marks: MarkPlayerPresenceInput[] = [];
  onlineSnapshot: OnlineSnapshot = { state: "no-character" };
  currentPlace: {
    state: "ready";
    locationId: string;
    locationName: string;
    insideKorchma: boolean;
  } = {
    state: "ready",
    locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
    locationName: "Перед корчмою",
    insideKorchma: false
  };

  markAction(input: MarkPlayerPresenceInput): Promise<void> {
    this.marks.push(input);
    return Promise.resolve();
  }

  getRaidParticipantsForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getAdventureParticipantsForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getOnlineForTelegramUser(): Promise<OnlineSnapshot> {
    return Promise.resolve(this.onlineSnapshot);
  }

  getLookForTelegramUser(): Promise<{ state: "no-character" }> {
    return Promise.resolve({ state: "no-character" });
  }

  getKorchmaInteriorPresence(): Promise<PresenceGroup> {
    return Promise.resolve({
      active: [{ telegramUserId: 42n, name: "Мандрівник", status: "active" }],
      idle: [],
      total: 1
    });
  }

  getCurrentPlaceForTelegramUser(): Promise<{
    state: "ready";
    locationId: string;
    locationName: string;
    insideKorchma: boolean;
  }> {
    return Promise.resolve(this.currentPlace);
  }

  getCurrentActivityForTelegramUser(): Promise<{
    state: "ready";
    currentRaidId: string | null;
    currentAdventureId: string | null;
  }> {
    return Promise.resolve({
      state: "ready",
      currentRaidId: null,
      currentAdventureId: null
    });
  }
}

function createTestBot(presence: CapturingPresenceService, overrides: Partial<BotServices> = {}) {
  const bot = createBot("123456:test-token", servicesWith({ presence, ...overrides }));

  bot.api.config.use((_prev, method) => {
    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Квестарня",
          username: "kvestarnia_bot"
        }
      });
    }

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  return bot;
}

const character: CharacterSummary = {
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
};

function characterRecord() {
  return {
    id: "character-42",
    userId: "user-42",
    telegramUserId: 42n,
    name: character.name,
    pronoun: character.pronoun,
    path: character.path,
    raceId: character.raceId,
    classId: character.classId,
    level: character.level,
    xp: character.xp,
    gold: character.gold,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    hpRegenAt: null,
    manaCurrent: character.manaCurrent,
    manaMax: character.manaMax,
    manaRegenAt: null,
    activeCosmeticTitleGrantId: null,
    statsJson: character.stats,
    remortCount: 0
  };
}

function activePartyBossSession(): PartyBossSessionRecord {
  const now = new Date("2026-06-30T10:00:00.000Z");
  const record = characterRecord();

  return {
    id: "boss-1",
    partySessionId: "party-1",
    partyInviteToken: "partyABC12",
    leaderCharacterId: record.id,
    status: "active",
    turn: 1,
    version: 1,
    rulesVersion: "party-boss-proof-v1",
    bossKey: "party-boss-proof-one",
    state: {
      rulesVersion: "party-boss-proof-v1",
      partySessionId: "party-1",
      status: "active",
      turn: 1,
      boss: {
        monsterId: "party-boss-proof-one",
        name: "Контрольний Бос",
        level: 3,
        hp: 42,
        hpMax: 42,
        attack: 8,
        armor: 2,
        resist: 1,
        dexterity: 5,
        tags: ["party-boss-proof"]
      },
      participants: [{
        characterId: record.id,
        name: record.name,
        remortCount: 0,
        status: "active",
        combatStats: {
          level: 3,
          hpMax: record.hpMax,
          manaMax: record.manaMax,
          hpCurrent: record.hpCurrent,
          manaCurrent: record.manaCurrent,
          strength: 5,
          dexterity: 5,
          intelligence: 5,
          charisma: 5,
          luck: 5,
          raceId: record.raceId,
          classId: record.classId
        },
        resources: {
          hp: record.hpCurrent,
          hpMax: record.hpMax,
          mana: record.manaCurrent,
          manaMax: record.manaMax
        },
        contribution: {
          submittedActions: 0,
          timeoutActions: 0,
          damageDealt: 0,
          damageTaken: 0
        }
      }],
      roundLog: [],
      startedAt: now.toISOString()
    },
    result: null,
    turnExpiresAt: new Date("2026-06-30T10:00:23.000Z"),
    completedAt: null,
    participants: [record]
  };
}

function readyTavernService() {
  return {
    getTavernForTelegramUser: () =>
      Promise.resolve({
        state: "ready",
        character
      }),
    advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({ state: "none" }),
    getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
    buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
  };
}

function pendingTavernService() {
  return {
    getTavernForTelegramUser: () =>
      Promise.resolve({
        state: "pending",
        character,
        availableAt: new Date("2026-06-13T10:33:00.000Z"),
        now: new Date("2026-06-13T10:30:00.000Z")
      }),
    advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
    getActivePendingFridayBarrelRaidForTelegramUser: () =>
      Promise.resolve({
        state: "pending",
        character,
        availableAt: new Date("2026-06-13T10:33:00.000Z"),
        now: new Date("2026-06-13T10:30:00.000Z")
      }),
    getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
    buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
  };
}

function duelServiceWithCreateCounter(
  onCreate: () => void = () => undefined
): NonNullable<BotServices["duel"]> {
  return {
    createOpenChallengeForTelegramUser: () => {
      onCreate();
      return Promise.resolve({
        state: "level-gated",
        character,
        minLevel: 3
      });
    }
  } as unknown as NonNullable<BotServices["duel"]>;
}

function questHubReadyServices(): Partial<BotServices> {
  return {
    adventure: {
      getAdventureOfferForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          requiredLevel: 3,
          character
        }),
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      selectAdventureProblem: () => Promise.resolve({ state: "no-character" }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getProblemQuestProgressForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          character,
          progress: {
            stageId: "13",
            title: "Тринадцять дрібних проблем",
            wins: 4,
            target: 13,
            completed: false,
            rewardClaimed: false,
            issued: true,
            branchComplete: false
          },
          archive: []
        }),
      getFightOverviewForTelegramUser: () =>
        Promise.resolve({
          state: "persistent-ready",
          character,
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
        }),
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    yeger: {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character,
          requiredLevel: 4
        }),
      startForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      trackForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      turnInForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    cellarErrand: {
      getForTelegramUser: () =>
        Promise.resolve({
          state: "level-locked",
          character,
          requiredLevel: 2
        }),
      complete: () => Promise.resolve({ state: "no-character" })
    }
  } as unknown as Partial<BotServices>;
}

function activePersistentFightService(): Partial<BotServices>["fight"] {
  return {
    getFightOverviewForTelegramUser: () =>
      Promise.resolve({
        state: "persistent-active",
        character,
        session: activePersistentSession(PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT),
        monster: {
          id: "monster.deadline-spider",
          name: "Павук дедлайнів",
          description: "Плете павутину з «сьогодні швиденько».",
          level: 2,
          tags: ["beast", "time", "web"]
        },
        questProgress: null
      }),
    getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
    completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
  } as Partial<BotServices>["fight"];
}

function activePersistentSession(originLocationId?: string) {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    characterId: "character-42",
    monsterId: "monster.deadline-spider",
    status: "active" as const,
    turn: 1,
    reward: null,
    createdAt: new Date("2026-06-15T10:00:00.000Z"),
    updatedAt: new Date("2026-06-15T10:00:00.000Z"),
    expiresAt: new Date("2026-06-15T10:20:00.000Z"),
    state: {
      id: "123e4567-e89b-42d3-a456-426614174000",
      source: "normal" as const,
      ...(originLocationId ? { originLocationId } : {}),
      status: "active" as const,
      turn: 1,
      hero: {
        hp: 20,
        hpMax: 20,
        mana: 10,
        manaMax: 10
      },
      monster: {
        id: "monster.deadline-spider",
        hp: 12,
        hpMax: 12
      }
    }
  };
}

function activeTrainingSession() {
  return {
    ...activePersistentSession(),
    monsterId: TRAINING_DOPPELGANGER_MONSTER_ID,
    state: {
      ...activePersistentSession().state,
      source: "training" as const,
      monster: {
        id: TRAINING_DOPPELGANGER_MONSTER_ID,
        hp: 12,
        hpMax: 12
      }
    }
  };
}

function servicesWith(overrides: Partial<BotServices>): BotServices {
  return {
    adventure: {
      getAdventureOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      selectAdventureProblem: () => Promise.resolve({ state: "no-character" }),
      completeAdventureApproach: () => Promise.resolve({ state: "no-character" }),
      resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    cellarErrand: {
      getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      complete: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    hunt: {
      getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeHuntContract: () => Promise.resolve({ state: "no-character" })
    },
    yeger: {
      getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      startForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      trackForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      turnInForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    onboarding: {},
    hero: {
      findByTelegramUserId: () =>
        Promise.resolve({
          state: "existing-character",
          character,
          inventoryGoldValue: 0
        })
    },
    inventory: {},
    presence: new CapturingPresenceService(),
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {
      getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      getActivePendingFridayBarrelRaidForTelegramUser: () =>
        Promise.resolve({ state: "none" }),
      getRoundOfferForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      buyRoundForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    ...overrides
  } as unknown as BotServices;
}

function messageUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: {
        id: 42,
        type: "private" as const,
        first_name: "Тест"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text
    }
  };
}

function commandUpdate(text: string) {
  const update = messageUpdate(text);
  const commandLength = text.split(" ", 1)[0]?.length ?? text.length;

  return {
    ...update,
    message: {
      ...update.message,
      entities: [
        {
          type: "bot_command" as const,
          offset: 0,
          length: commandLength
        }
      ]
    }
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: "callback-1",
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "chat-instance",
      data,
      message: {
        message_id: 10,
        date: 0,
        chat: {
          id: 42,
          type: "private" as const,
          first_name: "Тест"
        },
        text: "old"
      }
    }
  };
}

import { describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";

describe("support command and start deep links", () => {
  it("renders /support with configured URL", async () => {
    const calls = await captureMessageCalls("/support", servicesWith(), {
      supportJarUrl: "https://send.monobank.ua/jar/test-placeholder"
    });
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("Банка підтримки Квестарні");
    expect(String(message?.payload.text)).toContain("https://send.monobank.ua/jar/test-placeholder");
    expect(String(message?.payload.text)).toContain("Стан Банки видно за посиланням.");
    expect(String(message?.payload.text)).not.toContain("0 грн");
    expect(String(message?.payload.text)).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expectNoOldSupportNaming(String(message?.payload.text));
    expect(String(message?.payload.text)).not.toContain("undefined");
  });

  it("renders /support with configured manual status", async () => {
    const calls = await captureMessageCalls("/support", servicesWith(), {
      supportJarUrl: "https://send.monobank.ua/jar/test-placeholder",
      supportJarStatus: {
        currentUah: 1234,
        goalUah: 5000,
        updatedAt: "2026-06-16"
      }
    });
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("У Банці зараз: 1 234 грн");
    expect(String(message?.payload.text)).toContain("Ціль: 5 000 грн");
    expect(String(message?.payload.text)).toContain("Оновлено вручну: 2026-06-16");
    expect(String(message?.payload.text)).not.toContain("залишилось тільки");
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expectNoOldSupportNaming(String(message?.payload.text));
  });

  it("renders /support fallback without a broken URL", async () => {
    const calls = await captureMessageCalls("/support", servicesWith());
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("посилання ще прибивають");
    expect(String(message?.payload.text)).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expectNoOldSupportNaming(String(message?.payload.text));
    expect(String(message?.payload.text)).not.toContain("undefined");
    expect(String(message?.payload.text)).not.toContain("https://");
  });

  it("renders /start support_thanks without starting onboarding", async () => {
    const onboardingStart = vi.fn();
    const calls = await captureMessageCalls(
      "/start support_thanks",
      servicesWith({
        onboarding: {
          start: onboardingStart
        }
      } as Partial<BotServices>),
      {
        supportJarUrl: "https://send.monobank.ua/jar/test-placeholder",
        supportJarStatus: {
          currentUah: 1234,
          goalUah: 5000,
          updatedAt: "2026-06-16"
        }
      }
    );
    const message = calls.find((call) => call.method === "sendMessage");

    expect(onboardingStart).not.toHaveBeenCalled();
    expect(String(message?.payload.text)).toContain("Корчмар піднімає подячний кухоль");
    expect(String(message?.payload.text)).toContain("після поповнення Банки Квестарні");
    expect(String(message?.payload.text)).toContain("Ефект косметичний");
    expect(String(message?.payload.text)).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expectNoUnsafeRewardClaims(String(message?.payload.text));
    expectNoOldSupportNaming(String(message?.payload.text));
    expect(message?.payload.parse_mode).toBe("HTML");
    expect(String(message?.payload.text)).toContain("✨ <b>+1000 до настрою корчми</b>");
    expect(String(message?.payload.text)).not.toContain("https://send.monobank.ua");
    expect(String(message?.payload.text)).not.toContain("У Банці зараз");
  });

  it("opens duel deep links as saved result cards with rematch actions", async () => {
    const onboardingStart = vi.fn();
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "resolved",
      challenge: makeDuelChallenge("abc_DEF12"),
      challenger: makeCharacterSummary("Kyjivan BooksDragon"),
      target: makeCharacterSummary("Shannar de Kassal", { remortCount: 1 }),
      result: {
        outcome: "target",
        winnerCharacterId: "character-99",
        loserCharacterId: "character-42",
        challengerScore: 7,
        targetScore: 9,
        swing: 0,
        flavorKey: "paperwork-stall"
      }
    });
    const calls = await captureMessageCalls(
      "/start duel_abc_DEF12",
      servicesWith({
        onboarding: {
          start: onboardingStart
        },
        duel: {
          acceptForTelegramUser
        }
      } as Partial<BotServices>),
      {
        botUsername: "kvestarnia_test_bot"
      }
    );
    const message = calls.find((call) => call.method === "sendMessage");
    const keyboard = JSON.stringify(message?.payload.reply_markup);

    expect(onboardingStart).not.toHaveBeenCalled();
    expect(acceptForTelegramUser).toHaveBeenCalledWith(42n, "abc_DEF12", {
      expectedMode: "quick"
    });
    expect(String(message?.payload.text)).toContain("⚡ <b>Результат миттєвої дуелі</b>");
    expect(keyboard).toContain("v1:duel:rematch:abc_DEF12");
    expect(keyboard).toContain("v1:duel:share:abc_DEF12");
    expect(keyboard).toContain("v1:duel:new");
  });

  it("keeps active turn-based /start deep links private in private chats", async () => {
    const acceptForTelegramUser = vi.fn().mockResolvedValue(makeActiveTurnBasedDuelView());
    const calls = await captureMessageCalls(
      "/start duel_turnbased_abc_DEF12",
      servicesWith({
        duel: {
          acceptForTelegramUser
        }
      } as Partial<BotServices>),
      {
        botUsername: "kvestarnia_test_bot"
      }
    );
    const message = calls.find((call) => call.method === "sendMessage");
    const keyboard = JSON.stringify(message?.payload.reply_markup);

    expect(acceptForTelegramUser).toHaveBeenCalledWith(42n, "abc_DEF12", {
      expectedMode: "turn-based"
    });
    expect(String(message?.payload.text)).toContain("Покрокова дуель");
    expect(String(message?.payload.text)).toContain("Ваш вибір");
    expect(keyboard).toContain("Оновити");
  });

  it("keeps active turn-based /start deep links spectator-safe in group chats", async () => {
    const acceptForTelegramUser = vi.fn().mockResolvedValue(makeActiveTurnBasedDuelView());
    const calls = await captureMessageCalls(
      "/start duel_turnbased_abc_DEF12",
      servicesWith({
        duel: {
          acceptForTelegramUser
        }
      } as Partial<BotServices>),
      {
        botUsername: "kvestarnia_test_bot",
        chatType: "group"
      }
    );
    const message = calls.find((call) => call.method === "sendMessage");
    const keyboard = JSON.stringify(message?.payload.reply_markup);

    expect(acceptForTelegramUser).toHaveBeenCalledWith(42n, "abc_DEF12", {
      expectedMode: "turn-based"
    });
    expect(String(message?.payload.text)).toContain("Покрокова дуель");
    expect(String(message?.payload.text)).toContain("записи закритими");
    expect(String(message?.payload.text)).not.toContain("Ваш вибір");
    expect(keyboard).not.toContain("Атакувати");
    expect(keyboard).not.toContain("Здатися");
  });

  it("explains that self-duel links should be forwarded to another adventurer", async () => {
    const onboardingStart = vi.fn();
    const acceptForTelegramUser = vi.fn().mockResolvedValue({
      state: "self-challenge",
      challenge: makeDuelChallenge("abc_DEF12"),
      challenger: makeCharacterSummary("Kyjivan BooksDragon")
    });
    const calls = await captureMessageCalls(
      "/start duel_abc_DEF12",
      servicesWith({
        onboarding: {
          start: onboardingStart
        },
        duel: {
          acceptForTelegramUser
        }
      } as Partial<BotServices>)
    );
    const message = calls.find((call) => call.method === "sendMessage");
    const text = String(message?.payload.text);

    expect(onboardingStart).not.toHaveBeenCalled();
    expect(text).toContain("🥊 <b>Самодуель відхилено</b>");
    expect(text).toContain("Для цього вже є Сумлінний Допельґанґер.\n\nПерешліть це повідомлення іншому пригоднику.");
    expect(text).toContain("дві різні чашки й одна спільна згода");
  });

  it("keeps regular /start and unknown payloads on the onboarding path", async () => {
    const onboardingStart = vi.fn().mockResolvedValue({ state: "new-character" });
    await captureMessageCalls(
      "/start",
      servicesWith({
        onboarding: {
          start: onboardingStart
        }
      } as Partial<BotServices>)
    );
    await captureMessageCalls(
      `/start ${["barrel", "thanks"].join("_")}`,
      servicesWith({
        onboarding: {
          start: onboardingStart
        }
      } as Partial<BotServices>)
    );

    expect(onboardingStart).toHaveBeenCalledTimes(2);
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureMessageCalls(
  text: string,
  services: BotServices,
  options: {
    supportJarUrl?: string;
    supportJarStatus?: { currentUah?: number; goalUah?: number; updatedAt?: string };
    botUsername?: string;
    chatType?: "private" | "group" | "supergroup";
  } = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services, options);
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

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

  await bot.init();
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 10,
      date: 0,
      text,
      entities: [
        {
          type: "bot_command",
          offset: 0,
          length: text.split(/\s/, 1)[0]?.length ?? text.length
        }
      ],
      chat: {
        id: 42,
        type: options.chatType ?? "private"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      }
    }
  });

  return calls;
}

function servicesWith(overrides: Partial<BotServices> = {}): BotServices {
  return {
    adventure: {},
    cellarErrand: {},
    fight: {},
    hunt: {},
    yeger: {},
    onboarding: {
      start: () => Promise.resolve({ state: "new-character" })
    },
    hero: {},
    equipment: {},
    inventory: {},
    levelBarter: {},
    mantokChest: {},
    presence: {
      markAction: () => Promise.resolve()
    },
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {},
    ...overrides
  } as unknown as BotServices;
}

function expectNoUnsafeRewardClaims(text: string): void {
  expect(text).not.toContain("платіж підтверджено");
  expect(text).not.toContain("отримано XP");
  expect(text).not.toContain("видано золото");
  expect(text).not.toContain("манатку додано");
  expect(text).not.toContain("донорський статус");
}

function expectNoOldSupportNaming(text: string): void {
  const oldTerms = [
    ["Бочка", "підтримки"].join(" "),
    ["Бочка", "Квестарні"].join(" "),
    ["У", "Бочці", "зараз"].join(" "),
    ["Тост", "із", "Бочки"].join(" "),
    ["Бочка", "вдячно", "булькнула"].join(" "),
    ["barrel", "thanks"].join("_"),
    ["SUPPORT", "BARREL"].join("_"),
    ["support", "Barrel"].join(""),
    ["Support", "Barrel"].join("")
  ];

  for (const term of oldTerms) {
    expect(text).not.toContain(term);
  }
}

function makeDuelChallenge(inviteToken: string) {
  return {
    id: "duel-1",
    challengerCharacterId: "character-42",
    targetCharacterId: "character-99",
    contextChatId: null,
    inviteToken,
    status: "resolved",
    expiresAt: new Date("2026-06-17T18:13:00.000Z"),
    resolvedAt: new Date("2026-06-17T18:00:00.000Z"),
    result: {
      outcome: "target",
      winnerCharacterId: "character-99",
      loserCharacterId: "character-42",
      challengerScore: 7,
      targetScore: 9,
      swing: 0,
      flavorKey: "paperwork-stall"
    },
    createdAt: new Date("2026-06-17T17:55:00.000Z"),
    updatedAt: new Date("2026-06-17T18:00:00.000Z"),
    challenger: null,
    target: null
  };
}

function makeActiveTurnBasedDuelView() {
  const session = makeTurnBasedSession();

  return {
    state: "active",
    challenge: session.challenge,
    session,
    challenger: makeCharacterSummary("Kyjivan BooksDragon"),
    target: makeCharacterSummary("Shannar de Kassal"),
    turnExpiresAt: session.turnExpiresAt,
    now: new Date("2026-06-17T18:00:00.000Z")
  };
}

function makeTurnBasedSession() {
  const turnExpiresAt = new Date("2026-06-17T18:00:23.000Z");
  const challenge = {
    ...makeDuelChallenge("abc_DEF12"),
    mode: "turn-based",
    status: "active",
    resolvedAt: null,
    result: null,
    challenger: {
      ...makeCharacterRecord(42n, "Kyjivan BooksDragon"),
      id: "character-42"
    },
    target: {
      ...makeCharacterRecord(99n, "Shannar de Kassal"),
      id: "character-99"
    }
  };

  return {
    id: "session-1",
    duelChallengeId: "duel-1",
    challengerCharacterId: "character-42",
    targetCharacterId: "character-99",
    status: "active",
    actingCharacterId: "character-99",
    turn: 2,
    version: 4,
    turnExpiresAt,
    completedAt: null,
    challengerChatId: null,
    challengerMessageId: null,
    targetChatId: null,
    targetMessageId: null,
    createdAt: new Date("2026-06-17T17:55:00.000Z"),
    updatedAt: new Date("2026-06-17T18:00:00.000Z"),
    challenge,
    state: {
      mode: "turn-based",
      status: "active",
      rulesVersion: "turn-based-duel-v1",
      balanceVersion: "instant-duel-v2",
      turn: 2,
      actingCharacterId: "character-99",
      participants: {
        challenger: makeTurnBasedParticipant("character-42", "Kyjivan BooksDragon"),
        target: makeTurnBasedParticipant("character-99", "Shannar de Kassal")
      },
      pendingActions: {
        challenger: {
          actorCharacterId: "character-42",
          action: "skill"
        }
      }
    }
  };
}

function makeTurnBasedParticipant(characterId: string, displayName: string) {
  return {
    characterId,
    displayName,
    title: "Пригодник місцевого значення",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    level: 3,
    remortCount: 0,
    stats: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    combatStats: {
      level: 3,
      classId: "class.warrior",
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6,
      armor: 1,
      resistance: 1,
      weaponPower: 2,
      spellPower: 1,
      critChance: 0,
      critMultiplier: 2,
      evasion: 0
    },
    hp: {
      current: 24,
      max: 24
    },
    mana: {
      current: 12,
      max: 12
    },
    cooldowns: {}
  };
}

function makeCharacterRecord(telegramUserId: bigint, name: string) {
  return {
    telegramUserId,
    userId: `user-${telegramUserId.toString()}`,
    name,
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 3,
    xp: 25,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    statsJson: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    hpRegenAt: null,
    manaRegenAt: null,
    createdAt: new Date("2026-06-17T17:00:00.000Z"),
    updatedAt: new Date("2026-06-17T18:00:00.000Z"),
    equipment: []
  };
}

function makeCharacterSummary(name: string, overrides: { remortCount?: number } = {}) {
  return {
    name,
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пригодник місцевого значення",
    level: 3,
    remortCount: overrides.remortCount,
    xp: 25,
    nextLevelXp: 50,
    xpToNextLevel: 25,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    stats: {
      strength: 7,
      dexterity: 7,
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
}

import { describe, expect, it } from "vitest";
import {
  presentLook,
  presentOnline,
  presentParticipants
} from "../../src/bot/presenters/presencePresenter";
import type {
  LookSnapshot,
  OnlineSnapshot,
  ParticipantsSnapshot
} from "../../src/services/presenceService";

describe("presence presenter", () => {
  it("renders /online without exact timestamps or global location lists", () => {
    const text = presentOnline(onlineSnapshot);

    expect(text).toContain("👥 У грі зараз: 3");
    expect(text).toContain("📍 Зала корчми: 2");
    expect(text).toContain("— <b>587</b>");
    expect(text).toContain("— <b>Дара</b>");
    expect(text).toContain("🍺 У соло-рейдах «Бочка Пінного Міражу»: 2");
    expect(text).not.toContain("Нестор Межовий");
    expect(text).not.toContain("Стіл зі справами");
    expect(text).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("does not mention inactive raids away from the barrel", () => {
    const text = presentOnline({
      state: "ready",
      globalTotal: 1,
      location: {
        id: "location.korchma.hall",
        name: "Зала корчми",
        people: {
          active: [{ telegramUserId: 1n, name: "587", status: "active" }],
          idle: [],
          total: 1
        }
      },
      activity: null
    });

    expect(text).toContain("📍 Зала корчми: тільки ти.");
    expect(text).not.toContain("🍺 Активного рейду зараз немає.");
  });

  it("mentions inactive raids only near the barrel", () => {
    const text = presentOnline({
      state: "ready",
      globalTotal: 1,
      location: {
        id: "location.korchma.barrel",
        name: "Біля Бочки Пінного Міражу",
        people: {
          active: [{ telegramUserId: 1n, name: "587", status: "active" }],
          idle: [],
          total: 1
        }
      },
      activity: null
    });

    expect(text).toContain("📍 Біля Бочки Пінного Міражу: тільки ти.");
    expect(text).toContain("🍺 Активного рейду зараз немає.");
  });

  it("renders /look with a compact local presence line", () => {
    const text = presentLook(lookSnapshot);

    expect(text).toContain("👀 Озирнутися");
    expect(text).toContain("👥 Тут: 2 активні, 1 притих.");
    expect(text).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
  });

  it("renders participants grouped by active and idle", () => {
    const text = presentParticipants(participantsSnapshot);

    expect(text).toContain("🍺 Бочка Пінного Міражу");
    expect(text).toContain("🟢 Активні:");
    expect(text).toContain("— <b>587</b>");
    expect(text).toContain("🟡 Притихли:");
    expect(text).toContain("— <b>Дара</b>");
    expect(text).toContain("📍 Поточна місцина: Біля Бочки Пінного Міражу");
  });

  it("shows active cosmetic titles in social presence rows and escapes them", () => {
    const text = presentParticipants({
      state: "ready",
      activity: {
        kind: "raid",
        id: "raid.friday-barrel",
        name: "Бочка Пінного Міражу",
        locationName: "Біля Бочки Пінного Міражу",
        people: {
          active: [{
            telegramUserId: 13n,
            name: "Дара <&>",
            activeCosmeticTitle: "Перший <пергамент> не зʼїв",
            status: "active"
          }],
          idle: [],
          total: 1
        }
      }
    });

    expect(text).toContain("— <b>Дара &lt;&amp;&gt;</b>, «Перший &lt;пергамент&gt; не зʼїв»");
  });

  it("uses cellar icon for cellar adventure participants and online summaries", () => {
    const participants = presentParticipants(cellarParticipantsSnapshot);
    const online = presentOnline(cellarOnlineSnapshot);

    expect(participants).toContain("🐭 <i>Льохова справа</i>");
    expect(participants).not.toContain("🌯 <i>Льохова справа</i>");
    expect(online).toContain("🐭 У пригоді «<i>Льохова справа</i>»: 1");
    expect(online).not.toContain("🌯 У пригоді «<i>Льохова справа</i>»");
  });

  it("uses yeger icon for yeger adventure participants and online summaries", () => {
    const participants = presentParticipants(yegerParticipantsSnapshot);
    const online = presentOnline(yegerOnlineSnapshot);

    expect(participants).toContain("🏹 <i>Єгерська справа</i>");
    expect(participants).not.toContain("🌯 <i>Єгерська справа</i>");
    expect(online).toContain("🏹 У пригоді «<i>Єгерська справа</i>»: 1");
    expect(online).not.toContain("🌯 У пригоді «<i>Єгерська справа</i>»");
  });

  it("uses fighting corner icon for doppelganger training and a neutral fallback for unknown adventures", () => {
    const doppelgangerOnline = presentOnline(doppelgangerOnlineSnapshot);
    const unknownOnline = presentOnline(unknownAdventureOnlineSnapshot);

    expect(doppelgangerOnline).toContain("🥊 У пригоді «<i>Сумлінний Допельґанґер</i>»: 1");
    expect(doppelgangerOnline).not.toContain("🌯 У пригоді «<i>Сумлінний Допельґанґер</i>»");
    expect(unknownOnline).toContain("🧩 У пригоді «<i>Невідома пригода</i>»: 1");
    expect(unknownOnline).not.toContain("🌯 У пригоді «<i>Невідома пригода</i>»");
  });

  it("limits long Telegram people lists and truncates oversized names", () => {
    const crowdedSnapshot: ParticipantsSnapshot = {
      state: "ready",
      activity: {
        kind: "raid",
        id: "raid.friday-barrel",
        name: "Бочка Пінного Міражу",
        locationName: "Біля Бочки Пінного Міражу",
        people: {
          active: [
            {
              telegramUserId: 1n,
              name: "Пригодник із дуже довгим іменем, яке не має розтягувати Telegram",
              status: "active"
            },
            ...Array.from({ length: 13 }, (_, index) => ({
              telegramUserId: BigInt(index + 2),
              name: `Пригодник ${index + 2}`,
              status: "active" as const
            }))
          ],
          idle: [],
          total: 14
        }
      }
    };
    const text = presentParticipants(crowdedSnapshot);

    expect(text).toContain("Пригодник із дуже довгим іменем, яке не має роз…");
    expect(text).toContain("— і ще 2 пригодники");
    expect(text).not.toContain("Пригодник 14");
  });
});

const onlineSnapshot: OnlineSnapshot = {
  state: "ready",
  globalTotal: 3,
  location: {
    id: "location.korchma.hall",
    name: "Зала корчми",
    people: {
      active: [{ telegramUserId: 1n, name: "587", status: "active" }],
      idle: [{ telegramUserId: 2n, name: "Дара", status: "idle" }],
      total: 2
    }
  },
  activity: {
    kind: "raid",
    id: "raid.friday-barrel",
    name: "Бочка Пінного Міражу",
    locationName: "Біля Бочки Пінного Міражу",
    people: {
      active: [{ telegramUserId: 1n, name: "587", status: "active" }],
      idle: [{ telegramUserId: 2n, name: "Дара", status: "idle" }],
      total: 2
    }
  }
};

const lookSnapshot: LookSnapshot = {
  state: "ready",
  location: {
    id: "location.korchma.hall",
    name: "Зала корчми",
    people: {
      active: [
        { telegramUserId: 1n, name: "587", status: "active" },
        { telegramUserId: 2n, name: "Нестор Межовий", status: "active" }
      ],
      idle: [{ telegramUserId: 3n, name: "Дара", status: "idle" }],
      total: 3
    }
  }
};

const participantsSnapshot: ParticipantsSnapshot = {
  state: "ready",
  activity: {
    kind: "raid",
    id: "raid.friday-barrel",
    name: "Бочка Пінного Міражу",
    locationName: "Біля Бочки Пінного Міражу",
    people: {
      active: [{ telegramUserId: 1n, name: "587", status: "active" }],
      idle: [{ telegramUserId: 2n, name: "Дара", status: "idle" }],
      total: 2
    }
  }
};

const cellarParticipantsSnapshot: ParticipantsSnapshot = {
  state: "ready",
  activity: {
    kind: "adventure",
    id: "adventure.cellar.mouse-errand",
    name: "Льохова справа",
    locationName: "Льох корчми",
    people: {
      active: [{ telegramUserId: 1n, name: "587", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

const cellarOnlineSnapshot: OnlineSnapshot = {
  ...onlineSnapshot,
  activity: {
    kind: "adventure",
    id: "adventure.cellar.mouse-errand",
    name: "Льохова справа",
    locationName: "Льох корчми",
    people: {
      active: [{ telegramUserId: 1n, name: "587", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

const yegerParticipantsSnapshot: ParticipantsSnapshot = {
  state: "ready",
  activity: {
    kind: "adventure",
    id: "adventure.hunt-board.contract",
    name: "Єгерська справа",
    locationName: "Єгерський куток",
    people: {
      active: [{ telegramUserId: 1n, name: "Shannar de Kassal", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

const yegerOnlineSnapshot: OnlineSnapshot = {
  ...onlineSnapshot,
  activity: {
    kind: "adventure",
    id: "adventure.hunt-board.contract",
    name: "Єгерська справа",
    locationName: "Єгерський куток",
    people: {
      active: [{ telegramUserId: 1n, name: "Shannar de Kassal", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

const doppelgangerOnlineSnapshot: OnlineSnapshot = {
  ...onlineSnapshot,
  location: {
    id: "location.korchma.quest_table",
    name: "Стіл зі справами",
    people: {
      active: [{ telegramUserId: 1n, name: "Shannar de Kassal", status: "active" }],
      idle: [],
      total: 1
    }
  },
  activity: {
    kind: "adventure",
    id: "adventure.training-doppelganger",
    name: "Сумлінний Допельґанґер",
    locationName: "Стіл зі справами",
    people: {
      active: [{ telegramUserId: 1n, name: "Shannar de Kassal", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

const unknownAdventureOnlineSnapshot: OnlineSnapshot = {
  ...onlineSnapshot,
  activity: {
    kind: "adventure",
    id: "adventure.future-mystery",
    name: "Невідома пригода",
    locationName: "Стіл зі справами",
    people: {
      active: [{ telegramUserId: 1n, name: "Shannar de Kassal", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

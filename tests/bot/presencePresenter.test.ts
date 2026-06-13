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
    expect(text).toContain("📍 У цій місцині: 2");
    expect(text).toContain("— 587");
    expect(text).toContain("— Дара");
    expect(text).toContain("🍺 У рейді «Бочка Пінного Міражу»: 2");
    expect(text).not.toContain("Нестор Межовий");
    expect(text).not.toContain("Стіл зі справами");
    expect(text).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("renders only-you and no active raid states", () => {
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

    expect(text).toContain("📍 У цій місцині: тільки ти.");
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
    expect(text).toContain("— 587");
    expect(text).toContain("🟡 Притихли:");
    expect(text).toContain("— Дара");
    expect(text).toContain("📍 Поточна місцина: Біля Бочки Пінного Міражу");
  });

  it("uses cellar icon for cellar adventure participants and online summaries", () => {
    const participants = presentParticipants(cellarParticipantsSnapshot);
    const online = presentOnline({
      ...onlineSnapshot,
      activity: cellarParticipantsSnapshot.activity
    });

    expect(participants).toContain("🐭 Підвальна справа");
    expect(participants).not.toContain("🌯 Підвальна справа");
    expect(online).toContain("🐭 У пригоді «Підвальна справа»: 1");
    expect(online).not.toContain("🌯 У пригоді «Підвальна справа»");
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
    name: "Підвальна справа",
    locationName: "Підвал корчми",
    people: {
      active: [{ telegramUserId: 1n, name: "587", status: "active" }],
      idle: [],
      total: 1
    }
  }
};

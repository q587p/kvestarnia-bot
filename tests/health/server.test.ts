import { createServer } from "http";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_PORT,
  handleHealthRequest,
  renderPresencePage,
  resolveHealthPort
} from "../../src/health/server";
import type {
  PresenceService,
  PublicPresenceLocationsSnapshot
} from "../../src/services/presenceService";

let server: ReturnType<typeof createServer> | null = null;

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  server = null;
});

describe("health server", () => {
  it("uses PORT when valid and defaults to 10000 otherwise", () => {
    expect(resolveHealthPort("12345")).toBe(12345);
    expect(resolveHealthPort(23456)).toBe(23456);
    expect(resolveHealthPort(undefined)).toBe(DEFAULT_HEALTH_PORT);
    expect(resolveHealthPort("not-a-port")).toBe(DEFAULT_HEALTH_PORT);
  });

  it("keeps /health as the text healthcheck", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/health`);

    await expect(response.text()).resolves.toContain("kvestarnia ok");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it("serves the public Kvestarnia home page with latest news and presence links", async () => {
    const baseUrl = await listen(presenceServiceWith(publicPresenceSnapshot));

    const response = await fetch(`${baseUrl}/`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(text).toContain("<title>Квестарня — гумористична фентезі-РПҐ у Telegram</title>");
    expect(text).toContain("Квестарня");
    expect(text).toContain("Гумористична фентезі-РПҐ у Telegram");
    expect(text).toContain("Створи пригодника, зайди в корчму, бери короткі квести");
    expect(text).toContain(
      'Квестарню розробляє <a href="https://t.me/q587p">@q587p</a> — той самий корчмар за стійкою.'
    );
    expect(text).toContain("https://t.me/kvestarnia_bot");
    expect(text).toContain("/presence");
    expect(text).toContain("/news");
    expect(text).toContain('href="/news">Вісті</a>');
    expect(text).not.toContain('href="/health"');
    expect(text).not.toContain(">Health</a>");
    expect(text).toContain("Що вже можна зробити");
    expect(text).toContain("Створити пригодника з расою й класом.");
    expect(text).toContain("Зайти в корчму й узяти перші справи.");
    expect(text).toContain("Побитися з дивними монстрами.");
    expect(text).toContain("Зібрати манатки й вдягнути спорядження.");
    expect(text).toContain("Побачити, що в Квестарні вже хтось ворушиться.");
    expect(text).not.toContain("Поточні команди й можливості");
    expect(text).toContain("Низ навчився рахувати до двох");
    expect(text).toContain("Бойова картка вже вміє показати кількох супротивників");
    expect(text).toContain("Корчма не оголошує перемогу завчасно");
    expect(text).toContain("Автоматичних зграй, нових щедрих нагород");
    expect(text).toContain("У грі зараз: 4");
    expect(text).toContain("Активних: 3");
    expect(text).toContain("Притихлих: 1");
    expect(text).toContain("Розклад за відкритими місцинами живе на окремій сторінці.");
    expect(text).not.toContain("Підтримати корчму");
    expect(text).not.toContain("send.monobank.ua");
    expect(text).not.toContain("У Банці зараз");
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("Зала корчми");
    expect(text).not.toContain("— Дара");
    expect(text).not.toContain("— Нестор Межовий");
  });

  it("serves a secondary support block only when support URL is configured", async () => {
    const baseUrl = await listen({
      presence: presenceServiceWith(publicPresenceSnapshot),
      supportJarUrl: "https://send.monobank.ua/jar/test-placeholder"
    });

    const response = await fetch(`${baseUrl}/`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("💚 Підтримати Квестарню");
    expect(text).not.toContain("🫙 Підтримати Квестарню");
    expect(text).toContain("Підтримати корчму");
    expect(text).toContain('href="https://send.monobank.ua/jar/test-placeholder"');
    expect(text).toContain("Стан Банки видно за посиланням.");
    expect(text).not.toContain("0 грн");
    expect(text).toContain("без купівлі ігрової сили");
    expect(text).toContain(
      "Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч."
    );
    expect(text).not.toContain("платіж підтверджено");
    expect(text).not.toContain("отримано XP");
    expect(text).not.toContain("видано золото");
    expect(text).not.toContain("манатку додано");
    expectNoOldSupportNaming(text);
    expect(text).toContain("Грати в Telegram");
    expect(text.indexOf("Грати в Telegram")).toBeLessThan(text.indexOf("Підтримати корчму"));
    expect(text.indexOf("Вісті з-під стійки")).toBeLessThan(
      text.indexOf("Підтримати корчму")
    );
  });

  it("serves manual support status inside the secondary support block", async () => {
    const baseUrl = await listen({
      presence: presenceServiceWith(publicPresenceSnapshot),
      supportJarUrl: "https://send.monobank.ua/jar/test-placeholder",
      supportJarStatus: {
        currentUah: 1234,
        goalUah: 5000,
        updatedAt: "2026-06-16"
      }
    });

    const response = await fetch(`${baseUrl}/`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("У Банці зараз: 1 234 грн");
    expect(text).toContain("Ціль: 5 000 грн");
    expect(text).toContain("Оновлено вручну: 2026-06-16");
    expect(text).not.toContain("залишилось тільки");
    expect(text).not.toContain("платіж підтверджено");
    expect(text).not.toContain("донорський статус");
    expectNoOldSupportNaming(text);
    expect(text.indexOf("Підтримати Квестарню")).toBeLessThan(text.indexOf("1 234 грн"));
    expect(text.indexOf("Грати в Telegram")).toBeLessThan(text.indexOf("1 234 грн"));
  });

  it("serves the public news archive from news.md", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/news`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(text).toContain("Вісті Квестарні");
    expect(text).toContain("Банка підтримки отримала табличку");
    expect(text).toContain("Архів");
    expect(text).toContain("Першу петлю закрито");
    expect(text).toContain("/news?entry=1");
  });

  it("serves an older selected news entry", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/news?entry=1`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Перший корчемний виклик і ясніші гачки");
    expect(text).toContain("Новіша");
  });

  it("keeps invalid selected news entries on the latest archive item", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/news?entry=not-a-number`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Реванш і картка після дуелі");
  });

  it("returns 404 for other paths", async () => {
    const baseUrl = await listen();

    const response = await fetch(`${baseUrl}/nope`);

    expect(response.status).toBe(404);
  });

  it("serves public presence locations as JSON without names or exact timestamps", async () => {
    const baseUrl = await listen(presenceServiceWith(publicPresenceSnapshot));

    const response = await fetch(`${baseUrl}/api/presence/locations`);
    const body = JSON.parse(await response.text()) as PublicPresenceLocationsSnapshot;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({
      total: 4,
      locations: [
        {
          locationId: "location.korchma.hall",
          title: "Зала корчми",
          regionName: "Корчма Квестарні",
          activeCount: 3,
          idleCount: 1,
          players: []
        }
      ]
    });
    expect(serialized).not.toContain("587");
    expect(serialized).not.toContain("Дара");
    expect(serialized).not.toContain("Нестор Межовий");
    expect(serialized).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
    expect(serialized).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("serves the live presence page without names or exact timestamps", async () => {
    const baseUrl = await listen(presenceServiceWith(publicPresenceSnapshot));

    const response = await fetch(`${baseUrl}/presence`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(text).toContain("Жива Квестарня");
    expect(text).toContain("👥 У грі зараз: 4");
    expect(text).toContain("Зала корчми");
    expect(text).toContain("Активних: 3");
    expect(text).toContain("Притихлих: 1");
    expect(text).not.toContain("— 587");
    expect(text).not.toContain("— Дара");
    expect(text).not.toContain("— Нестор Межовий");
    expect(text).not.toMatch(/\d+\s*(?:секунд|хвилин)\s+тому/i);
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("renders an empty public presence page", () => {
    const html = renderPresencePage({
      totalActive: 0,
      totalIdle: 0,
      total: 0,
      locations: []
    });

    expect(html).toContain("У грі зараз: 0");
    expect(html).toContain("Зараз у Квестарні тихо");
  });

  it("uses neutral Ukrainian presence count labels for singular counts", () => {
    const html = renderPresencePage({
      totalActive: 1,
      totalIdle: 0,
      total: 1,
      locations: [
        {
          locationId: "location.korchma.barrel",
          title: "Біля Бочки Пінного Міражу",
          regionName: "Корчма Квестарні",
          activeCount: 1,
          idleCount: 0,
          players: []
        }
      ]
    });

    expect(html).toContain("Активних: 1");
    expect(html).toContain("Притихлих: 0");
    expect(html).not.toContain("1 активні");
    expect(html).not.toContain("0 притихли");
  });
});

async function listen(
  options:
    | PresenceService
    | {
        presence?: PresenceService;
        supportJarUrl?: string;
        supportJarStatus?: { currentUah?: number; goalUah?: number; updatedAt?: string };
      } = {}
): Promise<string> {
  const serverOptions =
    "getPublicPresenceLocations" in options ? { presence: options } : options;

  server = createServer((request, response) => {
    handleHealthRequest(request, response, serverOptions);
  });

  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function presenceServiceWith(snapshot: PublicPresenceLocationsSnapshot): PresenceService {
  return {
    getPublicPresenceLocations: () => Promise.resolve(snapshot)
  } as unknown as PresenceService;
}

const publicPresenceSnapshot: PublicPresenceLocationsSnapshot = {
  totalActive: 3,
  totalIdle: 1,
  total: 4,
  locations: [
    {
      locationId: "location.korchma.hall",
      title: "Зала корчми",
      regionName: "Корчма Квестарні",
      activeCount: 3,
      idleCount: 1,
      players: []
    }
  ]
};

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

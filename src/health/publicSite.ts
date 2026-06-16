import type { SupportJarStatus } from "../config/env";
import type { PublicPresenceLocationsSnapshot } from "../services/presenceService";
import { escapeHtml, renderNewsEntry, type NewsEntry } from "./news";

const TELEGRAM_BOT_URL = "https://t.me/kvestarnia_bot";
const EMPTY_PRESENCE: PublicPresenceLocationsSnapshot = {
  totalActive: 0,
  totalIdle: 0,
  total: 0,
  locations: []
};

export function renderHomePage(
  snapshot: PublicPresenceLocationsSnapshot = EMPTY_PRESENCE,
  newsEntries: NewsEntry[] = [],
  options: { supportJarUrl?: string; supportJarStatus?: SupportJarStatus } = {}
): string {
  const latestNews = newsEntries[0]
    ? renderNewsEntry(newsEntries[0])
    : "<p>Вісті тимчасово пішли шукати цвях для Дошки вістей.</p>";

  return renderPage(
    "Квестарня — гумористична фентезі-РПҐ у Telegram",
    `
    <section class="hero band">
      <div class="hero-copy">
        <p class="eyebrow">Гумористична фентезі-РПҐ у Telegram</p>
        <h1>Квестарня</h1>
        <p class="lead">Створи пригодника, зайди в корчму, бери короткі квести, бий дурнуватих монстрів і тягни додому манатки сумнівної цінності. Українською з нуля, без важкого UI й серйозного обличчя без потреби.</p>
        <nav class="cta-row" aria-label="Головні посилання">
          <a class="button primary" href="${TELEGRAM_BOT_URL}">Грати в Telegram</a>
          <a class="button" href="/presence">Жива Квестарня</a>
          <a class="button" href="/news">Вісті</a>
        </nav>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="tavern-sign">Квестарня</div>
        <div class="tavern-table">
          <span>🍺</span>
          <span>🎒</span>
          <span>🛢️</span>
        </div>
      </div>
    </section>

    <section class="band foam">
      <div class="section-head">
        <h2>Що це</h2>
        <p>Короткі сцени, кнопки замість важкого UI, швидкий прогрес, смішний лут і соціяльні пригоди, які хочеться переказати друзям у чаті.</p>
      </div>
      <div class="feature-grid">
        ${renderFeature("🎲", "Легка РПҐ у Telegram", "Створюєш пригодника через <code>/start</code>, обираєш расу й клас, заходиш у корчму й береш першу маленьку проблему.")}
        ${renderFeature("⚔️", "Прогрес за хвилину", "XP, золото, рівні, манатки й перші безпечні сутички без окремого клієнта або довгого мануалу.")}
        ${renderFeature("👥", "Соціяльна корчма", "Присутність, частування, майбутні рейди й жарти працюють там, де вже живуть чати.")}
      </div>
    </section>

    <section class="band split">
      <div>
        <h2>Бачення</h2>
        <p>Квестарня має відчуватись як жива фентезійна корчма, що завжди поруч у Telegram. Не потрібно встановлювати клієнт, читати довгий мануал або виділяти вечір на «серйозну» сесію.</p>
        <p>Гравець відкриває бот, бачить одну зрозумілу дію, натискає кнопку й отримує сцену, жарт, трофей або маленьку проблему, яку сам собі героїчно створив.</p>
      </div>
      <div>
        <h2>Тон</h2>
        <p>Тепла українська корчма в абсурдному фентезі: дружня до новачка, іронічна, швидка, трохи підозріла й достатньо системна, щоб цифри мали значення.</p>
        <p>Смішно без приниження гравця. Дурнувато настільки, щоб лут хотілося скріншотити.</p>
      </div>
    </section>

    <section class="band parchment">
      <div class="section-head">
        <h2>Що вже можна зробити</h2>
        <p>Це ранній playable foundation, але в корчмі вже є чим зайняти руки, манатки й підозри.</p>
      </div>
      <ul class="action-list" aria-label="Що вже можна зробити">
        <li>Створити пригодника з расою й класом.</li>
        <li>Зайти в корчму й узяти перші справи.</li>
        <li>Побитися з дивними монстрами.</li>
        <li>Зібрати манатки й вдягнути спорядження.</li>
        <li>Побачити, що в Квестарні вже хтось ворушиться.</li>
      </ul>
    </section>

    <section class="band presence-band">
      ${renderPresenceSummary(snapshot)}
    </section>

    <section class="band news-band">
      <div class="section-head">
        <h2>Остання вість</h2>
        <p>Дошка вістей не гарантує спокою, але гарантує архів.</p>
      </div>
      ${latestNews}
      <p class="more-link"><a href="/news">Усі вісті</a></p>
    </section>

    ${renderSupportBlock(options.supportJarUrl, options.supportJarStatus)}
    `
  );
}

export function renderNewsArchivePage(entries: NewsEntry[], selectedIndex: number): string {
  const selected = entries[selectedIndex] ?? entries[0] ?? null;
  const body = selected
    ? renderNewsEntry(selected, 1)
    : "<h1>Вісті</h1><p>Дошка вістей тимчасово порожня. Це підозріло, але акуратно.</p>";
  const archive = entries.length
    ? `<aside class="archive" aria-label="Архів вістей">
        <h2>Архів</h2>
        <ol>
          ${entries
            .map((entry, index) => {
              const current = index === selectedIndex;
              return `<li>${current ? "<span aria-current=\"page\">" : `<a href="/news?entry=${index}">`}${escapeHtml(entry.title)}${current ? "</span>" : "</a>"}</li>`;
            })
            .join("")}
        </ol>
      </aside>`
    : "";

  return renderPage(
    selected ? `${selected.title} — Вісті Квестарні` : "Вісті Квестарні",
    `
    <section class="band news-layout">
      <div>
        <p class="back-link"><a href="/">← На головну</a></p>
        ${body}
        ${renderNewsPagination(entries, selectedIndex)}
      </div>
      ${archive}
    </section>
    `
  );
}

export function renderPresencePage(snapshot: PublicPresenceLocationsSnapshot): string {
  const locationSections =
    snapshot.locations.length === 0
      ? "<p class=\"empty\">Зараз у Квестарні тихо. Навіть журнал обережно перегортає себе сам.</p>"
      : snapshot.locations.map(renderLocationCard).join("\n");

  return renderPage(
    "Жива Квестарня",
    `
    <section class="band presence-page">
      <p class="back-link"><a href="/">← На головну</a></p>
      <h1>Жива Квестарня</h1>
      <p class="lead-small">Хто зараз у грі, без Telegram-стеження й секундоміра над головою.</p>
      <p class="total">👥 У грі зараз: ${snapshot.total}</p>
      <div class="presence-totals">
        <span class="active">🟢 Активних: ${snapshot.totalActive}</span>
        <span class="idle">🟡 Притихлих: ${snapshot.totalIdle}</span>
      </div>
      ${locationSections}
      <p class="privacy-note">Без точних timestamp-ів, без публічних імен за замовчуванням і без назв прихованих місцин.</p>
    </section>
    `,
    { refresh: true }
  );
}

function renderPage(title: string, body: string, options: { refresh?: boolean } = {}): string {
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${options.refresh ? '<meta http-equiv="refresh" content="60">' : ""}
  <title>${escapeHtml(title)}</title>
  <style>${SITE_CSS}</style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/">Квестарня</a>
    <nav aria-label="Навігація">
      <a href="${TELEGRAM_BOT_URL}">Telegram</a>
      <a href="/presence">Жива</a>
      <a href="/news">Вісті</a>
    </nav>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

function renderFeature(icon: string, title: string, text: string): string {
  return `<article class="feature">
  <div class="feature-icon" aria-hidden="true">${icon}</div>
  <h3>${title}</h3>
  <p>${text}</p>
</article>`;
}

function renderSupportBlock(
  supportJarUrl: string | undefined,
  supportJarStatus: SupportJarStatus | undefined
): string {
  if (!supportJarUrl) {
    return "";
  }

  const escapedUrl = escapeHtml(supportJarUrl);
  const statusBlock = renderSupportStatus(supportJarStatus);

  return `<section class="band support-band">
  <div class="support-card">
    <p class="eyebrow">Добровільно й без сили за гроші</p>
    <h2>🫙 Підтримати Квестарню</h2>
    <p>Квестарня безкоштовна й без купівлі ігрової сили.</p>
    <p>Якщо хочеться допомогти проєкту — можна добровільно підкинути монет у Банку підтримки: на сервер, токени для Кодексу, тексти, редактуру, коректуру, ілюстрації й корчмарську інфраструктуру.</p>
    <p>Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч. Просто корчмі стане трохи тепліше.</p>
    ${statusBlock}
    <p><a class="support-button" href="${escapedUrl}">Підтримати корчму</a></p>
  </div>
</section>`;
}

function renderSupportStatus(status: SupportJarStatus | undefined): string {
  const lines =
    status?.currentUah === undefined
      ? ["Стан Банки видно за посиланням."]
      : [`У Банці зараз: ${formatUah(status.currentUah)} грн`];

  if (status?.goalUah !== undefined) {
    lines.push(`Ціль: ${formatUah(status.goalUah)} грн`);
  }

  if (status?.updatedAt) {
    lines.push(`Оновлено вручну: ${status.updatedAt}`);
  }

  return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
}

function formatUah(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function renderPresenceSummary(snapshot: PublicPresenceLocationsSnapshot): string {
  return `<div class="section-head">
    <h2>Жива Квестарня</h2>
    <p>Присутність не показує, хто «онлайн» у Telegram. Вона лише рахує загальний шум Квестарні: активні, притихлі й усі пригодники разом.</p>
  </div>
  <p class="total">👥 У грі зараз: ${snapshot.total}</p>
  <div class="presence-summary">
    <div class="presence-number">
      <span>${snapshot.total}</span>
      <strong>усього зараз</strong>
    </div>
    <div class="presence-stats">
      <span class="active">🟢 Активних: ${snapshot.totalActive}</span>
      <span class="idle">🟡 Притихлих: ${snapshot.totalIdle}</span>
    </div>
  </div>
  <p class="privacy-note">Розклад за відкритими місцинами живе на окремій сторінці. Без точних timestamp-ів, без публічних імен за замовчуванням і без назв прихованих місцин.</p>
  <p class="link-row"><a href="/presence">Відкрити Живу Квестарню</a><a href="/api/presence/locations">JSON присутності</a></p>`;
}

function renderLocationCard(location: PublicPresenceLocationsSnapshot["locations"][number]): string {
  const region = location.regionName
    ? `<div class="region">${escapeHtml(location.regionName)}</div>`
    : "";
  const players =
    location.players.length === 0
      ? ""
      : `<ul>${location.players.map((player) => `<li>— ${escapeHtml(player)}</li>`).join("")}</ul>`;

  return `<section class="location">
  <h2>${escapeHtml(location.title)}</h2>
  ${region}
  <div class="counts">${formatPresenceCounts(location.activeCount, location.idleCount)}</div>
  ${players}
</section>`;
}

function formatPresenceCounts(activeCount: number, idleCount: number): string {
  return `<span class="active">🟢 Активних: ${activeCount}</span> · <span class="idle">🟡 Притихлих: ${idleCount}</span>`;
}

function renderNewsPagination(entries: NewsEntry[], selectedIndex: number): string {
  if (entries.length <= 1) {
    return "";
  }

  const links = [
    selectedIndex > 0 ? `<a href="/news?entry=${selectedIndex - 1}">Новіша</a>` : "",
    selectedIndex < entries.length - 1 ? `<a href="/news?entry=${selectedIndex + 1}">Старіша</a>` : ""
  ].filter(Boolean);

  return links.length === 0 ? "" : `<nav class="pager" aria-label="Навігація вістями">${links.join("")}</nav>`;
}

const SITE_CSS = `
:root {
  color-scheme: light;
  --ink: #17231f;
  --wood: #1f4a3d;
  --wood-deep: #0f211d;
  --parchment: #f3e4c4;
  --foam: #fff7df;
  --amber: #d99a24;
  --copper: #b7653a;
  --wine: #842f3f;
  --green: #367b50;
  --honey: #a87616;
  --muted: #536b61;
  --line: rgba(31, 74, 61, 0.22);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--wood-deep);
  color: var(--ink);
  font: 16px/1.6 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: var(--wine);
  font-weight: 700;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px max(18px, calc((100vw - 1120px) / 2));
  background: rgba(255, 247, 223, 0.96);
  border-bottom: 1px solid var(--line);
}

.brand {
  color: var(--ink);
  font-size: 1.05rem;
  text-decoration: none;
}

.site-header nav,
.cta-row,
.link-row,
.pager {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.site-header nav a {
  color: var(--muted);
  font-size: 0.95rem;
  text-decoration: none;
}

main {
  background: var(--foam);
}

.band {
  width: 100%;
  padding: 56px max(18px, calc((100vw - 1120px) / 2));
}

.hero {
  min-height: 78vh;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  align-items: center;
  gap: 40px;
  background: var(--wood);
  color: var(--foam);
}

.hero h1 {
  margin: 0 0 18px;
  color: var(--foam);
  font-size: clamp(3rem, 10vw, 6.8rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.eyebrow {
  margin: 0 0 12px;
  color: #f3c15c;
  font-weight: 800;
  text-transform: uppercase;
}

.lead,
.lead-small {
  max-width: 760px;
  color: inherit;
  font-size: 1.22rem;
}

.button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 247, 223, 0.38);
  border-radius: 6px;
  color: var(--foam);
  text-decoration: none;
}

.button.primary {
  background: var(--amber);
  border-color: var(--amber);
  color: var(--ink);
}

.button.subtle {
  color: #f1d8a6;
}

.hero-visual {
  min-height: 360px;
  display: grid;
  align-content: center;
  gap: 24px;
  padding: 28px;
  border: 1px solid rgba(255, 247, 223, 0.22);
  background: #17362e;
  box-shadow: inset 0 -20px 0 rgba(0, 0, 0, 0.16);
}

.tavern-sign {
  justify-self: center;
  padding: 18px 28px;
  border: 4px solid var(--copper);
  border-radius: 6px;
  background: var(--parchment);
  color: var(--ink);
  font-size: 2rem;
  font-weight: 900;
  transform: rotate(-2deg);
}

.tavern-table {
  display: flex;
  justify-content: center;
  gap: 18px;
  padding: 22px;
  border-top: 8px solid var(--copper);
  color: var(--foam);
  font-size: 3rem;
}

.foam {
  background: var(--foam);
}

.parchment,
.news-band {
  background: var(--parchment);
}

.support-band {
  background: #f8efe0;
}

.support-card {
  max-width: 820px;
  padding: 24px;
  border: 1px solid rgba(132, 47, 63, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.48);
}

.support-card .eyebrow {
  color: var(--wine);
}

.support-button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 6px;
  background: var(--wood);
  color: var(--foam);
  text-decoration: none;
}

.presence-band {
  background: #edf4ef;
}

.section-head {
  max-width: 820px;
  margin-bottom: 26px;
}

h1,
h2,
h3 {
  margin: 0 0 12px;
  line-height: 1.15;
  letter-spacing: 0;
}

h2 {
  font-size: 2rem;
}

p {
  margin: 0 0 16px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.feature,
.archive {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.42);
}

.feature-icon {
  font-size: 2rem;
}

.split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 36px;
  background: #eef6ed;
}

.action-list {
  max-width: 760px;
  margin: 0;
  padding-left: 22px;
  font-size: 1.08rem;
}

.action-list li {
  margin-bottom: 8px;
}

code {
  display: inline-block;
  padding: 2px 7px;
  border: 1px solid rgba(132, 47, 63, 0.18);
  border-radius: 5px;
  background: rgba(132, 47, 63, 0.08);
  color: #5f2330;
  font: 0.95em ui-monospace, SFMono-Regular, Consolas, monospace;
}

.presence-summary,
.presence-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 18px;
}

.presence-number {
  min-width: 150px;
  padding: 16px;
  border-left: 6px solid var(--amber);
  background: var(--foam);
}

.presence-number span {
  display: block;
  font-size: 2.5rem;
  font-weight: 900;
  line-height: 1;
}

.active {
  color: var(--green);
  font-weight: 800;
}

.idle {
  color: var(--honey);
  font-weight: 800;
}

.presence-list,
.news-entry ul,
.archive ol {
  margin: 0 0 18px;
  padding-left: 22px;
}

.presence-list {
  max-width: 720px;
  padding: 0;
  list-style: none;
}

.presence-list li,
.location {
  padding: 14px 0;
  border-top: 1px solid var(--line);
}

.presence-list span,
.region,
.counts,
.empty,
.privacy-note,
.back-link {
  color: var(--muted);
}

.presence-list span {
  display: block;
}

.link-row a,
.pager a {
  margin-right: 8px;
}

.news-entry {
  max-width: 860px;
}

.news-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: 40px;
  background: var(--foam);
}

.archive {
  align-self: start;
  background: var(--parchment);
}

.archive span[aria-current="page"] {
  font-weight: 900;
}

.more-link,
.pager,
.back-link {
  margin-top: 22px;
}

@media (max-width: 760px) {
  .site-header {
    position: static;
    align-items: flex-start;
    flex-direction: column;
  }

  .hero,
  .split,
  .news-layout,
  .feature-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    min-height: auto;
  }

  .hero-visual {
    min-height: 240px;
  }
}
`;

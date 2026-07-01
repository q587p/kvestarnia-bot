# 0.2.19 - Deploy Notification as Visti

Status: Shipped in `0.2.19`

## Goal

Rework the optional deploy notification so it matches the shipped Kvestarnia news surface and voice.

Current notification example:

```text
🛠️ Квестарня оновилась.
Версія: 0.1.18
```

The notification treats the release entry as `вісти`, not generic `новини-новини`, and includes the first narrative paragraph from the latest `news.md` entry when that entry is readable.

Shipped copy shape:

```text
🛠️ Квестарня оновилась.
Версія: <b>{version}</b>

📰 Остання вість із Дошки корчми:
<b>{latest release title without version/date prefix}</b>

{first narrative paragraph from latest news.md entry}

Архів вістей: /news
Канал вістей: https://t.me/kvestarnia
```

Fallback:

```text
🛠️ Квестарня оновилась.
Версія: <b>{version}</b>

Дошка вістей тимчасово мовчить. Корчмар каже, що це теж технічний стан.

Архів вістей: /news
Канал вістей: https://t.me/kvestarnia
```

## Scope

- Updated `DeployNotificationService.renderDeployNotification(...)`.
- Renamed visible deploy-notification wording from generic `Остання новина`/`Деталі й архів` style to `вісти`/`Дошка вістей` wording.
- Included the first body paragraph from the latest release entry after the version line, with HTML escaping and Telegram message length safety.
- Kept `/news` as the archive command.
- Added service tests for the exact notification text, fallback and HTML escaping.

## Non-goals

- No new durable notification/outbox system.
- No change to deploy notification opt-in config or marker semantics.
- No broad `/news` command rename unless explicitly approved in the same task.
- No migration.

## Acceptance criteria

- Deploy notification no longer says only `Квестарня оновилась` + version + title.
- The latest release title and first narrative paragraph are visible in the notification when `news.md` is readable.
- Fallback copy remains safe when `news.md` is missing or malformed.
- Player-facing copy uses Ukrainian `вісти` language and keeps the message short enough for Telegram.
- Tests cover latest-news paragraph extraction, HTML escaping, fallback rendering and absence of old wording.

## Relevant files / search terms

- `src/services/deployNotificationService.ts`
- `src/news/newsMarkdown.ts`
- `news.md`
- `tests/services/deployNotificationService.test.ts`
- `Остання новина`
- `Квестарня оновилась`
- `Дошка вістей`

## Focused tests

- `npm test -- tests/services/deployNotificationService.test.ts tests/news/newsMarkdown.test.ts`
- `npm run typecheck`

## Manual Telegram QA

- With `DEPLOY_NOTIFICATIONS_ENABLED=true`, trigger a new version marker and verify the private deploy message shows the version, release title, first Корчмар/narrative paragraph and `/news` archive hint.

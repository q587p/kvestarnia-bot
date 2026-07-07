# Public Surface and Roadmap Sync

## Goal

Synchronize public surfaces and planning docs after `0.2.7 — Player Abilities MVP`, so players, README readers and Codex see the same current Kvestarnia.

## Scope

- Update public site/news source or rendering path so current repository news is visible beyond `0.0.24`.
- Update Telegram-facing public wording proposal in docs, avoiding ready-sounding guild promises.
- Update README playable list after `0.2.7` if the PR has merged.
- Update `docs/history/phase2/deferred-0.2.md` so Race Abilities are not still `proposed next` after they ship.
- Update `docs/product/roadmap.md`, `docs/tasks/README.md`, `docs/ai/context.md` with the chosen post-`0.2.7` order.
- Fix support wording drift in `docs/product/product-brief.md` if still present.

## Non-goals

- No new gameplay system.
- No package bump for docs-only changes.
- No broad rewrite of README into a dev runbook.
- No promise that guilds, raids, markets or crafting are already playable.

## Acceptance criteria

- Public surfaces do not present `0.0.24` as latest if newer `news.md` entries exist.
- Roadmap/deferred docs agree on the next runtime order.
- Race Abilities status is accurate after `0.2.7` merge.
- Telegram/public copy follows Brand and does not overpromise.
- Markdown links pass if a link checker exists.

## Relevant files / search terms

- `README.md`
- `news.md`
- site/server rendering files for homepage and `/news`
- `docs/product/roadmap.md`
- `docs/history/phase2/deferred-0.2.md`
- `docs/README.md`
- `docs/product/product-brief.md`
- `docs/product/brand.md`
- `docs/ai/context.md`
- `docs/tasks/README.md`
- search: `0.0.24`, `Race Abilities`, `proposed next`, `Бочка підтримки`, `ґільдії`

## Focused tests

- news/site rendering tests if they exist;
- markdown link tests if available;
- health/news tests if available.

## Manual QA

- Open homepage and `/news`; verify latest entry is current.
- Read Telegram bot/channel descriptions and ensure future features are roadmap-only.
- Open README and docs index; verify current build line is not contradictory.

## Release surfaces

Docs-only by default. If site runtime code changes, mention it in PR body and run the relevant test suite.

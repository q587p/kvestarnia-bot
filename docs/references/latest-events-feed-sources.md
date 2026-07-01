# Latest Events Feed — external source analysis

This reference doc summarizes product and UX patterns for a Kvestarnia recent-events feed. It is intentionally separate from the Codex prompt so the prompt can stay short and skill-based.

## User-provided examples

The supplied examples use the strongest Telegram-friendly pattern:

```text
📣 Останні події / 📜 Хроніки Гри

📅 Day
emoji HH:mm | actor + action + result
```

Useful properties:

- day grouping makes the feed scannable;
- an emoji classifies each event before the player reads it;
- the timestamp supports a feeling of a live world;
- rows stay short enough for mobile Telegram;
- rows focus on moments with social value: new players, level-ups, equipment, raids.

Main risk: a feed that records every small action becomes noise. Kvestarnia needs thresholds, filters and dedupe from the first slice.

## Steam / Xbox achievements: public proof and social goals

Steamworks describes Stats and Achievements as persistent, account-bound tracking that can be displayed in a Steam Community Profile. The same page says achievements can encourage teamwork, player interaction, extra objectives and more time in-game.

Source: https://partner.steamgames.com/doc/features/achievements

Xbox title-managed achievements describe achievements as inclusive, social and engaging, and list an `Achievement Activity Feed` where players can discover popular achievements among friends and rewards being earned.

Source: https://learn.microsoft.com/en-us/gaming/gdk/docs/services/player-data/achievements/title-managed/live-achievements-tm-overview

Kvestarnia implication:

- activity rows should teach players what kinds of moments are possible;
- milestones should be more prominent than tiny routine progress;
- the feed should complement the existing achievement ledger rather than duplicate every achievement unlock.

## Discord Recent Activity: compact cards, collapse and privacy

Discord's recent activity cards show live/recent activities, time elapsed or how long ago something happened, and can collapse to three cards or expand up to 50. The FAQ also describes hiding cards and activity privacy controls globally, per server and per game.

Source: https://support.discord.com/hc/en-us/articles/22045487931799-Members-List-Recent-Activity-FAQ

Kvestarnia implication:

- make the main feature a pull surface, not constant unsolicited chat spam;
- show a compact first page and paginate;
- avoid loss/death shame in the MVP;
- sanitize public names and do not leak private Telegram identifiers.

## OSRS trackers: adventure moments, not audit logs

RuneDiary's OSRS adventure log highlights real-time achievements including rare drops and loot, level-ups and milestones, quest completions, combat achievements and pets.

Source: https://www.runediary.com/oh-that-feel/adventurers-log

OSRS Tracker positions itself around capturing every level-up, pet drop and legendary moment; it also calls out raid completions, deaths, timelines, sharing and live Discord alerts with smart filtering to reduce noise.

Source: https://osrs-tracker.com/

Kvestarnia implication:

- a good feed records moments players want to talk about, not every backend state change;
- rare manatky, raid wins and underdog victories are stronger than routine combat wins;
- if death/loss rows are ever added, they should be opt-in or clearly non-shaming.

## Teams activity feed anatomy: actor, reason, time, context

Microsoft Teams activity feed notification anatomy breaks a card into actor/avatar, activity type icon, title as actor + reason, timestamp, location and preview. The docs also mention feed retention for the past four weeks.

Source: https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/design/activity-feed-notifications

Kvestarnia implication:

- store structured data: actor, event type, subject, timestamp, location/context and preview payload;
- render short rows from that structure rather than storing only final text;
- add indexes and retention decisions now so the feed can grow into personal/guild/season feeds later.

## Recommended synthesis for Kvestarnia

Use a structured `ActivityEvent` ledger and render it into `📜 Хроніки Квестарні`:

1. Pull screen first, optional auto-announcements later.
2. MVP event types: character created, level reached, group raid victory, rare manatka received, underdog combat victory.
3. Deferred event types: item upgrade and overlevel item only when current `main` has item-level/upgrade data.
4. Filters: important, adventurers, fights, manatky.
5. Dedupe every event by terminal source id.
6. No public loss/death/shame in the first slice.
7. Keep rows short, grouped by Kyiv day, with `Сьогодні` / `Вчора` labels where possible.

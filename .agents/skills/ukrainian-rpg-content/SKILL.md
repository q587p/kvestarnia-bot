---
name: ukrainian-rpg-content
description: Use for player-facing Ukrainian Kvestarnia RPG copy: battle text, tips, locations, buttons, item/monster/quest flavor, news, release notes, and content review. Trigger when the task changes or asks for Ukrainian game text.
---

# Ukrainian RPG Content Skill

Use this skill for player-facing Ukrainian copy in Kvestarnia.
It may generate, rewrite, or review battle, tip, location, item, monster, quest, class/race, support, release/news, and Telegram UI text.

Follow the active task mode:
- If the current agent is read-only, report issues and suggestions only.
- If editing is allowed by the main task, keep diffs minimal and update relevant tests for stable text surfaces when needed.

## Sources to prefer

Read only what is needed:
- `AGENTS.md` for hard project rules.
- `docs/CONTENT_STYLE_GUIDE.md` for Ukrainian copy style.
- `docs/BRAND.md` for naming and public voice.
- `news.md` only when editing player-facing release news.
- Relevant presenter/content files only; avoid broad scans.

## Core voice

Kvestarnia copy is:
- Ukrainian from the start, not translated.
- Friendly, ironic, warm, and absurd-fantasy.
- Tavern-first: short scenes, small rituals, manatky, suspicious loot, and tavern-keeper logic.
- Funny without humiliating the player.
- Screenshot-worthy but compact enough for Telegram.

Good taste sources are flavor only: tabletop RPGs, Munchkin-like item absurdity, MythAdventures-style fantasy bureaucracy, Monty Python silliness, Epic NPC Man energy, classic MMORPG rituals, Pratchett-like systemic absurdity, Ukrainian folklore and memes. Do not copy protected scenes, characters, unique places, or long quotes.

## Hard language rules

- Player-facing name: `Квестарня`.
- Technical slug only: `kvestarnia`.
- Use `пригодник` as the default in-world player entity.
- Use `персонаж` for rules/data/sheets/settings.
- Use `герой` as status, consequence, promo image, or irony, not the default label.
- Use Ukrainian `«»` quotes in player-facing prose.
- Visible player/news/changelog dates use Holocene years, e.g. `12026`, not `2026`.
- Use `міт`, `мітичний`, `мітологія`, `мітологічний`; avoid `міф*` unless immutable.
- Use `соціяльний`, `соціяльна`, `соціяльне`, `соціяльні`, `соціяльність`; avoid `соціальн*` unless immutable.
- Avoid accidental Russian, rough calques, and random English except commands, code, IDs, or deliberate technical labels.

## Telegram format rules

- One normal message should fit on one mobile screen.
- Default length: 1 heading plus 1-6 short lines.
- Use blank lines between scene beats; do not split compact stat/reward lists.
- Emojis help scanning; they must not replace meaning.
- Buttons should use clear verbs.
- If a location screen has an action button, the text must hint at that action.
- If presenter output uses Telegram HTML, keep escaping and `parse_mode: "HTML"` consistent.
- NPC direct speech should use HTML blockquote at presenter/bot boundary, not raw Markdown `>`.

## Dynamic text safety

Dynamic templates must work with different genders, numbers, long names, monster names, class/race names, and item names.
Prefer neutral verbs and structures:
- `влучає`
- `спрацьовує`
- `завдано`
- `отримано`
- `зараховано`

Avoid templates that only agree with one noun gender or one action type.
When changing battle/reward/hub templates, recommend or add regression tests for multiple substitutions when editing is allowed.

## Battle copy

Battle text should feel like a scene, not a log dump.

Do:
- Keep HP/damage readable.
- Make the result clear before the joke if stakes matter.
- Keep repeated turn screens compact.
- Avoid repeating `хід` in adjacent labels. Use `Раунд`, `Журнал`, `Остання дія`, or no label when cleaner.
- Ensure duplicate callback answers and edited messages do not produce awkward repeated text.

Good shape:
```text
Раунд 2

Журнал
Атака влучає на 11 шкоди.
Монстр промахнувся й зробив вигляд, що так і планував.
```

Avoid:
```text
Хід записано.

Хід: 2

Останній хід
Атака влучає...
```

## Tips and help copy

Tips should be short, useful, and in-world.
Do:
- Say what the player can do next.
- Prefer one joke plus one clear instruction.
- Do not expose hidden implementation details.
- Do not promise roadmap features as shipped.

## Location copy

Location copy should orient the player and hint at the available action.
Do:
- Keep ordinary locations lowercase in prose: `шинок`, `льох`, `стіл зі справами`, `дошка вістей`.
- Use uppercase only for sentence starts, UI titles/buttons, and proper names.
- Make the action discoverable outside the button.

## News and release copy

`news.md` is player-facing and spoiler-light.
Do:
- Sell the mood and visible actions.
- Use `У грі вже:` for visible changes.
- Use at most one short `Ще не відчинено:` line for understandable player-facing limits.
- Keep exact mechanics, rewards, hidden conditions, final punchlines, technical debt, scheduler/restart/deploy details, Redis/BullMQ, migrations, scaling, and Mini App backlog out of news.

Detailed mechanics belong in `CHANGELOG.md`, docs, tests, or PR body.

## Items and monsters

Item naming formula:
- ordinary object + unexpected function/emotion
- short name, one-sentence description
- silly but desirable as a trophy

Examples:
- `Капці тривожної мобільності`
- `Келих нестримного пафосу`
- `Сокира лагідної аргументації`

Monster naming formula:
- fantasy creature + domestic/bureaucratic absurdity
- understandable without external meme knowledge

Examples:
- `Скелет-вахтер`
- `Дракончик попереднього погодження`
- `Павук дедлайнів`

## Support copy

Support copy must be voluntary and non-coercive.
Always state or preserve that support gives no gameplay advantage when relevant.
Allowed idea:
- `Підтримка не дає ігрових переваг. Просто корчмі стане трохи тепліше.`

Do not use:
- `преміум`
- `купити лут`
- `ексклюзивна нагорода`
- `донатери отримують бонуси`
- any paid combat power, XP, gold, loot, manatky, access, or ranking advantage

## Red lines

Do not make jokes from:
- real wartime suffering or real tragedies
- protected traits or slurs
- real political figures unless a human approved a specific satire direction
- imperial/occupier nostalgia
- gambling with real-money power
- crypto/NFT/pay-to-win mechanics
- humiliation of the player for failure

## Generation output

For normal generation, keep output compact:
- 3 options maximum unless the user asks for more.
- Include only the text and a short note on where it fits.
- No tutorial.

For structured content, return data first, then Telegram examples only if useful.

## Review output

For copy review, use:

- Blockers:
- Important copy issues:
- Minor polish:
- Suggested replacement text:
- Test/update notes:

Only include actionable findings. If the copy is fine, say so briefly and list any small optional polish.

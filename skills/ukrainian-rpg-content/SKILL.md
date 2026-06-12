---
name: ukrainian-rpg-content
description: Generate and review Ukrainian-language humorous fantasy RPG content for Telegram bot messages, monsters, items, quests, classes, races, and seasonal events.
---

# Ukrainian RPG Content Skill

Use this skill when creating or reviewing user-facing game text.

## Goals
- Keep all player-facing text natural Ukrainian.
- Make content short enough for Telegram.
- Preserve the tone: cozy tavern, absurd fantasy, light satire, Pratchett-like systemic silliness.
- Prefer original Ukrainian jokes over translated memes.

## Checklist
- Does the text fit in one mobile screen?
- Is the main action visible in the first line?
- Are numbers readable?
- Are emojis useful, not noisy?
- Is the joke understandable without external context?
- Are names screenshot-worthy?
- Does the text avoid real trauma, discrimination, and accidental russisms?

## Naming formulas
Items:
- [ordinary object] + [emotion/function]
- «Пательня переконання»
- «Капці тривожної мобільності»
- «Плащ людини, яка вже йде»

Monsters:
- [fantasy creature] + [bureaucracy/domestic absurdity]
- «Скелет-вахтер»
- «Гоблін з Excel»
- «Павук дедлайнів»

## Output format for new content
When asked to generate content, return structured data first, then examples of Telegram messages.

For items:
```ts
{
  id: "item.pan-of-persuasion",
  name: "Пательня переконання",
  slot: "weapon",
  rarity: "uncommon",
  stats: { str: 2, cha: 1 },
  description: "Аргумент із ручкою."
}
```

For monsters:
```ts
{
  id: "monster.mimic-shawarma",
  name: "Мімік-шаурма",
  level: 1,
  hp: 14,
  attack: 3,
  armor: 0,
  trait: "pretends_to_be_food"
}
```

## Red lines
Do not create jokes based on real wartime suffering, protected traits, slurs, or real political figures unless the task explicitly asks for a reviewed satire direction.

# Loot Expansion v1: canonical Kvestarnia ids

## Problem

`src/content/lootExpansionV1Data.ts` is a generated broad loot pack. It arrived with legacy fantasy ids for classes, races and titles: for example `bureaucrat`, `cleric`, `cook`, `human`, `goblin`, `dragonkin`, `debt_collector` and `lord_of_pan`.

Current character creation uses the live Kvestarnia ids instead: `bureaucramancer`, `priest`, `varenyk-mancer`, `human-ish`, `bisyny`, `drantohor` and the rest of the playable race/class set.

The old adapter kept the generated pack internally valid by mapping current ids toward legacy pack ids. That made validation green, but it left frustrating player-facing cases: a generated manatka could ask for a class, race or title that does not exist as a real player choice.

## Fix

`src/content/lootExpansionV1.ts` now normalizes the raw generated pack at the adapter boundary:

- exported class dictionaries are replaced with current playable class ids;
- exported race dictionaries are replaced with current active race ids;
- legacy class/race requirements and affinities are rewritten to current ids;
- hard title requirements are converted to current class/race surrogate requirements and then cleared from `requirements.titles`;
- title affinities are kept only as soft synthetic buckets for flavor and weighting;
- generated loot candidates are filtered through `checkLootExpansionEquipRequirement`, so ordinary loot rolls should not offer expansion gear the current character cannot equip.

## Not A Title System

This does not add persistent earned titles. It only prevents generated manatky from requiring orphan title ids. Current visible combo titles can still act as flavor and soft affinity signals through `profile.title` / `titleIds`, but hard equipment gates now rely on level, class and race only.

## Important Mappings

Classes:

- `cleric` -> `priest`
- `cook` -> `varenyk-mancer`
- `bureaucrat`, `merchant` -> `bureaucramancer`
- `alchemist`, `necromancer`, `summoner` -> `mage`
- `blacksmith`, `tank` -> `warrior`
- `druid` -> `kharakternyk`

Races:

- `human`, `halfling` -> `human-ish`
- `orc` -> `intellectual-orc`
- `gnome` -> `domovyk`
- `goblin`, `catfolk` -> `bisyny`
- `dragonkin` -> `drantohor`
- `frogfolk` -> `dryland-rusalka`
- `skeleton` -> `molfar-soul`
- `construct` -> `dwarf`

Former hard title gates:

- `debt_collector` / «Боргомант» -> `bureaucramancer`
- `lord_of_pan`, `soup_knight` -> `varenyk-mancer`
- `archive_rat`, `queue_marshall`, `novice_of_queue` -> `bureaucramancer`
- `not_dead_first`, `carpet_slayer` -> `warrior`
- `boss_arguer` -> `kharakternyk`
- `guild_meme` -> `bard`
- `loot_whisperer` -> `rogue`
- `honorary_goblin` -> `bisyny`
- `sleepy_champion` -> `molfar-soul`
- `master_of_teapot` -> `dryland-rusalka`

## Why Not Hand-Edit The Generated File?

`lootExpansionV1Data.ts` is large generated content. Hand-editing rows there would drift again the next time the source pack regenerates. The stable boundary is the adapter: raw generated data stays raw, exported runtime data becomes canonical.

## Verification Target

Run:

```bash
npm.cmd test -- tests/content/lootExpansionV1.test.ts tests/domain/lootEngine.test.ts
npm.cmd run lint
npx.cmd tsc --noEmit
```

Expected behavior:

- `lootExpansionV1Data.classes` equals current playable class ids;
- `lootExpansionV1Data.races` equals current active race ids;
- no item has hard `requirements.titles`;
- all requirements and affinities resolve against current dictionaries;
- generated expansion loot candidates are equippable by the current character profile.

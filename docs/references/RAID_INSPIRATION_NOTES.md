# Raid Inspiration Notes

These are design references, not dependencies and not content to copy.

## Pokémon GO raid lobby pattern

Useful idea:

- one concrete boss event;
- a visible join/lobby window;
- public or friend-specific invitation to the same instance;
- teamwork with personal participation rewards.

Kvestarnia adaptation:

- opaque Telegram deep link instead of a pass/code economy;
- private bot preview and server eligibility;
- `👀 Хто поруч` targeted invite plus forwardable link;
- no monetized combat pass and no location exposure.

## Flexible raid-size scaling

MMOs such as World of Warcraft popularized flexible group sizes with encounter scaling.

Useful idea:

- do not require one exact headcount;
- freeze scale at pull/start;
- change mechanics as well as HP.

Kvestarnia adaptation:

- `1..8`, recommended `4–5`;
- sublinear HP after player five;
- more marked targets and watcher pressure for larger groups;
- no live rescaling after disconnect/knockout.

## Shared break-bar / control objective

Guild Wars 2-style break-bar design is useful as a general pattern: a boss telegraphs a dangerous action and the group contributes control/disruption rather than only racing raw damage.

Kvestarnia adaptation:

- visible `Нагляд` objective;
- every class has at least one useful contribution route;
- dedicated disrupt sacrifices damage;
- failure causes readable area pressure;
- support contribution counts toward rewards.

## Telegraph-first boss design

Many turn-based and MMO bosses show intent before a severe action.

Useful idea:

- players can make an informed defend/disrupt choice;
- difficulty comes from coordination, not surprise one-shots.

Kvestarnia adaptation:

- private marked-target warning;
- one-round `Форма 19-84` warning;
- final-round warning;
- timeout auto-defend to avoid free AFK damage.

## What not to import

- no giant MMO roster or role queue;
- no mandatory tank/healer/DPS trinity;
- no pay-to-enter raid pass;
- no loot-master power or winner-takes-all item;
- no live HP rubber-banding to current gear;
- no copied character names, slogans, prose, scenes or UI text from *1984* or another game.

## Source-check note

Before publishing public design notes, replace this informal inspiration summary with the project's preferred source citations/links if needed. Runtime implementation does not depend on any external API or copyrighted asset.

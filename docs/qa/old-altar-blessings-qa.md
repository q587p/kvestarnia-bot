# Old Altar Blessings — QA plan

## Automated test checklist

### Domain

- Selected blessing stat accepts only `strength`, `dexterity`, `intelligence`, `charisma`, `luck`.
- Invalid stat callback is rejected or normalized safely before mutation.
- Bonus amount is clamped to `1..3`.
- Favor cost maps to bonus amount.
- Mana cost maps to bonus amount.
- Current direct Priest blessing math remains unchanged.

### Callback parsing

- Open altar callback parses.
- Help callback parses.
- Offering preview/confirm callback parses.
- Priest ritual target callback parses.
- Blessing type callback parses.
- Invalid version/prefix/action is rejected.
- Callback data stays under Telegram limit.

### Service — open flows

- No character -> no-character card.
- Non-Priest can open altar and offering UI.
- Priest below level gate cannot conduct rite.
- Level 3+ Priest can see ritual action at yard.
- Actor in combat/raid sees blocked ritual state.
- Actor outside yard cannot perform altar mutation from stale callback.

### Service — gold offerings

- Enough gold: gold decreases by 13, favor increases by 1, offering ledger row is written.
- Not enough gold: no mutation.
- Duplicate confirmation: no second spend/grant.
- Same Kyiv day cap after 3 favor from gold: no mutation.
- Next Kyiv day: cap resets.
- Remort/current character life boundary: favor does not carry incorrectly.

### Service — Priest altar blessing

- Priest self-blessing spends mana and favor atomically.
- Priest target blessing spends mana/favor and creates selected stat blessing.
- Target private notification is requested only after successful durable mutation.
- Active blessing blocks another altar blessing.
- Active direct Priest blessing blocks altar blessing if the single-blessing rule is implemented globally.
- Same actor-target repeat wait blocks.
- Different target remains available if mana/favor is enough.
- Expired blessing no longer affects effective stats.
- Replayed/stale callback does not spend again.

### Repository / Prisma

- Favor account unique by current character/remort life.
- Offering ledger stores local Kyiv date.
- Transaction prevents negative gold/favor/mana.
- Concurrent confirmations cannot double spend.
- Blessing spend ledger references durable blessing/action rows where possible.

### Presenters / keyboards

- Yard card mentions altar.
- Yard keyboard has `🪨 Старий жертовник` and preserves back/daily routes.
- Altar open card shows favor balance.
- Offering confirmation clearly states irreversible spend.
- Blocked cards attach useful navigation/action keyboard.
- Priest result card shows HP? No; blessing result should show mana/favor/stat/duration only.
- Target notification copy is clear and private.

### Routing / presence

- Opening the altar keeps presence as `location.korchma.yard`.
- Same-yard target list includes active same-yard characters and excludes idle/inactive beyond current rules.
- Front/yard marker behavior does not regress.
- No new root-grove presence location appears in MVP.

## Manual Telegram QA

### Setup

Use at least two characters:

- Priest level 3+ with enough mana and gold.
- Non-Priest level 3+ with enough gold.
- Optional third same-yard target.

### Script

1. From front, open `🪣 У задвірок`.
2. Verify yard copy mentions old altar.
3. Open `🪨 Старий жертовник`.
4. Verify favor balance appears.
5. As non-Priest, open offering flow and donate gold.
6. Verify gold decrease and favor increase.
7. Retry the same confirmation; verify no duplicate spend.
8. Donate until the daily cap; verify cap blocker.
9. As non-Priest, try to conduct a rite; verify Priest-only copy.
10. As Priest, donate enough gold/favor.
11. As Priest, bless self with `Тверда рука`.
12. Check hero card/effective stat display while active.
13. Try another blessing while active; verify no stacking blocker.
14. Wait/reset blessing; bless self with another stat.
15. Place another active character at yard.
16. Bless target; verify target notification.
17. Move target away and replay old target callback; verify stale location blocker.
18. Put Priest in combat/raid; verify ritual action blocks.
19. Use existing `✨ Жрецька поміч` outside altar; verify direct behavior remains unchanged.

## Regression smoke

- `/hero` displays current Priest blessing correctly.
- Existing direct Priest self-bless button still works.
- Existing direct Priest heal still spends mana and not bandages.
- Rogue `Тиха кишеня` target lists still work.
- Bard performance and same-location presence still work.
- Daily Korchma Round yard scene still opens when relevant.
- Main menu location button still updates correctly.
- `npm run check` passes.

## Known playtest questions

- Is 13 gold too cheap or too expensive for 1 favor?
- Do players understand the difference between offering and blessing?
- Do Priests feel more useful, or does this feel like extra bookkeeping?
- Is selected-stat blessing too much compared with direct +luck blessing?
- Does the yard feel better with the altar, or should `Тихий Корінь` become a real location later?

# Referral reward balance

Canonical source: `../../CONTRACT.md`.

## Final ladder

| Invitee level | Existing achievement | Inviter reward | Why here |
|---:|---|---|---|
| 3 | `achievement.level.3` | `1× item.dense-bandage`, `5× item.iskrokamin`, `50` gold | First real proof of play; already funds the raw `+1` NPC upgrade price and gives strong healing |
| 5 | `achievement.level.5` | `1× item.field-kit`, `13× item.iskrokamin`, `120` gold | A visibly stronger medical reward aligned with the raw `+2` NPC upgrade price |
| 8 | `achievement.level.8` | `2× item.field-kit`, `65× item.iskrokamin`, `760` gold | Combined raw `+3` and `+4` NPC upgrade costs |
| 13 | `achievement.level.13` | `3× item.field-kit`, `193× item.iskrokamin`, `900` gold | Capstone payout: the current `+5` NPC gold price and enough Iskrokamin for any current one-step `+5` attempt |

Each accepted direct invitee has all four stages. Gold and every item are one frozen automatic payout for that stage. There is no payout for level 2 or 10, signup, acceptance, purchases or a second referral generation.

The private inviter dashboard shows this exact table before the link is shared, plus totals of `1 × item.dense-bandage`, `6 × item.field-kit`, `276 × item.iskrokamin` and `1830` gold. This owner-approved disclosure is referral-dashboard-only and does not change the spoiler-light consent card, lore or `news.md`.

## Live catalog facts

| Item | Existing behaviour | Catalog/economy facts |
|---|---|---|
| Бинт відповідальної паніки | Common one-use consumable; heals 7 HP | `goldValue=7`; `trade-blocked`, `duel-blocked` |
| Щільний бинт | Uncommon one-use consumable; heals 42 HP | `goldValue=56`; crafted from 8 ordinary bandages; `trade-blocked`, `duel-blocked` |
| Польова аптечка | Uncommon one-use consumable; raises HP only as far as needed to reach at least 93% max HP | `goldValue=91`; crafted from 13 ordinary bandages; `trade-blocked`, `duel-blocked` |
| Іскрокамінь | Uncommon priceless resource used by existing item upgrades | `priceless=true`; explicitly `tradeable`; no direct use effect |

Do not create bound referral variants. After a committed payout, each item follows every ordinary live rule.

In the current repository, `trade-blocked` prevents the direct gift surface but does not erase all economic paths: the three medical items can be sent through the post, sold to Mantok, and contribute their ordinary values to level barter; Iskrokamin is transferable and is progression-relevant. This is an intentionally material reward, not cosmetic fiction.

## Footprint per completed invitee

Direct emissions after all four stages:

```text
gold: 50 + 120 + 760 + 900 = 1830
Iskrokamin: 5 + 13 + 65 + 193 = 276
medical items: 1 dense bandage + 6 field kits
```

Medical catalog value:

```text
1 × 56 + 6 × 91 = 602 goldValue
```

The same medical track is equivalent to `8 + 6 × 13 = 86` ordinary bandages before ranger crafting savings.

| Stage | Direct gold | Medical `goldValue` | Gold + nominal medical value | Iskrokamin |
|---:|---:|---:|---:|---:|
| 3 | 50 | 56 | 106 | 5 |
| 5 | 120 | 91 | 211 | 13 |
| 8 | 760 | 182 | 942 | 65 |
| 13 | 900 | 273 | 1173 | 193 |
| **Total** | **1830** | **602** | **2432** | **276** |

`goldValue` is valuation, not liquid gold. If all medical rewards are sold in one Mantok basket at the current 42% rate, the payout is `ceil(602 × 0.42) = 253` gold, taking total liquid gold to `2083`. Selling each unit in its own eligible basket can round that conversion to `24 + 6 × 39 = 258`, or `2088` total liquid gold. The Iskrokamin has no sale value but is a real transferable upgrade resource.

The current upgrade rows are `+1: 50 gold / 5 base Iskrokamin`, `+2: 120 / 13`, `+3: 260 / 23`, `+4: 500 / 42`, `+5: 900 / 93`. NPC gold stays fixed; rarity/set calculation and donor discounts modify only the Iskrokamin cost. Referral stages mirror `+1`, `+2`, combined `+3 + +4`, and `+5`. Across the whole referral track, `1830` gold exactly equals the complete NPC gold ladder, while `276` Iskrokamin exceeds the raw `176` ladder because the final `193` covers the current legendary `+5` maximum of `180` with `13` spare. Failed attempts still spend resources.

### Current `+5` cap, not a hidden `+6`

Repository `0.4.5` caps authored and generated item upgrades at `+5`; no `+6` variant, price or effect exists. The level-13 amount `193` must therefore not be described as buying a shipped `+6` upgrade.

It does cover the maximum current one-step `+5` Iskrokamin price without a donor: `ceil(93 × 1.93) = 180` for a legendary item, leaving `13`. A literal `+6` would be a separate Charkokovalnia balance/content task covering the cap, IDs, variants, effects, rarity/set modifiers, gold/mana costs, success chance, UI, persistence and tests; the referral task must not invent that feature implicitly.

The cap is per invitee and structural:

- at most four unique material reward rows;
- exact frozen stage payloads from the table above;
- no repeat after restart, remort, replay or policy version;
- no global inviter cap.

Thus the maximum material emission grows with the number of real accepted players who reach the stages. That is the intended incentive.

## Why 3 / 5 / 8 / 13

These are already enabled visible level achievements, so the player does not need a parallel qualification vocabulary. They also make a coherent Kvestarnia number rhythm and match the existing economy:

- level 3 already gives a dense bandage rather than a token base consumable;
- level 5 introduces the field kit, while levels 8 and 13 increase its quantity;
- the `5/13/65/193` resource curve maps to `+1`, `+2`, combined `+3/+4`, and the maximum current `+5` step;
- the `50/120/760/900` gold curve exactly funds the base NPC ladder from `+1` through `+5`.

A level jump grants every crossed stage exactly once. No `24h`, `7d`, Daily Korchma Round, active-date or Kyiv-date condition may be added behind the displayed level.

## Why automatic payout

The owner references consistently show `досяг рівня → виплата`, not a claim inbox. Automatic grant reduces friction and makes the causal loop obvious.

`PENDING` is a recovery state only. It is valid while:

- `REFERRAL_REWARD_PAYOUTS_ENABLED=false`;
- the inviter has no current Character;
- restart serialization temporarily leaves no valid delivery target;
- a transient transaction error exhausted bounded retries.

Once the condition clears, the same frozen row is delivered automatically. A notification may say `отримав` only after the item increments, gold increment and `GRANTED` receipt commit together.

Remort is different from restart in the live repository: it keeps the same Character ID while resetting that Character's life, gold and items. Payout therefore serializes wholly before or after the reset. It is never reissued merely because remort began a new life.

## Accepted alt-farming risk

A determined player can create another Telegram account and level it for the full staged package. This is explicitly accepted despite the material size above. The cost is actual progression, while the implementation closes zero-effort paths:

- existing accounts cannot attach retroactively;
- one invitee cannot rebind;
- self-referral is rejected;
- repeated level events, achievement backfill and remort cannot repeat a stage;
- concurrent delivery cannot duplicate gold or any item component;
- a new reward plan cannot reopen old milestone keys.

No IP/device fingerprinting, CAPTCHA, rolling cap or delayed retention gate belongs in this slice.

## Achievement side effects

A successful payout is a real `item.received` grant plus an ordinary gold-balance change. Feed the exact applied items and resulting balance to the existing best-effort post-commit achievement tracker so ordinary first-owned/inventory-count/Iskrokamin and gold-balance achievements may unlock.

Do not emit `item.crafted` for dense bandage or field kit. Referral delivery did not craft them. Later item use follows existing `item.used` behaviour.

## Tuning rules

Measure by bounded milestone key:

- accepted referrals;
- stage earned and stage granted counts;
- accepted-to-level conversion and time-to-stage;
- pending payout age;
- direct referral gold emitted by stage;
- Mantok sale, post and barter usage through existing aggregate economy metrics;
- Iskrokamin upgrade consumption through existing aggregate metrics.

If emission is too high, create a reviewed future policy for future acceptances. Do not confiscate items or gold, rewrite old pending payloads, add `rewardPlanVersion` to uniqueness or retroactively impose hidden gates.

## Explicitly rejected in 0.4.6

- premium currency, purchase-linked rewards or a percentage of invitee spending;
- XP/loot/drop multipliers;
- reward for the invitee merely opening or creating a Character;
- second-level referral rewards;
- random reward boxes;
- manually claimed material rewards;
- global “first 13 friends only” material cap;
- a separate referral currency or shop;
- cosmetic titles as a substitute for the four material stages;
- silently adding or promising item upgrade `+6` as part of referral work.

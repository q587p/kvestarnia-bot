# Guild Foundation Balance — 0.4.4

Status: accepted durable social-shell constants. This file contains no future
reward, weekly-goal or guild-economy promise.

| Boundary | Accepted value | Purpose |
| --- | ---: | --- |
| Founder eligibility | level 5+, or level 3+ after one remort | keeps founding deliberate without gating free joins |
| Creation cost | 93 personal gold, non-refundable | one bounded personal sink; never shared custody |
| Founder cooldown | rolling 7 days from confirm | prevents charter/name churn across expiry or disband |
| Creation preview | 13 minutes, one live/User | bounded confirmation and replay window |
| Forming charter | 7 days | enough time to recruit one distinct friend |
| Forming name hold | expiry + 23 hours | blocks immediate impersonation without permanent capture |
| Disbanded name hold | disband + 30 days | gives an established identity a longer reuse buffer |
| Designed core / hard cap | 3–5 / 8 active Users | small-group product with bounded Telegram surfaces |
| Officer cap | 2 | prevents rank inflation in the small roster |
| Name / description | 3–32 / 0–93 graphemes | compact identity and moderation boundary |
| Crest catalog | exactly 13 server-owned emoji | stable rendering and no arbitrary Unicode role |
| Invitation TTL | 93 hours | asynchronous consent without indefinite pending state |
| Incoming invitation cap | 3 live/target | bounded pressure and keyboard size |
| Actor invitation rate | 3 new per rolling 13 minutes | spam control independent of delivery success |
| Decline cooldown | 7 days per guild-target pair | respects refusal across leader/officer changes |

Joining costs no gold and has no level, remort, quest, item or signature gate.
There is no guild currency, bank, shared reward, XP, buff, shop, weekly reward or
combat advantage. Base party/combat eligibility and rewards do not depend on
guild membership; `joinSource=guild` is attribution only.

## Risk controls

- Exact cost is frozen in the intent and conditionally debited in the same
  serializable transaction as cooldown claim, reservation and membership.
- Unique active User/name/invite keys and version CAS protect simultaneous
  confirms, accepts, role changes and final roster slots.
- Server-owned normalization rejects reserved, markup/control and mixed
  Cyrillic/Latin names; description and crest are revalidated on leader edit.
- Funnel counters come from private audit event types only. They do not derive
  contribution, activity, location, online time or public rankings.

Balance expansion is blocked until this rewardless shell has exact-head manual
QA and observed small-cohort evidence. Any economy or progression addition needs
its own task and balance review.

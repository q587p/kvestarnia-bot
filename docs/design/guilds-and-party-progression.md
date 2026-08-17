# Ґільдії та гуртова прогресія

Статус: accepted product boundary for repository release `0.4.5`; runtime
surface is default-off behind `GUILD_FOUNDATION_ENABLED`.

## Product boundary

A party is a temporary team for one already-authored gameplay occasion. A guild
is a durable small identity that helps the same people find one another again.
The guild never owns a party, encounter, combat lease, reward or settlement.

Foundation is designed around a comfortable core of 3–5 people. The domain
separates an initial active-member capacity of 8 from an absolute future maximum
of 13, while current admission and UI remain at 8. It stores one normalized/display name, one exclusive
emoji crest from the 13-choice catalog or one custom emoji, a 0–93-grapheme
description, active membership and private audit history. Names are retained
historically while a separate reservation is released after the accepted
expiry/disband hold. A future explicit expansion may raise an individual guild
only as far as 13 members; this release provides no expansion mechanic, price,
entitlement or persisted capacity field and therefore needs no capacity migration.

## Guild Nest and discovery

`🪺 Гніздо ґільдій` is a low side chamber off `Спуск до Низу`, before the first
combat layer. It is the canonical public discovery route, not a fourth passage,
per-guild hall or free-floating notice board. It shares
`PRESENCE_LOCATION_KORCHMA_DEEP`, so browsing renews neutral activity without
splitting nearby, movement, daily-scene or combat-lock semantics.
When the feature is enabled, the Spusk card itself names the low side passage,
chamber, crests and postal slots before offering the full-width Nest action.

Public Nest and directory callbacks require the viewer's current Spusk
location. New persistent main keyboards have no global guild row. Private
`/guild`, target-bound deep links, invite responses and character-card shortcuts
remain available from anywhere under their existing rules; cached legacy
`🏰 Ґільдії` text stays a guarded compatibility route. The default-off flag hides
the entrance and makes stale public callbacks inert before repository access.

The public directory is an active-only five-row projection ordered by
normalized name and stable id. It exposes escaped crest/name, optional escaped
description and current `n/8` count only. It has no roster, leader, role,
membership id, Telegram identity, token, audit, timestamp, exact location,
ranking, recommendation or application action. Guild UGC, including a custom
emoji crest, keeps canonical validation and HTML escaping; broader
moderation/reporting waits for a repository-wide facility.

The private hero card shows a forming/active guild's escaped crest and name.
`👀 Хто поруч` may prefix an already-visible active Character with only the
escaped active-guild crest; it still reveals no guild name, role, membership id,
Telegram identity, timestamp or extra location data. An active leader may open
a five-row same-location invitation picker only for nearby nonmembers who have
already minted a live private opt-in. Presence, authority, membership and that
target-bound consent are revalidated at the callback/mutation boundary.

## Creation lifecycle

Founder eligibility is `(remortCount = 0 AND currentLevel >= 7) OR
(remortCount >= 1 AND currentLevel >= 3)`. Join has no level, remort, quest,
item or payment gate.

Creation uses one replaceable 13-minute intent per User. The preview freezes
name, crest, description and 587-gold cost. Confirm atomically:

1. verifies the current Character life and eligibility;
2. claims the rolling seven-day User-level founder cooldown;
3. conditionally debits 587 gold once;
4. reserves the normalized name;
5. creates a seven-day `forming` guild and its leader membership;
6. terminalizes every incoming invitation and appends private audit.

The payment is non-refundable. Failures and replay spend nothing extra. The
first accepted invitation from a second distinct User activates the guild in
the same transaction. Only that activation writes `guild.created`; the joining
User records `guild.joined`. If no one joins, expiry closes active memberships
and invitations without erasing history.

The forming name reservation releases at `charterExpiresAt + 23h`. An active
guild may be disbanded only by its sole leader; that reservation releases at
`disbandedAt + 30d`. Lazy maintenance uses conditional updates, so release is
idempotent and cannot free a newer reservation.

## Crest identity

Each emoji crest has one nullable unique reservation key. Forming and active
guilds reserve it; expiry/disband clears it. Creation and leader profile editing
show an advisory filtered catalog plus the guild's own current crest, then claim
inside the versioned transaction. The relevant overdue owner is
terminalized directly, independent of the bounded cleanup backlog. Unique-key
races give one winner; a losing create has no gold debit, founder cooldown or
charter side effect.

Custom identity is a direct alternative in both pickers, including when all 13
catalog crests are occupied. The exact ForceReply accepts exactly one genuine
Unicode RGI emoji sequence and fences continuation by flag, membership/leader
authority, guild status and expected version. Occupied, multiple, textual,
forged and stale replies are
rejected without profile, gold, cooldown or audit mutation. Replay stays
idempotent across restart. The normalized visible sequence keeps its emoji
presentation selectors, while selector aliases share a separate canonical
reservation key and catalog aliases render the canonical catalog form. Audit
records only semantic catalog/custom-emoji
changes. Photo, document, sticker, animation, video, URL and binary crest input
are not supported; legacy pre-release photo prompts recover inertly through the
emoji picker.

## Roles and permissions

Technical role keys remain `leader`, `officer`, `member`. `Guild.leaderUserId`
is the exactly-one-leader anchor; role strings alone are not the invariant.
There may be at most two officers.

| Action | Leader | Officer | Member |
| --- | --- | --- | --- |
| Read profile/roster | yes | yes | yes |
| Create/cancel own invitation | yes | yes | no |
| Cancel another inviter's invitation | yes | no | no |
| Edit available catalog/custom crest and description | yes | no | no |
| Promote/demote, kick, offer transfer | yes | no | no |
| Voluntary leave | only after accepted transfer | yes | yes |
| Disband | sole active member only | no | no |

An officer loses cancellation authority immediately after demotion, kick or
leave. Transfer is a durable nominee offer; only the nominated active member may
accept it against the current guild version. No voluntary path infers a
successor from presence, activity or join order.

## Invitations and privacy

There is no global exact-character-name directory. A target creates a bounded,
target-bound opt-in code and shares it deliberately. Its forwardable card has 13
distinct Ukrainian invitation texts and includes the actionable private deep
link in the body; changing the text does not rotate the underlying live link or
token. External failures collapse
to one unavailable result instead of revealing whether a User exists or already
belongs elsewhere.

- invitation TTL: 93 hours;
- one live guild-target pair;
- at most three live incoming invitations per target;
- at most three new invitations per actor per rolling 13 minutes;
- decline blocks the guild-target pair for seven days, independent of inviter;
- roster, candidate and invitation pages: five rows.

Cards and audit DTOs never expose exact location, activity/online timestamp,
Telegram identity or invitation token. Telegram delivery failure does not
cancel durable state; `/guild` is the authoritative recovery surface.

## PartySession integration

`/guild_party` does not create a lobby. It opens a paginated guild-member picker
only when the actor already leads an eligible real gameplay `PartySession` in
recruiting state. The send path reuses ordinary party invitation copy, join
callback and canonical card publication. `joinSource=guild` is attribution only;
nonmembers keep all ordinary allowed invitation and join routes.

Guild and party state are revalidated immediately around audience resolution.
The notice contains no guild branding, so a final leave/kick race cannot disclose
membership. Guild leave, kick, disband or flag changes never mutate a party or
combat row.

## Character lifecycle and rollout

Membership, leadership, founder cooldown and invitations are User-level.
Remort keeps the same membership and leader anchor while current-life party and
combat cleanup remains authoritative. `/restart` refuses deletion while the
Character leads or participates in a live recruiting/active party or active
group combat, even when no `ActiveCombatLease` exists. Safe Character recreation
does not transfer leadership.

Disabled rollout preserves rows and the minimum escape/recovery paths: profile
read, nonleader leave, accepted transfer and sole-member disband. It blocks new
formation, invite/accept, role/profile and guild-party writes. The default stays
off until exact-head three-account QA and an abandoned-leader operator policy
are approved.

## Outside 0.4.5

No guild bank, shared economy/items, trade, XP, levels, weekly goal, buffs,
bosses, chat, alliances, war, territory, leaderboard, matchmaking or PvP. Any
future guild progression requires a separate version task, economy/abuse review
and production evidence; it is not implied by the foundation tables.

## Future guild-system backlog

The following ideas are recorded for later version tasks only. They do not
expand the 0.4.5 schema, rollout flag or release promise, and the referenced
other-game UI is product research rather than copy to reproduce verbatim.

1. **Public recruitment and applications.** Add leader-controlled `private` and
   `public` modes. Private guilds accept no directory applications. Public
   guilds may expose a short recruitment announcement, open/closed recruitment
   state and a safe in-game contact path, with button-first application review.
   Do not expose Telegram handles, exact location or membership ids. Define
   spam limits, decline cooldowns, blocking, moderation and capacity races first.
2. **Contribution goals and guild quests.** Build the already planned weekly
   goal before considering daily personal/shared objectives. Contributions need
   canonical gameplay receipts, anti-farming weights, remort rules, exact-once
   settlement and useful progress cards. Exact thresholds and rewards remain a
   balance decision; weaker-enemy weighting from another game is not accepted
   automatically.
3. **Treasury and transparent ledger.** A shared-gold system needs explicit
   deposit sources, withdrawal/spend authority, immutable receipts, daily/all-
   time summaries, rollback and abuse recovery. It must not silently tax player
   rewards or mix guild money with a Character wallet. This is a high-risk
   economy slice, not a foundation follow-up.
4. **Capacity growth and structures.** The current cap starts at 8 and a future
   expansion may reach at most 13. A later structure/entitlement design may
   unlock those five places stepwise. Other buildings, shared combat health,
   attack/defence buffs and timed activations require separate balance and
   all-combat-surface proof; no pay-to-win bonuses are pre-approved.
5. **Guild chat and event journal.** Consider a bounded guild-only message feed
   plus system events for joins, exits and accepted applications. It requires
   reporting/moderation, retention limits, escaping, flood control, deleted-user
   handling and privacy review before implementation.
6. **Diplomacy, alliances and territories.** Alliance requests, hostility,
   territory control, taxes and guild PvP are independent late-game systems.
   They need season/reset ownership, opt-in conflict, matchmaking, settlement,
   collusion and abandoned-leader policies. They must not block ordinary PvE or
   turn the read-only 0.4.5 directory into an authorization boundary.
7. **Guild progression and cosmetics.** Guild XP/levels and earned frames remain
   the 0.4.13 direction after weekly-goal evidence. Progression may unlock
   cosmetic identity and carefully reviewed comfort features; it does not imply
   shared combat power, territory or treasury access.

Each item needs its own scoped task, QA matrix, data/rollback plan and player-
visible menu design. Shipping one item does not implicitly authorize the next.

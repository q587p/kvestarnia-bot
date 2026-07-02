# Tavern Social Games balance and abuse controls

## Economy principles

- No house payout in MVP.
- No outcome modifiers from paid tavern drinks in MVP.
- All winnings come from the reserved pot.
- Refund paths return reserved stakes only.
- All gold changes should be ledgered/audited using the existing economy pattern.

## Recommended config

Use existing config conventions. If env flags are the repo pattern, recommended defaults are:

```env
TAVERN_GAMES_ENABLED=false
TAVERN_GAME_TAVLEI_ENABLED=false
TAVERN_GAME_KOSTI_ENABLED=false
TAVERN_GAME_MAX_STAKE=25
TAVERN_GAME_DAILY_NET_WIN_CAP=150
TAVERN_GAME_CREATE_COOLDOWN_SEC=60
TAVERN_GAME_ACTIVE_SESSION_LIMIT=1
```

Start disabled by default unless the repo has a different feature flag release convention.

## Launch phases

### Phase 0: hidden/dev

- Feature hidden from normal tavern UI.
- Exercise migrations, create/join/decision/resolve/refund.
- Verify stale callbacks and failed resolve safe refunds.

### Phase 1: Tavlei only

- Enable Tavlei with low max stake.
- Watch repeated pair transfers and refund rate.
- Avoid leaderboard or streak rewards.

### Phase 2: Kosti

- Enable Kosti after table timeouts and multi-player payouts are stable.
- Keep the same or lower max stake.
- Verify pot conservation in production logs.

### Phase 3: polish

- Add more result templates, rematch, feed polish, and optional social reactions.

## Abuse risks and mitigations

### Gold transfer between accounts

Risk: players can use table games as direct transfers.

Mitigations:

- max stake;
- one active stake session per character;
- create cooldown;
- daily net win cap or at least audit event;
- repeated pair audit;
- optional cap on net transfer between the same pair over 24 hours.

### Double spend / race conditions

Risk: duplicate callbacks, concurrent joins, concurrent resolves, expire vs resolve races.

Mitigations:

- transaction-safe gold mutation;
- row lock or existing safe status transition pattern;
- idempotent callbacks;
- terminal statuses;
- unique participant per session;
- resolve may be called multiple times but pays once;
- payout/refund paths are mutually exclusive.

### Orphan escrow

Risk: reserved stakes remain stuck after stale sessions or errors.

Mitigations:

- opportunistic expiration on tavern games entry/list/join/resolve;
- indexed expiration timestamps;
- terminal failed-safe refund state;
- admin/dev repair command if the repo has admin tools.

### Combat lock bypass

Risk: game callbacks let a player navigate or act while combat lock should block non-combat actions.

Mitigations:

- create/join/submit-decision callbacks pass through the same guard as tavern navigation;
- passive resolution of already-escrowed games may complete without requiring a new player action;
- result rendering should not open forbidden navigation paths during combat.

## Required invariants

- Character gold never becomes negative.
- A stake is reserved at most once per participant.
- A participant belongs to a session at most once.
- One character has at most one active stake session unless the repo explicitly supports more.
- A session reaches exactly one terminal state.
- Terminal sessions never mutate payouts again.
- `sum(payouts) == pot` for completed sessions.
- `sum(refunds) == reserved pot` for refunded sessions.
- Ledger/audit totals match the gold mutations.
- Stale callbacks return friendly text, not an exception.

## Telemetry / logging

Use the existing logging or telemetry pattern. Recommended event names:

- `tavern_game_session_created`
- `tavern_game_joined`
- `tavern_game_decision_submitted`
- `tavern_game_resolved`
- `tavern_game_refunded`
- `tavern_game_payout_failed`
- `tavern_game_stale_callback`
- `tavern_game_daily_cap_hit`

Useful dimensions:

- game key;
- stake;
- player count;
- status transition;
- refund reason;
- payout total;
- time to fill;
- time to resolve;
- repeated pair marker for Tavlei.

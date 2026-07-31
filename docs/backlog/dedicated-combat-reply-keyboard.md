# Dedicated Combat Reply Keyboard

Status: future versioned task, captured from the `0.4.2` PR #187 Telegram QA
findings. No release number is assigned, and this does not block `0.4.3`.

## Goal

Replace the location-aware persistent main reply keyboard with one authoritative
combat reply keyboard while a private-chat character owns an active combat
lease, then restore the correct main/navigation keyboard exactly once after
flee or terminal completion.

The player must always retain at least one visible, usable control surface. An
active actor gets combat controls; a knocked-out observer gets refresh/recovery;
a free character gets current navigation. There must be no keyboard-less gap,
one-second flash, stale replacement or five-second message spam.

## Findings from the deferred 0.4.2 attempt

- A Telegram reply keyboard is chat-global state. It is replaced only by a new
  message carrying another reply keyboard; editing the canonical combat card
  cannot update it.
- One message cannot carry both a reply keyboard and an inline keyboard. A
  design that needs both must define their publication order and recovery
  contract explicitly.
- Intro, active-card, scheduler, `/start`, refresh and navigation deliveries can
  race. A briefly visible battle keyboard may be replaced immediately by a
  later main-keyboard message even when both individual sends succeed.
- Publishing a keyboard only for the first revision leaves used abilities
  visible, recovered abilities absent and knocked-out participants actionable.
  Controls must derive from current authoritative mana, cooldown, target, item
  and participant state on every relevant generation.
- An older reply label remains pressable after its action becomes unavailable.
  It must reach canonical validation, commit no gameplay effect and redraw the
  current controls without a separate error bubble.
- Party-wide delivery followed by a second actor redraw caused duplicate cards
  and duplicate keyboards. A queued/replaced/duplicate action should publish at
  most one current actor surface; unchanged participants should receive no
  routine replacement.
- Countdown refreshes must edit the existing canonical card instead of sending
  a new card every scheduler tick.
- Flee, terminal settlement and a newer solo/duel/raid/GroupCombat can overtake
  an old active worker. In-process locks and a pre-send state read are not a
  correctness boundary across restart or rolling deployment.
- Telegram calls can outlive a stale database claim. Every send/edit/delete
  that may change controls needs bounded live ownership, renewal or durable
  compensation so older UI cannot become last after ownership changes.
- Telegram has no request idempotency key. Acceptance immediately before abort,
  network failure or database acknowledgement loss remains an honest external
  at-least-once ambiguity.
- Supergroups cannot receive the private reply keyboard. A no-keyboard redirect
  must not acknowledge a private control generation or poison later recovery.
- A failed refresh, `/start`, stale callback, process restart or scheduler repair
  must converge to an actionable surface. Repeated mismatch warnings are not a
  recovery mechanism.
- Combat modes previously assembled similar rows independently, causing label
  and placement drift. Shared action semantics and row-shape helpers are needed
  across ordinary one/multi-enemy fights, Training Doppelgänger, Party Boss,
  turn duel and GroupCombat.

## Scope

- Define one authoritative per-character UI owner from the durable combat lease.
- Publish a dedicated private reply keyboard for every active combat mode, with
  currently legal direct actions and a compact observer/recovery form.
- Keep target selection, item selection and any overflow action list reachable;
  do not truncate abilities or manatky.
- Reuse shared labels and row layout where action semantics match. Preserve
  mode-specific actions and wording where they do not.
- Order active publication, personal flee, terminal navigation and a newer
  combat through one durable per-character contract plus the local
  serialization optimization.
- Make keyboard generations explicit: acknowledge only the keyboard actually
  sent, never a card-only or supergroup delivery.
- Restore current location/quest navigation exactly once after combat ownership
  ends, and ensure that restored or newer-combat keyboard is last.
- Decide whether canonical cards retain inline actions as a recovery/targeting
  surface or become display-only. Do not remove the 0.4.2 inline fallback until
  the dedicated reply keyboard proves restart and failure recovery.

## Non-goals

- No combat balance, reward, item, achievement or encounter changes.
- No activation inside `0.4.2` or automatic assignment to `0.4.3`.
- No replacement of the existing durable combat lease with Telegram message
  state or an in-memory lock.
- No claim that Telegram delivery is exactly once.
- No migration until the implementation task proves existing publication and
  navigation fields cannot express the selected protocol.

## Acceptance criteria

1. Every private-chat state has at least one authoritative visible keyboard:
   active battle, observer/recovery or current main navigation.
2. Starting combat replaces the main reply keyboard with the battle keyboard
   without a flash-and-disappear interval; the first canonical card remains
   actionable regardless of intro/card ordering.
3. Legal class, race, equipment, item, guard, target and flee controls disappear
   and reappear exactly with canonical validation. Stale presses commit nothing.
4. Knockout immediately converges to observer-only controls; terminal/flee
   converges to current navigation; a newer combat always wins over stale UI.
5. Queued, replaced, duplicate and unchanged scheduler work does not republish
   identical keyboards or duplicate canonical cards.
6. Delayed send, edit and delete; stale takeover; acknowledgement failure;
   process death; restart; rolling deployment and supergroup redirect converge
   without leaving an inert newest private surface.
7. A validated final action remains restart-recoverable and exactly-once even
   while terminal keyboard publication is busy.
8. Exact recipient/order/send/edit/delete counts are asserted for initial,
   queued, replaced, duplicate, resolved, unavailable, recovered, knockout,
   flee, terminal, restart and newer-combat paths.
9. Ordinary PvE, multi-enemy PvE, Training Doppelgänger, Party Boss, turn duel
   and GroupCombat use shared primitives where semantics match and retain their
   existing gameplay behavior.
10. Manual Telegram QA proves no keyboard-less state across three accounts,
    slow network simulation, `/start`, refresh, timeout, restart, flee, terminal
    settlement and immediate entry into another combat.

## Relevant files / search terms

- `activeCombatLease`, combat-lock middleware and current owner dispatch.
- `groupCombatCardDelivery`, terminal exit navigation and publication claims.
- ordinary fight, Training Doppelgänger, Party Boss and duel card delivery.
- `combatActionKeyboardLayout`, reply-keyboard builders and main-menu keyboard.
- keyboard fingerprint/generation, canonical message reference and scheduler.
- grammY `sendMessage`, `editMessageText`, `deleteMessage`, abort and retry.

## Focused tests

- Shared row/label parity and overflow reachability across every combat mode.
- Mana/cooldown/item recovery, stale labels and knockout transitions.
- Deterministic publication barriers around every Telegram operation.
- Restart/stale-claim adoption, newer-combat ownership and terminal restoration.
- Exact Telegram counts with ordinary, ambiguous and permanent failures.
- Repository integration for the real durable claim/acknowledgement contract.

## Manual Telegram QA

Use three local accounts and an isolated runtime snapshot. Exercise solo,
multi-enemy, GroupCombat and Party Boss flows with deliberately slow replies,
timeouts, `/start`, refresh, unavailable abilities, knockout, flee, completion,
restart and immediate next-combat entry. Record whether the battle or main
keyboard is visible after every step and capture any duplicate/stale message.

## Release surfaces

When activated, assign a new version and update its task, QA matrix, combat
architecture, playtesting instructions, compact context, changelog/news and PR
body. The task must state the exact local `.env` configuration and manual QA
status. Until then, keep the shipped 0.4.2 persistent-main-keyboard plus inline
combat-control fallback and do not describe this backlog design as available.

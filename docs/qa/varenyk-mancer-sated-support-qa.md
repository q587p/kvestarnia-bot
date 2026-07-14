# Varenyk-mancer Sated Support — Telegram QA

Status: pending. This checklist documents intended manual verification; it does not claim completed results.

## Setup

- Refresh the isolated local bot with `refresh-local-bot.cmd` when ready for manual testing.
- Prepare a living level 3+ Varenyk-mancer, an active same-location recipient and a second Varenyk-mancer.
- Use `/dev_reset_varenyk_sated` only between local cases that need the caller's status/wait cleared.

## Manual Telegram checks

| Scenario | Preconditions and action | Expected bot response and state | Logs / database evidence |
| --- | --- | --- | --- |
| Discovery and preview | Living level 3+ Varenyk-mancer; open hero and `Хто поруч`, then preview self and an active exact-location recipient outside Korchma/Shynok. | `🍽️ Нагодувати` is reachable without a special location. Preview names the target and shows deterministic stat rank, applied affordable rank, exact cost/recovery, 13-minute duration and 93-minute wait. No resources change before confirm. | Preview-only row belongs to the actor; no recipient status row or achievement exists yet. |
| Downgrade and self ordering | Put mana between two rank costs, confirm self-feed, then repeat below 8 mana after reset. | Highest affordable rank is committed; full mana cost leaves before capped `+1 mana` returns. Below 8 mana shows a blocker with no activation. | Fresh receipt records the applied rank/cost and post-action resources; blocked attempt creates no recipient activation. |
| Caps, full resources and cards | Feed at partial HP/mana, then at full resources after reset; reopen hero/combat cards. | Immediate `2 + rank HP` and `1 mana` cap independently. Full resources still activate. `😋 Ситий` shows canonical remaining time; recovery text appears only after a real change. | One recipient row contains activation/lives/timestamps/cursor; no over-max resource value is stored. |
| Other recipient and notification | Feed another eligible player, then press the same confirmation again. | Recipient receives one concise private notification only for the fresh commit; replay does not spend, heal, notify or unlock again. | One receipt/activation and one achievement source event at most; duplicate callback produces no second mutation. |
| Invalid and stale targets | Try inactive, remote, different normalized location, defeated, remorted, combat-active and incompatible-flow targets; alter token/target/life callback fields. | Every attempt fails closed with concise blocker copy and no support effect. | Actor mana and recipient cooldown/resources stay unchanged; no notification or achievement row. |
| Two-caster race and replacement | Confirm two casters concurrently for one recipient. Later genuinely clear/shorten the recipient wait and feed again. | Race yields exactly one fresh winner. After the wait is truly available, one new activation replaces rank/duration; no parallel stack exists. | Exactly one recipient cooldown row; first race has one winning activation, later replacement has a new activation id/receipt. |
| Lazy time, restart and remort | Reopen after complete minutes, while full, after restart and after expiry; remort recipient and separately remort an actor who fed someone else. | Eligible minutes recover capped `+1 HP/+1 mana`; cursor advances while full. Expiry stops recovery while wait may remain. Recipient remort clears old-life state/wait; actor remort does not cancel the other recipient. | Cursor is monotonic and capped at expiry; recipient remort removes its row, while the other recipient's life-bound payload remains. |
| Persistent PvE and Doppelganger | Enter single-/multi-enemy persistent PvE and Training Doppelganger with active Sated; commit actions and timeout/default defence, including terminal turns. | At most one pulse follows the recipient's own committed turn, after action spend. Rejected/stale callbacks do not pulse. | Stored combat state has one durable pulse id per activation/kind/session/turn/recipient and journal recovery only when resources changed. |
| Turn duel, Big Barrel and quick duel | Run turn-based duel and Big Barrel rounds with eligible participants; replay/restart/duplicate resolution; also run a quick duel. | Each eligible participant gets at most one own-action/round pulse, including timeout/terminal resolution. Quick duel gets none. | Stored round payloads retain unique pulse identities; losing CAS/replay does not advance resources or duplicate journal entries. |
| Regressions and dev safety | Smoke Priest heal/blessing, Shynok recovery, passive regeneration, rewards and stored journals. Run `/dev_reset_varenyk_sated` locally, then inspect production configuration. | Existing mechanics stay unchanged. Local command clears only caller current-life status/wait; production neither registers, shows nor mutates through it. | Only the caller's Sated row is deleted locally; production command invocation creates no DB write even with dev-grant configuration set. |

## Smoke after deploy

No deploy is authorized in this task. After a future authorized deploy, repeat discovery, one self-feed, one other-feed, one durable combat turn and the production dev-command absence check.

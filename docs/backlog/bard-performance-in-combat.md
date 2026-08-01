# Bard performance during active combat backlog

Status: deferred design. The current contract freezes `Натхнення` when combat
starts; a performance must begin before the combat lease is acquired.

## Product expectation to resolve

A Bard outside a fight may see active same-location players who are already in
combat. Those players are not currently eligible audience, because applying a
new external buff directly to a frozen combat state would break deterministic
replay and restart safety.

## Future task questions

- Decide whether a performance may target participants in an already active
  solo fight, GroupCombat, turn duel or Big Barrel raid.
- If allowed, commit the external effect at one authoritative turn/round
  boundary through the owning combat transaction rather than mutating JSON
  asynchronously.
- Define same-location, remort-life, lease, expiry, duplicate-delivery and
  simultaneous-performance rules.
- Preserve exact replay after restart and prevent a performance from reviving a
  defeated participant or retroactively changing a resolved turn.
- Align all combat surfaces and their journals before exposing the button.

Until this contract is activated, nearby copy must explain that combat-busy
players cannot receive a new performance and that the buff should be applied
before battle.

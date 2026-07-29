# Nyz Tier Two

Status: future gameplay task. `0.4.2` exposes only a post-victory construction
notice and does not allow entry.

## Goal

Turn the temporarily discovered `Ярус II` stairs into a real bounded Nyz
location in a later versioned task.

## Current boundary

- A won left-passage party attack gives every participant the same
  deterministic 13–23-minute discovery window.
- The visible `🪜 Ярус II` button opens a non-mutating construction notice.
- No presence transition, encounter generation, reward, quest, achievement,
  search node or production route exists for the second tier.

## Future contract questions

- Define the canonical location/presence IDs and the route back to Ярус I.
- Decide whether discovery windows gate entry, encounters or only flavor.
- Author the first monster/reward band without reusing the left-passage rest
  cooldown as hidden progression.
- Add a dedicated local QA helper, quest-overview/lore review, achievements
  decision and rollout flag before exposing any write path.
- Cover direct callbacks, stale cards, restart, remort and unavailable-state
  behavior without changing migration `20260724233000_left_passage_party_attack`.

## Non-goals

- Do not implement Ярус II inside `0.4.2`.
- Do not assign this backlog to a numbered `0.4.x` slot or displace the verified
  roadmap.
- Do not promise a date, reward table or production availability.

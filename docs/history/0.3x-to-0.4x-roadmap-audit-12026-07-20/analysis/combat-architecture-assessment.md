# Combat / party architecture assessment

## Поточні reusable частини

- `PartySession` recruitment, membership, version CAS і leases;
- actor combat action primitive, ability availability/cooldowns і stable RNG;
- `CombatEnemyState` та enemy runtime/status helpers;
- PartyBoss unique actor/turn action і optimistic turn transition;
- turn-duel strict repair та canonical participant card pattern;
- simulator/effective-stat snapshot foundations.

## Чого не можна reuse wholesale

- Solo `CombatState`: один `hero`, legacy singular `monster`, hard cap two enemies
  і threat logic «primary + backup».
- Turn duel: exactly challenger/target.
- PartyBoss: singular `boss`, Big Barrel AI/taunt/ward/protocol/music,
  partySessionId unique і self-only support gaps.

Це три orchestration layers навколо actor-action atom, а не готовий N×M engine.

## Критичні 0.3 lifecycle gaps

### Restart

Combat lock middleware whitelist-ить restart/remort і окремо redirect-ить лише
turn duel. `RestartService` видаляє Character без lease check. FK cascades можуть:

- для leader видалити PartySession/PartyBoss, лишивши чужі string-reference
  ActiveCombatLease orphan;
- для nonleader видалити relational participant/action, але лишити actor у frozen
  PartyBoss JSON, тобто ghost roster.

Потрібен DB-side busy gate й leader/nonleader/delete-vs-resolve integration tests.

### Remort

Поточний remort одного participant скасовує весь PartyBoss, відпускає всіх,
відкочує survivor raid-time HP/mana, але consumed items можуть лишитися consumed.
Також cancellation release передає Sated, але не Bard Inspiration, на відміну від
normal terminal release.

Найменша безпечна політика: block remort під active multi-actor combat.

### Parser/repair

PartyBoss state фактично cast/clone без strict validation; unknown status може
стати active. Один malformed due row може кинути до обробки здорових рядків і
лишити leases stuck. Потрібен versioned parser, CAS invalidation без rewards,
status release/orphan scan і row isolation.

### Ability parity

Combat vocabulary має ally scopes, але PartyBoss після actor action застосовує
окремо лише gear support. Частина class/race heal/guard/counter дій може витратити
хід без intended group effect. До production Big Barrel це треба виправити з
matrix+simulation або приховати/відкласти через flag decision.

## Target model

Окремі:

- `GroupCombatSession`;
- `GroupCombatParticipant` із frozen snapshot, canonical card, contribution і
  settlement state;
- `GroupCombatAction` з explicit target;
- optional `GroupCombatRound` лише якщо потрібен full journal.

Enemy state може лишатися strict JSON у bounded 3×3. Per-participant settlement
має бути retryable й independent; terminal combat transaction фіксує plan, а не
нескінченну guild-raid мутацію.

## Performance gates

- current-turn actions only, не весь history на кожен submit;
- lean due-id scan;
- bounded recap/state/card;
- canonical card edit/convergence, не new message per participant per round;
- 3×3 × 13–25 turn query/size fixture;
- не масштабувати current PartyBoss monolithic terminal transaction на guild raid.

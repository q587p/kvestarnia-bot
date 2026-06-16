# Phase 2 — Trading and Gifting

Trading/gifting should arrive after duel invites prove that Квестарня can handle opt-in social state safely. The first slice should be modest: give one eligible item unit or complete a simple item-for-item exchange.

## MVP order

1. **Gift one item unit.** Sender chooses an eligible манатка, target accepts, item moves once.
2. **Item-for-item trade.** Both players lock one offer, both confirm, transaction swaps safely.
3. **Gold add-on.** Only after item movement and audit rows are proven.
4. **Market.** Later, not Phase 2 first slice.

## Eligibility

Do not allow:

- equipped items;
- priceless/story/protected items;
- apology keepsakes;
- items involved in another pending transfer;
- items whose stack changed after preview without a new confirmation.

## Data sketch

```text
item_transfers
- id
- sender_character_id
- receiver_character_id
- status: pending | accepted | declined | expired | completed | cancelled
- offered_item_id
- offered_quantity
- requested_item_id nullable
- requested_quantity nullable
- audit_payload_json nullable
- expires_at
- completed_at nullable
- created_at
- updated_at
```

## UX rules

- Sender sees exact item, quantity, target and warning.
- Receiver sees exact item and accepts explicitly.
- Confirmation copy says this is not selling and not a gold faucet.
- Repeated callbacks replay completed/expired state.

## Acceptance criteria

- Sender cannot transfer an item they no longer own.
- Equipped/protected/priceless items are rejected.
- Accept/confirm is transactional and idempotent.
- Audit payload can explain what moved.
- Tests cover stale preview, repeated confirm, declined/expired transfer and concurrent transfer attempts.


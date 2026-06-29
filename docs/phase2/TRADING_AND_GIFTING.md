# Phase 2 — Trading and Gifting

Trading/gifting should arrive after duel invites prove that Квестарня can handle opt-in social state safely. The first slice should be modest: give one eligible item unit or complete a simple item-for-item exchange.

## MVP order

1. **Gift one item unit.** Sender chooses an eligible манатка, target accepts, item moves once.
2. **Postal manatka delivery.** Sender can offer a small bounded package of eligible манатки to a known recipient without same-location presence, paying an extra delivery fee and preserving recipient opt-in.
3. **Item-for-item trade.** Both players lock one offer, both confirm, transaction swaps safely.
4. **Gold add-on.** Only after item movement and audit rows are proven.
5. **Market.** Later, not Phase 2 first slice.

## Eligibility

Do not allow:

- equipped items;
- priceless/story/protected items;
- apology keepsakes;
- items involved in another pending transfer;
- items involved in a future live mail/delivery reservation;
- items whose stack changed after preview without a new confirmation.
- postal packages above 5 distinct `itemId` types or above 93 units for any selected type.

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
- transfer_kind: gift | postal
- package_json nullable for explicit postal package lines
- delivery_fee_gold default 0
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
- Postal delivery must be framed as paid delivery, not a way to reveal where a player currently is.
- Shipped postal delivery uses explicit durable social history for known recipients: completed transfers, accepted/active/resolved duels, or Bard reactions with applause/tips. Passive audience snapshots, public search and exact-location discovery do not count.

## Acceptance criteria

- Sender cannot transfer an item they no longer own.
- Equipped/protected/priceless items are rejected.
- Accept/confirm is transactional and idempotent.
- Audit payload can explain what moved.
- Tests cover stale preview, repeated confirm, declined/expired transfer and concurrent transfer attempts.
- Postal delivery keeps replay guarantees by moving confirmed package quantities into postal custody, returning them on decline/cancel/expiry, adding a tested delivery-fee rule, and not disclosing recipient location or online status.


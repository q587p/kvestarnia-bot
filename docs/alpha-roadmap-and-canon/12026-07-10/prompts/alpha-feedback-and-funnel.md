# Codex prompt — alpha feedback and funnel foundation

Scout first. Read `AGENTS.md`, product/privacy/architecture docs, relevant project skills, persistence patterns, admin authorization, and existing analytics/performance code. Do not edit during the scout phase.

Propose the smallest two slices: a voluntary private feedback inbox and an aggregate first-week funnel. Define purpose, data fields, retention/deletion, authorization, idempotency, rate limits, low-cardinality privacy rules, migrations, tests, and operator reporting. Do not add rewards, public feeds, message-body logging, raw identifiers in logs, or an external analytics vendor.

Wait for scope approval before implementation. When approved, implement one slice only, add focused tests, update the canonical privacy/current-state docs, and run `npm run check`. Report exact evidence and unresolved operator decisions. Do not commit, push, deploy, or export user data unless explicitly asked.

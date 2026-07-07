# Isolated local bot database preparation

The isolated local bot runtime uses a disposable SQLite database under the runtime snapshot directory.
It is intentionally separate from the main repository database and from CI migration checks.

Default behavior:

```text
KVESTARNIA_LOCAL_BOT_DB_PREPARE=push
```

This runs:

```text
npm run db:generate
npx prisma db push --skip-generate
```

Why: local Telegram testing should not be blocked by migration-history problems while Codex edits the main repository. The bot only needs a database shape that matches the current `prisma/schema.prisma` snapshot.

If `db push` detects incompatible drift, the runtime manager asks whether it may back up and recreate only the isolated runtime database. It never deletes the source repository database.

Optional migration-check mode:

```cmd
set KVESTARNIA_LOCAL_BOT_DB_PREPARE=migrate
run-local-bot.cmd
```

In this mode the runtime first tries the repository migration command. If migrations fail, it falls back to `prisma db push` because this database is disposable and local-bot-only.

Use CI or the main Codex workflow to validate migrations. Do not use the isolated local bot launcher as the source of truth for migration correctness.

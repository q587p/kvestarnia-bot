const { spawnSync } = require("node:child_process");

const prismaCli = require.resolve("prisma/build/index.js");
const TARGET_MIGRATION = "20260615140000_add_character_resource_regen_timestamps";

function determineRepairMode(input) {
  if (!input.failedMigration) {
    return null;
  }

  const hasHp = input.columns.has("hp_regen_at");
  const hasMana = input.columns.has("mana_regen_at");

  if (hasHp && hasMana) {
    return {
      type: "mark-applied"
    };
  }

  if (hasHp || hasMana) {
    return {
      type: "complete-partial",
      missingColumns: [
        ...(hasHp ? [] : ["hp_regen_at"]),
        ...(hasMana ? [] : ["mana_regen_at"])
      ]
    };
  }

  return {
    type: "retry-migration"
  };
}

async function inspectRepairMode(prisma) {
  const failedMigrationRows = await prisma.$queryRawUnsafe(
    `SELECT finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
     FROM "_prisma_migrations"
     WHERE migration_name = '${TARGET_MIGRATION}'
     LIMIT 1`
  );
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("characters")`);
  const migration = Array.isArray(failedMigrationRows) ? failedMigrationRows[0] : null;
  const columnNames = new Set(
    Array.isArray(columns) ? columns.map((column) => String(column.name)) : []
  );

  return determineRepairMode({
    failedMigration:
      Boolean(migration) && !migration.finishedAt && !migration.rolledBackAt,
    columns: columnNames
  });
}

function createPrismaClient() {
  const { PrismaClient } = require("@prisma/client");

  return new PrismaClient();
}

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: "inherit",
    env: process.env
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function runPrismaWithInput(args, input) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
    input
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

async function main() {
  let repairMode = null;
  let prisma = null;

  try {
    prisma = createPrismaClient();
    repairMode = await inspectRepairMode(prisma);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("no such table: _prisma_migrations")) {
      console.warn(
        "[db:deploy] Migration repair preflight skipped, continuing with prisma migrate deploy.",
        message
      );
    }
  } finally {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }
  }

  if (repairMode) {
    if (repairMode.type === "mark-applied") {
      console.log(
        `[db:deploy] Found failed migration ${TARGET_MIGRATION}; marking it applied before deploy.`
      );
      const resolveStatus = runPrisma([
        "migrate",
        "resolve",
        "--applied",
        TARGET_MIGRATION
      ]);

      if (resolveStatus !== 0) {
        process.exit(resolveStatus);
        return;
      }
    } else if (repairMode.type === "complete-partial") {
      console.log(
        `[db:deploy] Found partially applied migration ${TARGET_MIGRATION}; adding missing columns before deploy.`
      );
      const statements = repairMode.missingColumns
        .map(
          (column) =>
            `ALTER TABLE "characters" ADD COLUMN "${column}" DATETIME;`
        )
        .join("\n");
      const executeStatus = runPrismaWithInput(
        ["db", "execute", "--schema", "prisma/schema.prisma", "--stdin"],
        statements
      );

      if (executeStatus !== 0) {
        process.exit(executeStatus);
        return;
      }

      const resolveStatus = runPrisma([
        "migrate",
        "resolve",
        "--applied",
        TARGET_MIGRATION
      ]);

      if (resolveStatus !== 0) {
        process.exit(resolveStatus);
        return;
      }
    } else {
      console.log(
        `[db:deploy] Found failed migration ${TARGET_MIGRATION}; resetting it to rolled-back before deploy.`
      );
      const resolveStatus = runPrisma([
        "migrate",
        "resolve",
        "--rolled-back",
        TARGET_MIGRATION
      ]);

      if (resolveStatus !== 0) {
        process.exit(resolveStatus);
        return;
      }
    }
  }

  const deployStatus = runPrisma(["migrate", "deploy"]);
  process.exit(deployStatus);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  determineRepairMode
};

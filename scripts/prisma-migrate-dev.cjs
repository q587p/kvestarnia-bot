const { spawnSync } = require("node:child_process");

const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "migrate", "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    RUST_LOG: process.env.RUST_LOG || "info"
  }
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);

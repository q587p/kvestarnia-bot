/** @type {import("vitest/config").UserConfig} */
module.exports = {
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    fileParallelism: true,
    minWorkers: 1,
    maxWorkers: 2,
    testTimeout: 10000
  }
};

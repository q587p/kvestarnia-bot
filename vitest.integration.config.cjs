/** @type {import("vitest/config").UserConfig} */
module.exports = {
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 10000
  }
};

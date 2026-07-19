#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const MANAGER_VERSION = 1;
const ACTIONS = new Set(["run", "refresh", "stop", "status", "path"]);
const EXCLUDED_TOP_LEVEL_ENTRIES = new Set([
  ".git",
  ".agents",
  ".codex",
  ".github",
  ".idea",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "skills",
  "tests",
]);
const PRISMA_RUNTIME_FILES = new Set([
  "dev.db",
  "dev.db-journal",
  "dev.db-wal",
  "dev.db-shm",
]);

function log(message = "") {
  process.stdout.write(`[local-bot] ${message}\n`);
}

function warn(message) {
  process.stderr.write(`[local-bot] WARNING: ${message}\n`);
}

function fail(message) {
  const error = new Error(message);
  error.isExpected = true;
  throw error;
}

function parseArguments(argv) {
  const result = { action: argv[0] || "run", options: {} };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      result.options[key] = true;
      continue;
    }

    result.options[key] = value;
    index += 1;
  }

  return result;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeRelative(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function managedPathIdentity(candidatePath, platform = process.platform) {
  const normalized = path.normalize(candidatePath);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathsReferToSameLocation(leftPath, rightPath, platform = process.platform) {
  return managedPathIdentity(leftPath, platform) === managedPathIdentity(rightPath, platform);
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function removeFileIfPresent(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (error) {
    warn(`Could not remove ${filePath}: ${error.message}`);
  }
}

function getRuntimeRoot(sourceRoot) {
  if (process.env.KVESTARNIA_LOCAL_RUNTIME) {
    return path.resolve(process.env.KVESTARNIA_LOCAL_RUNTIME);
  }

  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share");
  const repositoryName = path.basename(sourceRoot).replace(/[^a-zA-Z0-9._-]/g, "-");
  const repositoryId = sha256(sourceRoot.toLowerCase()).slice(0, 12);
  return path.join(base, "Kvestarnia", "local-bot", `${repositoryName}-${repositoryId}`);
}

function getPaths(sourceRoot) {
  const runtimeRoot = getRuntimeRoot(sourceRoot);
  return {
    sourceRoot,
    runtimeRoot,
    metadataPath: path.join(runtimeRoot, ".kvestarnia-runtime.json"),
    manifestPath: path.join(runtimeRoot, ".kvestarnia-source-manifest.json"),
    dependencyHashPath: path.join(runtimeRoot, ".kvestarnia-dependencies.sha256"),
  };
}

function assertRepository(paths) {
  const packagePath = path.join(paths.sourceRoot, "package.json");
  if (!fs.existsSync(packagePath)) {
    fail(`package.json was not found in ${paths.sourceRoot}`);
  }

  const packageJson = readJson(packagePath);
  if (!packageJson || packageJson.name !== "kvestarnia-bot") {
    fail(`Expected the kvestarnia-bot repository at ${paths.sourceRoot}`);
  }

  if (paths.runtimeRoot === paths.sourceRoot || isInside(paths.sourceRoot, paths.runtimeRoot)) {
    fail(
      `The isolated runtime must live outside the repository. ` +
        `Unset KVESTARNIA_LOCAL_RUNTIME or point it outside ${paths.sourceRoot}`,
    );
  }
}

function shouldSkipSourceEntry(relativePath, entry) {
  const normalized = normalizeRelative(relativePath);
  const parts = normalized.split("/");

  if (EXCLUDED_TOP_LEVEL_ENTRIES.has(parts[0])) {
    return true;
  }

  if (parts[0] === ".env" || (parts[0].startsWith(".env.") && parts[0] !== ".env.example")) {
    return true;
  }

  if (parts[0].startsWith(".kvestarnia-")) {
    return true;
  }

  if (parts.includes("node_modules") || parts.includes("dist") || parts.includes("coverage")) {
    return true;
  }

  if (parts.includes("backups")) {
    return true;
  }

  if (parts[0] === "prisma" && PRISMA_RUNTIME_FILES.has(parts[parts.length - 1])) {
    return true;
  }

  if (entry && entry.isFile()) {
    const fileName = parts[parts.length - 1];
    if (fileName.endsWith(".log") || fileName.endsWith(".tmp")) {
      return true;
    }
  }

  return false;
}

function walkDirectory(sourceRoot, relativeDirectory, output) {
  const absoluteDirectory = path.join(sourceRoot, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) {
    return;
  }

  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (shouldSkipSourceEntry(relativePath, entry)) {
      continue;
    }

    if (entry.isDirectory()) {
      walkDirectory(sourceRoot, relativePath, output);
      continue;
    }

    if (entry.isFile()) {
      output.push(normalizeRelative(relativePath));
      continue;
    }

    warn(`Skipping unsupported source entry: ${relativePath}`);
  }
}

function ensureSourceEnvironment(paths) {
  const sourceEnvPath = path.join(paths.sourceRoot, ".env");
  const examplePath = path.join(paths.sourceRoot, ".env.example");

  if (!fs.existsSync(sourceEnvPath)) {
    if (!fs.existsSync(examplePath)) {
      fail("Neither .env nor .env.example exists in the repository root.");
    }

    fs.copyFileSync(examplePath, sourceEnvPath);
    log("Created .env from .env.example in the source repository.");
    warn("Set BOT_TOKEN in .env before expecting Telegram responses.");
  }

  return sourceEnvPath;
}

function createRuntimeEnvironment(sourceEnvPath) {
  const sourceText = fs.readFileSync(sourceEnvPath, "utf8");
  const databaseMatch = sourceText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/im);

  if (!databaseMatch) {
    fail("DATABASE_URL is missing from .env.");
  }

  const rawValue = databaseMatch[1].replace(/^['"]|['"]$/g, "").trim();
  if (!/^file:/i.test(rawValue) || !/dev\.db(?:[?]|$)/i.test(rawValue)) {
    fail(
      "The local launcher only accepts a SQLite dev.db DATABASE_URL. " +
        "Use something like DATABASE_URL=\"file:./dev.db\".",
    );
  }

  const runtimeLine = 'DATABASE_URL="file:./dev.db"';
  return sourceText.replace(/^\s*DATABASE_URL\s*=\s*.+?\s*$/im, runtimeLine);
}

function collectSourceSnapshot(paths, options = {}) {
  const files = [];
  walkDirectory(paths.sourceRoot, "", files);

  const sourceEnvPath = path.join(paths.sourceRoot, ".env");
  if (!fs.existsSync(sourceEnvPath) && options.createEnvironment === false) {
    fail(".env does not exist yet. Start run-local-bot.cmd once to create it from .env.example.");
  }
  const ensuredEnvPath = ensureSourceEnvironment(paths);
  const runtimeEnvironment = createRuntimeEnvironment(ensuredEnvPath);

  const uniqueFiles = [...new Set(files)].sort();
  const manifestFiles = {};

  for (const relativePath of uniqueFiles) {
    const absolutePath = path.join(paths.sourceRoot, relativePath);
    manifestFiles[relativePath] = {
      sha256: sha256File(absolutePath),
      size: fs.statSync(absolutePath).size,
    };
  }

  manifestFiles[".env"] = {
    sha256: sha256(runtimeEnvironment),
    size: Buffer.byteLength(runtimeEnvironment),
  };

  const snapshotHash = sha256(
    Object.entries(manifestFiles)
      .map(([relativePath, details]) => `${relativePath}:${details.sha256}`)
      .join("\n"),
  );

  return { files: uniqueFiles, manifestFiles, runtimeEnvironment, snapshotHash };
}

function pruneEmptyParents(startPath, stopPath) {
  let current = path.dirname(startPath);
  while (current !== stopPath && isInside(stopPath, current)) {
    try {
      if (fs.readdirSync(current).length > 0) {
        return;
      }
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

function syncSnapshot(paths, snapshot) {
  ensureDirectory(paths.runtimeRoot);
  const previousManifest = readJson(paths.manifestPath) || { files: {} };
  const previousFiles = previousManifest.files || {};
  let copied = 0;
  let removed = 0;

  for (const relativePath of snapshot.files) {
    const sourcePath = path.join(paths.sourceRoot, relativePath);
    const destinationPath = path.join(paths.runtimeRoot, relativePath);
    const previous = previousFiles[relativePath];
    const current = snapshot.manifestFiles[relativePath];

    if (!previous || previous.sha256 !== current.sha256 || !fs.existsSync(destinationPath)) {
      ensureDirectory(path.dirname(destinationPath));
      fs.copyFileSync(sourcePath, destinationPath);
      copied += 1;
    }
  }

  const runtimeEnvPath = path.join(paths.runtimeRoot, ".env");
  if (
    !previousFiles[".env"] ||
    previousFiles[".env"].sha256 !== snapshot.manifestFiles[".env"].sha256 ||
    !fs.existsSync(runtimeEnvPath)
  ) {
    fs.writeFileSync(runtimeEnvPath, snapshot.runtimeEnvironment, "utf8");
    copied += 1;
  }

  for (const relativePath of Object.keys(previousFiles)) {
    if (Object.prototype.hasOwnProperty.call(snapshot.manifestFiles, relativePath)) {
      continue;
    }

    const destinationPath = path.resolve(paths.runtimeRoot, relativePath);
    if (!isInside(paths.runtimeRoot, destinationPath)) {
      warn(`Refusing to remove an unsafe manifest path: ${relativePath}`);
      continue;
    }

    if (fs.existsSync(destinationPath) && fs.statSync(destinationPath).isFile()) {
      fs.rmSync(destinationPath, { force: true });
      pruneEmptyParents(destinationPath, paths.runtimeRoot);
      removed += 1;
    }
  }

  writeJsonAtomic(paths.manifestPath, {
    version: MANAGER_VERSION,
    sourceRoot: paths.sourceRoot,
    snapshotHash: snapshot.snapshotHash,
    syncedAt: new Date().toISOString(),
    files: snapshot.manifestFiles,
  });

  log(`Snapshot synchronized: ${copied} copied, ${removed} removed.`);
}

function commandFor(executable, args) {
  if (process.platform !== "win32") {
    return { executable, args };
  }

  const comspec = process.env.ComSpec || "cmd.exe";
  const escaped = [executable, ...args].map((value) => {
    const text = String(value).replace(/"/g, '""');
    return /[\s&|<>^()]/.test(text) ? `"${text}"` : text;
  });

  return {
    executable: comspec,
    args: ["/d", "/s", "/c", escaped.join(" ")],
  };
}

function runCommand(executable, args, cwd, options = {}) {
  const command = commandFor(executable, args);
  const result = spawnSync(command.executable, command.args, {
    cwd,
    env: { ...process.env, ...(options.env || {}) },
    stdio: "inherit",
    windowsHide: false,
  });

  if (result.error) {
    fail(`Could not start ${executable}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    return false;
  }

  return true;
}

function getDependencyHash(paths) {
  const pieces = [];
  for (const fileName of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
    const filePath = path.join(paths.runtimeRoot, fileName);
    if (fs.existsSync(filePath)) {
      pieces.push(`${fileName}:${sha256File(filePath)}`);
    }
  }
  return sha256(pieces.join("\n"));
}

function prepareDependencies(paths) {
  const nodeModulesPath = path.join(paths.runtimeRoot, "node_modules");
  const currentHash = getDependencyHash(paths);
  const storedHash = fs.existsSync(paths.dependencyHashPath)
    ? fs.readFileSync(paths.dependencyHashPath, "utf8").trim()
    : "";

  if (fs.existsSync(nodeModulesPath) && storedHash === currentHash) {
    log("Runtime dependencies are current.");
    return;
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const hasLockFile =
    fs.existsSync(path.join(paths.runtimeRoot, "package-lock.json")) ||
    fs.existsSync(path.join(paths.runtimeRoot, "npm-shrinkwrap.json"));
  const installArguments = hasLockFile
    ? ["ci", "--no-audit", "--no-fund"]
    : ["install", "--no-audit", "--no-fund"];

  log(`Installing isolated runtime dependencies with npm ${installArguments[0]}...`);
  if (!runCommand(npm, installArguments, paths.runtimeRoot)) {
    fail("Installing isolated runtime dependencies failed.");
  }

  fs.writeFileSync(paths.dependencyHashPath, `${currentHash}\n`, "utf8");
}

function promptYesNo(question) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const interfaceInstance = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    interfaceInstance.question(`${question} [y/N] `, (answer) => {
      interfaceInstance.close();
      resolve(/^y(?:es)?$/i.test(answer.trim()));
    });
  });
}

function backupRuntimeDatabase(paths) {
  const databasePath = path.join(paths.runtimeRoot, "prisma", "dev.db");
  if (!fs.existsSync(databasePath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const backupDirectory = path.join(paths.runtimeRoot, "prisma", "backups");
  const backupPath = path.join(backupDirectory, `dev-${timestamp}.db`);
  ensureDirectory(backupDirectory);
  fs.copyFileSync(databasePath, backupPath);
  return backupPath;
}

function removeRuntimeDatabaseFiles(paths) {
  const prismaDirectory = path.join(paths.runtimeRoot, "prisma");
  for (const fileName of PRISMA_RUNTIME_FILES) {
    removeFileIfPresent(path.join(prismaDirectory, fileName));
  }
}

function prepareRuntimeDatabaseWithPush(paths, options = {}) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["prisma", "db", "push", "--skip-generate"];

  if (options.acceptDataLoss) {
    args.push("--accept-data-loss");
  }

  log("Synchronizing the isolated runtime database from prisma/schema.prisma...");
  log("This uses prisma db push for the disposable local-bot database only.");
  return runCommand(npx, args, paths.runtimeRoot);
}

async function preparePrisma(paths) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const prepareMode = (process.env.KVESTARNIA_LOCAL_BOT_DB_PREPARE || "push").toLowerCase();

  log("Generating Prisma Client inside the isolated runtime...");
  if (!runCommand(npm, ["run", "db:generate"], paths.runtimeRoot)) {
    fail("Prisma Client generation failed inside the isolated runtime.");
  }

  if (prepareMode === "migrate") {
    log("Applying migrations to the isolated runtime database...");
    if (runCommand(npm, ["run", "db:migrate"], paths.runtimeRoot)) {
      return;
    }

    warn("Migration failed. Falling back to schema push for the disposable isolated runtime database.");
  } else if (prepareMode !== "push") {
    warn(
      `Unknown KVESTARNIA_LOCAL_BOT_DB_PREPARE=${prepareMode}; ` +
        "using prisma db push for the isolated runtime database.",
    );
  }

  if (prepareRuntimeDatabaseWithPush(paths)) {
    return;
  }

  warn("Prisma db push failed. The isolated SQLite database may have incompatible local drift.");
  const shouldReset = await promptYesNo(
    "Back up and recreate only the ISOLATED runtime prisma/dev.db from prisma/schema.prisma?",
  );

  if (!shouldReset) {
    fail("Runtime database recreation was declined.");
  }

  const backupPath = backupRuntimeDatabase(paths);
  if (backupPath) {
    log(`Runtime database backup saved to ${backupPath}`);
  }

  removeRuntimeDatabaseFiles(paths);

  if (!prepareRuntimeDatabaseWithPush(paths, { acceptDataLoss: true })) {
    fail("Recreating the isolated runtime database from prisma/schema.prisma failed.");
  }
}


function sleepSync(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function isProcessAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return false;
  }

  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function verifyManagedHost(processId, sourceRoot) {
  if (!isProcessAlive(processId)) {
    return false;
  }

  if (process.platform !== "win32") {
    return true;
  }

  const safeSourceRoot = sourceRoot.replace(/'/g, "''");
  const scriptName = "local-bot-runtime.cjs";
  const script = [
    `$p = Get-CimInstance Win32_Process -Filter \"ProcessId = ${processId}\" -ErrorAction SilentlyContinue`,
    "if ($null -eq $p) { exit 1 }",
    "$c = [string]$p.CommandLine",
    `$hasScript = $c.IndexOf('${scriptName}', [System.StringComparison]::OrdinalIgnoreCase) -ge 0`,
    `$hasRoot = $c.IndexOf('${safeSourceRoot}', [System.StringComparison]::OrdinalIgnoreCase) -ge 0`,
    "if ($hasScript -and $hasRoot) { exit 0 }",
    "exit 2",
  ].join("; ");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { stdio: "ignore", windowsHide: true },
  );

  return result.status === 0;
}

function readMetadata(paths) {
  const metadata = readJson(paths.metadataPath);
  if (
    !metadata ||
    typeof metadata.sourceRoot !== "string" ||
    !pathsReferToSameLocation(metadata.sourceRoot, paths.sourceRoot)
  ) {
    return null;
  }
  return metadata;
}

function clearOwnMetadata(paths) {
  const metadata = readMetadata(paths);
  if (!metadata || metadata.hostPid === process.pid) {
    removeFileIfPresent(paths.metadataPath);
  }
}

function getActiveMetadata(paths) {
  const metadata = readMetadata(paths);
  if (!metadata) {
    return null;
  }

  if (!isProcessAlive(Number(metadata.hostPid))) {
    removeFileIfPresent(paths.metadataPath);
    return null;
  }

  if (!verifyManagedHost(Number(metadata.hostPid), paths.sourceRoot)) {
    warn("Found stale runtime metadata whose PID now belongs to another process; ignoring it.");
    removeFileIfPresent(paths.metadataPath);
    return null;
  }

  return metadata;
}

function killProcessTree(processId) {
  if (!isProcessAlive(processId)) {
    return true;
  }

  if (process.platform === "win32") {
    const result = spawnSync(
      "taskkill.exe",
      ["/PID", String(processId), "/T", "/F"],
      { stdio: "inherit", windowsHide: true },
    );
    return result.status === 0 || !isProcessAlive(processId);
  }

  try {
    process.kill(-processId, "SIGTERM");
    return true;
  } catch {
    try {
      process.kill(processId, "SIGTERM");
      return true;
    } catch {
      return !isProcessAlive(processId);
    }
  }
}

function stopRuntime(paths) {
  const metadata = getActiveMetadata(paths);
  if (!metadata) {
    log("The isolated local bot is not running.");
    return true;
  }

  const hostPid = Number(metadata.hostPid);
  const botPid = Number(metadata.botPid);
  let stopped = false;

  if (Number.isInteger(botPid) && botPid > 0 && isProcessAlive(botPid)) {
    writeJsonAtomic(paths.metadataPath, {
      ...metadata,
      state: "stopping",
      stopRequestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    log(`Stopping isolated local bot PID ${botPid}...`);
    stopped = killProcessTree(botPid);

    if (stopped) {
      for (let attempt = 0; attempt < 30 && isProcessAlive(hostPid); attempt += 1) {
        sleepSync(100);
      }
    }
  }

  if (!stopped || isProcessAlive(hostPid)) {
    log(`Stopping isolated local bot host PID ${hostPid}...`);
    stopped = killProcessTree(hostPid);
  }

  if (!stopped) {
    warn(`Could not stop managed local bot host PID ${hostPid}.`);
    return false;
  }

  const currentMetadata = readMetadata(paths);
  if (!currentMetadata || Number(currentMetadata.hostPid) === hostPid) {
    removeFileIfPresent(paths.metadataPath);
  }
  log("The isolated local bot was stopped.");
  return true;
}

function getGitDescription(sourceRoot) {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  const commit = result.status === 0 ? result.stdout.trim() : null;

  const statusResult = spawnSync("git", ["status", "--porcelain"], {
    cwd: sourceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  const dirty = statusResult.status === 0 ? statusResult.stdout.trim().length > 0 : null;

  if (!commit) {
    return null;
  }
  return `${commit}${dirty ? " + uncommitted changes" : ""}`;
}

function readPackageVersion(rootPath) {
  const packageJson = readJson(path.join(rootPath, "package.json"));
  return packageJson && typeof packageJson.version === "string" ? packageJson.version : "unknown";
}

function writeHostMetadata(paths, values) {
  writeJsonAtomic(paths.metadataPath, {
    managerVersion: MANAGER_VERSION,
    sourceRoot: paths.sourceRoot,
    runtimeRoot: paths.runtimeRoot,
    hostPid: process.pid,
    botPid: values.botPid || null,
    state: values.state,
    packageVersion: values.packageVersion,
    sourceRevision: values.sourceRevision,
    snapshotHash: values.snapshotHash,
    startedAt: values.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function runRuntime(paths) {
  const active = getActiveMetadata(paths);
  if (active) {
    fail(
      `The isolated local bot is already running as PID ${active.hostPid}. ` +
        "Use status-local-bot.cmd or refresh-local-bot.cmd.",
    );
  }

  ensureDirectory(paths.runtimeRoot);
  const sourceRevision = getGitDescription(paths.sourceRoot);
  const packageVersion = readPackageVersion(paths.sourceRoot);
  let child = null;
  let shuttingDown = false;

  const stopChild = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (child && child.pid) {
      killProcessTree(child.pid);
    }
    clearOwnMetadata(paths);
  };

  process.once("SIGINT", () => {
    stopChild();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopChild();
    process.exit(143);
  });
  process.once("exit", () => {
    if (!shuttingDown) {
      clearOwnMetadata(paths);
    }
  });

  try {
    writeHostMetadata(paths, {
      state: "preparing",
      packageVersion,
      sourceRevision,
      snapshotHash: null,
    });

    const snapshot = collectSourceSnapshot(paths);
    syncSnapshot(paths, snapshot);
    prepareDependencies(paths);
    await preparePrisma(paths);

    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const command = commandFor(npm, ["run", "dev"]);

    log("");
    log(`Source:  ${paths.sourceRoot}`);
    log(`Runtime: ${paths.runtimeRoot}`);
    log(`Version: ${packageVersion}`);
    if (sourceRevision) {
      log(`Revision: ${sourceRevision}`);
    }
    log("The bot now runs from an isolated snapshot.");
    log("Codex may edit/test the source repository without locking this Prisma Client.");
    log("Run refresh-local-bot.cmd only when you want to promote the latest source snapshot.");
    log("");

    child = spawn(command.executable, command.args, {
      cwd: paths.runtimeRoot,
      env: {
        ...process.env,
        KVESTARNIA_ISOLATED_RUNTIME: "1",
        KVESTARNIA_SOURCE_ROOT: paths.sourceRoot,
      },
      stdio: "inherit",
      windowsHide: false,
      detached: process.platform !== "win32",
    });

    writeHostMetadata(paths, {
      state: "running",
      botPid: child.pid,
      packageVersion,
      sourceRevision,
      snapshotHash: snapshot.snapshotHash,
    });

    const exitResult = await new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };

      child.once("error", (error) => settle({ code: 1, signal: null, error }));
      child.once("exit", (code, signal) => settle({ code, signal, error: null }));
    });

    const finalMetadata = readMetadata(paths);
    const requestedStop =
      finalMetadata &&
      Number(finalMetadata.hostPid) === process.pid &&
      finalMetadata.state === "stopping";

    shuttingDown = true;
    if (exitResult.error) {
      warn(`Could not start the bot: ${exitResult.error.message}`);
    }
    clearOwnMetadata(paths);

    if (requestedStop) {
      log("Bot stopped by the local runtime manager.");
      return 0;
    }

    if (exitResult.signal) {
      log(`Bot stopped by signal ${exitResult.signal}.`);
      return 1;
    }

    const exitCode = Number.isInteger(exitResult.code) ? exitResult.code : 1;
    log(`Bot stopped with exit code ${exitCode}.`);
    return exitCode;
  } catch (error) {
    shuttingDown = true;
    clearOwnMetadata(paths);
    throw error;
  }
}

function printStatus(paths) {
  const metadata = getActiveMetadata(paths);
  const manifest = readJson(paths.manifestPath);
  let currentSnapshot = null;

  try {
    currentSnapshot = collectSourceSnapshot(paths, { createEnvironment: false });
  } catch (error) {
    warn(`Could not compare the source snapshot: ${error.message}`);
  }

  log(`Source:  ${paths.sourceRoot}`);
  log(`Runtime: ${paths.runtimeRoot}`);

  if (!metadata) {
    log("Status: not running");
    if (manifest && currentSnapshot) {
      log(
        `Prepared snapshot: ${manifest.snapshotHash === currentSnapshot.snapshotHash ? "current" : "outdated"}`,
      );
    }
    return;
  }

  log(`Status: ${metadata.state || "running"}`);
  log(`Host PID: ${metadata.hostPid}`);
  if (metadata.botPid) {
    log(`Bot PID: ${metadata.botPid}`);
  }
  log(`Version: ${metadata.packageVersion || "unknown"}`);
  if (metadata.sourceRevision) {
    log(`Started from: ${metadata.sourceRevision}`);
  }
  if (currentSnapshot && metadata.snapshotHash) {
    log(`Source changes since start: ${metadata.snapshotHash === currentSnapshot.snapshotHash ? "no" : "yes"}`);
  }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (!ACTIONS.has(parsed.action)) {
    fail(`Unknown action: ${parsed.action}. Expected one of: ${[...ACTIONS].join(", ")}`);
  }

  const requestedSourceRoot = path.resolve(
    typeof parsed.options["source-root"] === "string"
      ? parsed.options["source-root"]
      : path.join(__dirname, ".."),
  );
  const sourceRoot = fs.realpathSync.native(requestedSourceRoot);
  const paths = getPaths(sourceRoot);
  assertRepository(paths);

  switch (parsed.action) {
    case "path":
      process.stdout.write(`${paths.runtimeRoot}\n`);
      return 0;
    case "status":
      printStatus(paths);
      return 0;
    case "stop":
      return stopRuntime(paths) ? 0 : 1;
    case "refresh":
      if (!stopRuntime(paths)) {
        return 1;
      }
      return runRuntime(paths);
    case "run":
      return runRuntime(paths);
    default:
      return 1;
  }
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
    })
    .catch((error) => {
      const prefix = error && error.isExpected ? "" : "Unexpected error: ";
      process.stderr.write(`[local-bot] ERROR: ${prefix}${error.message}\n`);
      if (!error.isExpected && error.stack) {
        process.stderr.write(`${error.stack}\n`);
      }
      process.exitCode = 1;
    });
}

module.exports = {
  managedPathIdentity,
  pathsReferToSameLocation,
};

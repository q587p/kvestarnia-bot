"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const toPosix = (value) => value.replaceAll("\\", "/");
const errors = [];

function gitFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "-z"],
    { cwd: root, encoding: "utf8" },
  );

  return output
    .split("\0")
    .filter(Boolean)
    .map(toPosix)
    .filter((relativePath) =>
      fs.existsSync(path.join(root, ...relativePath.split("/"))),
    );
}

const files = gitFiles();
const fileSet = new Set(files);
const pathSet = new Set(files);
const lowerPathMap = new Map();

for (const file of files) {
  const parts = file.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    pathSet.add(parts.slice(0, index).join("/"));
  }
}

for (const repoPath of pathSet) {
  const key = repoPath.toLowerCase();
  const matches = lowerPathMap.get(key) ?? [];
  matches.push(repoPath);
  lowerPathMap.set(key, matches);
}

function addError(message) {
  errors.push(message);
}

const topLevelAllowed = new Set([
  "docs/README.md",
  "docs/DOCUMENTATION_STRUCTURE.md",
]);

for (const file of files.filter((item) => /^docs\/[^/]+\.md$/i.test(item))) {
  if (!topLevelAllowed.has(file)) {
    addError(`top-level docs allowlist: ${file}`);
  }
}

const requiredReadmes = [
  "docs/ai/README.md",
  "docs/ai/prompts/README.md",
  "docs/ai/prompts/archive/README.md",
  "docs/architecture/README.md",
  "docs/backlog/README.md",
  "docs/balance/README.md",
  "docs/content/README.md",
  "docs/design/README.md",
  "docs/history/README.md",
  "docs/history/audits/README.md",
  "docs/history/backlog/README.md",
  "docs/history/early-raid/README.md",
  "docs/history/evidence/README.md",
  "docs/history/evidence/manual-qa/README.md",
  "docs/history/phase1/README.md",
  "docs/history/phase2/README.md",
  "docs/history/phases/README.md",
  "docs/operations/README.md",
  "docs/product/README.md",
  "docs/qa/README.md",
  "docs/references/README.md",
  "docs/tasks/README.md",
  "docs/tasks/archive/README.md",
];

for (const required of requiredReadmes) {
  if (!fileSet.has(required)) {
    addError(`required category index missing: ${required}`);
  }
}

const contextPath = path.join(root, "docs", "ai", "context.md");
const contextText = fs.readFileSync(contextPath, "utf8").replaceAll("\r\n", "\n");
const contextLines =
  contextText.length === 0
    ? 0
    : contextText.replace(/\n$/, "").split("\n").length;
if (contextLines >= 250) {
  addError(`docs/ai/context.md has ${contextLines} lines; maximum is 249`);
}

for (const file of files) {
  const lower = file.toLowerCase();
  if (path.posix.basename(lower) === "patch.diff") {
    addError(`generated patch payload is tracked: ${file}`);
  }
  if (
    lower.startsWith("docs/") &&
    ["/repo-files/", "/reference-docs/", "/reference-tasks/"].some((segment) =>
      `/${lower}`.includes(segment),
    )
  ) {
    addError(`copied documentation payload is tracked: ${file}`);
  }
}

const namingExceptions = new Set([
  "docs/DOCUMENTATION_STRUCTURE.md",
  "docs/ai/CODEX_PROMPT_POLICY.md",
  "docs/ai/CODEX_TOKEN_ECONOMY_APPLIED.md",
]);

for (const file of files.filter(
  (item) => item.startsWith("docs/") && item.endsWith(".md"),
)) {
  const base = path.posix.basename(file);
  if (base === "README.md" || namingExceptions.has(file)) {
    continue;
  }
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.md$/.test(base)) {
    addError(`document name is not lower-kebab-case: ${file}`);
  }
}

function cleanTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  target = target.split("#", 1)[0].split("?", 1)[0];
  try {
    target = decodeURIComponent(target);
  } catch {
    return rawTarget;
  }
  return target.replaceAll("\\", "/");
}

function checkTarget(source, lineNumber, rawTarget) {
  if (
    !rawTarget ||
    rawTarget.startsWith("#") ||
    rawTarget.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(rawTarget) ||
    rawTarget.startsWith("/")
  ) {
    return;
  }

  const target = cleanTarget(rawTarget);
  if (!target) {
    return;
  }

  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), target),
  ).replace(/\/+$/, "");

  if (resolved === ".." || resolved.startsWith("../")) {
    addError(`${source}:${lineNumber}: relative target escapes repository: ${rawTarget}`);
    return;
  }

  if (pathSet.has(resolved)) {
    return;
  }

  const caseMatches = lowerPathMap.get(resolved.toLowerCase());
  if (caseMatches?.length) {
    addError(
      `${source}:${lineNumber}: path case mismatch: ${rawTarget} -> ${caseMatches.join(", ")}`,
    );
    return;
  }

  addError(`${source}:${lineNumber}: missing relative target: ${rawTarget}`);
}

const markdownFiles = files.filter((item) => item.endsWith(".md"));
for (const file of markdownFiles) {
  const absolute = path.join(root, ...file.split("/"));
  const lines = fs.readFileSync(absolute, "utf8").split(/\r?\n/);
  let fenced = false;

  lines.forEach((line, index) => {
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) {
      return;
    }

    const withoutInlineCode = line.replace(/`[^`]*`/g, "");
    const inlineLink = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g;
    const referenceLink = /^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/g;

    for (const match of withoutInlineCode.matchAll(inlineLink)) {
      checkTarget(file, index + 1, match[1]);
    }
    for (const match of withoutInlineCode.matchAll(referenceLink)) {
      checkTarget(file, index + 1, match[1]);
    }
  });
}

const activeByHash = new Map();
for (const file of markdownFiles.filter(
  (item) =>
    item.startsWith("docs/") &&
    !item.includes("/history/") &&
    !item.includes("/archive/"),
)) {
  const absolute = path.join(root, ...file.split("/"));
  const normalized = fs
    .readFileSync(absolute, "utf8")
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .trim();

  if (!normalized) {
    continue;
  }

  const hash = crypto.createHash("sha256").update(normalized).digest("hex");
  const matches = activeByHash.get(hash) ?? [];
  matches.push(file);
  activeByHash.set(hash, matches);
}

for (const matches of activeByHash.values()) {
  if (matches.length > 1) {
    addError(`exact duplicate active docs: ${matches.join(", ")}`);
  }
}

if (errors.length > 0) {
  console.error(`Documentation checks failed (${errors.length}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Documentation checks passed: ${markdownFiles.length} Markdown files, ${contextLines} context lines.`,
);

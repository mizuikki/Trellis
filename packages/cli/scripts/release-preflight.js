#!/usr/bin/env node
/**
 * Local release preflight for the source-managed CLI/core pair.
 *
 * The fork does not publish packages. A release only requires the packages to
 * remain version-locked and, when invoked from CI or a release tag, for the
 * optional Git tag to name that same version.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CORE_PKG = path.join(REPO_ROOT, "packages/core/package.json");
const CLI_PKG = path.join(REPO_ROOT, "packages/cli/package.json");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readVersions() {
  const core = readJSON(CORE_PKG);
  const cli = readJSON(CLI_PKG);
  return {
    coreName: core.name,
    coreVersion: core.version,
    cliName: cli.name,
    cliVersion: cli.version,
  };
}

function tagVersionFromEnv() {
  const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || "";
  const match = ref.match(
    /(?:refs\/tags\/)?v(\d+\.\d+\.\d+(?:-[A-Za-z0-9.+-]+)?)$/,
  );
  return match ? match[1] : null;
}

function fail(message) {
  console.error(`${RED}x ${message}${RESET}`);
  process.exit(1);
}

export function checkVersions({ requireTag = false } = {}) {
  const versions = readVersions();
  if (versions.coreVersion !== versions.cliVersion) {
    fail(
      `Version mismatch:\n` +
        `  ${versions.coreName}: ${versions.coreVersion}\n` +
        `  ${versions.cliName}:  ${versions.cliVersion}\n` +
        "Both source packages must share the exact compatibility version.",
    );
  }

  const tagVersion = tagVersionFromEnv();
  if (requireTag && !tagVersion) {
    fail("Expected a Git tag like v1.0.0 via GITHUB_REF or GITHUB_REF_NAME.");
  }
  if (tagVersion && tagVersion !== versions.cliVersion) {
    fail(
      `Git tag version (${tagVersion}) does not match package version (${versions.cliVersion}).`,
    );
  }

  console.log(
    `${GREEN}ok${RESET} versions match: ${versions.coreName}@${versions.coreVersion} = ${versions.cliName}@${versions.cliVersion}` +
      (tagVersion ? ` = git tag v${tagVersion}` : ""),
  );
  return { ...versions, tagVersion };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log("release-preflight check-versions [--require-tag]");
    return;
  }
  if (command === "check-versions") {
    checkVersions({ requireTag: rest.includes("--require-tag") });
    return;
  }
  fail(`Unknown release preflight command: ${command}`);
}

main();

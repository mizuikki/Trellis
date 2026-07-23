import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { VERSION } from "../constants/version.js";
import { compareVersions } from "../utils/compare-versions.js";
import { getTrellisSourceRoot, update, type UpdateResult } from "./update.js";

const PREVIEW_FORMAT_VERSION = 1;
const PROTECTED_PATHS = [
  ".trellis/tasks",
  ".trellis/workspace",
  ".trellis/backlog",
  ".trellis/spec",
] as const;
const RUNTIME_MANIFEST_PREFIXES = [
  ".codex/sessions/",
  ".trellis/tasks/",
  ".trellis/workspace/",
  ".trellis/backlog/",
] as const;
const TRELLIS_BLOCK_START = "<!-- TRELLIS:START -->";
const TRELLIS_BLOCK_END = "<!-- TRELLIS:END -->";

export interface DogfoodUpdateOptions {
  migrate?: boolean;
  apply?: string;
  keepWorktree?: boolean;
}

export interface DogfoodPreviewManifest {
  formatVersion: number;
  sourceCommit: string;
  sourceTree: string;
  cliVersion: string;
  deployedVersion: string;
  targetVersion: string;
  patchPath: string;
  patchSha256: string;
  createdAt: string;
}

export interface DogfoodPreviewResult {
  status: "previewed" | "noop";
  manifestPath?: string;
  patchPath?: string;
}

export class DogfoodUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DogfoodUpdateError";
  }
}

interface SourceCheckout {
  root: string;
  commit: string;
  tree: string;
  deployedVersion: string;
}

type TreeSnapshot = Map<string, string>;

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DogfoodUpdateError(
      `Git command failed: git ${args.join(" ")}: ${message}`,
    );
  }
}

function gitValue(cwd: string, args: string[]): string {
  return runGit(cwd, args).trim();
}

function samePath(left: string, right: string): boolean {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return path.resolve(left) === path.resolve(right);
  }
}

function readDeploymentVersion(root: string): string {
  const versionPath = path.join(root, ".trellis", ".version");
  if (!fs.existsSync(versionPath)) {
    throw new DogfoodUpdateError(
      "Missing .trellis/.version in the source checkout.",
    );
  }
  return fs.readFileSync(versionPath, "utf-8").trim();
}

function assertSourceCheckout(cwd: string): SourceCheckout {
  const root = gitValue(cwd, ["rev-parse", "--show-toplevel"]);
  if (!samePath(cwd, root)) {
    throw new DogfoodUpdateError(
      "Run dogfood-update from the source checkout root.",
    );
  }
  if (!samePath(root, getTrellisSourceRoot())) {
    throw new DogfoodUpdateError(
      "dogfood-update must run from the source checkout that built this CLI.",
    );
  }

  const packageJsonPath = path.join(root, "packages", "cli", "package.json");
  const builtCliPath = path.join(
    root,
    "packages",
    "cli",
    "dist",
    "cli",
    "index.js",
  );
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(builtCliPath)) {
    throw new DogfoodUpdateError(
      "A built local CLI is required. Run 'pnpm build' before dogfood-update.",
    );
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
    version?: unknown;
  };
  if (packageJson.version !== VERSION) {
    throw new DogfoodUpdateError(
      `Built CLI version (${VERSION}) does not match packages/cli/package.json (${String(packageJson.version)}).`,
    );
  }

  if (
    gitValue(root, ["status", "--porcelain", "--untracked-files=all"]) !== ""
  ) {
    throw new DogfoodUpdateError("The source checkout must be clean.");
  }

  const deployedVersion = readDeploymentVersion(root);
  if (compareVersions(VERSION, deployedVersion) < 0) {
    throw new DogfoodUpdateError(
      `Source deployment (${deployedVersion}) is newer than the built CLI (${VERSION}).`,
    );
  }

  return {
    root,
    commit: gitValue(root, ["rev-parse", "HEAD"]),
    tree: gitValue(root, ["rev-parse", "HEAD^{tree}"]),
    deployedVersion,
  };
}

function hashFile(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function snapshotTree(root: string, relativePath: string): TreeSnapshot {
  const snapshot: TreeSnapshot = new Map();
  const start = path.join(root, ...relativePath.split("/"));

  const visit = (absolutePath: string, relative: string): void => {
    if (!fs.existsSync(absolutePath)) {
      snapshot.set(`${relative}:missing`, "missing");
      return;
    }
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      snapshot.set(relative, `link:${fs.readlinkSync(absolutePath)}`);
      return;
    }
    if (stat.isDirectory()) {
      snapshot.set(relative, "directory");
      for (const name of fs.readdirSync(absolutePath).sort()) {
        if (relative === "." && name === ".git") continue;
        visit(path.join(absolutePath, name), `${relative}/${name}`);
      }
      return;
    }
    if (stat.isFile()) {
      snapshot.set(relative, `file:${hashFile(absolutePath)}`);
      return;
    }
    snapshot.set(relative, `other:${stat.mode}`);
  };

  visit(start, relativePath);
  return snapshot;
}

function snapshotsEqual(left: TreeSnapshot, right: TreeSnapshot): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

function readOptionalFile(root: string, relativePath: string): string | null {
  const filePath = path.join(root, ...relativePath.split("/"));
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
}

function agentsManagedBlockOnlyChanged(
  before: string | null,
  after: string | null,
): boolean {
  if (before === after) return true;
  if (before === null || after === null) return false;
  const beforeStart = before.indexOf(TRELLIS_BLOCK_START);
  const beforeEnd = before.indexOf(TRELLIS_BLOCK_END, beforeStart);
  const afterStart = after.indexOf(TRELLIS_BLOCK_START);
  const afterEnd = after.indexOf(TRELLIS_BLOCK_END, afterStart);
  if (beforeStart < 0 || beforeEnd < 0 || afterStart < 0 || afterEnd < 0) {
    return false;
  }
  return (
    before.slice(0, beforeStart) === after.slice(0, afterStart) &&
    before.slice(beforeEnd + TRELLIS_BLOCK_END.length) ===
      after.slice(afterEnd + TRELLIS_BLOCK_END.length)
  );
}

function validateHashManifest(root: string): void {
  const manifestPath = path.join(root, ".trellis", ".template-hashes.json");
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
    __version?: unknown;
    hashes?: unknown;
  };
  if (
    parsed.__version !== 2 ||
    parsed.hashes === null ||
    typeof parsed.hashes !== "object" ||
    Array.isArray(parsed.hashes)
  ) {
    throw new DogfoodUpdateError(
      "Updated .template-hashes.json is not schema version 2.",
    );
  }
  for (const key of Object.keys(parsed.hashes)) {
    if (RUNTIME_MANIFEST_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      throw new DogfoodUpdateError(
        `Updated hash manifest tracks protected runtime data: ${key}`,
      );
    }
  }
}

async function withWorkingDirectory<T>(
  cwd: string,
  action: () => Promise<T>,
): Promise<T> {
  const original = process.cwd();
  process.chdir(cwd);
  try {
    return await action();
  } finally {
    process.chdir(original);
  }
}

function assertUpdateSucceeded(result: UpdateResult): void {
  if (result.status === "conflict") {
    const paths = result.conflicts?.flatMap((conflict) => conflict.paths) ?? [];
    throw new DogfoodUpdateError(
      `Self-hosted update requires manual resolution: ${paths.join(", ")}`,
    );
  }
  if (result.status === "cancelled") {
    throw new DogfoodUpdateError("Self-hosted update was cancelled.");
  }
}

function validateUpdatedTarget(
  target: string,
  protectedBefore: Map<string, TreeSnapshot>,
  agentsBefore: string | null,
): void {
  if (readDeploymentVersion(target) !== VERSION) {
    throw new DogfoodUpdateError(
      "Updated target did not receive the expected deployment version.",
    );
  }
  for (const protectedPath of PROTECTED_PATHS) {
    const before = protectedBefore.get(protectedPath);
    if (!before) continue;
    if (!snapshotsEqual(before, snapshotTree(target, protectedPath))) {
      throw new DogfoodUpdateError(
        `Protected path changed during update: ${protectedPath}`,
      );
    }
  }
  if (
    !agentsManagedBlockOnlyChanged(
      agentsBefore,
      readOptionalFile(target, "AGENTS.md"),
    )
  ) {
    throw new DogfoodUpdateError(
      "AGENTS.md changed outside the Trellis managed block.",
    );
  }
  validateHashManifest(target);
}

function writePreview(
  source: SourceCheckout,
  patch: string,
): DogfoodPreviewResult {
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "trellis-dogfood-preview-"),
  );
  const patchPath = path.join(outputDir, "upgrade.patch");
  fs.writeFileSync(patchPath, patch);
  const manifest: DogfoodPreviewManifest = {
    formatVersion: PREVIEW_FORMAT_VERSION,
    sourceCommit: source.commit,
    sourceTree: source.tree,
    cliVersion: VERSION,
    deployedVersion: source.deployedVersion,
    targetVersion: VERSION,
    patchPath,
    patchSha256: hashFile(patchPath),
    createdAt: new Date().toISOString(),
  };
  const manifestPath = path.join(outputDir, "preview.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { status: "previewed", manifestPath, patchPath };
}

function parsePreviewManifest(manifestPath: string): DogfoodPreviewManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    throw new DogfoodUpdateError(
      "Preview manifest is unreadable or invalid JSON.",
    );
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new DogfoodUpdateError("Preview manifest has an invalid shape.");
  }
  const manifest = parsed as Partial<DogfoodPreviewManifest>;
  if (
    manifest.formatVersion !== PREVIEW_FORMAT_VERSION ||
    typeof manifest.sourceCommit !== "string" ||
    typeof manifest.sourceTree !== "string" ||
    typeof manifest.cliVersion !== "string" ||
    typeof manifest.deployedVersion !== "string" ||
    typeof manifest.targetVersion !== "string" ||
    typeof manifest.patchPath !== "string" ||
    typeof manifest.patchSha256 !== "string"
  ) {
    throw new DogfoodUpdateError(
      "Preview manifest is not a dogfood-update manifest.",
    );
  }
  return manifest as DogfoodPreviewManifest;
}

export async function previewDogfoodUpdate(
  options: Pick<DogfoodUpdateOptions, "migrate" | "keepWorktree">,
): Promise<DogfoodPreviewResult> {
  if (!options.migrate) {
    throw new DogfoodUpdateError("Self-hosted upgrades require --migrate.");
  }
  const source = assertSourceCheckout(process.cwd());
  if (source.deployedVersion === VERSION) {
    return { status: "noop" };
  }
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "trellis-dogfood-worktree-"),
  );
  const target = path.join(temporaryRoot, "target");
  let worktreeCreated = false;

  try {
    runGit(source.root, ["worktree", "add", "--detach", target, "HEAD"]);
    worktreeCreated = true;
    const protectedBefore = new Map(
      PROTECTED_PATHS.map((protectedPath) => [
        protectedPath,
        snapshotTree(target, protectedPath),
      ]),
    );
    const agentsBefore = readOptionalFile(target, "AGENTS.md");
    const result = await withWorkingDirectory(target, () =>
      update({
        migrate: true,
        suppressMigrationTask: true,
        overwriteManagedFiles: true,
        preserveExistingMigrationTargets: true,
      }),
    );
    assertUpdateSucceeded(result);
    validateUpdatedTarget(target, protectedBefore, agentsBefore);

    const dryRunBefore = snapshotTree(target, ".");
    const dryRunResult = await withWorkingDirectory(target, () =>
      update({ dryRun: true, migrate: true, suppressMigrationTask: true }),
    );
    assertUpdateSucceeded(dryRunResult);
    if (!snapshotsEqual(dryRunBefore, snapshotTree(target, "."))) {
      throw new DogfoodUpdateError(
        "Update dry-run changed the isolated target.",
      );
    }

    runGit(target, ["add", "-A"]);
    const patch = runGit(target, ["diff", "--cached", "--binary", "HEAD"]);
    if (patch === "") {
      return { status: "noop" };
    }
    return writePreview(source, patch);
  } finally {
    if (worktreeCreated && !options.keepWorktree) {
      runGit(source.root, ["worktree", "remove", "--force", target]);
    }
    if (!options.keepWorktree) {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
}

export function applyDogfoodPreview(manifestPath: string): void {
  const manifest = parsePreviewManifest(manifestPath);
  const source = assertSourceCheckout(process.cwd());
  if (
    source.commit !== manifest.sourceCommit ||
    source.tree !== manifest.sourceTree ||
    VERSION !== manifest.cliVersion ||
    source.deployedVersion !== manifest.deployedVersion ||
    manifest.targetVersion !== VERSION
  ) {
    throw new DogfoodUpdateError(
      "Source state no longer matches the reviewed preview.",
    );
  }
  if (
    !fs.existsSync(manifest.patchPath) ||
    hashFile(manifest.patchPath) !== manifest.patchSha256
  ) {
    throw new DogfoodUpdateError(
      "Preview patch is missing or no longer matches its manifest.",
    );
  }
  runGit(source.root, ["apply", "--index", manifest.patchPath]);
  const staged = gitValue(source.root, ["diff", "--cached", "--name-status"]);
  console.log(
    `Applied reviewed self-hosted upgrade patch: ${manifest.patchPath}`,
  );
  console.log(staged);
}

export async function dogfoodUpdate(
  options: DogfoodUpdateOptions,
): Promise<DogfoodPreviewResult | undefined> {
  if (options.apply) {
    if (options.migrate || options.keepWorktree) {
      throw new DogfoodUpdateError(
        "--apply cannot be combined with --migrate or --keep-worktree.",
      );
    }
    applyDogfoodPreview(options.apply);
    return;
  }
  const result = await previewDogfoodUpdate(options);
  if (result.status === "noop") {
    console.log("Self-hosted deployment is already up to date.");
  } else {
    console.log(`Preview manifest: ${result.manifestPath}`);
    console.log(`Review patch: ${result.patchPath}`);
  }
  return result;
}

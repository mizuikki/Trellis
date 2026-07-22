import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);
const PYTHON = "python3";
const SENTINEL = "<!-- trellis:scaffold-unfilled -->";

function hasPython(): boolean {
  try {
    execFileSync(PYTHON, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function setupRepo(repo: string): void {
  fs.mkdirSync(path.join(repo, ".trellis", "scripts"), { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, path.join(repo, ".trellis", "scripts"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(repo, ".trellis", ".developer"), "name=test\n");
}

function makeTask(repo: string, name = "07-23-example", title = "Example task"): string {
  const taskDir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "task.json"),
    JSON.stringify({ title, status: "planning" }) + "\n",
  );
  fs.writeFileSync(path.join(taskDir, "prd.md"), "# Example\n");
  return taskDir;
}

function run(repo: string, ...args: string[]) {
  return spawnSync(PYTHON, [".trellis/scripts/task.py", ...args], {
    cwd: repo,
    encoding: "utf-8",
    env: { ...process.env, TRELLIS_CONTEXT_ID: "scaffold-test" },
  });
}

function runAsync(repo: string, ...args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [".trellis/scripts/task.py", ...args], {
      cwd: repo,
      env: { ...process.env, TRELLIS_CONTEXT_ID: "scaffold-test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf-8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf-8"); });
    child.on("error", reject);
    child.on("close", status => resolve({ status, stdout, stderr }));
  });
}

describe.skipIf(!hasPython())("task.py scaffold", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-scaffold-test-"));
    setupRepo(repo);
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("create does not seed design.md or implement.md", () => {
    const result = run(repo, "create", "Create only", "--slug", "create-only", "--no-start");
    expect(result.status, result.stderr).toBe(0);
    const tasks = fs.readdirSync(path.join(repo, ".trellis", "tasks"));
    const taskDir = path.join(repo, ".trellis", "tasks", tasks.find(name => name.endsWith("-create-only")) ?? "");
    expect(fs.existsSync(path.join(taskDir, "design.md"))).toBe(false);
    expect(fs.existsSync(path.join(taskDir, "implement.md"))).toBe(false);
  });

  it("scaffolds English prompts, skips existing files, and preserves bytes", () => {
    const taskDir = makeTask(repo);
    const first = run(repo, "scaffold", "07-23-example", "design");
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toBe("design.md: created\n");
    const content = fs.readFileSync(path.join(taskDir, "design.md"), "utf-8");
    expect(content).toContain("# Design - Example task");
    expect(content.split(SENTINEL)).toHaveLength(2);
    expect(content.split("\n")[1]).toBe(SENTINEL);

    const second = run(repo, "scaffold", "07-23-example", "design");
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toBe("design.md: skipped_exists\n");
    expect(fs.readFileSync(path.join(taskDir, "design.md"), "utf-8")).toBe(content);
  });

  it("handles all partial success and never overwrites an empty regular file", () => {
    const taskDir = makeTask(repo);
    fs.writeFileSync(path.join(taskDir, "design.md"), "");
    const result = run(repo, "scaffold", "07-23-example", "all");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("design.md: skipped_exists\nimplement.md: created\n");
    expect(result.stderr).toContain("design.md remains not planning-ready");
    expect(fs.readFileSync(path.join(taskDir, "design.md"), "utf-8")).toBe("");
    expect(fs.existsSync(path.join(taskDir, "implement.md"))).toBe(true);
  });

  it("uses argparse usage errors and rejects invalid task references before writes", () => {
    const missingArg = run(repo, "scaffold");
    expect(missingArg.status).toBe(2);

    const taskDir = makeTask(repo);
    const outside = path.join(repo, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "task.json"), JSON.stringify({ title: "outside" }));
    const archiveTask = path.join(repo, ".trellis", "tasks", "archive", "2026-07", "old");
    fs.mkdirSync(archiveTask, { recursive: true });
    fs.writeFileSync(path.join(archiveTask, "task.json"), JSON.stringify({ title: "old" }));
    const nested = path.join(taskDir, "nested");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, "task.json"), JSON.stringify({ title: "nested" }));

    for (const target of ["unknown", outside, archiveTask, nested]) {
      const result = run(repo, "scaffold", target, "design");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Error:");
      expect(fs.existsSync(path.join(taskDir, "design.md"))).toBe(false);
    }
  });

  it("rejects ambiguous names and malformed task metadata without writes", () => {
    const first = makeTask(repo, "07-22-duplicate");
    const second = makeTask(repo, "07-23-duplicate");
    const ambiguous = run(repo, "scaffold", "duplicate", "design");
    expect(ambiguous.status).toBe(1);
    expect(ambiguous.stderr).toContain("ambiguous task");
    expect(fs.existsSync(path.join(first, "design.md"))).toBe(false);
    expect(fs.existsSync(path.join(second, "design.md"))).toBe(false);

    const invalid = makeTask(repo, "07-23-invalid");
    fs.writeFileSync(path.join(invalid, "task.json"), "[]");
    const malformed = run(repo, "scaffold", "07-23-invalid", "design");
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain("task.json");
    expect(fs.existsSync(path.join(invalid, "design.md"))).toBe(false);

    if (process.platform !== "win32") {
      const outside = path.join(repo, "escape-target");
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "task.json"), JSON.stringify({ title: "escape" }));
      const escape = path.join(repo, ".trellis", "tasks", "07-23-escape");
      fs.symlinkSync(outside, escape);
      const escaped = run(repo, "scaffold", "07-23-escape", "design");
      expect(escaped.status).toBe(1);
      expect(escaped.stderr).toContain("non-symlink directory");
      expect(fs.existsSync(path.join(outside, "design.md"))).toBe(false);
    }
  });

  it("does not replace directories or symlinks and all continues after an error", () => {
    const taskDir = makeTask(repo);
    fs.mkdirSync(path.join(taskDir, "design.md"));
    const result = run(repo, "scaffold", "07-23-example", "all");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("design.md: error_invalid_target");
    expect(result.stdout).toBe("implement.md: created\n");
    expect(fs.statSync(path.join(taskDir, "design.md")).isDirectory()).toBe(true);

    if (process.platform !== "win32") {
      const other = makeTask(repo, "07-23-symlink");
      fs.symlinkSync(path.join(taskDir, "implement.md"), path.join(other, "design.md"));
      const linked = run(repo, "scaffold", "07-23-symlink", "design");
      expect(linked.status).toBe(1);
      expect(linked.stderr).toContain("design.md: error_invalid_target");
      expect(fs.lstatSync(path.join(other, "design.md")).isSymbolicLink()).toBe(true);
    }
  });

  it("uses exclusive creation so concurrent callers cannot clobber a scaffold", async () => {
    const taskDir = makeTask(repo);
    const [first, second] = await Promise.all([
      runAsync(repo, "scaffold", "07-23-example", "design"),
      runAsync(repo, "scaffold", "07-23-example", "design"),
    ]);
    expect([first.status, second.status]).toEqual([0, 0]);
    expect([first.stdout, second.stdout].sort()).toEqual([
      "design.md: created\n",
      "design.md: skipped_exists\n",
    ]);
    expect(fs.readFileSync(path.join(taskDir, "design.md"), "utf-8")).toContain(SENTINEL);
  });

  it("revalidates the task directory independently before the create window", () => {
    const taskDir = makeTask(repo);
    const moved = `${taskDir}-moved`;
    const probe = [
      "from pathlib import Path",
      "import os, sys",
      "from common.task_artifacts import resolve_scaffold_task, scaffold_artifact",
      "task = Path(sys.argv[1])",
      "target = resolve_scaffold_task(str(task))",
      "os.rename(task, str(task) + '-moved')",
      "task.mkdir()",
      "(task / 'task.json').write_text('{\\\"title\\\": \\\"replacement\\\"}', encoding='utf-8')",
      "print(scaffold_artifact(target, 'design').code)",
    ].join("\n");
    const result = spawnSync(PYTHON, ["-c", probe, taskDir], {
      cwd: path.join(repo, ".trellis", "scripts"),
      encoding: "utf-8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("error_invalid_target\n");
    expect(fs.existsSync(path.join(taskDir, "design.md"))).toBe(false);
    expect(fs.existsSync(path.join(moved, "design.md"))).toBe(false);
  });

  it("blocks start before status or session-pointer mutation for unready artifacts", () => {
    const taskDir = makeTask(repo);
    fs.writeFileSync(path.join(taskDir, "design.md"), `# Design\n${SENTINEL}\n`);
    const blocked = run(repo, "start", "07-23-example");
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("error_unfilled");
    expect(JSON.parse(fs.readFileSync(path.join(taskDir, "task.json"), "utf-8")).status).toBe("planning");
    expect(fs.existsSync(path.join(repo, ".trellis", ".runtime", "sessions", "scaffold-test.json"))).toBe(false);
  });

  it("blocks non-UTF-8 artifacts before status or session-pointer mutation", () => {
    const taskDir = makeTask(repo);
    fs.writeFileSync(path.join(taskDir, "implement.md"), Buffer.from([0xff, 0xfe]));
    const blocked = run(repo, "start", "07-23-example");
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("error_invalid_utf8");
    expect(JSON.parse(fs.readFileSync(path.join(taskDir, "task.json"), "utf-8")).status).toBe("planning");
    expect(fs.existsSync(path.join(repo, ".trellis", ".runtime", "sessions", "scaffold-test.json"))).toBe(false);
  });

  it("permits filled regular files and ignores a later sentinel mention", () => {
    const taskDir = makeTask(repo);
    fs.writeFileSync(path.join(taskDir, "design.md"), "# Design\n\nReviewed decision\n\n\n\n" + SENTINEL + "\n");
    fs.writeFileSync(path.join(taskDir, "implement.md"), "# Implement\n\nReviewed steps\n");
    const started = run(repo, "start", "07-23-example");
    expect(started.status, started.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(taskDir, "task.json"), "utf-8")).status).toBe("in_progress");
  });
});

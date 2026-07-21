import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  SHARED_HOOKS_BY_PLATFORM,
  getSharedHookScripts,
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../../src/templates/shared-hooks/index.js";

const ALL_HOOK_FILES = [
  "session-start.py",
  "inject-shell-session-context.py",
  "inject-workflow-state.py",
  "inject-subagent-context.py",
] as const;

const EMPTY_EXCEPT_PASS_RE = /except[^\n]*:\n\s*pass\s*$/m;

function runSubagentContextProbe(
  files: Record<string, string>,
  mode: "context" | "index" | "artifact" = "context",
): string {
  const root = mkdtempSync(join(tmpdir(), "trellis-shared-context-"));
  const task = join(root, ".trellis", "tasks", "bounded-context");
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(task, { recursive: true });
  const hook = getSharedHookScripts().find(
    (candidate) => candidate.name === "inject-subagent-context.py",
  );
  if (!hook) throw new Error("inject-subagent-context.py template is missing");
  const hookPath = join(root, "inject-subagent-context.py");
  writeFileSync(hookPath, hook.content);
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const python = process.platform === "win32" ? "python" : "python3";
  return execFileSync(
    python,
    [
      "-c",
      [
        "import importlib.util, sys",
        "spec = importlib.util.spec_from_file_location('hook', sys.argv[1])",
        "module = importlib.util.module_from_spec(spec)",
        "sys.modules[spec.name] = module",
        "spec.loader.exec_module(module)",
        mode === "context"
          ? "sys.stdout.write(module.get_implement_context(sys.argv[2], '.trellis/tasks/bounded-context'))"
          : mode === "index"
            ? "sys.stdout.write(module.read_jsonl_index(sys.argv[2], '.trellis/tasks/bounded-context/implement.jsonl'))"
            : "sys.stdout.write(module._read_bounded_artifact(sys.argv[2], '.trellis/tasks/bounded-context/prd.md') or '')",
      ].join("; "),
      hookPath,
      root,
    ],
    { encoding: "utf8" },
  );
}

describe("shared-hooks capability table", () => {
  it("every capability-table entry names a real shared-hook file", () => {
    const realFiles = new Set(getSharedHookScripts().map((h) => h.name));
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      for (const hook of hooks) {
        expect(
          realFiles.has(hook),
          `${platform} declares ${hook} but no such file exists under shared-hooks/`,
        ).toBe(true);
      }
    }
  });

  it("every shared-hook file is distributed to at least one platform", () => {
    const distributed = new Set<string>();
    for (const hooks of Object.values(SHARED_HOOKS_BY_PLATFORM)) {
      for (const h of hooks) distributed.add(h);
    }
    for (const hook of getSharedHookScripts()) {
      expect(
        distributed.has(hook.name),
        `${hook.name} exists under shared-hooks/ but no platform installs it — dead template`,
      ).toBe(true);
    }
  });

  it("statusline.py is not distributed by default", () => {
    const realFiles = new Set(getSharedHookScripts().map((h) => h.name));
    expect(realFiles.has("statusline.py")).toBe(false);
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      expect(
        (hooks as readonly string[]).includes("statusline.py"),
        `${platform} must not install the generated statusline.py hook by default`,
      ).toBe(false);
    }
  });

  it("inject-subagent-context.py is restricted to platforms with native sub-agent context delivery", () => {
    // Codex uses SubagentStart.additionalContext; these remaining platforms
    // are class-2 and load their context from an agent-definition prelude.
    const class2 = new Set(["copilot", "gemini", "qoder", "trae"]);
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      const has = hooks.includes("inject-subagent-context.py");
      if (class2.has(platform))
        expect(
          has,
          `${platform} is class-2 pull-based and must not ship inject-subagent-context.py`,
        ).toBe(false);
    }

    expect(SHARED_HOOKS_BY_PLATFORM.codex).toContain(
      "inject-subagent-context.py",
    );
  });

  it("codex + copilot do not take the shared session-start.py (they bundle their own)", () => {
    expect(SHARED_HOOKS_BY_PLATFORM.codex).not.toContain("session-start.py");
    expect(SHARED_HOOKS_BY_PLATFORM.copilot).not.toContain("session-start.py");
  });

  it("inject-shell-session-context.py goes to Cursor only", () => {
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      const has = hooks.includes("inject-shell-session-context.py");
      if (platform === "cursor") expect(has).toBe(true);
      else
        expect(
          has,
          `${platform} declares inject-shell-session-context.py but does not use Cursor beforeShellExecution`,
        ).toBe(false);
    }
  });

  it("kiro registers session-start, workflow-state, and subagent-context hooks", () => {
    // Kiro wires per-turn + spawn hooks on both surfaces (CLI agent
    // userPromptSubmit/agentSpawn + IDE .kiro.hook promptSubmit), so it ships
    // the same trio as other agent-capable push-based platforms.
    expect([...SHARED_HOOKS_BY_PLATFORM.kiro].sort()).toEqual(
      [
        "inject-subagent-context.py",
        "inject-workflow-state.py",
        "session-start.py",
      ].sort(),
    );
  });

  it("zcode registers session-start, workflow-state, and subagent-context hooks", () => {
    // ZCode 3.x ships a workspace hook config (.zcode/config.json) covering
    // SessionStart + UserPromptSubmit + PreToolUse Agent/Task.
    expect([...SHARED_HOOKS_BY_PLATFORM.zcode].sort()).toEqual(
      [
        "inject-subagent-context.py",
        "inject-workflow-state.py",
        "session-start.py",
      ].sort(),
    );
  });

  it("getSharedHookScriptsForPlatform returns exactly the declared set per platform", () => {
    for (const platform of Object.keys(
      SHARED_HOOKS_BY_PLATFORM,
    ) as SharedHookPlatform[]) {
      const names = getSharedHookScriptsForPlatform(platform)
        .map((h) => h.name)
        .sort();
      const expected = [...SHARED_HOOKS_BY_PLATFORM[platform]].sort();
      expect(names).toEqual(expected);
    }
  });

  it("shared-hooks directory only contains files enumerated by ALL_HOOK_FILES", () => {
    // Guards against a new shared hook being added without the capability
    // table being updated.
    const actual = new Set(getSharedHookScripts().map((h) => h.name));
    const expected = new Set(ALL_HOOK_FILES);
    expect(actual).toEqual(expected);
  });

  it("shared hooks do not read legacy .current-task state", () => {
    for (const hook of getSharedHookScripts()) {
      expect(
        hook.content,
        `${hook.name} must use the session-scoped active task resolver`,
      ).not.toContain(".current-task");
      expect(hook.content).not.toContain("global fallback");
    }
  });

  it("shared session-start.py injects compact task artifact guidance", () => {
    const sessionStart = getSharedHookScripts().find(
      (h) => h.name === "session-start.py",
    );
    expect(sessionStart, "session-start.py is missing from shared-hooks/").toBeDefined();
    const content = sessionStart ? sessionStart.content : "";
    expect(content).toContain("<trellis-workflow>");
    expect(content).toContain("Task context order");
    expect(content).toContain("jsonl entries -> `prd.md`");
    expect(content).toContain("Lightweight task can request start review with PRD-only");
    expect(content).toContain("complex task must add");
    expect(content).not.toContain("Status: READY");
    expect(content).not.toContain("<workflow>");
  });

  it("generated session and workflow-state hooks document fail-open exception suppression", () => {
    for (const name of ["session-start.py", "inject-workflow-state.py"]) {
      const hook = getSharedHookScripts().find((h) => h.name === name);
      expect(hook, `${name} is missing from shared-hooks/`).toBeDefined();
      const content = hook?.content ?? "";

      expect(content).not.toContain("BaseException");
      expect(content).not.toMatch(EMPTY_EXCEPT_PASS_RE);
    }
  });

  it("inject-subagent-context builds a bounded metadata index without referenced bodies", () => {
    const marker = "REFERENCED_BODY_MARKER_MUST_NOT_APPEAR";
    const entries = [
      JSON.stringify({
        file: ".trellis/spec/large.md",
        reason: "Needed to verify bounded metadata discovery",
      }),
      JSON.stringify({
        path: ".trellis/spec",
        type: "directory",
        reason: "Legacy directory entry",
      }),
      JSON.stringify({
        path: ".trellis\\spec\\large.md",
        reason: "Duplicate Windows-style path",
      }),
      JSON.stringify({
        file: "../outside.md",
        reason: "Outside repository",
      }),
      "{malformed",
      JSON.stringify({ _example: "seed" }),
      JSON.stringify({ file: ".trellis/spec/missing.md", reason: "Missing is non-fatal" }),
    ];
    const context = runSubagentContextProbe({
      ".trellis/tasks/bounded-context/implement.jsonl": entries.join("\n"),
      ".trellis/tasks/bounded-context/prd.md": "# PRD\n",
      ".trellis/spec/large.md": `${marker}\n${"x".repeat(2 * 1024 * 1024)}`,
    });

    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).not.toContain(marker);
    expect(context).toContain(".trellis/spec/large.md");
    expect(context).toContain("Needed to verify bounded metadata discovery");
    expect(context).toContain("type: file");
    expect(context).toMatch(/bytes: 2097\d+/);
    expect(context).toContain("type: directory");
    expect(context).toContain("Missing is non-fatal");
    expect(context.match(/path: \.trellis\/spec\/large\.md/g)).toHaveLength(1);
    expect(context).not.toContain("Duplicate Windows-style path");
    expect(context).not.toContain("Outside repository");
  });

  it("inject-subagent-context caps UTF-8 artifacts and aggregate context with path-bearing notices", () => {
    const context = runSubagentContextProbe({
      ".trellis/tasks/bounded-context/implement.jsonl": "",
      ".trellis/tasks/bounded-context/prd.md": `PRD_START\n${"界".repeat(90_000)}PRD_END`,
      ".trellis/tasks/bounded-context/design.md": `DESIGN_START\n${"计".repeat(90_000)}DESIGN_END`,
      ".trellis/tasks/bounded-context/implement.md": `PLAN_START\n${"划".repeat(90_000)}PLAN_END`,
    });

    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).toContain("PRD_START");
    expect(context).not.toContain("PRD_END");
    expect(context).toContain(".trellis/tasks/bounded-context/prd.md");
    expect(context).toContain("load the remainder on demand");
    expect(context).not.toContain("�");
    expect(context).toContain("Task context for .trellis/tasks/bounded-context");
    expect(context).toContain(".trellis/tasks/bounded-context/design.md");
    expect(context).toContain(".trellis/tasks/bounded-context/implement.md");

    const artifact = runSubagentContextProbe(
      {
        ".trellis/tasks/bounded-context/prd.md": `PRD_START\n${"界".repeat(90_000)}PRD_END`,
      },
      "artifact",
    );
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain(
      "Truncated .trellis/tasks/bounded-context/prd.md at 65536 UTF-8 bytes",
    );
    expect(artifact).not.toContain("�");
  });

  it("inject-subagent-context enforces manifest entry, source, and rendered-index limits", () => {
    const taskManifest = ".trellis/tasks/bounded-context/implement.jsonl";
    const shortEntries = Array.from({ length: 257 }, (_, index) =>
      JSON.stringify({
        file: `.trellis/spec/${index}.md`,
        reason: `entry ${index}`,
      }),
    );
    const entryLimited = runSubagentContextProbe(
      { [taskManifest]: shortEntries.join("\n") },
      "index",
    );
    expect(entryLimited.match(/^- path:/gm)).toHaveLength(256);
    expect(entryLimited).toContain(
      "Omitted additional entries from .trellis/tasks/bounded-context/implement.jsonl after 256",
    );

    const longEntries = Array.from({ length: 256 }, (_, index) =>
      JSON.stringify({
        file: `.trellis/spec/long-${index}.md`,
        reason: `${index}-${"r".repeat(500)}`,
      }),
    );
    const indexLimited = runSubagentContextProbe(
      { [taskManifest]: longEntries.join("\n") },
      "index",
    );
    expect(Buffer.byteLength(indexLimited.trimEnd(), "utf8")).toBeLessThanOrEqual(
      32 * 1024,
    );
    expect(indexLimited).toContain(
      "Truncated rendered index for .trellis/tasks/bounded-context/implement.jsonl",
    );
    expect(indexLimited).not.toContain("�");

    const sourceLimited = runSubagentContextProbe(
      {
        [taskManifest]: `${JSON.stringify({
          file: ".trellis/spec/first.md",
          reason: "first complete row",
        })}\n${"x".repeat(300 * 1024)}`,
      },
      "index",
    );
    expect(sourceLimited).toContain("path: .trellis/spec/first.md");
    expect(sourceLimited).toContain(
      "Stopped reading .trellis/tasks/bounded-context/implement.jsonl after 262144 bytes",
    );
    expect(sourceLimited).not.toContain("�");
  });
});

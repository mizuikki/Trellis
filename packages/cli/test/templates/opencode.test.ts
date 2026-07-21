import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  contextCollector,
  isTrellisSubagent,
  TrellisContext,
} from "../../src/templates/opencode/lib/trellis-context.js";
import {
  buildSessionContext,
  hasInjectedTrellisContext,
} from "../../src/templates/opencode/lib/session-utils.js";
import injectSubagentContextPlugin from "../../src/templates/opencode/plugins/inject-subagent-context.js";
import sessionStartPlugin from "../../src/templates/opencode/plugins/session-start.js";
import injectWorkflowStatePlugin from "../../src/templates/opencode/plugins/inject-workflow-state.js";

interface TestContextCollector {
  processed: Set<string>;
  markProcessed(directory: string, sessionID: string): void;
  isProcessed(directory: string, sessionID: string): boolean;
  clear(sessionID: string): void;
}

interface OpenCodeInjectHooks {
  "tool.execute.before": (
    input: unknown,
    output: { args: { command: string } },
  ) => Promise<void>;
}

async function createOpenCodeInjectHooks(
  platform: NodeJS.Platform = "linux",
  env: NodeJS.ProcessEnv = {},
): Promise<OpenCodeInjectHooks> {
  return (await injectSubagentContextPlugin({
    directory: "/tmp/trellis-opencode-test",
    platform,
    env,
  })) as OpenCodeInjectHooks;
}

describe("opencode session context dedupe", () => {
  let collector: TestContextCollector;

  beforeEach((): void => {
    collector = contextCollector as TestContextCollector;
  });

  afterEach((): void => {
    collector.clear("session-a");
    collector.clear("session-b");
    collector.processed.clear();
  });

  it("tracks processed sessions in memory for the active process", () => {
    expect(collector.isProcessed("session-a")).toBe(false);

    collector.markProcessed("session-a");
    expect(collector.isProcessed("session-a")).toBe(true);

    collector.clear("session-a");

    expect(collector.isProcessed("session-a")).toBe(false);
  });

  it("does not treat a different session id as already processed", () => {
    collector.markProcessed("session-a");

    expect(collector.isProcessed("session-b")).toBe(false);
  });
});

describe("opencode session-start history detection", () => {
  afterEach((): void => {
    contextCollector.clear("session-a");
  });

  it("builds compact startup context with an adaptive one-shot acknowledgment", () => {
    const context = buildSessionContext({
      directory: "/tmp/trellis-opencode-test",
      getActiveTask: () => ({ taskPath: null, source: "none", stale: false }),
      getContextKey: () => null,
      getCurrentTask: () => null,
      readFile: () => "",
      readProjectFile: () => "",
      resolveTaskDir: () => null,
      runScript: () => "",
    });

    expect(context.startsWith("<session-context>")).toBe(true);
    expect(context).toContain("Trellis compact SessionStart context");
    expect(context).toContain("<first-reply-notice>");
    expect(context).toContain("the user's current request");
    expect(context).toContain("the user message that triggered this reply");
    expect(context).toContain("has no clear natural language");
    expect(context).toContain(
      "explicitly established project communication language",
    );
    expect(context).toContain("Trellis SessionStart ✓");
    expect(context).toContain("Continue directly with the user's request");
    expect(context).toContain(
      "must not alter the language used for the remainder of the response",
    );
    expect(context).toContain("This notice is one-shot");
    expect(context.indexOf("the user's current request")).toBeLessThan(
      context.indexOf("explicitly established project communication language"),
    );
    expect(
      context.indexOf("explicitly established project communication language"),
    ).toBeLessThan(context.indexOf("Trellis SessionStart ✓"));
    expect(context.indexOf("<first-reply-notice>")).toBeLessThan(
      context.indexOf("<current-state>"),
    );
    expect(context).toContain("<guidelines>");
    expect(context).toContain("<ready>");
    expect(context).not.toContain("say once in Chinese");
    expect(context).not.toContain("exactly one short Chinese sentence");
    expect(context).not.toContain(
      "Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。",
    );
  });

  it("persists startup context and suppresses reinjection from history", async () => {
    interface ChatOutput {
      parts: {
        type: string;
        text: string;
        metadata?: { trellis?: { sessionStart?: boolean } };
      }[];
    }

    let historyReads = 0;
    let persistedParts: ChatOutput["parts"] = [];
    const hooks = (await sessionStartPlugin({
      directory: "/tmp/trellis-opencode-test",
      client: {
        session: {
          messages: async () => {
            historyReads += 1;
            return {
              data:
                persistedParts.length === 0
                  ? []
                  : [{ info: { role: "user" }, parts: persistedParts }],
            };
          },
        },
      },
    })) as {
      "chat.message": (
        input: { sessionID: string; agent: string },
        output: ChatOutput,
      ) => Promise<void>;
    };

    const firstOutput: ChatOutput = {
      parts: [{ type: "text", text: "First request" }],
    };
    await hooks["chat.message"](
      { sessionID: "session-a", agent: "build" },
      firstOutput,
    );

    expect(firstOutput.parts[0].text).toMatch(
      /^<session-context>[\s\S]*\n\n---\n\nFirst request$/,
    );
    expect(firstOutput.parts[0].text).toContain("<first-reply-notice>");
    expect(firstOutput.parts[0].text).toContain("Trellis SessionStart ✓");
    expect(firstOutput.parts[0].metadata).toEqual({
      trellis: { sessionStart: true },
    });

    persistedParts = firstOutput.parts;
    contextCollector.clear("session-a");

    const secondOutput: ChatOutput = {
      parts: [{ type: "text", text: "Second request" }],
    };
    await hooks["chat.message"](
      { sessionID: "session-a", agent: "build" },
      secondOutput,
    );

    expect(secondOutput.parts).toEqual([
      { type: "text", text: "Second request" },
    ]);
    expect(historyReads).toBe(2);
  });

  it("detects persisted Trellis context from metadata", () => {
    const messages = [
      {
        info: { role: "user" },
        parts: [
          {
            type: "text",
            text: "hello",
            metadata: {
              trellis: {
                sessionStart: true,
              },
            },
          },
        ],
      },
    ];

    expect(hasInjectedTrellisContext(messages)).toBe(true);
  });

  it("ignores unrelated user messages", () => {
    const messages = [
      {
        info: { role: "user" },
        parts: [
          {
            type: "text",
            text: "normal prompt",
          },
        ],
      },
    ];

    expect(hasInjectedTrellisContext(messages)).toBe(false);
  });
});

describe("opencode bash session context", () => {
  it("injects TRELLIS_CONTEXT_ID into Bash commands from plugin sessionID", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command: "python3 ./.trellis/scripts/task.py start .trellis/tasks/demo",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; python3 ./.trellis/scripts/task.py start .trellis/tasks/demo",
    );
  });

  it("uses PowerShell environment syntax on Windows", async () => {
    const hooks = await createOpenCodeInjectHooks("win32");
    const output = {
      args: {
        command: "python ./.trellis/scripts/task.py start .trellis/tasks/demo",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "$env:TRELLIS_CONTEXT_ID = 'opencode_oc-a'; python ./.trellis/scripts/task.py start .trellis/tasks/demo",
    );
  });

  it("uses POSIX environment syntax on Windows Git Bash", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      MSYSTEM: "MINGW64",
    });
    const output = {
      args: {
        command: "git diff --name-only",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git diff --name-only",
    );
  });

  it("uses POSIX environment syntax when Windows OSTYPE indicates MSYS", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      OSTYPE: "msys",
    });
    const output = {
      args: {
        command: "git status --short",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git status --short",
    );
  });

  it("uses POSIX environment syntax when Windows MINGW_PREFIX is set", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      MINGW_PREFIX: "/mingw64",
    });
    const output = {
      args: {
        command: "git log --oneline -1",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git log --oneline -1",
    );
  });

  it("uses POSIX environment syntax when Windows SHELL is bash", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      SHELL: "/usr/bin/bash",
    });
    const output = {
      args: {
        command: "git branch --show-current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git branch --show-current",
    );
  });

  it("uses POSIX environment syntax when OpenCode Git Bash path is configured", async () => {
    const hooks = await createOpenCodeInjectHooks("win32", {
      OPENCODE_GIT_BASH_PATH: "C:\\Program Files\\Git\\bin\\bash.exe",
    });
    const output = {
      args: {
        command: "git rev-parse --show-toplevel",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; git rev-parse --show-toplevel",
    );
  });

  it("does not duplicate an explicit TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command:
          "TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
    );
  });

  it("does not duplicate an explicit exported TRELLIS_CONTEXT_ID", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command:
          "export TRELLIS_CONTEXT_ID=manual; python3 ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID=manual; python3 ./.trellis/scripts/task.py current",
    );
  });

  it("does not duplicate an explicit env TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command:
          "env FOO=bar TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "env FOO=bar TRELLIS_CONTEXT_ID=manual python3 ./.trellis/scripts/task.py current",
    );
  });

  it("does not duplicate an explicit PowerShell TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks("win32");
    const output = {
      args: {
        command:
          "$env:TRELLIS_CONTEXT_ID = 'manual'; python ./.trellis/scripts/task.py current",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "$env:TRELLIS_CONTEXT_ID = 'manual'; python ./.trellis/scripts/task.py current",
    );
  });

  it("does not treat a grep pattern as an explicit TRELLIS_CONTEXT_ID assignment", async () => {
    const hooks = await createOpenCodeInjectHooks();
    const output = {
      args: {
        command: "env | sort | grep '^TRELLIS_CONTEXT_ID='",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "bash", sessionID: "oc-a" },
      output,
    );

    expect(output.args.command).toBe(
      "export TRELLIS_CONTEXT_ID='opencode_oc-a'; env | sort | grep '^TRELLIS_CONTEXT_ID='",
    );
  });
});

// ---------------------------------------------------------------------------
// Issue #264 — sub-agent context injection + chat.message skip
// ---------------------------------------------------------------------------

interface TaskToolOutput {
  args: {
    subagent_type?: string;
    prompt?: string;
  };
}

interface TaskToolHooks {
  "tool.execute.before": (
    input: { tool: string; sessionID?: string; agent?: string },
    output: TaskToolOutput,
  ) => Promise<void>;
}

interface ChatMessagePart {
  type: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

interface ChatMessageHooks {
  "chat.message": (
    input: { sessionID: string; agent?: string },
    output: { parts: ChatMessagePart[] },
  ) => Promise<void>;
}

function setupTrellisProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "trellis-opencode-264-"));
  const taskDir = join(dir, ".trellis", "tasks", "demo-task");
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(dir, ".trellis", ".runtime", "sessions"), { recursive: true });
  writeFileSync(join(taskDir, "prd.md"), "# Demo PRD\n\nGoal: verify injection.");
  writeFileSync(join(taskDir, "implement.jsonl"), "");
  writeFileSync(join(taskDir, "check.jsonl"), "");
  writeFileSync(
    join(dir, ".trellis", "workflow.md"),
    [
      "# Workflow",
      "",
      "[workflow-state:in_progress]",
      "Active task: <task path>. Dispatch trellis-implement or trellis-check.",
      "[/workflow-state:in_progress]",
      "",
    ].join("\n"),
  );
  return dir;
}

function writeSessionFile(dir: string, key: string, taskRef: string): void {
  const file = join(dir, ".trellis", ".runtime", "sessions", `${key}.json`);
  writeFileSync(file, JSON.stringify({ current_task: taskRef }, null, 2));
}

describe("opencode subagent helper", () => {
  it("isTrellisSubagent matches the three trellis sub-agent names", () => {
    expect(isTrellisSubagent({ agent: "trellis-implement" })).toBe(true);
    expect(isTrellisSubagent({ agent: "trellis-check" })).toBe(true);
    expect(isTrellisSubagent({ agent: "trellis-research" })).toBe(true);
  });

  it("isTrellisSubagent rejects unrelated agents", () => {
    expect(isTrellisSubagent({ agent: "build" })).toBe(false);
    expect(isTrellisSubagent({ agent: "trellis-implement-extra" })).toBe(false);
    expect(isTrellisSubagent({ agent: undefined })).toBe(false);
    expect(isTrellisSubagent({})).toBe(false);
    expect(isTrellisSubagent(null)).toBe(false);
  });
});

describe("opencode TrellisContext single-session fallback", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTrellisProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the only session file when exactly one exists", () => {
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "missing-key" });

    expect(active.taskPath).toBe(".trellis/tasks/demo-task");
    expect(active.source).toBe("session-fallback:opencode_sole");
    expect(active.stale).toBe(false);
  });

  it("refuses to guess when two or more session files exist", () => {
    writeSessionFile(dir, "opencode_a", ".trellis/tasks/demo-task");
    writeSessionFile(dir, "opencode_b", ".trellis/tasks/demo-task");
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "missing-key" });

    expect(active.taskPath).toBeNull();
    expect(active.source).toBe("none");
  });

  it("returns no task when zero session files exist (Python parity)", () => {
    // sessions/ exists from setupTrellisProject but contains no files
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "missing-key" });

    expect(active.taskPath).toBeNull();
    expect(active.source).toBe("none");
  });

  it("prefers an exact context-key match over the fallback", () => {
    writeSessionFile(dir, "opencode_session_exact", ".trellis/tasks/demo-task");
    writeSessionFile(dir, "opencode_other", ".trellis/tasks/demo-task");
    const ctx = new TrellisContext(dir);
    const active = ctx.getActiveTask({ sessionID: "exact" });

    // sessionID="exact" maps to "opencode_exact" via buildContextKey; we
    // wrote "opencode_session_exact" so the exact lookup misses, but the
    // presence of ≥2 files means fallback should also refuse — proving
    // exact match is attempted first.
    expect(active.taskPath).toBeNull();
  });

  it("enforces OpenCode artifact, entry, source, and rendered-index limits", () => {
    const task = join(dir, ".trellis", "tasks", "demo-task");
    const ctx = new TrellisContext(dir);
    const artifactPath = join(task, "prd.md");
    writeFileSync(artifactPath, `START\n${"界".repeat(90_000)}END`);
    const artifact = ctx.readBoundedArtifact(
      artifactPath,
      ".trellis/tasks/demo-task/prd.md",
    );
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain(
      "Truncated .trellis/tasks/demo-task/prd.md at 65536 UTF-8 bytes",
    );
    expect(artifact).not.toContain("�");

    const manifestPath = join(task, "implement.jsonl");
    writeFileSync(
      manifestPath,
      Array.from({ length: 257 }, (_, index) =>
        JSON.stringify({ file: `.trellis/spec/${index}.md`, reason: `entry ${index}` }),
      ).join("\n"),
    );
    const entryLimited = ctx.buildManifestIndex(manifestPath);
    expect(entryLimited.match(/^- path:/gm)).toHaveLength(256);
    expect(entryLimited).toContain(
      "Omitted additional entries from .trellis/tasks/demo-task/implement.jsonl after 256",
    );

    writeFileSync(
      manifestPath,
      Array.from({ length: 257 }, (_, index) =>
        JSON.stringify({
          file: `.trellis/spec/${index}.md`,
          reason: "r".repeat(43),
        }),
      ).join("\n"),
    );
    const noticeLimited = ctx.buildManifestIndex(manifestPath);
    expect(Buffer.byteLength(noticeLimited, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(noticeLimited).toContain(
      "Omitted additional entries from .trellis/tasks/demo-task/implement.jsonl after 256",
    );
    expect(noticeLimited).not.toContain("�");

    writeFileSync(
      manifestPath,
      Array.from({ length: 256 }, (_, index) =>
        JSON.stringify({ file: `.trellis/spec/long-${index}.md`, reason: `${index}-${"r".repeat(500)}` }),
      ).join("\n"),
    );
    const indexLimited = ctx.buildManifestIndex(manifestPath);
    expect(Buffer.byteLength(indexLimited, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(indexLimited).toContain(
      "Truncated rendered index for .trellis/tasks/demo-task/implement.jsonl",
    );
    expect(indexLimited).not.toContain("�");

    writeFileSync(
      manifestPath,
      `${JSON.stringify({ file: ".trellis/spec/first.md", reason: "first" })}\n${"x".repeat(300 * 1024)}`,
    );
    const sourceLimited = ctx.buildManifestIndex(manifestPath);
    expect(sourceLimited).toContain("path: .trellis/spec/first.md");
    expect(sourceLimited).toContain(
      "Stopped reading .trellis/tasks/demo-task/implement.jsonl after 262144 bytes",
    );

    mkdirSync(join(dir, ".trellis", "spec"), { recursive: true });
    writeFileSync(
      manifestPath,
      [
        JSON.stringify({ file: "..", type: "directory", reason: "Parent escape" }),
        JSON.stringify({ file: "../outside.md", reason: "Outside escape" }),
        JSON.stringify({
          file: ".trellis/spec",
          type: "directory",
          reason: "Valid directory",
        }),
      ].join("\n"),
    );
    const boundaryChecked = ctx.buildManifestIndex(manifestPath);
    expect(boundaryChecked).not.toContain("Parent escape");
    expect(boundaryChecked).not.toContain("Outside escape");
    expect(boundaryChecked).toContain("path: .trellis/spec");
    expect(boundaryChecked).toContain("type: directory");
    expect(boundaryChecked).toContain("Valid directory");
  });

  it("hardens OpenCode Unicode reasons, post-decode artifacts, and path-only dedup", () => {
    const task = join(dir, ".trellis", "tasks", "demo-task");
    const ctx = new TrellisContext(dir);
    const manifestPath = join(task, "implement.jsonl");

    writeFileSync(
      manifestPath,
      '{"file":".trellis/spec/surrogate.md","reason":"before\\ud800after"}\n',
    );
    const surrogateIndex = ctx.buildManifestIndex(manifestPath);
    expect(surrogateIndex).toContain("path: .trellis/spec/surrogate.md");
    expect(surrogateIndex).toContain("before");
    expect(surrogateIndex).toContain("after");
    expect(Buffer.from(surrogateIndex, "utf8").toString("utf8")).toBe(surrogateIndex);

    const emojiReason = `${"x".repeat(236)}😀${"y".repeat(10)}`;
    writeFileSync(
      manifestPath,
      JSON.stringify({ file: ".trellis/spec/emoji.md", reason: emojiReason }),
    );
    const emojiIndex = ctx.buildManifestIndex(manifestPath);
    const reasonMatch = emojiIndex.match(/reason: ([^\n]+)/);
    expect(reasonMatch?.[1]).toBeDefined();
    const renderedReason = reasonMatch?.[1] ?? "";
    expect(Array.from(renderedReason).length).toBeLessThanOrEqual(240);
    expect(renderedReason).toContain("😀");
    expect(renderedReason.endsWith("...")).toBe(true);
    expect(Buffer.from(renderedReason, "utf8").toString("utf8")).toBe(renderedReason);

    const artifactPath = join(task, "prd.md");
    const invalidBytes = Buffer.alloc(60_000, 0xff);
    writeFileSync(artifactPath, invalidBytes);
    expect(Buffer.byteLength(invalidBytes.toString("utf8"), "utf8")).toBeGreaterThan(64 * 1024);
    const artifact = ctx.readBoundedArtifact(
      artifactPath,
      ".trellis/tasks/demo-task/prd.md",
    );
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain(
      "Truncated .trellis/tasks/demo-task/prd.md at 65536 UTF-8 bytes",
    );
    expect(Buffer.from(artifact, "utf8").toString("utf8")).toBe(artifact);

    writeFileSync(
      manifestPath,
      [
        JSON.stringify({
          file: ".trellis/spec/shared.md",
          type: "file",
          reason: "first as file",
        }),
        JSON.stringify({
          file: ".trellis/spec/shared.md",
          type: "directory",
          reason: "second as directory",
        }),
      ].join("\n"),
    );
    const deduped = ctx.buildManifestIndex(manifestPath);
    expect(deduped.match(/path: \.trellis\/spec\/shared\.md/g)).toHaveLength(1);
    expect(deduped).toContain("type: file");
    expect(deduped).toContain("first as file");
    expect(deduped).not.toContain("second as directory");
    expect(deduped).not.toContain("type: directory");
  });

  it("dedupes symlink aliases and reports replacement truncation in aggregate notices", () => {
    const task = join(dir, ".trellis", "tasks", "demo-task");
    const spec = join(dir, ".trellis", "spec");
    mkdirSync(spec, { recursive: true });
    writeFileSync(join(spec, "real.md"), "canonical body\n");
    symlinkSync("real.md", join(spec, "alias.md"));
    const ctx = new TrellisContext(dir);
    const manifestPath = join(task, "implement.jsonl");
    writeFileSync(
      manifestPath,
      [
        JSON.stringify({ file: ".trellis/spec/alias.md", reason: "alias first" }),
        JSON.stringify({ file: ".trellis/spec/real.md", reason: "real second" }),
      ].join("\n"),
    );
    const index = ctx.buildManifestIndex(manifestPath);
    expect(index.match(/path: \.trellis\/spec\/real\.md/g)).toHaveLength(1);
    expect(index).toContain("alias first");
    expect(index).not.toContain("real second");
    expect(index).not.toContain("path: .trellis/spec/alias.md");

    const invalidBytes = Buffer.alloc(60_000, 0xff);
    writeFileSync(join(task, "prd.md"), invalidBytes);
    writeFileSync(join(task, "design.md"), invalidBytes);
    writeFileSync(join(task, "implement.md"), invalidBytes);
    const context = ctx.buildTaskContext(task, ["implement.jsonl"]);
    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).toContain("artifact limits applied to");
    expect(context).not.toContain("artifact limits applied to none");
    expect(context).toContain(".trellis/tasks/demo-task/prd.md");
    expect(context).toContain(".trellis/tasks/demo-task/design.md");
    expect(context).toContain(".trellis/tasks/demo-task/implement.md");
  });

  it("does not treat untruncated artifacts as limited when their body contains notice text", () => {
    const task = join(dir, ".trellis", "tasks", "demo-task");
    const prdDisplay = ".trellis/tasks/demo-task/prd.md";
    const embeddedNotice =
      `[Truncated ${prdDisplay} at 65536 UTF-8 bytes; load the remainder on demand.]`;
    const prd = `PREFIX\n${embeddedNotice}\n${"a".repeat(40_000)}`;
    expect(Buffer.byteLength(prd, "utf8")).toBeLessThan(64 * 1024);
    writeFileSync(join(task, "prd.md"), prd);
    writeFileSync(join(task, "design.md"), `START\n${"界".repeat(90_000)}END`);
    writeFileSync(join(task, "implement.md"), `START\n${"划".repeat(90_000)}END`);
    const context = new TrellisContext(dir).buildTaskContext(task, ["implement.jsonl"]);
    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    const applied = context.match(/artifact limits applied to ([^;]+)/)?.[1] ?? "";
    expect(applied.length).toBeGreaterThan(0);
    expect(applied).not.toContain("prd.md");
    expect(applied).toContain("design.md");
    expect(applied).toContain("implement.md");
  });
});

describe("opencode inject-subagent-context (issue #264)", () => {
  let dir: string;
  let hooks: TaskToolHooks;

  beforeEach(async () => {
    dir = setupTrellisProject();
    hooks = (await injectSubagentContextPlugin({
      directory: dir,
      platform: "linux",
      env: {},
    })) as TaskToolHooks;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("mutates implement prompt using single-session fallback when sessionID misses", async () => {
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "do the implementation",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("# Implement Agent Task");
    expect(output.args.prompt).toContain("Demo PRD");
    expect(output.args.prompt).toContain("do the implementation");
    // Marker must be at the top so generated agent definitions can detect
    // successful injection via a prefix check.
    expect(output.args.prompt.startsWith("<!-- trellis-hook-injected -->")).toBe(
      true,
    );
  });

  it("indexes JSONL references without inlining bodies and bounds task context", async () => {
    const specPath = join(dir, ".trellis", "spec", "demo.md");
    mkdirSync(join(dir, ".trellis", "spec"), { recursive: true });
    const marker = "UNIQUE_SPEC_MARKER_42";
    writeFileSync(specPath, `${marker}\n${"x".repeat(2 * 1024 * 1024)}`);
    writeFileSync(
      join(dir, ".trellis", "tasks", "demo-task", "implement.jsonl"),
      [
        JSON.stringify({
          file: ".trellis/spec/demo.md",
          reason: "OpenCode metadata reason",
        }),
        JSON.stringify({
          path: ".trellis/spec",
          type: "directory",
          reason: "OpenCode directory",
        }),
        "{bad",
        JSON.stringify({ _example: "seed" }),
      ].join("\n"),
    );
    const taskDir = join(dir, ".trellis", "tasks", "demo-task");
    writeFileSync(join(taskDir, "prd.md"), `PRD_START\n${"界".repeat(90_000)}PRD_END`);
    writeFileSync(join(taskDir, "design.md"), `DESIGN_START\n${"计".repeat(90_000)}`);
    writeFileSync(join(taskDir, "implement.md"), `PLAN_START\n${"划".repeat(90_000)}`);
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/demo-task");

    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "do the implementation",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(Buffer.byteLength(output.args.prompt ?? "", "utf8")).toBeLessThan(
      140 * 1024,
    );
    expect(output.args.prompt).not.toContain(marker);
    expect(output.args.prompt).toContain(".trellis/spec/demo.md");
    expect(output.args.prompt).toContain("OpenCode metadata reason");
    expect(output.args.prompt).toContain("type: file");
    expect(output.args.prompt).toContain("type: directory");
    expect(output.args.prompt).not.toContain("PRD_END");
    expect(output.args.prompt).not.toContain("�");
    expect(output.args.prompt).toContain("load the remainder on demand");
  });

  it("mutates check prompt using Active task hint when runtime resolution fails", async () => {
    // No session file → both session lookup and single-session fallback miss.
    // Hint is the only resolver.
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-check",
        prompt: "Active task: .trellis/tasks/demo-task\n\nplease check",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("# Check Agent Task");
    expect(output.args.prompt).toContain("Demo PRD");
  });

  it("Active task hint takes precedence over single-session fallback", async () => {
    // Set up TWO matches: a session file pointing at demo-task AND a hint
    // pointing at a different task path. Hint should win.
    writeSessionFile(dir, "opencode_sole", ".trellis/tasks/another-task");
    const hintTask = join(dir, ".trellis", "tasks", "hint-task");
    mkdirSync(hintTask, { recursive: true });
    writeFileSync(join(hintTask, "prd.md"), "# Hint PRD\n\nfrom hint");
    writeFileSync(join(hintTask, "implement.jsonl"), "");

    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "Active task: .trellis/tasks/hint-task\n\ngo",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("Hint PRD");
    expect(output.args.prompt).not.toContain("Demo PRD");
  });

  it("emits the trellis-hook-injected marker for research agent too", async () => {
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-research",
        prompt: "investigate something",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    expect(output.args.prompt).toContain("<!-- trellis-hook-injected -->");
    expect(output.args.prompt).toContain("# Research Agent Task");
  });

  it("skips when no task can be resolved through any path", async () => {
    const output: TaskToolOutput = {
      args: {
        subagent_type: "trellis-implement",
        prompt: "implement without context",
      },
    };

    await hooks["tool.execute.before"](
      { tool: "task", sessionID: "stranger" },
      output,
    );

    // Prompt is left untouched when implement/check can't find a task
    expect(output.args.prompt).toBe("implement without context");
  });
});

describe("opencode chat.message subagent skip (issue #264)", () => {
  let dir: string;

  beforeEach(() => {
    dir = setupTrellisProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    contextCollector.clear("subagent-session");
    contextCollector.clear("main-session");
  });

  it("session-start.js early-returns when input.agent is a trellis sub-agent", async () => {
    const hooks = (await sessionStartPlugin({
      directory: dir,
      client: undefined,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [{ type: "text", text: "original" }];

    await hooks["chat.message"](
      { sessionID: "subagent-session", agent: "trellis-implement" },
      { parts },
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("original");
    expect(parts[0].metadata).toBeUndefined();
  });

  it("session-start.js skips trellis-check and trellis-research", async () => {
    const hooks = (await sessionStartPlugin({
      directory: dir,
      client: undefined,
    })) as ChatMessageHooks;

    for (const agent of ["trellis-check", "trellis-research"]) {
      const parts: ChatMessagePart[] = [{ type: "text", text: "untouched" }];
      await hooks["chat.message"](
        { sessionID: "subagent-session", agent },
        { parts },
      );
      expect(parts[0].text).toBe("untouched");
    }
  });

  it("inject-workflow-state.js early-returns when input.agent is a trellis sub-agent", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [{ type: "text", text: "original" }];

    await hooks["chat.message"](
      { sessionID: "subagent-session", agent: "trellis-implement" },
      { parts },
    );

    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe("original");
  });

  it("inject-workflow-state.js still injects breadcrumb for main-session turns", async () => {
    const hooks = (await injectWorkflowStatePlugin({
      directory: dir,
    })) as ChatMessageHooks;
    const parts: ChatMessagePart[] = [{ type: "text", text: "user prompt" }];

    await hooks["chat.message"](
      { sessionID: "main-session", agent: "build" },
      { parts },
    );

    expect(parts[0].text).toContain("<workflow-state>");
    expect(parts[0].text).toContain("user prompt");
  });
});

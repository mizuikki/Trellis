import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { collectPiTemplates } from "../../src/configurators/pi.js";
import {
  getAllAgents,
  getExtensionTemplate,
  getSettingsTemplate,
} from "../../src/templates/pi/index.js";

interface AgentConfig {
  model?: string;
  thinking?: string;
  tools?: string[];
  fallbackModels: string[];
}

interface PiRunConfig {
  model?: string;
  thinking?: string;
  tools?: string[];
}

interface PiExtensionInternals {
  buildContext: (root: string, agent: string, key: string | null) => string;
  readBoundedArtifact: (path: string, displayPath: string) => string;
  renderManifestIndex: (root: string, taskDir: string, jsonlName: string) => string;
  normalizeAgent: (agent: string | undefined) => string;
  isTrellisAgent: (root: string, agent: string) => boolean;
  parseAgentFM: (content: string) => AgentConfig;
  buildPiArgs: (config: PiRunConfig) => string[];
  resolveRunCfg: (
    input: { model?: string; thinking?: string },
    agentCfg: AgentConfig,
    inheritedThinking?: string,
  ) => PiRunConfig;
  cmdHasTrellisCtx: (cmd: string) => boolean;
  shellQuote: (v: string) => string;
  trellisExtension: (pi: {
    registerTool?: (tool: unknown) => void;
    registerShortcut?: (key: string, opts: unknown) => void;
    on?: (event: string, handler: (event: unknown, ctx?: unknown) => unknown) => void;
  }) => void;
}

function loadExtensionInternals(cwd = process.cwd()): PiExtensionInternals {
  const source = `${getExtensionTemplate()}

export {
  buildContext,
  readBoundedArtifact,
  renderManifestIndex,
  normalizeAgent,
  isTrellisAgent,
  parseAgentFM,
  buildPiArgs,
  resolveRunCfg,
  cmdHasTrellisCtx,
  shellQuote,
  trellisExtension,
};
`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = createRequire(import.meta.url);
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const sandboxProcess = Object.create(process) as NodeJS.Process;
  const sandboxEnv = { ...process.env };
  delete sandboxEnv.TRELLIS_SUBAGENT_CHILD;
  Object.defineProperty(sandboxProcess, "cwd", { value: () => cwd });
  Object.defineProperty(sandboxProcess, "env", { value: sandboxEnv });
  const sandbox = vm.createContext({
    Buffer,
    console,
    exports: moduleObject.exports,
    module: moduleObject,
    process: sandboxProcess,
    require,
  });
  vm.runInContext(compiled, sandbox);
  return moduleObject.exports as unknown as PiExtensionInternals;
}

function createMinimalTrellisRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "trellis-pi-355-"));
  mkdirSync(join(root, ".pi"), { recursive: true });
  mkdirSync(join(root, ".trellis", "scripts"), { recursive: true });
  writeFileSync(
    join(root, ".trellis", "workflow.md"),
    [
      "[workflow-state:no_task]",
      "No active task. First classify the current turn and ask for task-creation consent before creating any Trellis task.",
      "[/workflow-state:no_task]",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, ".trellis", "scripts", "get_context.py"),
    [
      "#!/usr/bin/env python3",
      "import sys",
      "if '--mode' in sys.argv and 'phase' in sys.argv:",
      "    print('## Phase Index\\nPhase 1: Plan')",
      "else:",
      "    print('SESSION CONTEXT\\nCurrent task: none.')",
      "",
    ].join("\n"),
  );
  return root;
}

describe("pi templates", () => {
  it("buildContext renders bounded metadata indexes and UTF-8-safe task artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "trellis-pi-bounded-context-"));
    const task = join(root, ".trellis", "tasks", "bounded-context");
    mkdirSync(join(root, ".git"), { recursive: true });
    mkdirSync(join(root, ".trellis", ".runtime", "sessions"), { recursive: true });
    mkdirSync(join(root, ".trellis", "spec"), { recursive: true });
    mkdirSync(task, { recursive: true });
    writeFileSync(
      join(root, ".trellis", ".runtime", "sessions", "pi_bounded.json"),
      JSON.stringify({ current_task: ".trellis/tasks/bounded-context" }),
    );
    const marker = "PI_REFERENCED_BODY_MARKER";
    writeFileSync(
      join(root, ".trellis", "spec", "large.md"),
      `${marker}\n${"x".repeat(2 * 1024 * 1024)}`,
    );
    writeFileSync(
      join(task, "implement.jsonl"),
      [
        JSON.stringify({ file: ".trellis/spec/large.md", reason: "Pi metadata reason" }),
        JSON.stringify({ path: ".trellis/spec", type: "directory", reason: "Pi directory" }),
        "{bad",
      ].join("\n"),
    );
    writeFileSync(join(task, "prd.md"), `PRD_START\n${"界".repeat(90_000)}PRD_END`);
    writeFileSync(join(task, "design.md"), `DESIGN_START\n${"计".repeat(90_000)}`);
    writeFileSync(join(task, "implement.md"), `PLAN_START\n${"划".repeat(90_000)}`);

    const context = loadExtensionInternals(root).buildContext(
      root,
      "trellis-implement",
      "pi_bounded",
    );

    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).not.toContain(marker);
    expect(context).toContain(".trellis/spec/large.md");
    expect(context).toContain("Pi metadata reason");
    expect(context).toContain("type: file");
    expect(context).toContain("type: directory");
    expect(context).not.toContain("PRD_END");
    expect(context).not.toContain("�");
    expect(context).toContain("load the remainder on demand");
    expect(context).toContain(".trellis/tasks/bounded-context/design.md");
    expect(context).toContain(".trellis/tasks/bounded-context/implement.md");
    expect(context).not.toContain(task);
  });

  it("enforces Pi artifact, entry, source, and rendered-index limits", () => {
    const root = mkdtempSync(join(tmpdir(), "trellis-pi-all-limits-"));
    const task = join(root, ".trellis", "tasks", "limits");
    mkdirSync(task, { recursive: true });
    const internals = loadExtensionInternals(root);
    const artifactPath = join(task, "prd.md");
    writeFileSync(artifactPath, `START\n${"界".repeat(90_000)}END`);
    const artifact = internals.readBoundedArtifact(artifactPath, ".trellis/tasks/limits/prd.md");
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain("Truncated .trellis/tasks/limits/prd.md at 65536 UTF-8 bytes");
    expect(artifact).not.toContain("�");

    const manifestPath = join(task, "implement.jsonl");
    writeFileSync(
      manifestPath,
      Array.from({ length: 257 }, (_, index) =>
        JSON.stringify({ file: `.trellis/spec/${index}.md`, reason: `entry ${index}` }),
      ).join("\n"),
    );
    const entryLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(entryLimited.match(/^- path:/gm)).toHaveLength(256);
    expect(entryLimited).toContain("Omitted additional entries from implement.jsonl after 256");

    writeFileSync(
      manifestPath,
      Array.from({ length: 257 }, (_, index) =>
        JSON.stringify({
          file: `.trellis/spec/${index}.md`,
          reason: "r".repeat(43),
        }),
      ).join("\n"),
    );
    const noticeLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(Buffer.byteLength(noticeLimited, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(noticeLimited).toContain(
      "Omitted additional entries from implement.jsonl after 256",
    );
    expect(noticeLimited).not.toContain("�");

    writeFileSync(
      manifestPath,
      Array.from({ length: 256 }, (_, index) =>
        JSON.stringify({ file: `.trellis/spec/long-${index}.md`, reason: `${index}-${"r".repeat(500)}` }),
      ).join("\n"),
    );
    const indexLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(Buffer.byteLength(indexLimited, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(indexLimited).toContain("Truncated rendered index for implement.jsonl");
    expect(indexLimited).not.toContain("�");

    writeFileSync(
      manifestPath,
      `${JSON.stringify({ file: ".trellis/spec/first.md", reason: "first" })}\n${"x".repeat(300 * 1024)}`,
    );
    const sourceLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(sourceLimited).toContain("path: .trellis/spec/first.md");
    expect(sourceLimited).toContain("Stopped reading implement.jsonl after 262144 bytes");

    mkdirSync(join(root, ".trellis", "spec"), { recursive: true });
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
    const boundaryChecked = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(boundaryChecked).not.toContain("Parent escape");
    expect(boundaryChecked).not.toContain("Outside escape");
    expect(boundaryChecked).toContain("path: .trellis/spec");
    expect(boundaryChecked).toContain("type: directory");
    expect(boundaryChecked).toContain("Valid directory");
  });

  it("hardens Pi Unicode reasons, post-decode artifacts, and path-only dedup", () => {
    const root = mkdtempSync(join(tmpdir(), "trellis-pi-unicode-dedup-"));
    const task = join(root, ".trellis", "tasks", "limits");
    mkdirSync(task, { recursive: true });
    const internals = loadExtensionInternals(root);
    const manifestPath = join(task, "implement.jsonl");

    writeFileSync(
      manifestPath,
      '{"file":".trellis/spec/surrogate.md","reason":"before\\ud800after"}\n',
    );
    const surrogateIndex = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(surrogateIndex).toContain("path: .trellis/spec/surrogate.md");
    expect(surrogateIndex).toContain("before");
    expect(surrogateIndex).toContain("after");
    expect(Buffer.from(surrogateIndex, "utf8").toString("utf8")).toBe(surrogateIndex);

    const emojiReason = `${"x".repeat(236)}😀${"y".repeat(10)}`;
    writeFileSync(
      manifestPath,
      JSON.stringify({ file: ".trellis/spec/emoji.md", reason: emojiReason }),
    );
    const emojiIndex = internals.renderManifestIndex(root, task, "implement.jsonl");
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
    const artifact = internals.readBoundedArtifact(artifactPath, ".trellis/tasks/limits/prd.md");
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain("Truncated .trellis/tasks/limits/prd.md at 65536 UTF-8 bytes");
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
    const deduped = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(deduped.match(/path: \.trellis\/spec\/shared\.md/g)).toHaveLength(1);
    expect(deduped).toContain("type: file");
    expect(deduped).toContain("first as file");
    expect(deduped).not.toContain("second as directory");
    expect(deduped).not.toContain("type: directory");
  });

  it("dedupes symlink aliases and reports replacement truncation in aggregate notices", () => {
    const root = mkdtempSync(join(tmpdir(), "trellis-pi-canonical-"));
    const task = join(root, ".trellis", "tasks", "limits");
    const spec = join(root, ".trellis", "spec");
    mkdirSync(task, { recursive: true });
    mkdirSync(spec, { recursive: true });
    writeFileSync(join(spec, "real.md"), "canonical body\n");
    symlinkSync("real.md", join(spec, "alias.md"));
    const internals = loadExtensionInternals(root);
    const manifestPath = join(task, "implement.jsonl");
    writeFileSync(
      manifestPath,
      [
        JSON.stringify({ file: ".trellis/spec/alias.md", reason: "alias first" }),
        JSON.stringify({ file: ".trellis/spec/real.md", reason: "real second" }),
      ].join("\n"),
    );
    const index = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(index.match(/path: \.trellis\/spec\/real\.md/g)).toHaveLength(1);
    expect(index).toContain("alias first");
    expect(index).not.toContain("real second");
    expect(index).not.toContain("path: .trellis/spec/alias.md");

    const invalidBytes = Buffer.alloc(60_000, 0xff);
    writeFileSync(join(task, "prd.md"), invalidBytes);
    writeFileSync(join(task, "design.md"), invalidBytes);
    writeFileSync(join(task, "implement.md"), invalidBytes);
    mkdirSync(join(root, ".trellis", ".runtime", "sessions"), { recursive: true });
    writeFileSync(
      join(root, ".trellis", ".runtime", "sessions", "pi_canon.json"),
      JSON.stringify({ current_task: ".trellis/tasks/limits" }),
    );
    const context = internals.buildContext(root, "trellis-implement", "pi_canon");
    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).toContain("artifact limits applied to");
    expect(context).not.toContain("artifact limits applied to none");
    expect(context).toContain(".trellis/tasks/limits/prd.md");
    expect(context).toContain(".trellis/tasks/limits/design.md");
    expect(context).toContain(".trellis/tasks/limits/implement.md");
  });

  it("accepts manifest entries when the project root is reached through a symlink", () => {
    const realRoot = mkdtempSync(join(tmpdir(), "trellis-pi-real-root-"));
    const aliasParent = mkdtempSync(join(tmpdir(), "trellis-pi-alias-parent-"));
    const aliasRoot = join(aliasParent, "workspace");
    const task = join(realRoot, ".trellis", "tasks", "limits");
    const spec = join(realRoot, ".trellis", "spec");
    mkdirSync(task, { recursive: true });
    mkdirSync(spec, { recursive: true });
    writeFileSync(join(spec, "real.md"), "canonical body\n");
    symlinkSync(realRoot, aliasRoot);
    const internals = loadExtensionInternals(aliasRoot);
    writeFileSync(
      join(task, "implement.jsonl"),
      JSON.stringify({ file: ".trellis/spec/real.md", reason: "via symlink root" }),
    );
    const index = internals.renderManifestIndex(aliasRoot, join(aliasRoot, ".trellis", "tasks", "limits"), "implement.jsonl");
    expect(index).toContain("path: .trellis/spec/real.md");
    expect(index).toContain("via symlink root");
    expect(index).not.toContain("..");
  });

  it("does not treat untruncated artifacts as limited when their body contains notice text", () => {
    const root = mkdtempSync(join(tmpdir(), "trellis-pi-notice-false-positive-"));
    const task = join(root, ".trellis", "tasks", "limits");
    mkdirSync(task, { recursive: true });
    mkdirSync(join(root, ".trellis", ".runtime", "sessions"), { recursive: true });
    const prdPath = ".trellis/tasks/limits/prd.md";
    const embeddedNotice =
      `[Truncated ${prdPath} at 65536 UTF-8 bytes; load the remainder on demand.]`;
    const prd = `PREFIX\n${embeddedNotice}\n${"a".repeat(40_000)}`;
    expect(Buffer.byteLength(prd, "utf8")).toBeLessThan(64 * 1024);
    writeFileSync(join(task, "prd.md"), prd);
    writeFileSync(join(task, "design.md"), `START\n${"界".repeat(90_000)}END`);
    writeFileSync(join(task, "implement.md"), `START\n${"划".repeat(90_000)}END`);
    writeFileSync(
      join(root, ".trellis", ".runtime", "sessions", "pi_notice.json"),
      JSON.stringify({ current_task: ".trellis/tasks/limits" }),
    );
    const context = loadExtensionInternals(root).buildContext(
      root,
      "trellis-implement",
      "pi_notice",
    );
    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    const applied = context.match(/artifact limits applied to ([^;]+)/)?.[1] ?? "";
    expect(applied.length).toBeGreaterThan(0);
    expect(applied).not.toContain("prd.md");
    expect(applied).toContain("design.md");
    expect(applied).toContain("implement.md");
  });

  it("provides the three Trellis sub-agent definitions", () => {
    const agents = getAllAgents();
    expect(agents.map((agent) => agent.name).sort()).toEqual([
      "trellis-check",
      "trellis-implement",
      "trellis-research",
    ]);

    for (const agent of agents) {
      expect(agent.content).toContain(`name: ${agent.name}`);
      expect(agent.content).not.toContain("inject-subagent-context.py");
    }
  });

  it("settings no longer list a private skills root — Pi discovers shared .agents/skills/ natively (#447)", () => {
    const settings = JSON.parse(getSettingsTemplate().content) as {
      enableSkillCommands?: boolean;
      extensions?: string[];
      skills?: string[];
      prompts?: string[];
      packages?: unknown[];
    };

    expect(settings.enableSkillCommands).toBe(true);
    expect(settings.extensions).toEqual(["./extensions/trellis/index.ts"]);
    expect(settings.skills).toBeUndefined();
    expect(settings.prompts).toEqual(["./prompts"]);
    expect(settings.packages).toBeUndefined();
  });

  it("writes shared skills to .agents/skills/, not a private .pi/skills/ root (#447)", () => {
    const templates = collectPiTemplates();

    expect(
      templates.get(".agents/skills/trellis-check/SKILL.md"),
    ).toBeDefined();
    for (const key of templates.keys()) {
      expect(key.startsWith(".pi/skills/")).toBe(false);
    }
  });

  it("collects a manual trellis-start prompt for Pi fallback bootstrap", () => {
    const templates = collectPiTemplates();

    expect(templates.get(".pi/prompts/trellis-start.md")).toContain(
      "# Start Session",
    );
    expect(templates.get(".pi/prompts/trellis-continue.md")).toContain(
      "get_context.py --mode phase",
    );
    expect(templates.get(".pi/prompts/trellis-finish-work.md")).toContain(
      "finish-work",
    );
  });

  it("extension registers the trellis_subagent tool with mode+thinking schema", () => {
    const extension = getExtensionTemplate();

    // Tool name + label avoid collision with community subagent packages.
    expect(extension).toContain('name: "trellis_subagent"');
    expect(extension).toContain('label: "Trellis Subagent"');

    // Schema must declare the three dispatch modes and the thinking enum so the LLM
    // can pick a valid mode and override thinking per call.
    expect(extension).toContain(
      'enum: ["single", "parallel", "chain"]',
    );
    expect(extension).toContain(
      'enum: ["off", "minimal", "low", "medium", "high", "xhigh"]',
    );

    // Dispatch protocol carries the "Active task: <path>" prefix rule.
    expect(extension).toContain("Active task:");
  });

  it("extension wires the Pi events Trellis needs for context flow", () => {
    const extension = getExtensionTemplate();

    // session_start: notify-only welcome
    expect(extension).toContain('pi.on?.("session_start"');
    // input: not used; Trellis must not rewrite submitted user text
    expect(extension).not.toContain('pi.on?.("input"');
    // before_agent_start: preserves system prompt context and persists hidden runtime context
    expect(extension).toContain('pi.on?.("before_agent_start"');
    // context: preserves the existing context-key establishment behavior only
    expect(extension).toContain('pi.on?.("context"');
    // tool_call: inject TRELLIS_CONTEXT_ID into bash commands
    expect(extension).toContain('pi.on?.("tool_call"');
    // tool_result: mark failed/cancelled subagent runs as errors
    expect(extension).toContain('pi.on?.("tool_result"');
  });

  it("keeps user input clean while persisting hidden runtime context", () => {
    const root = createMinimalTrellisRoot();
    const { trellisExtension } = loadExtensionInternals(root);
    const handlers = new Map<
      string,
      (event: unknown, ctx?: unknown) => unknown
    >();

    trellisExtension({
      registerTool: vi.fn(),
      registerShortcut: vi.fn(),
      on(event, handler) {
        handlers.set(event, handler);
      },
    });

    const ctx = {
      sessionManager: { getSessionId: () => "pi-unit-355" },
      ui: { notify: vi.fn() },
    };

    expect(handlers.has("input")).toBe(false);

    const beforeAgentStart = handlers.get("before_agent_start");
    const first = beforeAgentStart?.(
      {
        type: "before_agent_start",
        prompt: "Adjust service routing",
        systemPrompt: "BASE",
        systemPromptOptions: {},
      },
      ctx,
    ) as {
      systemPrompt?: string;
      message: { customType?: string; content?: string; display?: boolean };
    };

    expect(first.systemPrompt).toContain("BASE");
    expect(first.systemPrompt).toContain(
      "Trellis compact SessionStart context",
    );
    expect(first.systemPrompt).toContain("<first-reply-notice>");
    expect(first.systemPrompt).toContain("the user's current request");
    expect(first.systemPrompt).toContain(
      "the user message that triggered this reply",
    );
    expect(first.systemPrompt).toContain("has no clear natural language");
    expect(first.systemPrompt).toContain(
      "explicitly established project communication language",
    );
    expect(first.systemPrompt).toContain("Trellis SessionStart ✓");
    expect(first.systemPrompt).toContain(
      "Continue directly with the user's request",
    );
    expect(first.systemPrompt).toContain(
      "must not alter the language used for the remainder of the response",
    );
    expect(first.systemPrompt).toContain("This notice is one-shot");
    expect(first.systemPrompt).not.toContain("say once in Chinese");
    expect(first.systemPrompt).not.toContain(
      "exactly one short Chinese sentence",
    );
    expect(first.systemPrompt).not.toContain(
      "Trellis SessionStart 已注入：workflow、当前任务状态、开发者身份、git 状态、active tasks、spec 索引已加载。",
    );
    expect(first.systemPrompt).toContain("<trellis-workflow>");
    expect(first.systemPrompt).toContain("Phase 1: Plan");
    expect(first.systemPrompt).toContain("No active Trellis task found");
    expect(first.systemPrompt).not.toContain("<workflow-state>");
    // The system prompt carries startup's session-overview snapshot.
    expect(first.systemPrompt).toContain("<session-overview>");
    expect(first.message).toEqual(
      expect.objectContaining({
        customType: "trellis-runtime-context",
        display: false,
      }),
    );
    expect("role" in first.message).toBe(false);
    expect("timestamp" in first.message).toBe(false);
    expect(first.message.content).not.toContain("BASE");
    expect(first.message.content).not.toContain(
      "Trellis compact SessionStart context",
    );
    expect(first.message.content).toContain("<workflow-state>");
    expect(first.message.content).toContain("Status: no_task");
    expect(first.message.content).toContain("<session-overview>");

    const second = beforeAgentStart?.(
      {
        type: "before_agent_start",
        prompt: "Continue",
        systemPrompt: "BASE",
        systemPromptOptions: {},
      },
      ctx,
    ) as {
      systemPrompt?: string;
      message?: { customType?: string; content?: string; display?: boolean };
    };

    // Provider prefix caches invalidate from byte 0 on any systemPrompt
    // change, so later turns must return the exact same bytes as turn one.
    expect(second.systemPrompt).toBe(first.systemPrompt);
    // Unchanged runtime context is not re-sent: the persisted message from
    // turn one is already in the session history.
    expect(second.message).toBeUndefined();
    expect(handlers.has("context")).toBe(true);
  });

  it("delivers task context changes as persisted messages, not systemPrompt churn", () => {
    const root = createMinimalTrellisRoot();
    const { trellisExtension } = loadExtensionInternals(root);
    const handlers = new Map<
      string,
      (event: unknown, ctx?: unknown) => unknown
    >();

    trellisExtension({
      registerTool: vi.fn(),
      registerShortcut: vi.fn(),
      on(event, handler) {
        handlers.set(event, handler);
      },
    });

    const ctx = {
      sessionManager: { getSessionId: () => "pi-unit-task-update" },
      ui: { notify: vi.fn() },
    };
    const beforeAgentStart = handlers.get("before_agent_start");
    const fire = () =>
      beforeAgentStart?.(
        {
          type: "before_agent_start",
          prompt: "Continue",
          systemPrompt: "BASE",
          systemPromptOptions: {},
        },
        ctx,
      ) as {
        systemPrompt?: string;
        message?: { customType?: string; content?: string; display?: boolean };
      };

    const first = fire();
    expect(first.systemPrompt).toContain("No active Trellis task found");

    // A task is created and activated mid-session.
    const taskDir = join(root, ".trellis", "tasks", "07-07-cache-fix");
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "prd.md"), "# PRD\nStable prefix matters.");
    writeFileSync(
      join(taskDir, "task.json"),
      JSON.stringify({ id: "07-07-cache-fix", status: "in_progress" }),
    );
    mkdirSync(join(root, ".trellis", ".runtime", "sessions"), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".trellis", ".runtime", "sessions", "pi_pi-unit-task-update.json"),
      JSON.stringify({ current_task: "tasks/07-07-cache-fix" }),
    );

    const second = fire();
    // systemPrompt keeps the turn-one snapshot byte-for-byte...
    expect(second.systemPrompt).toBe(first.systemPrompt);
    // ...and the new task context arrives as a persisted hidden message.
    expect(second.message?.customType).toBe("trellis-runtime-context");
    expect(second.message?.content).toContain("<trellis-task-context-update>");
    expect(second.message?.content).toContain("Stable prefix matters.");

    // No further changes -> nothing new to persist.
    const third = fire();
    expect(third.systemPrompt).toBe(first.systemPrompt);
    expect(third.message).toBeUndefined();
  });

  it("extension bash tool_call handler prefixes TRELLIS_CONTEXT_ID", () => {
    const extension = getExtensionTemplate();

    // Bash tool calls get TRELLIS_CONTEXT_ID exported in front so spawned
    // python scripts (e.g. task.py current) inherit session identity.
    expect(extension).toContain('ev.toolName === "bash"');
    expect(extension).toContain("export TRELLIS_CONTEXT_ID=");
    expect(extension).toContain("cmdHasTrellisCtx");
  });

  it("extension tool_result handler marks failed/cancelled subagent runs as errors", () => {
    const extension = getExtensionTemplate();

    expect(extension).toContain('ev.toolName === "trellis_subagent"');
    expect(extension).toContain('r.status === "failed"');
    expect(extension).toContain('r.status === "cancelled"');
    expect(extension).toContain("isError: true");
  });

  it("normalizeAgent prefixes bare names with trellis- and leaves prefixed names alone", () => {
    const { normalizeAgent } = loadExtensionInternals();

    expect(normalizeAgent("implement")).toBe("trellis-implement");
    expect(normalizeAgent("check")).toBe("trellis-check");
    expect(normalizeAgent("trellis-research")).toBe("trellis-research");
    expect(normalizeAgent(undefined)).toBe("trellis-implement");
    expect(normalizeAgent("trellis-custom")).toBe("trellis-custom");
  });

  it("isTrellisAgent gates on a real .pi/agents/*.md definition file", () => {
    const { isTrellisAgent } = loadExtensionInternals();

    const root = mkdtempSync(join(tmpdir(), "trellis-pi-test-"));
    mkdirSync(join(root, ".pi", "agents"), { recursive: true });
    writeFileSync(
      join(root, ".pi", "agents", "trellis-implement.md"),
      "---\nname: trellis-implement\n---\n",
    );

    expect(isTrellisAgent(root, "trellis-implement")).toBe(true);
    expect(isTrellisAgent(root, "trellis-foo")).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it("parseAgentFM reads model/thinking/fallbackModels/tools from agent frontmatter", () => {
    const { parseAgentFM } = loadExtensionInternals();

    // Mixed-case tool names in frontmatter must be normalized to lowercase:
    // Pi's built-in tools are lowercase (read, bash, edit, write, grep, find, ls)
    // and pi applies the allowlist without case normalization, so uppercase names
    // would silently fail to enable any tool.
    const cfg = parseAgentFM(`---
name: reviewer
model: anthropic/claude-sonnet-4
thinking: high
tools: Read, Write, Bash, find, Grep
fallbackModels:
  - openai/gpt-5-mini
  - "google/gemini-2.5-pro"
---
# Reviewer
`);

    expect(cfg).toEqual({
      model: "anthropic/claude-sonnet-4",
      thinking: "high",
      tools: ["read", "write", "bash", "find", "grep"],
      fallbackModels: ["openai/gpt-5-mini", "google/gemini-2.5-pro"],
    });
    // Belt-and-suspenders: no tool name survives with uppercase letters.
    expect(cfg.tools?.every((t) => t === t.toLowerCase())).toBe(true);
  });

  it("buildPiArgs maps PiRunConfig onto Pi CLI args", () => {
    const { buildPiArgs } = loadExtensionInternals();

    // model + thinking → composes "model:thinking" suffix when not already present
    expect(buildPiArgs({ model: "anthropic/claude-sonnet-4", thinking: "high" })).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "anthropic/claude-sonnet-4:high",
    ]);

    // model already has thinking suffix → passed through unchanged
    expect(
      buildPiArgs({ model: "anthropic/claude-sonnet-4:low", thinking: "high" }),
    ).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "anthropic/claude-sonnet-4:low",
    ]);

    // thinking-only (no model) → standalone --thinking flag
    expect(buildPiArgs({ thinking: "minimal" })).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--thinking",
      "minimal",
    ]);

    // thinking=off is suppressed
    expect(buildPiArgs({ model: "gpt-5", thinking: "off" })).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "gpt-5",
    ]);

    // tools → --tools flag
    expect(
      buildPiArgs({ tools: ["Read", "Write", "Bash", "find", "Grep"] }),
    ).toEqual([
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--tools",
      "Read,Write,Bash,find,Grep",
    ]);
  });

  it("resolveRunCfg lets per-call input override agent frontmatter defaults", () => {
    const { resolveRunCfg } = loadExtensionInternals();

    const agentCfg: AgentConfig = {
      model: "anthropic/claude-sonnet-4",
      thinking: "high",
      tools: ["Read", "Write", "Edit", "Bash", "find", "Grep"],
      fallbackModels: [],
    };

    // Per-call model + thinking win over agent config
    expect(
      resolveRunCfg(
        { model: "openai/gpt-5", thinking: "xhigh" },
        agentCfg,
      ),
    ).toEqual({ model: "openai/gpt-5:xhigh", thinking: "xhigh", tools: agentCfg.tools });

    // No overrides → fall back to agent config
    expect(resolveRunCfg({}, agentCfg)).toEqual({
      model: "anthropic/claude-sonnet-4:high",
      thinking: "high",
      tools: agentCfg.tools,
    });

    // Inherited thinking is the last fallback
    expect(
      resolveRunCfg(
        {},
        { model: "gpt-5", fallbackModels: [] },
        "medium",
      ),
    ).toEqual({ model: "gpt-5:medium", thinking: "medium" });
  });

  it("cmdHasTrellisCtx detects already-prefixed bash commands", () => {
    const { cmdHasTrellisCtx } = loadExtensionInternals();

    expect(cmdHasTrellisCtx("export TRELLIS_CONTEXT_ID=foo; ls")).toBe(true);
    expect(cmdHasTrellisCtx("TRELLIS_CONTEXT_ID=foo ls")).toBe(true);
    expect(cmdHasTrellisCtx("env TRELLIS_CONTEXT_ID=foo ls")).toBe(true);
    expect(cmdHasTrellisCtx("ls -la")).toBe(false);
    expect(cmdHasTrellisCtx("")).toBe(false);
  });

  it("shellQuote single-quotes values and escapes embedded single quotes", () => {
    const { shellQuote } = loadExtensionInternals();

    expect(shellQuote("simple")).toBe("'simple'");
    expect(shellQuote("with space")).toBe("'with space'");
    expect(shellQuote("with 'quote'")).toBe("'with '\\''quote'\\'''");
  });

  it("extension forwards TRELLIS_CONTEXT_ID into spawned Pi child env", () => {
    const extension = getExtensionTemplate();

    // The child pi process must inherit TRELLIS_CONTEXT_ID so sub-agent
    // task.py current resolves to the same task.
    expect(extension).toContain("TRELLIS_CONTEXT_ID:");
    expect(extension).toContain("...process.env");
  });

  it("extension validates agent definition before spawning a child pi process", () => {
    const extension = getExtensionTemplate();

    // Non-Trellis agent calls must short-circuit and point users to community
    // subagent packages instead of silently spawning a child pi process with
    // a missing agent definition.
    expect(extension).toContain("isTrellisAgent(root, agentName)");
    expect(extension).toContain("npm:@tintinweb/pi-subagents");
    expect(extension).toContain("npm:pi-subagents");
  });
});

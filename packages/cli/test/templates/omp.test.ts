import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import {
  getAllAgents,
  getExtensionTemplate,
} from "../../src/templates/omp/index.js";
import { collectOmpTemplates } from "../../src/configurators/omp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, "../../src/templates/omp");

type OmpEventHandler = (event: unknown, ctx?: unknown) => unknown;
type OmpExtension = (pi: {
  on: (event: string, handler: OmpEventHandler) => void;
}) => void;

interface OmpExtensionInternals {
  default?: OmpExtension;
  buildTaskContext: (
    projectRoot: string,
    taskDir: string,
    agentType?: "trellis-implement" | "trellis-check" | "trellis-research" | null,
  ) => string;
  readBoundedArtifact: (path: string, displayPath: string) => string;
  renderManifestIndex: (projectRoot: string, taskDir: string, jsonlName: string) => string;
}

function loadOmpExtensionInternals(): OmpExtensionInternals {
  const source = `${getExtensionTemplate()}\nexport { buildTaskContext, readBoundedArtifact, renderManifestIndex };\n`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = createRequire(import.meta.url);
  const moduleObject: { exports: OmpExtensionInternals | Record<string, never> } = {
    exports: {},
  };
  const sandboxProcess = Object.create(process) as NodeJS.Process;
  const sandboxEnv = { ...process.env };
  delete sandboxEnv.TRELLIS_CONTEXT_ID;
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
  return moduleObject.exports as OmpExtensionInternals;
}

function loadOmpExtension(): OmpExtension {
  const extension = loadOmpExtensionInternals().default;
  if (!extension) throw new Error("OMP extension template has no default export");
  return extension;
}

function captureOmpHandlers(): Map<string, OmpEventHandler> {
  const handlers = new Map<string, OmpEventHandler>();
  loadOmpExtension()({
    on: (event, handler) => handlers.set(event, handler),
  });
  return handlers;
}

describe("omp templates", () => {
  it("buildTaskContext bounds metadata indexes and aggregate UTF-8 bytes", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-bounded-context-"));
    const task = path.join(root, ".trellis", "tasks", "bounded-context");
    fs.mkdirSync(path.join(root, ".trellis", "spec"), { recursive: true });
    fs.mkdirSync(task, { recursive: true });
    const marker = "OMP_REFERENCED_BODY_MARKER";
    fs.writeFileSync(
      path.join(root, ".trellis", "spec", "large.md"),
      `${marker}\n${"x".repeat(2 * 1024 * 1024)}`,
    );
    fs.writeFileSync(
      path.join(task, "implement.jsonl"),
      [
        JSON.stringify({ file: ".trellis/spec/large.md", reason: "OMP metadata reason" }),
        JSON.stringify({ path: ".trellis/spec", type: "directory", reason: "OMP directory" }),
        "{bad",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(task, "prd.md"), `PRD_START\n${"界".repeat(90_000)}PRD_END`);
    fs.writeFileSync(path.join(task, "design.md"), `DESIGN_START\n${"计".repeat(90_000)}`);
    fs.writeFileSync(path.join(task, "implement.md"), `PLAN_START\n${"划".repeat(90_000)}`);

    const context = loadOmpExtensionInternals().buildTaskContext(
      root,
      task,
      "trellis-implement",
    );

    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).not.toContain(marker);
    expect(context).toContain(".trellis/spec/large.md");
    expect(context).toContain("OMP metadata reason");
    expect(context).toContain("type: file");
    expect(context).toContain("type: directory");
    expect(context).not.toContain("PRD_END");
    expect(context).not.toContain("�");
    expect(context).toContain("load the remainder on demand");
    expect(context).toContain(`${path.relative(root, task).replace(/\\/g, "/")}/design.md`);
    expect(context).toContain(`${path.relative(root, task).replace(/\\/g, "/")}/implement.md`);
  });

  it("enforces OMP artifact, entry, source, and rendered-index limits", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-all-limits-"));
    const task = path.join(root, ".trellis", "tasks", "limits");
    fs.mkdirSync(task, { recursive: true });
    const internals = loadOmpExtensionInternals();
    const artifactPath = path.join(task, "prd.md");
    fs.writeFileSync(artifactPath, `START\n${"界".repeat(90_000)}END`);
    const artifact = internals.readBoundedArtifact(artifactPath, ".trellis/tasks/limits/prd.md");
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain("Truncated .trellis/tasks/limits/prd.md at 65536 UTF-8 bytes");
    expect(artifact).not.toContain("�");

    const manifestPath = path.join(task, "implement.jsonl");
    fs.writeFileSync(
      manifestPath,
      Array.from({ length: 257 }, (_, index) =>
        JSON.stringify({ file: `.trellis/spec/${index}.md`, reason: `entry ${index}` }),
      ).join("\n"),
    );
    const entryLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(entryLimited.match(/^- path:/gm)).toHaveLength(256);
    expect(entryLimited).toContain("Omitted additional entries from implement.jsonl after 256");

    fs.writeFileSync(
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

    fs.writeFileSync(
      manifestPath,
      Array.from({ length: 256 }, (_, index) =>
        JSON.stringify({ file: `.trellis/spec/long-${index}.md`, reason: `${index}-${"r".repeat(500)}` }),
      ).join("\n"),
    );
    const indexLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(Buffer.byteLength(indexLimited, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(indexLimited).toContain("Truncated rendered index for implement.jsonl");
    expect(indexLimited).not.toContain("�");

    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({ file: ".trellis/spec/first.md", reason: "first" })}\n${"x".repeat(300 * 1024)}`,
    );
    const sourceLimited = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(sourceLimited).toContain("path: .trellis/spec/first.md");
    expect(sourceLimited).toContain("Stopped reading implement.jsonl after 262144 bytes");

    fs.mkdirSync(path.join(root, ".trellis", "spec"), { recursive: true });
    fs.writeFileSync(
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

  it("hardens OMP Unicode reasons, post-decode artifacts, and path-only dedup", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-unicode-dedup-"));
    const task = path.join(root, ".trellis", "tasks", "limits");
    fs.mkdirSync(task, { recursive: true });
    const internals = loadOmpExtensionInternals();
    const manifestPath = path.join(task, "implement.jsonl");

    fs.writeFileSync(
      manifestPath,
      '{"file":".trellis/spec/surrogate.md","reason":"before\\ud800after"}\n',
    );
    const surrogateIndex = internals.renderManifestIndex(root, task, "implement.jsonl");
    expect(surrogateIndex).toContain("path: .trellis/spec/surrogate.md");
    expect(surrogateIndex).toContain("before");
    expect(surrogateIndex).toContain("after");
    expect(Buffer.from(surrogateIndex, "utf8").toString("utf8")).toBe(surrogateIndex);

    const emojiReason = `${"x".repeat(236)}😀${"y".repeat(10)}`;
    fs.writeFileSync(
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

    const artifactPath = path.join(task, "prd.md");
    const invalidBytes = Buffer.alloc(60_000, 0xff);
    fs.writeFileSync(artifactPath, invalidBytes);
    expect(Buffer.byteLength(invalidBytes.toString("utf8"), "utf8")).toBeGreaterThan(64 * 1024);
    const artifact = internals.readBoundedArtifact(artifactPath, ".trellis/tasks/limits/prd.md");
    expect(Buffer.byteLength(artifact, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(artifact).toContain("Truncated .trellis/tasks/limits/prd.md at 65536 UTF-8 bytes");
    expect(Buffer.from(artifact, "utf8").toString("utf8")).toBe(artifact);

    fs.writeFileSync(
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
    const root = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-canonical-"));
    const task = path.join(root, ".trellis", "tasks", "limits");
    const spec = path.join(root, ".trellis", "spec");
    fs.mkdirSync(task, { recursive: true });
    fs.mkdirSync(spec, { recursive: true });
    fs.writeFileSync(path.join(spec, "real.md"), "canonical body\n");
    fs.symlinkSync("real.md", path.join(spec, "alias.md"));
    const internals = loadOmpExtensionInternals();
    const manifestPath = path.join(task, "implement.jsonl");
    fs.writeFileSync(
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
    fs.writeFileSync(path.join(task, "prd.md"), invalidBytes);
    fs.writeFileSync(path.join(task, "design.md"), invalidBytes);
    fs.writeFileSync(path.join(task, "implement.md"), invalidBytes);
    const context = internals.buildTaskContext(root, task, "trellis-implement");
    expect(Buffer.byteLength(context, "utf8")).toBeLessThanOrEqual(128 * 1024);
    expect(context).toContain("artifact limits applied to");
    expect(context).not.toContain("artifact limits applied to none");
    expect(context).toContain(
      `${path.relative(root, task).replace(/\\/g, "/")}/prd.md`,
    );
    expect(context).toContain(
      `${path.relative(root, task).replace(/\\/g, "/")}/design.md`,
    );
    expect(context).toContain(
      `${path.relative(root, task).replace(/\\/g, "/")}/implement.md`,
    );
  });

  it("accepts manifest entries when the project root is reached through a symlink", () => {
    const realRoot = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-real-root-"));
    const aliasParent = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-alias-parent-"));
    const aliasRoot = path.join(aliasParent, "workspace");
    const task = path.join(realRoot, ".trellis", "tasks", "limits");
    const spec = path.join(realRoot, ".trellis", "spec");
    fs.mkdirSync(task, { recursive: true });
    fs.mkdirSync(spec, { recursive: true });
    fs.writeFileSync(path.join(spec, "real.md"), "canonical body\n");
    fs.symlinkSync(realRoot, aliasRoot);
    const internals = loadOmpExtensionInternals();
    fs.writeFileSync(
      path.join(task, "implement.jsonl"),
      JSON.stringify({ file: ".trellis/spec/real.md", reason: "via symlink root" }),
    );
    const index = internals.renderManifestIndex(
      aliasRoot,
      path.join(aliasRoot, ".trellis", "tasks", "limits"),
      "implement.jsonl",
    );
    expect(index).toContain("path: .trellis/spec/real.md");
    expect(index).toContain("via symlink root");
    expect(index).not.toMatch(/\.\.\//);
  });

  it("does not treat untruncated artifacts as limited when their body contains notice text", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "trellis-omp-notice-false-positive-"));
    const task = path.join(root, ".trellis", "tasks", "limits");
    fs.mkdirSync(task, { recursive: true });
    const displayTask = path.relative(root, task).replace(/\\/g, "/");
    const prdDisplay = `${displayTask}/prd.md`;
    const embeddedNotice =
      `[Truncated ${prdDisplay} at 65536 UTF-8 bytes; load the remainder on demand.]`;
    const prd = `PREFIX\n${embeddedNotice}\n${"a".repeat(40_000)}`;
    expect(Buffer.byteLength(prd, "utf8")).toBeLessThan(64 * 1024);
    fs.writeFileSync(path.join(task, "prd.md"), prd);
    fs.writeFileSync(path.join(task, "design.md"), `START\n${"界".repeat(90_000)}END`);
    fs.writeFileSync(path.join(task, "implement.md"), `START\n${"划".repeat(90_000)}END`);
    const context = loadOmpExtensionInternals().buildTaskContext(
      root,
      task,
      "trellis-implement",
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
  });

  it("each agent has non-empty content and name", () => {
    for (const agent of getAllAgents()) {
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.content.length).toBeGreaterThan(0);
    }
  });

  it("getExtensionTemplate returns a non-empty string", () => {
    const extension = getExtensionTemplate();
    expect(extension.length).toBeGreaterThan(0);
  });

  it("extension template contains key markers for OMP integration", () => {
    const extension = getExtensionTemplate();
    expect(extension).toContain("before_agent_start");
    expect(extension).toContain("input");
    expect(extension).toContain("session_start");
    expect(extension).toContain("ExtensionAPI");
  });

  it("extension template avoids known runtime and context-safety regressions", () => {
    const extension = getExtensionTemplate();

    expect(extension).not.toContain("pi.setLabel(");
    expect(extension).not.toContain("process.env.TRELLIS_CONTEXT_ID =");
    expect(extension).toContain('buildContextKey("omp", "session", sessionId)');
    expect(extension).toContain("realpathSync");
    expect(extension).toContain("resolveProjectFile(projectRoot, rawPath)");
    expect(extension).not.toContain("readFileSync(targetPath");
    expect(extension).toContain("if (!key) return null;");
    expect(extension).toContain("return key;");
    expect(extension).toContain(`if (existsSync(candidate)) {
         sessionFilePath = candidate;
      } else {
         return { status: "no_task", taskDir: null, taskTitle: null };
      }
   } else {`);
    expect(extension).toContain(
      "No identity: use single-session fallback only when there is exactly one session file.",
    );
    expect(extension).not.toContain("currentContextKey");
  });

  it("injects the derived context key into the original Bash params", () => {
    const handler = captureOmpHandlers().get("tool_call");
    if (!handler) throw new Error("OMP extension did not register tool_call");
    const params: { command: string; env?: Record<string, string> } = {
      command: "python3 ./.trellis/scripts/task.py current",
      env: { EXISTING: "kept" },
    };

    handler(
      { type: "tool_call", toolName: "bash", toolCallId: "call-1", input: params },
      { sessionManager: { getSessionId: () => "session/a" } },
    );

    expect(params.env?.TRELLIS_CONTEXT_ID).toBe("omp_session_a");
    expect(params.env?.EXISTING).toBe("kept");
  });

  it("preserves an explicit Bash env override and leaves inline assignments untouched", () => {
    const handler = captureOmpHandlers().get("tool_call");
    if (!handler) throw new Error("OMP extension did not register tool_call");
    const command =
      "TRELLIS_CONTEXT_ID=inline python3 ./.trellis/scripts/task.py current";
    const params: { command: string; env?: Record<string, string> } = {
      command,
      env: { TRELLIS_CONTEXT_ID: "explicit" },
    };

    handler(
      { type: "tool_call", toolName: "bash", toolCallId: "call-2", input: params },
      { sessionManager: { getSessionId: () => "session/b" } },
    );

    expect(params.command).toBe(command);
    expect(params.env?.TRELLIS_CONTEXT_ID).toBe("explicit");
  });

  it("does not mutate non-Bash tool params", () => {
    const handler = captureOmpHandlers().get("tool_call");
    if (!handler) throw new Error("OMP extension did not register tool_call");
    const params: Record<string, unknown> = { path: "README.md" };

    handler(
      { type: "tool_call", toolName: "read", toolCallId: "call-3", input: params },
      { sessionManager: { getSessionId: () => "session/c" } },
    );

    expect(params).toEqual({ path: "README.md" });
  });

  it("extension template contains session context injection markers", () => {
    const extension = getExtensionTemplate();
    // R1: Session start rich injection via get_context.py
    expect(extension).toContain("buildSessionContext");
    expect(extension).toContain("trellis-session-context");
    expect(extension).toContain("get_context.py");
    expect(extension).toContain("session-context");
  });

  it("extension template contains sub-agent precision injection markers", () => {
    const extension = getExtensionTemplate();
    // R2: Sub-agent detection via PI_BLOCKED_AGENT
    expect(extension).toContain("PI_BLOCKED_AGENT");
    expect(extension).toContain("detectAgentType");
    expect(extension).toContain("trellis-implement");
    expect(extension).toContain("trellis-check");
    expect(extension).toContain("trellis-research");
    // Agent-type-specific jsonl selection
    expect(extension).toContain("implement.jsonl");
    expect(extension).toContain("check.jsonl");
  });

  it("no settings.json or Python hooks exist in the template directory", () => {
    // OMP is extension-backed: native provider auto-discovers .omp/ subdirs,
    // so no settings.json is needed and no Python hooks should be present.
    expect(fs.existsSync(path.join(templateDir, "settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(templateDir, "hooks"))).toBe(false);

    // Agents must not reference Python hook scripts
    for (const agent of getAllAgents()) {
      expect(agent.content).not.toContain("inject-subagent-context.py");
    }
  });
});

describe("omp command frontmatter", () => {
  it("collectOmpTemplates produces commands with YAML frontmatter", () => {
    const templates = collectOmpTemplates();
    const continueCmd = templates.get(".omp/commands/trellis-continue.md");
    const finishCmd = templates.get(".omp/commands/trellis-finish-work.md");

    expect(continueCmd).toBeDefined();
    expect(finishCmd).toBeDefined();

    // Both must start with YAML frontmatter
    expect(continueCmd).toMatch(/^---\ndescription: .+\n---\n\n/);
    expect(finishCmd).toMatch(
      /^---\ndescription: .+\nargument-hint: .+\n---\n\n/,
    );

    // Neither should retain the H1 heading from the source template
    expect(continueCmd).not.toMatch(/^---[\s\S]*?---\n\n# /);
    expect(finishCmd).not.toMatch(/^---[\s\S]*?---\n\n# /);
  });

  it("collectOmpTemplates does not emit a start command", () => {
    const templates = collectOmpTemplates();
    expect(templates.has(".omp/commands/trellis-start.md")).toBe(false);
  });
});

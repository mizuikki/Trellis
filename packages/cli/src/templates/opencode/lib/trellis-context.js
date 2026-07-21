/**
 * Trellis Context Manager
 *
 * Utility class for OpenCode plugins providing file reading,
 * JSONL parsing, and context building capabilities.
 */

import { appendFileSync, closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from "fs"
import { isAbsolute, join, relative, resolve } from "path"
import { StringDecoder } from "string_decoder"
import { Buffer } from "buffer"
import { platform } from "os"
import { execSync } from "child_process"
import { createHash } from "crypto"
import process from "process"

const PYTHON_CMD = platform() === "win32" ? "python" : "python3"
const MAX_TASK_CONTEXT_BYTES = 128 * 1024
const MAX_TASK_ARTIFACT_BYTES = 64 * 1024
const MAX_MANIFEST_INDEX_BYTES = 32 * 1024
const MAX_MANIFEST_SOURCE_BYTES = 256 * 1024
const MAX_MANIFEST_ENTRIES = 256
const MAX_REASON_CHARS = 240
// Debug logging
const DEBUG_LOG = "/tmp/trellis-plugin-debug.log"

function debugLog(prefix, ...args) {
  const timestamp = new Date().toISOString()
  const msg = `[${timestamp}] [${prefix}] ${args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ")}\n`
  try {
    appendFileSync(DEBUG_LOG, msg)
  } catch {
    // ignore
  }
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function sanitizeKey(raw) {
  const safe = raw.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "")
  return safe ? safe.slice(0, 160) : ""
}

function hashValue(raw) {
  return createHash("sha256").update(raw).digest("hex").slice(0, 24)
}

function lookupString(data, keys) {
  if (!data || typeof data !== "object") return null
  for (const key of keys) {
    const value = stringValue(data[key])
    if (value) return value
  }
  for (const nestedKey of ["input", "properties", "event", "hook_input", "hookInput"]) {
    const nested = data[nestedKey]
    if (nested && typeof nested === "object") {
      const value = lookupString(nested, keys)
      if (value) return value
    }
  }
  return null
}

function buildContextKey(platformName, kind, value) {
  if (kind === "transcript") {
    return `${platformName}_transcript_${hashValue(value)}`
  }
  const safeValue = sanitizeKey(value)
  return safeValue ? `${platformName}_${safeValue}` : `${platformName}_${hashValue(value)}`
}

// Matches `trellis-implement`, `trellis-check`, `trellis-research` exactly.
// Used by chat.message plugins to skip injection inside Trellis sub-agent turns.
const TRELLIS_SUBAGENT_RE = /^trellis-(implement|check|research)$/

/**
 * Return true when the OpenCode `chat.message` input represents a Trellis
 * sub-agent turn. `input.agent` is set by OpenCode when a Task tool spawns a
 * child session with a custom agent (see `packages/opencode/src/tool/task.ts`).
 */
export function isTrellisSubagent(input) {
  if (!input || typeof input !== "object") return false
  const agent = typeof input.agent === "string" ? input.agent.trim() : ""
  return TRELLIS_SUBAGENT_RE.test(agent)
}

/**
 * Trellis Context Manager
 */
export class TrellisContext {
  constructor(directory) {
    this.directory = directory
    debugLog("context", "TrellisContext initialized", { directory })
  }

  // ============================================================
  // Trellis Project Detection
  // ============================================================

  isTrellisProject() {
    return existsSync(join(this.directory, ".trellis"))
  }

  getContextKey(platformInput = null) {
    const override = stringValue(process.env.TRELLIS_CONTEXT_ID)
    if (override) {
      return sanitizeKey(override) || hashValue(override)
    }

    const runID = stringValue(process.env.OPENCODE_RUN_ID)
    if (runID) return buildContextKey("opencode", "session", runID)

    const input = platformInput && typeof platformInput === "object" ? platformInput : null
    if (!input) return null

    const sessionID = lookupString(input, ["session_id", "sessionId", "sessionID"])
    if (sessionID) return buildContextKey("opencode", "session", sessionID)

    const conversationID = lookupString(input, ["conversation_id", "conversationId", "conversationID"])
    if (conversationID) return buildContextKey("opencode", "conversation", conversationID)

    const transcriptPath = lookupString(input, ["transcript_path", "transcriptPath", "transcript"])
    if (transcriptPath) return buildContextKey("opencode", "transcript", transcriptPath)

    return null
  }

  readContext(contextKey) {
    try {
      const contextPath = join(this.directory, ".trellis", ".runtime", "sessions", `${contextKey}.json`)
      if (!existsSync(contextPath)) return null
      return JSON.parse(readFileSync(contextPath, "utf-8"))
    } catch {
      return null
    }
  }

  /**
   * Get active task from session runtime context.
   *
   * Resolution order (mirrors Python `active_task.resolve_active_task`):
   *   1. Lookup the runtime file for the input-derived context key.
   *   2. If that misses and exactly one session runtime file exists locally,
   *      use it (`_resolveSingleSessionFallback`). Refuses to guess when 0 or
   *      ≥2 files exist so multi-window isolation holds.
   */
  getActiveTask(platformInput = null) {
    const contextKey = this.getContextKey(platformInput)
    if (contextKey) {
      const context = this.readContext(contextKey)
      const taskRef = this.normalizeTaskRef(context?.current_task || "")
      if (taskRef) {
        const taskDir = this.resolveTaskDir(taskRef)
        return {
          taskPath: taskRef,
          source: `session:${contextKey}`,
          stale: !taskDir || !existsSync(taskDir),
        }
      }
    }

    const fallback = this._resolveSingleSessionFallback()
    if (fallback) {
      return fallback
    }

    return { taskPath: null, source: "none", stale: false }
  }

  /**
   * Mirror of Python `_resolve_single_session_fallback`. Returns the task
   * pointed at by the sole session runtime file when exactly one exists,
   * else null.
   */
  _resolveSingleSessionFallback() {
    const sessionsDir = join(this.directory, ".trellis", ".runtime", "sessions")
    if (!existsSync(sessionsDir)) return null

    let files
    try {
      files = readdirSync(sessionsDir)
        .filter(name => name.endsWith(".json"))
        .sort()
    } catch {
      return null
    }
    if (files.length !== 1) return null

    const sessionFile = join(sessionsDir, files[0])
    let context
    try {
      context = JSON.parse(readFileSync(sessionFile, "utf-8"))
    } catch {
      return null
    }
    const taskRef = this.normalizeTaskRef(context?.current_task || "")
    if (!taskRef) return null

    const taskDir = this.resolveTaskDir(taskRef)
    const fallbackKey = files[0].replace(/\.json$/, "")
    return {
      taskPath: taskRef,
      source: `session-fallback:${fallbackKey}`,
      stale: !taskDir || !existsSync(taskDir),
    }
  }

  getCurrentTask(platformInput = null) {
    return this.getActiveTask(platformInput).taskPath
  }

  normalizeTaskRef(taskRef) {
    if (!taskRef) {
      return ""
    }

    if (isAbsolute(taskRef)) {
      return taskRef.trim()
    }

    let normalized = taskRef.trim().replace(/\\/g, "/")
    while (normalized.startsWith("./")) {
      normalized = normalized.slice(2)
    }

    if (normalized.startsWith("tasks/")) {
      return `.trellis/${normalized}`
    }

    return normalized
  }

  resolveTaskDir(taskRef) {
    const normalized = this.normalizeTaskRef(taskRef)
    if (!normalized) {
      return null
    }

    if (isAbsolute(normalized)) {
      return normalized
    }

    if (normalized.startsWith(".trellis/")) {
      return join(this.directory, normalized)
    }

    return join(this.directory, ".trellis", "tasks", normalized)
  }

  // ============================================================
  // File Reading Utilities
  // ============================================================

  readFile(filePath) {
    try {
      if (existsSync(filePath)) {
        return readFileSync(filePath, "utf-8")
      }
    } catch {
      // Ignore read errors
    }
    return null
  }

  readProjectFile(relativePath) {
    return this.readFile(join(this.directory, relativePath))
  }

  runScript(scriptPath, cwd = null, contextKey = null) {
    try {
      const result = execSync(`${PYTHON_CMD} "${scriptPath}"`, {
        cwd: cwd || this.directory,
        timeout: 10000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(contextKey ? { TRELLIS_CONTEXT_ID: contextKey } : {}),
        },
      })
      return result || ""
    } catch {
      return ""
    }
  }

  // ============================================================
  // JSONL Reading
  // ============================================================

  readLimitedBytes(filePath, limit) {
    let fd = null
    try {
      fd = openSync(filePath, "r")
      const buffer = Buffer.alloc(limit + 1)
      const count = readSync(fd, buffer, 0, buffer.length, 0)
      return buffer.subarray(0, count)
    } catch {
      return null
    } finally {
      if (fd !== null) {
        try {
          closeSync(fd)
        } catch {
          // Ignore close errors after a failed read.
        }
      }
    }
  }

  utf8Prefix(bytes, limit) {
    return new StringDecoder("utf8").write(bytes.subarray(0, Math.max(0, limit)))
  }

  truncateUtf8(text, limit, notice) {
    const bytes = Buffer.from(text, "utf8")
    if (bytes.length <= limit) return text
    const suffix = Buffer.from(`\n\n${notice}`, "utf8")
    if (suffix.length >= limit) return this.utf8Prefix(suffix, limit)
    return this.utf8Prefix(bytes, limit - suffix.length) + suffix.toString("utf8")
  }

  readBoundedArtifact(filePath, displayPath) {
    const bytes = this.readLimitedBytes(filePath, MAX_TASK_ARTIFACT_BYTES)
    if (!bytes) return ""
    if (bytes.length <= MAX_TASK_ARTIFACT_BYTES) {
      return new StringDecoder("utf8").write(bytes)
    }
    const suffix = Buffer.from(
      `\n\n[Truncated ${displayPath} at ${MAX_TASK_ARTIFACT_BYTES} UTF-8 bytes; load the remainder on demand.]`,
      "utf8",
    )
    return this.utf8Prefix(bytes, MAX_TASK_ARTIFACT_BYTES - suffix.length) + suffix.toString("utf8")
  }

  resolveManifestPath(rawPath) {
    const normalized = typeof rawPath === "string" ? rawPath.trim().replace(/\\/g, "/") : ""
    if (!normalized || isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) return null
    try {
      const root = realpathSync(this.directory)
      const candidate = resolve(root, normalized)
      const rel = relative(root, candidate)
      if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) return null
      let target = candidate
      try {
        target = realpathSync(candidate)
      } catch {
        // Missing entries remain discoverable in the index.
      }
      const targetRel = relative(root, target)
      if (targetRel === ".." || targetRel.startsWith("../") || targetRel.startsWith("..\\") || isAbsolute(targetRel)) return null
      return { path: rel.replace(/\\/g, "/"), target }
    } catch {
      return null
    }
  }

  normalizeReason(value) {
    const reason = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
    if (!reason) return "(no reason provided)"
    return reason.length <= MAX_REASON_CHARS
      ? reason
      : reason.slice(0, MAX_REASON_CHARS - 3) + "..."
  }

  buildManifestIndex(jsonlPath) {
    const sourceBytes = this.readLimitedBytes(jsonlPath, MAX_MANIFEST_SOURCE_BYTES)
    if (!sourceBytes) return ""
    const sourceTruncated = sourceBytes.length > MAX_MANIFEST_SOURCE_BYTES
    let source = new StringDecoder("utf8").write(
      sourceBytes.subarray(0, MAX_MANIFEST_SOURCE_BYTES),
    )
    if (sourceTruncated) {
      const lastNewline = source.lastIndexOf("\n")
      source = lastNewline >= 0 ? source.slice(0, lastNewline) : ""
    }

    const rows = []
    const seen = new Set()
    let entryLimitReached = false
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const entry = JSON.parse(trimmed)
        const rawPath = entry.file || entry.path
        if (typeof rawPath !== "string" || !rawPath.trim()) continue
        const entryType = entry.type === "directory" ? "directory" : "file"
        const resolved = this.resolveManifestPath(rawPath)
        if (!resolved) continue
        const key = `${entryType}:${resolved.path}`
        if (seen.has(key)) continue
        if (rows.length >= MAX_MANIFEST_ENTRIES) {
          entryLimitReached = true
          break
        }
        seen.add(key)
        const fields = [`path: ${resolved.path}`, `type: ${entryType}`]
        try {
          const metadata = statSync(resolved.target)
          if (entryType === "file") fields.push(`bytes: ${metadata.size}`)
          fields.push(`revision: ${metadata.mtimeMs}`)
        } catch {
          fields.push("status: missing-or-unreadable")
        }
        fields.push(`reason: ${this.normalizeReason(entry.reason)}`)
        rows.push(`- ${fields.join(" | ")}`)
      } catch {
        // Seed rows and malformed lines are non-fatal.
      }
    }
    if (rows.length === 0 && !sourceTruncated) return ""
    const displayPath = relative(this.directory, jsonlPath).replace(/\\/g, "/")
    const lines = [`=== ${displayPath} (candidate context index; load sources on demand) ===`, ...rows]
    const limitNotices = []
    if (entryLimitReached) {
      limitNotices.push(`[Omitted additional entries from ${displayPath} after ${MAX_MANIFEST_ENTRIES}; load the manifest on demand.]`)
    }
    if (sourceTruncated) {
      limitNotices.push(`[Stopped reading ${displayPath} after ${MAX_MANIFEST_SOURCE_BYTES} bytes; load the remainder on demand.]`)
    }
    const rendered = lines.join("\n")
    if (Buffer.byteLength(rendered, "utf8") <= MAX_MANIFEST_INDEX_BYTES) {
      return [rendered, ...limitNotices].join("\n")
    }
    return this.truncateUtf8(
      rendered,
      MAX_MANIFEST_INDEX_BYTES,
      [`[Truncated rendered index for ${displayPath}; load the manifest on demand.]`, ...limitNotices].join(" "),
    )
  }

  buildTaskContext(taskDir, jsonlNames) {
    const displayTaskDir = relative(this.directory, taskDir).replace(/\\/g, "/") || "."
    const parts = [`Task directory: ${displayTaskDir}`]
    for (const jsonlName of jsonlNames) {
      const index = this.buildManifestIndex(join(taskDir, jsonlName))
      if (index) parts.push(index)
    }
    const truncatedArtifacts = []
    for (const [name, label] of [
      ["prd.md", "Requirements"],
      ["design.md", "Technical Design"],
      ["implement.md", "Execution Plan"],
    ]) {
      const displayPath = `${displayTaskDir}/${name}`
      try {
        if (statSync(join(taskDir, name)).size > MAX_TASK_ARTIFACT_BYTES) truncatedArtifacts.push(displayPath)
      } catch {
        // Missing task artifacts remain optional.
      }
      const content = this.readBoundedArtifact(join(taskDir, name), displayPath)
      if (content) parts.push(`=== ${displayPath} (${label}) ===\n${content}`)
    }
    return this.truncateUtf8(
      parts.join("\n\n"),
      MAX_TASK_CONTEXT_BYTES,
      `[Task context for ${displayTaskDir} exceeded ${MAX_TASK_CONTEXT_BYTES} bytes; artifact limits applied to ${truncatedArtifacts.join(", ") || "none"}; load the remaining task artifacts and manifest sources on demand.]`,
    )
  }
}

// ============================================================
// Context Collector (for session deduplication)
// ============================================================

class ContextCollector {
  constructor() {
    this.processed = new Set()
  }

  markProcessed(sessionID) {
    this.processed.add(sessionID)
  }

  isProcessed(sessionID) {
    return this.processed.has(sessionID)
  }

  clear(sessionID) {
    this.processed.delete(sessionID)
  }
}

// Singleton instance
export const contextCollector = new ContextCollector()

// Export debug log for plugins
export { debugLog }

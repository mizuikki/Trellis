#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Multi-Platform Sub-Agent Context Injection Hook

Injects task-specific context when sub-agents (implement, check, research) are spawned.

Core Design Philosophy:
- Hook is responsible for injecting all context, subagent works autonomously with complete info
- Each agent has a dedicated jsonl file defining its context
- No resume needed, no segmentation, behavior controlled by code not prompt

Trigger: PreToolUse (before Task tool call)

Context Source: Trellis active task resolver points to task directory
- implement.jsonl - Implement agent dedicated context
- check.jsonl     - Check agent dedicated context
- prd.md          - Requirements document
- design.md       - Technical design for complex tasks
- implement.md    - Execution plan for complex tasks
- codex-review-output.txt - Code Review results
"""
from __future__ import annotations

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# IMPORTANT: Force stdout to use UTF-8 on Windows
# This fixes UnicodeEncodeError when outputting non-ASCII characters
if sys.platform.startswith("win"):
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")  # type: ignore[union-attr]


# =============================================================================
# Path Constants (change here to rename directories)
# =============================================================================

DIR_WORKFLOW = ".trellis"
DIR_SPEC = "spec"
FILE_TASK_JSON = "task.json"

MAX_TASK_CONTEXT_BYTES = 128 * 1024
MAX_TASK_ARTIFACT_BYTES = 64 * 1024
MAX_MANIFEST_INDEX_BYTES = 32 * 1024
MAX_MANIFEST_SOURCE_BYTES = 256 * 1024
MAX_MANIFEST_ENTRIES = 256
MAX_REASON_CHARS = 240

# =============================================================================
# Subagent Constants (change here to rename subagent types)
# =============================================================================

AGENT_IMPLEMENT = "trellis-implement"
AGENT_CHECK = "trellis-check"
AGENT_RESEARCH = "trellis-research"

# Agents that require a task directory
AGENTS_REQUIRE_TASK = (AGENT_IMPLEMENT, AGENT_CHECK)
# All supported agents
AGENTS_ALL = (AGENT_IMPLEMENT, AGENT_CHECK, AGENT_RESEARCH)


def find_repo_root(start_path: str) -> str | None:
    """
    Find git repo root from start_path upwards

    Returns:
        Repo root path, or None if not found
    """
    current = Path(start_path).resolve()
    while current != current.parent:
        if (current / ".git").exists():
            return str(current)
        current = current.parent
    return None


def _detect_platform(input_data: dict) -> str | None:
    if _hook_event_name(input_data) == "SubagentStart":
        return "codex"
    if isinstance(input_data.get("cursor_version"), str):
        return "cursor"
    env_map = {
        "ZCODE_PROJECT_DIR": "zcode",
        "CLAUDE_PROJECT_DIR": "claude",
        "CURSOR_PROJECT_DIR": "cursor",
        "CODEBUDDY_PROJECT_DIR": "codebuddy",
        "FACTORY_PROJECT_DIR": "droid",
        "GEMINI_PROJECT_DIR": "gemini",
        "QODER_PROJECT_DIR": "qoder",
        "KIRO_PROJECT_DIR": "kiro",
        "COPILOT_PROJECT_DIR": "copilot",
    }
    for env_name, platform in env_map.items():
        if os.environ.get(env_name):
            return platform
    script_parts = set(Path(sys.argv[0]).parts)
    if ".claude" in script_parts:
        return "claude"
    if ".cursor" in script_parts:
        return "cursor"
    if ".gemini" in script_parts:
        return "gemini"
    if ".qoder" in script_parts:
        return "qoder"
    if ".codebuddy" in script_parts:
        return "codebuddy"
    if ".factory" in script_parts:
        return "droid"
    if ".kiro" in script_parts:
        return "kiro"
    if ".zcode" in script_parts:
        return "zcode"
    return None


def get_current_task(
    repo_root: str,
    input_data: dict,
    *,
    platform: str | None = None,
    allow_single_session_fallback: bool = True,
    allow_environment_context: bool = True,
    require_existing: bool = False,
) -> str | None:
    """Resolve current task directory through the unified active task resolver."""
    scripts_dir = Path(repo_root) / DIR_WORKFLOW / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    try:
        from common.active_task import resolve_active_task  # type: ignore[import-not-found]
    except Exception:
        return None

    active = resolve_active_task(
        Path(repo_root),
        input_data,
        platform=platform or _detect_platform(input_data),
        allow_single_session_fallback=allow_single_session_fallback,
        allow_environment_context=allow_environment_context,
    )
    if require_existing and active.stale:
        return None
    return active.task_path


def _truncate_utf8(text: str, limit: int, notice: str) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= limit:
        return text
    suffix = f"\n\n{notice}".encode("utf-8")
    if len(suffix) >= limit:
        return suffix[:limit].decode("utf-8", errors="ignore")
    prefix = encoded[: limit - len(suffix)].decode("utf-8", errors="ignore")
    return prefix + suffix.decode("utf-8")


def _read_bounded_artifact(repo_root: str, relative_path: str) -> str | None:
    full_path = Path(repo_root) / relative_path
    try:
        with full_path.open("rb") as stream:
            raw = stream.read(MAX_TASK_ARTIFACT_BYTES + 1)
    except OSError:
        return None
    text = raw.decode("utf-8", errors="replace")
    if len(raw) <= MAX_TASK_ARTIFACT_BYTES:
        return text
    notice = (
        f"[Truncated {relative_path} at {MAX_TASK_ARTIFACT_BYTES} UTF-8 bytes; "
        "load the remainder on demand.]"
    )
    return _truncate_utf8(text, MAX_TASK_ARTIFACT_BYTES, notice)


def _normalize_reason(value: object) -> str:
    reason = " ".join(value.split()) if isinstance(value, str) else ""
    if not reason:
        return "(no reason provided)"
    if len(reason) <= MAX_REASON_CHARS:
        return reason
    return reason[: MAX_REASON_CHARS - 3] + "..."


def _resolve_manifest_entry(
    repo_root: Path, raw_path: str, entry_type: str, reason: str
) -> tuple[str, str, str, int | None, int | None, str | None] | None:
    normalized = raw_path.strip().replace("\\", "/")
    if not normalized or normalized.startswith("/") or re.match(r"^[A-Za-z]:/", normalized):
        return None
    root = repo_root.resolve()
    candidate = (root / normalized).resolve()
    try:
        display_path = candidate.relative_to(root).as_posix()
    except ValueError:
        return None

    size: int | None = None
    revision: int | None = None
    status: str | None = None
    try:
        metadata = candidate.stat()
        revision = metadata.st_mtime_ns
        if entry_type == "file":
            size = metadata.st_size
    except FileNotFoundError:
        status = "missing"
    except OSError:
        status = "unreadable"

    return display_path, entry_type, reason, size, revision, status


def _render_manifest_entry(
    entry: tuple[str, str, str, int | None, int | None, str | None],
) -> str:
    path, entry_type, reason, size, revision, status = entry
    fields = [f"path: {path}", f"type: {entry_type}"]
    if size is not None:
        fields.append(f"bytes: {size}")
    if revision is not None:
        fields.append(f"revision: {revision}")
    if status:
        fields.append(f"status: {status}")
    fields.append(f"reason: {reason}")
    return "- " + " | ".join(fields)


def read_jsonl_index(base_path: str, jsonl_path: str) -> str:
    full_path = Path(base_path) / jsonl_path
    try:
        with full_path.open("rb") as stream:
            raw = stream.read(MAX_MANIFEST_SOURCE_BYTES + 1)
    except FileNotFoundError:
        print(
            f"[inject-subagent-context] WARN: {jsonl_path} not found — "
            f"sub-agent will receive only task artifacts",
            file=sys.stderr,
        )
        return ""
    except OSError:
        return ""

    source_truncated = len(raw) > MAX_MANIFEST_SOURCE_BYTES
    source = raw[:MAX_MANIFEST_SOURCE_BYTES].decode("utf-8", errors="ignore")
    if source_truncated:
        last_newline = source.rfind("\n")
        source = source[:last_newline] if last_newline >= 0 else ""

    entries: list[tuple[str, str, str, int | None, int | None, str | None]] = []
    seen: set[tuple[str, str]] = set()
    entry_limit_reached = False
    saw_real_entry = False
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            item = json.loads(stripped)
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(item, dict):
            continue
        file_path = item.get("file") or item.get("path")
        if not isinstance(file_path, str) or not file_path.strip():
            continue
        saw_real_entry = True
        entry_type = "directory" if item.get("type") == "directory" else "file"
        entry = _resolve_manifest_entry(
            Path(base_path), file_path, entry_type, _normalize_reason(item.get("reason"))
        )
        if entry is None:
            continue
        key = (entry[0], entry[1])
        if key in seen:
            continue
        if len(entries) >= MAX_MANIFEST_ENTRIES:
            entry_limit_reached = True
            break
        seen.add(key)
        entries.append(entry)

    if not saw_real_entry:
        print(
            f"[inject-subagent-context] WARN: {jsonl_path} has no curated "
            f"entries (only seed / empty) — sub-agent will receive only "
            f"task artifacts. See workflow.md planning artifact guidance.",
            file=sys.stderr,
        )
    if not entries and not source_truncated:
        return ""

    lines = [f"=== {jsonl_path} (candidate context index; load sources on demand) ==="]
    lines.extend(_render_manifest_entry(entry) for entry in entries)
    limit_notices: list[str] = []
    if entry_limit_reached:
        limit_notices.append(
            f"[Omitted additional entries from {jsonl_path} after "
            f"{MAX_MANIFEST_ENTRIES}; load the manifest on demand.]"
        )
    if source_truncated:
        limit_notices.append(
            f"[Stopped reading {jsonl_path} after {MAX_MANIFEST_SOURCE_BYTES} bytes; "
            "load the remainder on demand.]"
        )
    rendered = "\n".join(lines)
    if len(rendered.encode("utf-8")) <= MAX_MANIFEST_INDEX_BYTES:
        return "\n".join([rendered, *limit_notices])
    return _truncate_utf8(
        rendered,
        MAX_MANIFEST_INDEX_BYTES,
        " ".join(
            [
                f"[Truncated rendered index for {jsonl_path}; load the manifest on demand.]",
                *limit_notices,
            ]
        ),
    )


def get_agent_context(repo_root: str, task_dir: str, agent_type: str) -> str:
    """Build a bounded metadata index for implement.jsonl or check.jsonl."""
    return read_jsonl_index(repo_root, f"{task_dir}/{agent_type}.jsonl")


def _build_task_context(repo_root: str, task_dir: str, agent_type: str) -> str:
    parts = [f"Task directory: {task_dir}"]
    manifest_index = get_agent_context(repo_root, task_dir, agent_type)
    if manifest_index:
        parts.append(manifest_index)

    artifacts = (
        ("prd.md", "Requirements"),
        ("design.md", "Technical Design"),
        ("implement.md", "Execution Plan"),
    )
    truncated_artifacts: list[str] = []
    for name, label in artifacts:
        relative_path = f"{task_dir}/{name}"
        try:
            if (Path(repo_root) / relative_path).stat().st_size > MAX_TASK_ARTIFACT_BYTES:
                truncated_artifacts.append(relative_path)
        except OSError:
            pass
        content = _read_bounded_artifact(repo_root, relative_path)
        if content:
            parts.append(f"=== {relative_path} ({label}) ===\n{content}")

    combined = "\n\n".join(parts)
    return _truncate_utf8(
        combined,
        MAX_TASK_CONTEXT_BYTES,
        f"[Task context for {task_dir} exceeded {MAX_TASK_CONTEXT_BYTES} bytes; "
        f"artifact limits applied to {', '.join(truncated_artifacts) or 'none'}; "
        "load the remaining task artifacts and manifest sources on demand.]",
    )


def get_implement_context(repo_root: str, task_dir: str) -> str:
    """Build bounded task context for the implement agent."""
    return _build_task_context(repo_root, task_dir, "implement")


def get_check_context(repo_root: str, task_dir: str) -> str:
    """Build bounded task context for the check agent."""
    return _build_task_context(repo_root, task_dir, "check")


def get_finish_context(repo_root: str, task_dir: str) -> str:
    """
    Context for Finish phase: reuses check.jsonl + prd.md
    (Finish is a final check, same context source.)
    """
    return get_check_context(repo_root, task_dir)



def build_implement_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Implement"""
    return f"""<!-- trellis-hook-injected -->
# Implement Agent Task

You are the Implement Agent in the Multi-Agent Pipeline.

## Your Context

Task artifacts and a bounded manifest index have been prepared for you. Referenced source bodies remain available on disk for reason-based, on-demand reads:

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Select specs** - Use manifest reasons to select relevant sources; prefer targeted search or ranged reads for large files
2. **Understand task artifacts** - Read requirements, technical design if present, and execution plan if present
3. **Implement feature** - Implement following selected specs and task artifacts
4. **Self-check** - Ensure code quality against check specs

## Important Constraints

- Do NOT execute git commit, only code modifications
- Follow the relevant dev specs selected from the manifest index
- Report list of modified/created files when done"""


def build_check_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Check"""
    return f"""<!-- trellis-hook-injected -->
# Check Agent Task

You are the Check Agent in the Multi-Agent Pipeline (code and cross-layer checker).

## Your Context

Task artifacts and a bounded check-manifest index are prepared below. Referenced source bodies remain available on disk for reason-based, on-demand reads:

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Get changes** - Run `git diff --name-only` and `git diff` to get code changes
2. **Check against specs** - Use manifest reasons to select relevant specs, then check item by item; prefer targeted or ranged reads for large files
3. **Self-fix** - Fix issues directly, don't just report
4. **Run verification** - Run project's lint and typecheck commands

## Important Constraints

- Fix issues yourself, don't just report
- Must execute complete checklist in check specs
- Pay special attention to impact radius analysis (L1-L5)"""


def build_finish_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Finish (final check before PR)"""
    return f"""<!-- trellis-hook-injected -->
# Finish Agent Task

You are performing the final check before creating a PR.

## Your Context

Finish checklist and requirements:

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Review changes** - Run `git diff --name-only` to see all changed files
	2. **Verify task artifacts** - Check requirements in prd.md and, when present, design.md / implement.md
3. **Spec sync** - Analyze whether changes introduce new patterns, contracts, or conventions
   - If new pattern/convention found: read target spec file → update it → update index.md if needed
   - If infra/cross-layer change: follow the 7-section mandatory template from update-spec.md
   - If pure code fix with no new patterns: skip this step
4. **Run final checks** - Execute lint and typecheck
5. **Confirm ready** - Ensure code is ready for PR

## Important Constraints

- You MAY update spec files when gaps are detected (use update-spec.md as guide)
- MUST read the target spec file BEFORE editing (avoid duplicating existing content)
- Do NOT update specs for trivial changes (typos, formatting, obvious fixes)
- If critical CODE issues found, report them clearly (fix specs, not code)
- Verify all acceptance criteria in prd.md are met
- Verify design.md and implement.md constraints when those files are present"""



def get_research_context(repo_root: str, task_dir: str | None) -> str:
    """
    Context for Research Agent — project structure overview for spec directories.

    `task_dir` kept for signature parity with get_implement_context / get_check_context
    so the dispatcher can call them uniformly.
    """
    _ = task_dir
    context_parts = []

    # 1. Project structure overview (dynamically discover spec directories)
    spec_path = f"{DIR_WORKFLOW}/{DIR_SPEC}"
    spec_root = Path(repo_root) / DIR_WORKFLOW / DIR_SPEC

    # Build spec tree dynamically
    tree_lines = [f"{spec_path}/"]
    if spec_root.is_dir():
        pkg_dirs = sorted(d for d in spec_root.iterdir() if d.is_dir())
        for i, pkg_dir in enumerate(pkg_dirs):
            is_last = i == len(pkg_dirs) - 1
            prefix = "└── " if is_last else "├── "
            layers = sorted(d.name for d in pkg_dir.iterdir() if d.is_dir())
            layer_info = f" ({', '.join(layers)})" if layers else ""
            tree_lines.append(f"{prefix}{pkg_dir.name}/{layer_info}")

    spec_tree = "\n".join(tree_lines)

    project_structure = f"""## Project Spec Directory Structure

```
{spec_tree}
```

To get structured package info, run: `python3 ./{DIR_WORKFLOW}/scripts/get_context.py --mode packages`

## Search Tips

- Spec files: `{spec_path}/**/*.md`
- Code search: Use Glob and Grep tools
- Tech solutions: Use mcp__exa__web_search_exa or mcp__exa__get_code_context_exa"""

    context_parts.append(project_structure)

    return "\n\n".join(context_parts)


def build_research_prompt(original_prompt: str, context: str) -> str:
    """Build complete prompt for Research"""
    return f"""# Research Agent Task

You are the Research Agent in the Multi-Agent Pipeline (search researcher).

## Core Principle

**You do one thing: find and explain information.**

You are a documenter, not a reviewer.

## Project Info

{context}

---

## Your Task

{original_prompt}

---

## Workflow

1. **Understand query** - Determine search type (internal/external) and scope
2. **Plan search** - List search steps for complex queries
3. **Execute search** - Execute multiple independent searches in parallel
4. **Organize results** - Output structured report

## Search Tools

| Tool | Purpose |
|------|---------|
| Glob | Search by filename pattern |
| Grep | Search by content |
| Read | Read file content |
| mcp__exa__web_search_exa | External web search |
| mcp__exa__get_code_context_exa | External code/doc search |

## Strict Boundaries

**Only allowed**: Describe what exists, where it is, how it works

**Forbidden** (unless explicitly asked):
- Suggest improvements
- Criticize implementation
- Recommend refactoring
- Modify any files

## Report Format

Provide structured search results including:
- List of files found (with paths)
- Code pattern analysis (if applicable)
- Related spec documents
- External references (if any)"""


def _string_value(value: Any) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped
    return ""


def _hook_event_name(input_data: dict) -> str:
    """Return a hook event name from the documented snake/camel-case fields."""
    return _string_value(
        input_data.get("hook_event_name") or input_data.get("hookEventName")
    )


def _codex_subagent_type(input_data: dict) -> str:
    """Return a Trellis Codex agent type only for a native start event."""
    if _hook_event_name(input_data) != "SubagentStart":
        return ""
    agent_type = _string_value(
        input_data.get("agent_type") or input_data.get("agentType")
    )
    return agent_type if agent_type in AGENTS_ALL else ""


def build_codex_subagent_context(
    subagent_type: str,
    task_dir: str,
    context: str,
) -> str:
    """Build developer context for a native, already-dispatched Codex role."""
    role = subagent_type.removeprefix("trellis-")
    return f"""<!-- trellis-hook-injected -->
# Trellis Native {role.title()} Subagent

You are the dispatched `{subagent_type}` role for this task. Perform that role
directly; do not follow main-session dispatch or wait instructions, and do not
spawn another Trellis subagent.

Active task: {task_dir}

## Curated Context

{context}"""


def _handle_codex_subagent_start(input_data: dict) -> None:
    """Emit Codex developer context for a recognised native Trellis subagent.

    The event supplies the parent session id. Disabling the generic
    single-session fallback is essential here: native starts must never borrow
    a task from another Codex window when that parent id is absent or stale.
    """
    subagent_type = _codex_subagent_type(input_data)
    parent_session_id = _string_value(input_data.get("session_id"))
    if not subagent_type or not parent_session_id:
        return

    cwd = _string_value(input_data.get("cwd")) or os.getcwd()
    repo_root = find_repo_root(cwd)
    if not repo_root:
        return

    task_dir = get_current_task(
        repo_root,
        {"session_id": parent_session_id},
        platform="codex",
        allow_single_session_fallback=False,
        allow_environment_context=False,
        require_existing=True,
    )
    if not task_dir:
        return

    if subagent_type in AGENTS_REQUIRE_TASK:
        task_dir_full = Path(repo_root) / task_dir
        if not task_dir_full.is_dir():
            return

    if subagent_type == AGENT_IMPLEMENT:
        context = get_implement_context(repo_root, task_dir)
    elif subagent_type == AGENT_CHECK:
        context = get_check_context(repo_root, task_dir)
    else:
        context = get_research_context(repo_root, task_dir)

    if not context:
        return

    output = {
        "hookSpecificOutput": {
            "hookEventName": "SubagentStart",
            "additionalContext": build_codex_subagent_context(
                subagent_type, task_dir, context
            ),
        }
    }
    print(json.dumps(output, ensure_ascii=False))


def _extract_subagent_name(value: Any) -> str:
    """Extract a sub-agent name from common platform encodings.

    Cursor's native Task args encode custom sub-agents as a protobuf oneof,
    which can appear in hook JSON as either ``{"custom": {"name": "..."}}``
    or ``{"type": {"case": "custom", "value": {"name": "..."}}}``.
    """
    direct = _string_value(value)
    if direct:
        return direct

    if not isinstance(value, dict):
        return ""

    for key in ("name", "subagent_type_name", "subagentTypeName"):
        direct = _string_value(value.get(key))
        if direct:
            return direct

    custom = value.get("custom")
    if isinstance(custom, dict):
        custom_name = _string_value(custom.get("name"))
        if custom_name:
            return custom_name

    oneof = value.get("type")
    if isinstance(oneof, dict):
        case_name = _string_value(oneof.get("case"))
        if case_name == "custom":
            nested_value = oneof.get("value")
            if isinstance(nested_value, dict):
                custom_name = _string_value(nested_value.get("name"))
                if custom_name:
                    return custom_name
        if case_name:
            return case_name

    case_name = _string_value(value.get("case"))
    if case_name == "custom":
        nested_value = value.get("value")
        if isinstance(nested_value, dict):
            custom_name = _string_value(nested_value.get("name"))
            if custom_name:
                return custom_name
    if case_name:
        return case_name

    for agent_name in AGENTS_ALL:
        if agent_name in value:
            return agent_name

    return ""


def _extract_subagent_type(tool_input: dict) -> str:
    for key in (
        "subagent_type",
        "subagentType",
        "subagent_type_name",
        "subagentTypeName",
        "agent_type",
        "agentType",
        "name",
    ):
        agent_name = _extract_subagent_name(tool_input.get(key))
        if agent_name:
            return agent_name
    return ""


def _parse_hook_input(input_data: dict) -> tuple[str, str, dict]:
    """Parse hook input across different platform formats.

    Returns (subagent_type, original_prompt, tool_input).
    Handles:
    - Claude Code / Qoder / CodeBuddy / Droid: tool_name=Task|Agent, tool_input.subagent_type
    - Cursor: tool_name=Task|Subagent, tool_input.subagent_type
    - Copilot CLI: toolName=task (camelCase key, lowercase value)
    - ZCode: toolName=Agent, toolInput/tool_input.subagent_type
    - Gemini CLI: tool_name IS the agent name (BeforeTool matcher already filtered)
    - Kiro: agentSpawn hook, agent_name field at top level
    """
    tool_input = input_data.get("tool_input", {})
    if not isinstance(tool_input, dict):
        tool_input = input_data.get("toolInput", {})
    if not isinstance(tool_input, dict):
        tool_input = {}

    # Standard format: Task/Agent tool with subagent_type
    tool_name = input_data.get("tool_name", "") or input_data.get("toolName", "")
    if tool_name.lower() in ("task", "agent", "subagent"):
        return (
            _extract_subagent_type(tool_input),
            tool_input.get("prompt", ""),
            tool_input,
        )

    # Kiro: agentSpawn hook passes agent_name at top level
    agent_name = input_data.get("agent_name", "")
    if agent_name:
        return agent_name, tool_input.get("prompt", input_data.get("prompt", "")), tool_input

    # Gemini CLI: BeforeTool where tool_name IS the agent name
    # (matcher already ensured it's one of our agents)
    if tool_name in AGENTS_ALL:
        return tool_name, tool_input.get("prompt", ""), tool_input

    # Copilot CLI: toolName field (camelCase), value might be the agent name
    tool_name_camel = input_data.get("toolName", "")
    if tool_name_camel in AGENTS_ALL:
        return tool_name_camel, input_data.get("toolArgs", ""), tool_input

    return "", "", tool_input


def main():
    if os.environ.get("TRELLIS_HOOKS") == "0" or os.environ.get("TRELLIS_DISABLE_HOOKS") == "1":
        sys.exit(0)

    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    if not isinstance(input_data, dict):
        sys.exit(0)

    if _hook_event_name(input_data) == "SubagentStart":
        try:
            _handle_codex_subagent_start(input_data)
        except Exception:
            # A native context hook must never prevent Codex from spawning the
            # requested child when its runtime state is unavailable or stale.
            pass
        sys.exit(0)

    subagent_type, original_prompt, tool_input = _parse_hook_input(input_data)
    cwd = input_data.get("cwd", os.getcwd())

    # Only handle subagent types we care about
    if subagent_type not in AGENTS_ALL:
        sys.exit(0)

    # Find repo root
    repo_root = find_repo_root(cwd)
    if not repo_root:
        sys.exit(0)

    # Get current task directory (research doesn't require it)
    task_dir = get_current_task(repo_root, input_data)

    # implement/check need task directory
    if subagent_type in AGENTS_REQUIRE_TASK:
        if not task_dir:
            sys.exit(0)
        # Check if task directory exists
        task_dir_full = os.path.join(repo_root, task_dir)
        if not os.path.exists(task_dir_full):
            sys.exit(0)

    # Check for [finish] marker in prompt (check agent with finish context)
    is_finish_phase = "[finish]" in original_prompt.lower()

    # Get context and build prompt based on subagent type
    if subagent_type == AGENT_IMPLEMENT:
        assert task_dir is not None  # validated above
        context = get_implement_context(repo_root, task_dir)
        new_prompt = build_implement_prompt(original_prompt, context)
    elif subagent_type == AGENT_CHECK:
        assert task_dir is not None  # validated above
        if is_finish_phase:
            # Finish phase: use finish context (lighter, focused on final verification)
            context = get_finish_context(repo_root, task_dir)
            new_prompt = build_finish_prompt(original_prompt, context)
        else:
            # Regular check phase: use check context (full specs for self-fix loop)
            context = get_check_context(repo_root, task_dir)
            new_prompt = build_check_prompt(original_prompt, context)
    elif subagent_type == AGENT_RESEARCH:
        # Research can work without task directory
        context = get_research_context(repo_root, task_dir)
        new_prompt = build_research_prompt(original_prompt, context)
    else:
        sys.exit(0)

    if not context:
        sys.exit(0)

    # Return updated input. Most platforms ignore unrecognized fields, so we
    # include multiple formats. ZCode is stricter; live probing confirmed the
    # nested Claude-compatible shape below reaches the sub-agent prompt.
    updated = {**tool_input, "prompt": new_prompt}
    if _detect_platform(input_data) == "zcode":
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "updatedInput": updated,
            }
        }
    else:
        output = {
            # Claude Code / Qoder / CodeBuddy / Droid format
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "updatedInput": updated,
            },
            # Cursor format
            "permission": "allow",
            "updated_input": updated,
            # Gemini format
            "updatedInput": updated,
        }

    print(json.dumps(output, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()

"""Task planning artifact lifecycle and scaffold operations."""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .paths import FILE_TASK_JSON, get_repo_root, get_tasks_dir


ArtifactKind = Literal["design", "implement"]
ReadinessCode = Literal[
    "missing",
    "ready",
    "error_invalid_target",
    "error_unreadable",
    "error_invalid_utf8",
    "error_empty",
    "error_unfilled",
]
ScaffoldCode = Literal["created", "skipped_exists", "error_invalid_target", "error_write"]

SCAFFOLD_SENTINEL = "<!-- trellis:scaffold-unfilled -->"
_ARTIFACT_FILENAMES: dict[ArtifactKind, str] = {
    "design": "design.md",
    "implement": "implement.md",
}


@dataclass(frozen=True)
class ArtifactReadiness:
    """Readiness of one optional planning artifact."""

    kind: ArtifactKind
    path: Path
    code: ReadinessCode
    message: str = ""

    @property
    def present(self) -> bool:
        return self.code != "missing"

    @property
    def ready(self) -> bool:
        return self.code in ("missing", "ready")


@dataclass(frozen=True)
class ScaffoldResult:
    """Result of attempting to scaffold one artifact."""

    kind: ArtifactKind
    filename: str
    code: ScaffoldCode
    message: str = ""

    @property
    def succeeded(self) -> bool:
        return self.code in ("created", "skipped_exists")


@dataclass(frozen=True)
class _TaskTarget:
    directory: Path
    resolved_directory: Path
    device: int
    inode: int
    title: str


class TaskArtifactError(ValueError):
    """A scaffold task reference or metadata failed validation."""


def _default_design_content(title: str) -> str:
    """Return the canonical design scaffold body."""
    return f"""# Design - {title}
{SCAFFOLD_SENTINEL}

## Boundary
<!-- optional label D-BOUND: fill before start review -->
<!-- What changes, what does not, and where are the boundaries with neighbors? -->

## Mechanisms and Decisions
<!-- optional label D-MECH: split into multiple H2s if needed -->
<!-- Describe key ownership, algorithms, responsibilities, and decisions.
Add dedicated Flow or Contracts content when those triggers apply. -->

## Risks, Compatibility, and Failure Modes
<!-- optional label D-RISK: strategy only; concrete rollback steps go in implement.md -->

<!-- Add only when triggered or useful: System Overview, Data & Control Flow,
Contracts, Alternatives Considered, Test Strategy, Design Conclusions.
Do not leave empty Optional sections. -->
"""


def _default_implement_content(title: str) -> str:
    """Return the canonical implementation scaffold body."""
    return f"""# Implement - {title}
{SCAFFOLD_SENTINEL}

## Ordered Checklist
<!-- optional label I-STEPS -->
- [ ] ...

## Validation
<!-- optional label I-VAL: commands and/or matrix; verification must be reproducible -->
<!-- Reference design test strategy; do not restate architecture. -->

## Rollback
<!-- optional label I-ROLL: concrete steps, files, and commands; N/A requires a reason -->

## Task-specific Exit Criteria
<!-- optional label I-EXIT: unresolved blockers and task-specific gates;
reference the global Trellis workflow rather than copying its standard checklist. -->
"""


def _lstat(path: Path) -> os.stat_result | None:
    try:
        return path.lstat()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise TaskArtifactError(f"cannot inspect {path.name}: {exc}") from exc


def _is_plain_name(task_input: str) -> bool:
    return not Path(task_input).is_absolute() and "/" not in task_input and "\\" not in task_input


def _candidate_from_path(task_input: str, repo_root: Path) -> Path:
    normalized = task_input.replace("\\", "/")
    candidate = Path(normalized)
    return candidate if candidate.is_absolute() else repo_root / candidate


def _select_task_candidate(task_input: str, repo_root: Path) -> Path:
    if not task_input.strip():
        raise TaskArtifactError("task directory or name required")

    if not _is_plain_name(task_input):
        return _candidate_from_path(task_input, repo_root)

    tasks_dir = get_tasks_dir(repo_root)
    exact = tasks_dir / task_input
    if _lstat(exact) is not None:
        return exact

    try:
        matches = sorted(
            entry
            for entry in tasks_dir.iterdir()
            if entry.name != "archive" and entry.name.endswith(f"-{task_input}")
        )
    except OSError as exc:
        raise TaskArtifactError(f"cannot inspect live tasks: {exc}") from exc

    if not matches:
        raise TaskArtifactError(f"unknown task: {task_input}")
    if len(matches) > 1:
        names = ", ".join(path.name for path in matches)
        raise TaskArtifactError(f"ambiguous task '{task_input}': {names}")
    return matches[0]


def _read_task_title(task_json: Path) -> str:
    metadata_stat = _lstat(task_json)
    if metadata_stat is None or not stat.S_ISREG(metadata_stat.st_mode) or task_json.is_symlink():
        raise TaskArtifactError("task.json must be a non-symlink regular file")

    try:
        raw = task_json.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise TaskArtifactError("task.json must be valid UTF-8") from exc
    except OSError as exc:
        raise TaskArtifactError(f"cannot read task.json: {exc}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise TaskArtifactError(f"task.json is malformed: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise TaskArtifactError("task.json must contain a JSON object")
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        raise TaskArtifactError("task.json must contain a non-empty string title")
    return title.strip()


def resolve_scaffold_task(task_input: str, repo_root: Path | None = None) -> _TaskTarget:
    """Resolve and validate a scaffold target inside the live task directory."""
    root = (repo_root or get_repo_root()).resolve()
    tasks_dir = get_tasks_dir(root)
    candidate = _select_task_candidate(task_input, root)
    candidate_stat = _lstat(candidate)
    if candidate_stat is None:
        raise TaskArtifactError(f"unknown task: {task_input}")
    if candidate.is_symlink() or not stat.S_ISDIR(candidate_stat.st_mode):
        raise TaskArtifactError("task must be a non-symlink directory")

    try:
        resolved = candidate.resolve(strict=True)
        tasks_resolved = tasks_dir.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise TaskArtifactError(f"cannot resolve task boundary: {exc}") from exc
    if resolved.parent != tasks_resolved or resolved.name == "archive":
        raise TaskArtifactError("task must be a live direct child of .trellis/tasks")

    title = _read_task_title(candidate / FILE_TASK_JSON)
    return _TaskTarget(
        directory=candidate,
        resolved_directory=resolved,
        device=candidate_stat.st_dev,
        inode=candidate_stat.st_ino,
        title=title,
    )


def _revalidate_task(target: _TaskTarget) -> str | None:
    try:
        current = target.directory.lstat()
        resolved = target.directory.resolve(strict=True)
    except (FileNotFoundError, OSError, RuntimeError) as exc:
        return f"task directory changed before scaffold write: {exc}"
    if target.directory.is_symlink() or not stat.S_ISDIR(current.st_mode):
        return "task directory changed before scaffold write"
    if (current.st_dev, current.st_ino) != (target.device, target.inode):
        return "task directory was replaced before scaffold write"
    if resolved != target.resolved_directory:
        return "task directory no longer resolves to the validated location"
    return None


def check_artifact_readiness(task_dir: Path, kind: ArtifactKind) -> ArtifactReadiness:
    """Check the machine-enforced readiness contract for one artifact."""
    path = task_dir / _ARTIFACT_FILENAMES[kind]
    try:
        path_stat = path.lstat()
    except FileNotFoundError:
        return ArtifactReadiness(kind, path, "missing")
    except OSError as exc:
        return ArtifactReadiness(kind, path, "error_unreadable", str(exc))

    if path.is_symlink() or not stat.S_ISREG(path_stat.st_mode):
        return ArtifactReadiness(kind, path, "error_invalid_target", "must be a non-symlink regular file")
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return ArtifactReadiness(kind, path, "error_invalid_utf8", "must be valid UTF-8")
    except OSError as exc:
        return ArtifactReadiness(kind, path, "error_unreadable", str(exc))
    if not content.strip():
        return ArtifactReadiness(kind, path, "error_empty", "must contain reviewed content")
    if SCAFFOLD_SENTINEL in content.splitlines()[:5]:
        return ArtifactReadiness(kind, path, "error_unfilled", "scaffold is still marked unfilled")
    return ArtifactReadiness(kind, path, "ready")


def check_present_artifacts(task_dir: Path) -> tuple[ArtifactReadiness, ...]:
    """Return readiness failures for present design and implement artifacts."""
    results = (check_artifact_readiness(task_dir, "design"), check_artifact_readiness(task_dir, "implement"))
    return tuple(result for result in results if result.present and not result.ready)


def _scaffold_content(kind: ArtifactKind, title: str) -> str:
    return _default_design_content(title) if kind == "design" else _default_implement_content(title)


def _existing_target_result(kind: ArtifactKind, path: Path) -> ScaffoldResult:
    try:
        target_stat = path.lstat()
    except FileNotFoundError:
        return ScaffoldResult(kind, path.name, "error_write", "target disappeared during create")
    except OSError as exc:
        return ScaffoldResult(kind, path.name, "error_invalid_target", str(exc))
    if not path.is_symlink() and stat.S_ISREG(target_stat.st_mode):
        return ScaffoldResult(kind, path.name, "skipped_exists")
    return ScaffoldResult(kind, path.name, "error_invalid_target", "existing path is not a regular file")


def scaffold_artifact(target: _TaskTarget, kind: ArtifactKind) -> ScaffoldResult:
    """Create one canonical scaffold without overwriting any existing path.

    The task directory is revalidated immediately before the exclusive create.
    This protects target-file races and assumes the validated parent directory is
    not adversarially replaced during the final filesystem-call window.
    """
    filename = _ARTIFACT_FILENAMES[kind]
    path = target.directory / filename
    parent_error = _revalidate_task(target)
    if parent_error:
        return ScaffoldResult(kind, filename, "error_invalid_target", parent_error)

    try:
        path_stat = path.lstat()
    except FileNotFoundError:
        path_stat = None
    except OSError as exc:
        return ScaffoldResult(kind, filename, "error_invalid_target", str(exc))
    if path_stat is not None:
        return _existing_target_result(kind, path)

    try:
        with path.open("x", encoding="utf-8", newline="\n") as scaffold:
            scaffold.write(_scaffold_content(kind, target.title))
    except FileExistsError:
        return _existing_target_result(kind, path)
    except OSError as exc:
        return ScaffoldResult(kind, filename, "error_write", str(exc))
    return ScaffoldResult(kind, filename, "created")


def _print_result(result: ScaffoldResult, target: _TaskTarget) -> None:
    if result.succeeded:
        print(f"{result.filename}: {result.code}")
        if result.code == "skipped_exists":
            readiness = check_artifact_readiness(target.directory, result.kind)
            if not readiness.ready:
                print(
                    f"Warning: {result.filename} remains not planning-ready: {readiness.message}",
                    file=sys.stderr,
                )
        return
    suffix = f": {result.message}" if result.message else ""
    print(f"{result.filename}: {result.code}{suffix}", file=sys.stderr)


def cmd_scaffold(args: argparse.Namespace) -> int:
    """Scaffold design.md, implement.md, or both for a validated live task."""
    try:
        target = resolve_scaffold_task(args.task)
    except TaskArtifactError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    requested: tuple[ArtifactKind, ...]
    if args.artifact == "all":
        requested = ("design", "implement")
    else:
        requested = (args.artifact,)

    results = tuple(scaffold_artifact(target, kind) for kind in requested)
    for result in results:
        _print_result(result, target)
    return 0 if all(result.succeeded for result in results) else 1

#!/usr/bin/env python3
"""Analyze historical FoxCode usage in local Codex and Claude Code sessions."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


TEXT_PATTERNS = re.compile(
    r"foxcode|evalInBrowser|mcp__foxcode|mcp__plugin_foxcode|launch_firefox\.py",
    re.IGNORECASE,
)
BAD_SELECTOR_RE = re.compile(r"Document\\.querySelector: .* is not a valid selector|not a valid selector")
PLAYWRIGHT_SELECTOR_RE = re.compile(r"text=|:has-text\(")


@dataclass
class SessionUsage:
    file: Path
    mtime: float
    cwd: str
    first_user: str
    calls: list[tuple[str, str]]
    output: str
    selector_style_calls: int


def iter_jsonl(roots: Iterable[Path]) -> Iterable[Path]:
    for root in roots:
        if root.exists():
            yield from root.rglob("*.jsonl")


def read_text(path: Path) -> str:
    try:
        return path.read_text(errors="ignore")
    except OSError:
        return ""


def parse_jsonl(raw: str) -> Iterable[dict[str, Any]]:
    for line in raw.splitlines():
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            yield value


def walk(value: Any) -> Iterable[Any]:
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def strings(value: Any) -> str:
    return "\n".join(item for item in walk(value) if isinstance(item, str))


def compact(text: str, limit: int = 220) -> str:
    return " ".join(text.split())[:limit]


def first_user_codex(events: list[dict[str, Any]]) -> str:
    for event in events:
        if event.get("type") != "response_item":
            continue
        payload = event.get("payload", {})
        if payload.get("type") == "message" and payload.get("role") == "user":
            return compact(strings(payload))
    return ""


def first_user_claude(events: list[dict[str, Any]]) -> str:
    for event in events:
        if event.get("type") == "user":
            return compact(strings(event.get("message", {}).get("content", "")))
    return ""


def analyze_codex(paths: Iterable[Path]) -> tuple[int, int, list[SessionUsage]]:
    total = 0
    mentions = 0
    sessions: list[SessionUsage] = []

    for path in paths:
        total += 1
        raw = read_text(path)
        if not TEXT_PATTERNS.search(raw):
            continue
        mentions += 1
        events = list(parse_jsonl(raw))
        meta: dict[str, Any] = {}
        for event in events:
            if event.get("type") == "session_meta":
                meta = event.get("payload", {})
                break

        calls: list[tuple[str, str]] = []
        outputs: list[str] = []
        selector_style_calls = 0

        for event in events:
            if event.get("type") == "response_item":
                payload = event.get("payload", {})
                if payload.get("type") == "function_call":
                    name = str(payload.get("name", ""))
                    namespace = str(payload.get("namespace", "") or "")
                    args = payload.get("arguments", "")
                    arg_text = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)
                    if namespace.startswith("mcp__foxcode") and name in {"status", "evalInBrowser"}:
                        calls.append((name, arg_text))
                        if name == "evalInBrowser" and PLAYWRIGHT_SELECTOR_RE.search(arg_text):
                            selector_style_calls += 1
                    elif name == "exec_command" and "launch_firefox.py" in arg_text:
                        calls.append(("launch_firefox", arg_text))
                elif payload.get("type") == "function_call_output":
                    output = str(payload.get("output", ""))
                    if is_relevant_output(output):
                        outputs.append(output)
            elif event.get("type") == "event_msg":
                payload = event.get("payload", {})
                if payload.get("type") != "mcp_tool_call_end":
                    continue
                invocation = payload.get("invocation", {})
                tool = invocation.get("tool")
                if invocation.get("server") == "foxcode" and tool in {"status", "evalInBrowser"}:
                    args = json.dumps(invocation.get("arguments", {}), ensure_ascii=False)
                    calls.append((str(tool), args))
                    if tool == "evalInBrowser" and PLAYWRIGHT_SELECTOR_RE.search(args):
                        selector_style_calls += 1
                    outputs.append(json.dumps(payload.get("result", {}), ensure_ascii=False))

        if calls:
            sessions.append(
                SessionUsage(
                    file=path,
                    mtime=path.stat().st_mtime,
                    cwd=str(meta.get("cwd", "?")),
                    first_user=first_user_codex(events),
                    calls=calls,
                    output="\n".join(outputs),
                    selector_style_calls=selector_style_calls,
                )
            )

    return total, mentions, sessions


def analyze_claude(paths: Iterable[Path]) -> tuple[int, int, list[SessionUsage]]:
    total = 0
    mentions = 0
    sessions: list[SessionUsage] = []

    for path in paths:
        total += 1
        raw = read_text(path)
        if not TEXT_PATTERNS.search(raw):
            continue
        mentions += 1
        events = list(parse_jsonl(raw))
        meta: dict[str, Any] = {}
        calls: list[tuple[str, str]] = []
        outputs: list[str] = []
        selector_style_calls = 0

        for event in events:
            if event.get("cwd") and not meta:
                meta = {
                    "cwd": event.get("cwd"),
                    "timestamp": event.get("timestamp"),
                    "sessionId": event.get("sessionId"),
                }

            if event.get("type") == "assistant":
                content = event.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for item in content:
                        if not isinstance(item, dict) or item.get("type") != "tool_use":
                            continue
                        name = str(item.get("name", ""))
                        if name not in {
                            "mcp__plugin_foxcode_foxcode__status",
                            "mcp__plugin_foxcode_foxcode__evalInBrowser",
                            "mcp__foxcode__status",
                            "mcp__foxcode__evalInBrowser",
                        }:
                            continue
                        short = "status" if name.endswith("__status") else "evalInBrowser"
                        args = json.dumps(item.get("input", {}), ensure_ascii=False)
                        calls.append((short, args))
                        if short == "evalInBrowser" and PLAYWRIGHT_SELECTOR_RE.search(args):
                            selector_style_calls += 1

            if event.get("type") == "user":
                content = event.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "tool_result":
                            output = strings(item)
                            if is_relevant_output(output):
                                outputs.append(output)

        if calls:
            sessions.append(
                SessionUsage(
                    file=path,
                    mtime=path.stat().st_mtime,
                    cwd=str(meta.get("cwd", "?")),
                    first_user=first_user_claude(events),
                    calls=calls,
                    output="\n".join(outputs),
                    selector_style_calls=selector_style_calls,
                )
            )

    return total, mentions, sessions


def is_relevant_output(output: str) -> bool:
    markers = [
        "Missing host permission",
        "not a valid selector",
        "Timeout (",
        "No connection",
        "MCP server restarted",
        '"ok":false',
        "Error:",
    ]
    return any(marker in output for marker in markers)


def reliable_flags(output: str) -> list[str]:
    flags: list[str] = []
    if BAD_SELECTOR_RE.search(output):
        flags.append("bad_selector")
    if "Missing host permission" in output:
        flags.append("host_permission")
    if "Timeout (" in output:
        flags.append("timeout")
    if "No connection" in output:
        flags.append("no_connection")
    return flags


def summarize(name: str, total: int, mentions: int, sessions: list[SessionUsage], examples: int) -> dict[str, Any]:
    call_counts: Counter[str] = Counter()
    flag_counts: Counter[str] = Counter()
    cwd_counts: Counter[str] = Counter()
    eval_sessions = 0
    selector_style_calls = 0

    for session in sessions:
        cwd_counts[session.cwd] += 1
        call_names = [name for name, _ in session.calls]
        call_counts.update(call_names)
        if "evalInBrowser" in call_names:
            eval_sessions += 1
        selector_style_calls += session.selector_style_calls
        flags = set(reliable_flags(session.output))
        if flags:
            flag_counts["any_reliable_flag"] += 1
        for flag in flags:
            flag_counts[flag] += 1

    recent = []
    for session in sorted(sessions, key=lambda item: item.mtime, reverse=True)[:examples]:
        recent.append(
            {
                "file": str(session.file),
                "cwd": session.cwd,
                "calls": dict(Counter(name for name, _ in session.calls)),
                "selector_style_calls": session.selector_style_calls,
                "flags": reliable_flags(session.output),
                "first_user": session.first_user,
            }
        )

    return {
        "total_jsonl": total,
        "mention_files": mentions,
        "actual_sessions": len(sessions),
        "eval_sessions": eval_sessions,
        "calls": dict(call_counts),
        "calls_per_actual_session": round(sum(call_counts.values()) / len(sessions), 2) if sessions else 0,
        "eval_per_eval_session": round(call_counts["evalInBrowser"] / eval_sessions, 2) if eval_sessions else 0,
        "selector_style_calls": selector_style_calls,
        "reliable_flags": dict(flag_counts),
        "clean_sessions": len(sessions) - flag_counts["any_reliable_flag"],
        "top_cwd": cwd_counts.most_common(8),
        "recent_actual": recent,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=["json", "text"], default="text")
    parser.add_argument("--examples", type=int, default=10)
    parser.add_argument("--codex-root", action="append", type=Path)
    parser.add_argument("--claude-root", action="append", type=Path)
    args = parser.parse_args()

    home = Path.home()
    codex_roots = args.codex_root or [home / ".codex/sessions", home / ".codex/archived_sessions"]
    claude_roots = args.claude_root or [home / ".claude/projects", home / ".claude/sessions"]

    codex_total, codex_mentions, codex_sessions = analyze_codex(iter_jsonl(codex_roots))
    claude_total, claude_mentions, claude_sessions = analyze_claude(iter_jsonl(claude_roots))

    result = {
        "scope": {
            "codex_roots": [str(path) for path in codex_roots],
            "claude_roots": [str(path) for path in claude_roots],
        },
        "codex": summarize("Codex", codex_total, codex_mentions, codex_sessions, args.examples),
        "claude": summarize("Claude", claude_total, claude_mentions, claude_sessions, args.examples),
    }

    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_text(result)

    return 0


def print_text(result: dict[str, Any]) -> None:
    print("Scope")
    print(f"- Codex roots: {', '.join(result['scope']['codex_roots'])}")
    print(f"- Claude roots: {', '.join(result['scope']['claude_roots'])}")
    for key, title in [("codex", "Codex"), ("claude", "Claude Code")]:
        data = result[key]
        print()
        print(title)
        print(f"- total_jsonl: {data['total_jsonl']}")
        print(f"- mention_files: {data['mention_files']}")
        print(f"- actual_sessions: {data['actual_sessions']}")
        print(f"- eval_sessions: {data['eval_sessions']}")
        print(f"- calls: {json.dumps(data['calls'], ensure_ascii=False, sort_keys=True)}")
        print(f"- calls_per_actual_session: {data['calls_per_actual_session']}")
        print(f"- eval_per_eval_session: {data['eval_per_eval_session']}")
        print(f"- selector_style_calls: {data['selector_style_calls']}")
        print(f"- reliable_flags: {json.dumps(data['reliable_flags'], ensure_ascii=False, sort_keys=True)}")
        print(f"- clean_sessions: {data['clean_sessions']}")
        print(f"- top_cwd: {json.dumps(data['top_cwd'], ensure_ascii=False)}")
        print("- recent_actual:")
        for item in data["recent_actual"]:
            print(f"  - {json.dumps(item, ensure_ascii=False, sort_keys=True)}")


if __name__ == "__main__":
    raise SystemExit(main())

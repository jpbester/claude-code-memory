#!/usr/bin/env python3
"""
SessionEnd hook script for claude-code-memory.
Saves extracted memories from the Stop hook to session files.
"""
import os
import sys
import json
from datetime import datetime
from pathlib import Path


def get_claude_home():
    """Get the Claude home directory."""
    claude_home = os.environ.get('CLAUDE_HOME')
    if claude_home:
        return Path(claude_home)
    return Path.home() / ".claude"


def load_config(memory_dir):
    """Load memory configuration."""
    config_file = memory_dir / "memory-config.json"
    default_config = {
        "enabled": True,
        "min_messages": 5,
        "categories": [
            "work_context",
            "preferences",
            "technical_style",
            "ongoing_projects",
            "tools_and_workflows"
        ],
        "synthesis_interval_hours": 24,
        "max_memories_per_category": 15,
        "cleanup_after_days": 30
    }

    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {**default_config, **config}
        except Exception:
            pass

    return default_config


def main():
    """Main function to save session memories."""
    claude_home = get_claude_home()
    memory_dir = claude_home / "memory"
    sessions_dir = memory_dir / "sessions"

    # Ensure directories exist
    sessions_dir.mkdir(parents=True, exist_ok=True)

    # Load configuration
    config = load_config(memory_dir)

    # Check if memory collection is enabled
    if not config.get("enabled", True):
        return 0

    # Read hook input from stdin
    try:
        hook_input = sys.stdin.read()
        if not hook_input.strip():
            return 0
    except Exception as e:
        print(f"Error reading input: {e}", file=sys.stderr)
        return 1

    # Parse the hook input
    try:
        hook_data = json.loads(hook_input)
    except json.JSONDecodeError:
        # Input might be the raw memory extraction output
        # Try to find JSON in the input
        try:
            # Look for JSON object in the input
            start = hook_input.find('{')
            end = hook_input.rfind('}') + 1
            if start >= 0 and end > start:
                hook_data = json.loads(hook_input[start:end])
            else:
                return 0
        except Exception:
            return 0

    # Extract memories from the hook data
    memories = []
    session_summary = "Session"

    # The hook output might be in different formats
    if isinstance(hook_data, dict):
        if "memories" in hook_data:
            memories = hook_data.get("memories", [])
            session_summary = hook_data.get("session_summary", "Session")
        elif "output" in hook_data:
            # The actual extraction might be in an 'output' field
            try:
                output_data = json.loads(hook_data["output"])
                memories = output_data.get("memories", [])
                session_summary = output_data.get("session_summary", "Session")
            except Exception:
                pass

    # Skip if no memories extracted
    if not memories:
        return 0

    # Validate memories format
    valid_memories = []
    valid_categories = set(config.get("categories", []))

    for mem in memories:
        if isinstance(mem, dict) and "category" in mem and "content" in mem:
            # Validate category if strict mode
            if not valid_categories or mem["category"] in valid_categories:
                valid_memories.append({
                    "category": str(mem["category"]),
                    "content": str(mem["content"])
                })

    if not valid_memories:
        return 0

    # Create session memory file
    timestamp = datetime.now()
    session_id = timestamp.strftime("%Y%m%d_%H%M%S")

    session_data = {
        "session_id": session_id,
        "timestamp": timestamp.isoformat(),
        "summary": session_summary,
        "memories": valid_memories,
        "working_directory": os.getcwd()
    }

    # Save to session file
    session_file = sessions_dir / f"session_{session_id}.json"
    try:
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(session_data, f, indent=2)
    except Exception as e:
        print(f"Error saving session: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

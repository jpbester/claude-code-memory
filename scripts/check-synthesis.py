#!/usr/bin/env python3
"""
SessionStart hook script for claude-code-memory.
Checks if memory synthesis is needed and triggers it if overdue.
"""
import os
import sys
import json
import subprocess
from datetime import datetime, timedelta
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
        "synthesis_interval_hours": 24
    }

    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {**default_config, **config}
        except Exception:
            pass

    return default_config


def get_last_synthesis_time(synthesis_dir):
    """Get the last synthesis timestamp."""
    state_file = synthesis_dir / "last-synthesis.json"

    if not state_file.exists():
        return None

    try:
        with open(state_file, 'r', encoding='utf-8') as f:
            state = json.load(f)
            return datetime.fromisoformat(state["last_synthesis"])
    except Exception:
        return None


def count_pending_sessions(sessions_dir):
    """Count session files that haven't been synthesized."""
    if not sessions_dir.exists():
        return 0

    return len(list(sessions_dir.glob("session_*.json")))


def main():
    """Check if synthesis is needed and trigger if overdue."""
    claude_home = get_claude_home()
    memory_dir = claude_home / "memory"
    sessions_dir = memory_dir / "sessions"
    synthesis_dir = memory_dir / "synthesis"
    scripts_dir = memory_dir / "scripts"

    # Ensure directories exist
    memory_dir.mkdir(parents=True, exist_ok=True)
    sessions_dir.mkdir(parents=True, exist_ok=True)
    synthesis_dir.mkdir(parents=True, exist_ok=True)

    # Load configuration
    config = load_config(memory_dir)

    # Check if memory system is enabled
    if not config.get("enabled", True):
        return 0

    # Check last synthesis time
    last_synthesis = get_last_synthesis_time(synthesis_dir)
    interval_hours = config.get("synthesis_interval_hours", 24)

    now = datetime.now()
    needs_synthesis = False

    if last_synthesis is None:
        # Never synthesized before - check if there are any sessions
        pending = count_pending_sessions(sessions_dir)
        if pending > 0:
            needs_synthesis = True
    else:
        # Check if interval has passed
        next_synthesis = last_synthesis + timedelta(hours=interval_hours)
        if now >= next_synthesis:
            pending = count_pending_sessions(sessions_dir)
            if pending > 0:
                needs_synthesis = True

    if needs_synthesis:
        # Trigger synthesis
        synthesize_script = scripts_dir / "synthesize-memory.py"

        if synthesize_script.exists():
            try:
                # Run synthesis in background (don't block session start)
                subprocess.Popen(
                    [sys.executable, str(synthesize_script)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True
                )
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    sys.exit(main())

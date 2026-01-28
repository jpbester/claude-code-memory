#!/usr/bin/env python3
"""
Installation script for claude-code-memory plugin.
Sets up directories, copies scripts, and updates CLAUDE.md.
"""
import os
import sys
import shutil
import json
from pathlib import Path


def get_claude_home():
    """Get the Claude home directory, supporting both Unix and Windows."""
    # Check for explicit CLAUDE_HOME environment variable
    claude_home = os.environ.get('CLAUDE_HOME')
    if claude_home:
        return Path(claude_home)

    # Default to ~/.claude
    return Path.home() / ".claude"


def install():
    """Main installation function."""
    claude_home = get_claude_home()
    memory_dir = claude_home / "memory"
    scripts_dir = memory_dir / "scripts"

    print(f"Installing claude-code-memory to {memory_dir}")
    print("=" * 50)

    # Create directories
    print("Creating directories...")
    (memory_dir / "sessions").mkdir(parents=True, exist_ok=True)
    (memory_dir / "synthesis").mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)

    # Get plugin directory (parent of scripts/)
    plugin_dir = Path(__file__).parent.parent
    plugin_scripts_dir = plugin_dir / "scripts"

    # Copy scripts
    print("Copying scripts...")
    scripts_to_copy = ["save-memory.py", "synthesize-memory.py", "check-synthesis.py"]
    for script in scripts_to_copy:
        src = plugin_scripts_dir / script
        dst = scripts_dir / script
        if src.exists():
            shutil.copy(src, dst)
            print(f"  Copied {script}")
        else:
            print(f"  Warning: {script} not found in plugin directory")

    # Copy default config if not exists
    print("Setting up configuration...")
    config_file = memory_dir / "memory-config.json"
    if not config_file.exists():
        default_config = plugin_dir / "config" / "memory-config.json"
        if default_config.exists():
            shutil.copy(default_config, config_file)
            print("  Created default memory-config.json")
        else:
            # Create default config inline
            default_config_data = {
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
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(default_config_data, f, indent=2)
            print("  Created default memory-config.json")
    else:
        print("  Configuration already exists, keeping existing settings")

    # Update CLAUDE.md to import memories
    print("Updating CLAUDE.md...")
    claude_md = claude_home / "CLAUDE.md"
    import_line = "@memory/MEMORY.md"

    if claude_md.exists():
        content = claude_md.read_text(encoding='utf-8')
        if import_line not in content:
            # Add import at the beginning
            new_content = f"# Automatic Memory\n{import_line}\n\n{content}"
            claude_md.write_text(new_content, encoding='utf-8')
            print("  Added memory import to existing CLAUDE.md")
        else:
            print("  Memory import already present in CLAUDE.md")
    else:
        # Create new CLAUDE.md
        content = f"""# User Memory
{import_line}

# Manual Notes
Add any personal notes or preferences here.
"""
        claude_md.write_text(content, encoding='utf-8')
        print("  Created new CLAUDE.md with memory import")

    # Create empty MEMORY.md if it doesn't exist
    memory_md = memory_dir / "MEMORY.md"
    if not memory_md.exists():
        initial_memory = """# Claude Code Memory

*No memories synthesized yet. Use your Claude Code sessions and memories will be automatically extracted and stored here.*

## How It Works
- After each session, memorable information is extracted
- Every 24 hours, memories are synthesized into this file
- Use `/memory sync` to manually trigger synthesis
- Use `/memory status` to check the system status
"""
        memory_md.write_text(initial_memory, encoding='utf-8')
        print("  Created initial MEMORY.md")

    print()
    print("=" * 50)
    print("Installation complete!")
    print()
    print("Next steps:")
    print("1. Start a Claude Code session")
    print("2. Have meaningful conversations")
    print("3. Use /memory to check your memories")
    print()
    print("Commands available:")
    print("  /memory         - View status and memories")
    print("  /memory-pause   - Pause memory collection")
    print("  /memory-resume  - Resume memory collection")
    print("  /memory-reset   - Delete all memories")


def uninstall():
    """Remove the memory system (but keep the memories as backup)."""
    claude_home = get_claude_home()
    memory_dir = claude_home / "memory"

    print("Uninstalling claude-code-memory...")
    print("Note: Your memories are preserved in ~/.claude/memory/")

    # Remove import from CLAUDE.md
    claude_md = claude_home / "CLAUDE.md"
    import_line = "@memory/MEMORY.md"

    if claude_md.exists():
        content = claude_md.read_text(encoding='utf-8')
        if import_line in content:
            # Remove the import line and the header if it's our default
            lines = content.split('\n')
            new_lines = []
            skip_next_empty = False
            for line in lines:
                if line.strip() == "# Automatic Memory":
                    skip_next_empty = True
                    continue
                if line.strip() == import_line:
                    skip_next_empty = True
                    continue
                if skip_next_empty and line.strip() == "":
                    skip_next_empty = False
                    continue
                skip_next_empty = False
                new_lines.append(line)

            claude_md.write_text('\n'.join(new_lines), encoding='utf-8')
            print("Removed memory import from CLAUDE.md")

    print()
    print("Uninstall complete.")
    print("Your memories are still available at:", memory_dir)
    print("To fully remove, delete that directory manually.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--uninstall":
        uninstall()
    else:
        install()

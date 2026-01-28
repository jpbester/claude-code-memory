#!/usr/bin/env python3
"""
Memory synthesis script for claude-code-memory.
Consolidates session memories into a unified MEMORY.md file.
"""
import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict


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


def load_session_memories(sessions_dir):
    """Load all session memory files."""
    memories = []

    if not sessions_dir.exists():
        return memories

    for session_file in sessions_dir.glob("session_*.json"):
        try:
            with open(session_file, 'r', encoding='utf-8') as f:
                session_data = json.load(f)

                # Add session metadata to each memory
                timestamp = session_data.get("timestamp", "")
                working_dir = session_data.get("working_directory", "")

                for mem in session_data.get("memories", []):
                    memories.append({
                        "category": mem.get("category", "other"),
                        "content": mem.get("content", ""),
                        "timestamp": timestamp,
                        "working_directory": working_dir,
                        "source_file": session_file.name
                    })
        except Exception as e:
            print(f"Warning: Could not load {session_file}: {e}", file=sys.stderr)

    return memories


def deduplicate_memories(memories, max_per_category=15):
    """Remove duplicate and similar memories, keeping the most recent."""
    # Group by category
    by_category = defaultdict(list)
    for mem in memories:
        by_category[mem["category"]].append(mem)

    # For each category, deduplicate
    deduplicated = defaultdict(list)

    for category, mems in by_category.items():
        # Sort by timestamp (newest first)
        sorted_mems = sorted(mems, key=lambda x: x.get("timestamp", ""), reverse=True)

        seen_content = set()
        unique_mems = []

        for mem in sorted_mems:
            content = mem["content"].lower().strip()

            # Simple deduplication: skip if we've seen very similar content
            # Check for exact matches or high overlap
            is_duplicate = False
            for seen in seen_content:
                # Check for exact match
                if content == seen:
                    is_duplicate = True
                    break
                # Check for substring (one contains the other)
                if len(content) > 20 and len(seen) > 20:
                    if content in seen or seen in content:
                        is_duplicate = True
                        break

            if not is_duplicate:
                seen_content.add(content)
                unique_mems.append(mem)

                # Limit per category
                if len(unique_mems) >= max_per_category:
                    break

        deduplicated[category] = unique_mems

    return deduplicated


def format_category_name(category):
    """Convert category key to human-readable name."""
    names = {
        "work_context": "Work Context",
        "preferences": "Preferences",
        "technical_style": "Technical Style",
        "ongoing_projects": "Ongoing Projects",
        "tools_and_workflows": "Tools & Workflows"
    }
    return names.get(category, category.replace("_", " ").title())


def generate_memory_md(memories_by_category, synthesis_time):
    """Generate the MEMORY.md content."""
    lines = [
        "# Claude Code Memory",
        "",
        f"*Last synthesized: {synthesis_time.strftime('%Y-%m-%d %H:%M')}*",
        ""
    ]

    # Define category order
    category_order = [
        "work_context",
        "ongoing_projects",
        "preferences",
        "technical_style",
        "tools_and_workflows"
    ]

    # Add known categories first, then any others
    added_categories = set()

    for category in category_order:
        if category in memories_by_category and memories_by_category[category]:
            lines.append(f"## {format_category_name(category)}")
            for mem in memories_by_category[category]:
                lines.append(f"- {mem['content']}")
            lines.append("")
            added_categories.add(category)

    # Add any remaining categories
    for category, mems in memories_by_category.items():
        if category not in added_categories and mems:
            lines.append(f"## {format_category_name(category)}")
            for mem in mems:
                lines.append(f"- {mem['content']}")
            lines.append("")

    return "\n".join(lines)


def cleanup_old_sessions(sessions_dir, days=30):
    """Remove session files older than specified days."""
    if not sessions_dir.exists():
        return 0

    cutoff = datetime.now() - timedelta(days=days)
    removed = 0

    for session_file in sessions_dir.glob("session_*.json"):
        try:
            # Parse timestamp from filename (session_YYYYMMDD_HHMMSS.json)
            name = session_file.stem
            date_str = name.replace("session_", "")
            file_date = datetime.strptime(date_str, "%Y%m%d_%H%M%S")

            if file_date < cutoff:
                session_file.unlink()
                removed += 1
        except Exception:
            pass

    return removed


def save_synthesis_state(synthesis_dir, synthesis_time):
    """Save synthesis state for checking intervals."""
    synthesis_dir.mkdir(parents=True, exist_ok=True)
    state_file = synthesis_dir / "last-synthesis.json"

    state = {
        "last_synthesis": synthesis_time.isoformat(),
        "version": "1.0"
    }

    with open(state_file, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Synthesize Claude Code memories")
    parser.add_argument("--force", action="store_true", help="Force synthesis regardless of interval")
    parser.add_argument("--no-cleanup", action="store_true", help="Skip cleanup of old sessions")
    args = parser.parse_args()

    claude_home = get_claude_home()
    memory_dir = claude_home / "memory"
    sessions_dir = memory_dir / "sessions"
    synthesis_dir = memory_dir / "synthesis"

    # Load configuration
    config = load_config(memory_dir)

    print("Claude Code Memory Synthesis")
    print("=" * 40)

    # Load all session memories
    print("Loading session memories...")
    memories = load_session_memories(sessions_dir)
    print(f"  Found {len(memories)} memories from sessions")

    if not memories:
        print("  No memories to synthesize")
        return 0

    # Deduplicate memories
    print("Deduplicating memories...")
    max_per_category = config.get("max_memories_per_category", 15)
    memories_by_category = deduplicate_memories(memories, max_per_category)

    total_unique = sum(len(mems) for mems in memories_by_category.values())
    print(f"  {total_unique} unique memories across {len(memories_by_category)} categories")

    # Generate MEMORY.md
    print("Generating MEMORY.md...")
    synthesis_time = datetime.now()
    memory_content = generate_memory_md(memories_by_category, synthesis_time)

    memory_file = memory_dir / "MEMORY.md"
    with open(memory_file, 'w', encoding='utf-8') as f:
        f.write(memory_content)
    print(f"  Written to {memory_file}")

    # Save synthesis state
    save_synthesis_state(synthesis_dir, synthesis_time)

    # Cleanup old sessions
    if not args.no_cleanup:
        cleanup_days = config.get("cleanup_after_days", 30)
        print(f"Cleaning up sessions older than {cleanup_days} days...")
        removed = cleanup_old_sessions(sessions_dir, cleanup_days)
        if removed:
            print(f"  Removed {removed} old session files")

    print()
    print("Synthesis complete!")

    # Print summary
    print()
    print("Memory Summary:")
    for category in ["work_context", "ongoing_projects", "preferences", "technical_style", "tools_and_workflows"]:
        if category in memories_by_category:
            count = len(memories_by_category[category])
            print(f"  {format_category_name(category)}: {count} memories")

    return 0


if __name__ == "__main__":
    sys.exit(main())

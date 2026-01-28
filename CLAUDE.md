# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Memory is a plugin that provides automatic memory extraction and persistence across Claude Code sessions. It uses hooks to extract memorable information from conversations and synthesizes them into a unified MEMORY.md file that gets loaded into future sessions.

## Architecture

**Hook-based Memory Flow:**
1. **SessionStart** (`check-synthesis.py`): Checks if synthesis is overdue and triggers background synthesis if needed
2. **Stop** (prompt hook in `hooks.json`): Extracts memories from the conversation using a prompt
3. **SessionEnd** (`save-memory.py`): Saves extracted memories to individual session JSON files

**Memory Storage** (`~/.claude/memory/`):
- `MEMORY.md` - Synthesized memories loaded into sessions via `@memory/MEMORY.md` import in user's CLAUDE.md
- `sessions/` - Individual session JSON files with extracted memories
- `synthesis/last-synthesis.json` - Tracks when synthesis last ran
- `memory-config.json` - User configuration

**Synthesis Process** (`synthesize-memory.py`):
- Loads all session memory files
- Deduplicates by content similarity and substring matching
- Limits memories per category (default: 15)
- Generates MEMORY.md organized by category
- Cleans up old session files

## Memory Categories

The system extracts memories into five categories:
- `work_context` - Role, employer, projects
- `preferences` - Communication style, workflow preferences
- `technical_style` - Coding conventions, patterns
- `ongoing_projects` - Active projects, directories
- `tools_and_workflows` - Build tools, deployment, version control

## Skills

| Skill | Description |
|-------|-------------|
| `/memory [status\|view\|sync]` | View status (default), display all memories, or manually trigger synthesis |
| `/memory-pause` | Disable memory collection, preserving existing memories |
| `/memory-resume` | Re-enable memory collection |
| `/memory-reset` | Delete all memories (requires confirmation) |

## Key Files

- `hooks/hooks.json` - Hook definitions including the memory extraction prompt
- `scripts/install.py` - Installs scripts to `~/.claude/memory/scripts/` and updates user's CLAUDE.md
- `config/memory-config.json` - Default configuration template

## Testing

Run individual scripts manually:
```bash
# Manual synthesis
python scripts/synthesize-memory.py --force

# Check what synthesis would do (without cleanup)
python scripts/synthesize-memory.py --no-cleanup
```

## Installation/Uninstallation

```bash
# Install
python scripts/install.py

# Uninstall (preserves memories)
python scripts/install.py --uninstall
```

The install script copies Python scripts to `~/.claude/memory/scripts/` and adds `@memory/MEMORY.md` import to user's `~/.claude/CLAUDE.md`.

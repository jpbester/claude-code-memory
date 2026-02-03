# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Memory is a marketplace plugin that provides automatic memory extraction and persistence across Claude Code sessions. It uses hooks to extract memorable information from conversations and synthesizes them into a unified MEMORY.md file that gets loaded into future sessions.

## Architecture

**Directory Layout:**
- Repository root contains marketplace scaffolding (`.claude-plugin/marketplace.json`)
- `plugin/` contains the actual installable plugin
- Memory data is stored in `~/.claude/memory/` (stable, survives plugin updates)
- Scripts run from `${CLAUDE_PLUGIN_ROOT}` (plugin cache dir managed by Claude Code)

**Hook-based Memory Flow (Dual Extraction Strategy):**
1. **SessionStart** (`check-synthesis.js`): Checks if synthesis is overdue and triggers background synthesis if needed
2. **SessionEnd** (`save-memory.js`): Waits for transcript file to stabilize (file size stable for 1.5s), extracts conversation text, calls `claude -p` (Haiku) for AI extraction, falls back to heuristic extraction if that fails

**Transcript Discovery** (`findTranscriptPath` in `memory-utils.js`):
- Strategy 1: Use `hookData.transcript_path` directly if file exists
- Strategy 2: Convert `hookData.cwd` to project dir name (e.g. `C:\Projects\foo` → `C--Projects-foo`), look in `~/.claude/projects/{dir}/`
- Strategy 3: Scan all project directories for `{session_id}.jsonl`

**Extraction Strategies** (in `save-memory.js`):
- **AI extraction (primary)**: Parse transcript JSONL, extract only human-typed user messages and assistant text responses (skip tool_result/tool_use blocks, commands, progress entries), cap at ~50KB, pipe to `claude -p --model haiku` for intelligent memory extraction. Uses existing Claude Code auth — no API key needed.
- **Heuristic fallback**: If `claude -p` fails (not found, timeout, error), pattern-match user messages for preferences, work context, tech stack, frameworks, and session activities

**Memory Storage** (`~/.claude/memory/`):
- `MEMORY.md` - Synthesized memories loaded into sessions via `@memory/MEMORY.md` import in user's CLAUDE.md
- `sessions/` - Individual session JSON files with extracted memories
- `synthesis/last-synthesis.json` - Tracks when synthesis last ran
- `memory-config.json` - User configuration

**Synthesis Process** (`synthesize-memory.js`):
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
| `/memory-setup` | One-time setup to add memory import to user's CLAUDE.md |
| `/memory-pause` | Disable memory collection, preserving existing memories |
| `/memory-resume` | Re-enable memory collection |
| `/memory-reset` | Delete all memories (requires confirmation) |

## Key Files

- `plugin/hooks/hooks.json` - Hook definitions including the memory extraction prompt
- `plugin/scripts/memory-utils.js` - Shared utilities (getMemoryDir, loadConfig, etc.)
- `plugin/scripts/save-memory.js` - SessionEnd hook script
- `plugin/scripts/synthesize-memory.js` - Memory synthesis script
- `plugin/scripts/check-synthesis.js` - SessionStart hook script
- `config/memory-config.json` - Default configuration template

## Testing

Run individual scripts manually:
```bash
# Manual synthesis
node plugin/scripts/synthesize-memory.js --force

# Check what synthesis would do (without cleanup)
node plugin/scripts/synthesize-memory.js --no-cleanup

# Test save-memory with piped input
echo '{"memories":[{"category":"work_context","content":"test"}],"session_summary":"test"}' | node plugin/scripts/save-memory.js
```

## Installation

### Marketplace
```bash
/plugin marketplace add jpbester/claude-code-memory
/plugin install claude-code-memory
/memory-setup
```

### Local Development
```bash
claude --plugin-dir ./plugin
/memory-setup
```

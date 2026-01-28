---
name: memory
description: View your Claude Code memories and memory system status. Shows synthesized memories, session count, and last sync time.
user-invocable: true
argument-hint: "[status|view|sync]"
---

# Memory Management

You are managing the Claude Code memory system. Based on the argument provided, perform one of these actions:

## Arguments: $ARGUMENTS

### If "status" or empty (default):
Show memory system status by:
1. Read `~/.claude/memory/memory-config.json` and check if enabled
2. Read `~/.claude/memory/synthesis/last-synthesis.json` for last sync time (if exists)
3. Count files in `~/.claude/memory/sessions/` directory
4. Check if `~/.claude/memory/MEMORY.md` exists and get its size

Display a formatted status:
```
Memory System Status
====================
Enabled: [Yes/No]
Last Synthesis: [date or "Never"]
Pending Sessions: [count]
Memory File: [size or "Not created yet"]
```

### If "view":
Read and display the full content of `~/.claude/memory/MEMORY.md`. If it doesn't exist, inform the user that no memories have been synthesized yet.

### If "sync":
Run the synthesis script manually:
1. Execute: `python ~/.claude/memory/scripts/synthesize-memory.py --force`
2. Show the output
3. Then display the updated memory content from `~/.claude/memory/MEMORY.md`

## Notes
- Memory directory is at `~/.claude/memory/`
- Use platform-appropriate path handling (expand ~ to user home)
- Handle missing files gracefully with helpful messages

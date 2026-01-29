---
name: memory-setup
description: One-time setup to connect the memory system to your CLAUDE.md. Run this after installing the plugin.
user-invocable: true
allowed-tools: Read, Write, Bash(ls *), Bash(mkdir *), Glob
---

# Memory Setup

One-time setup to connect the claude-code-memory plugin to your sessions.

## Steps:

1. Check if `~/.claude/CLAUDE.md` exists
2. Check if `@memory/MEMORY.md` import is already present in the file
3. If already present, tell the user setup is already complete
4. If not present:
   a. If the file exists, prepend `# Automatic Memory` and `@memory/MEMORY.md` followed by a blank line to the existing content
   b. If the file does not exist, create it with:
      ```
      # User Memory
      @memory/MEMORY.md

      # Manual Notes
      Add any personal notes or preferences here.
      ```
5. Create `~/.claude/memory/` directory and subdirectories (`sessions/`, `synthesis/`) if they don't exist
6. If `~/.claude/memory/MEMORY.md` does not exist, create it with:
   ```
   # Claude Code Memory

   *No memories synthesized yet. Use your Claude Code sessions and memories will be automatically extracted and stored here.*

   ## How It Works
   - After each session, memorable information is extracted
   - Every 24 hours, memories are synthesized into this file
   - Use `/memory sync` to manually trigger synthesis
   - Use `/memory status` to check the system status
   ```
7. If `~/.claude/memory/memory-config.json` does not exist, create it with default settings:
   ```json
   {
     "enabled": true,
     "min_messages": 5,
     "categories": ["work_context", "preferences", "technical_style", "ongoing_projects", "tools_and_workflows"],
     "synthesis_interval_hours": 24,
     "max_memories_per_category": 15,
     "cleanup_after_days": 30
   }
   ```

8. Confirm completion:
   ```
   Memory setup complete!

   Your sessions will now automatically extract and remember key information.
   Memories are loaded into future sessions via ~/.claude/CLAUDE.md.

   Commands available:
     /memory         - View status and memories
     /memory sync    - Manually trigger memory synthesis
     /memory-pause   - Pause memory collection
     /memory-resume  - Resume memory collection
     /memory-reset   - Delete all memories
   ```

## Notes:
- Use platform-appropriate path handling (expand ~ to user home)
- Handle missing files gracefully
- Do not overwrite existing content in CLAUDE.md - only prepend the import

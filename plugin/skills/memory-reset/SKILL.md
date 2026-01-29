---
name: memory-reset
description: Permanently delete all memories including session files and synthesized memory. This cannot be undone!
user-invocable: true
allowed-tools: Read, Write, Bash(rm *), Bash(ls *)
---

# Reset All Memory

**WARNING: This permanently deletes all memories!**

## Steps:

1. First, ask the user to confirm:
   "Are you sure you want to reset ALL memories? This will delete:
   - All session memory files
   - The synthesized MEMORY.md
   - Synthesis history

   This action CANNOT be undone. Type 'yes' to confirm."

2. Wait for user confirmation. If they don't type exactly "yes", abort the operation.

3. If confirmed, delete:
   - All files in `~/.claude/memory/sessions/`
   - `~/.claude/memory/MEMORY.md`
   - `~/.claude/memory/synthesis/last-synthesis.json`

4. Reset `~/.claude/memory/memory-config.json` to default settings (enabled: true)

5. Confirm to the user:
   ```
   Memory reset complete.

   All memories have been deleted. Starting fresh.
   Memory collection is enabled for new sessions.
   ```

## Notes:
- Be very careful - this is destructive
- Do NOT proceed without explicit "yes" confirmation
- Keep the directory structure intact, just remove the content

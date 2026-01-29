---
name: memory-pause
description: Pause memory collection. Claude keeps existing memories but won't create new ones. Use /memory-resume to re-enable.
user-invocable: true
---

# Pause Memory Collection

Pause the memory collection system while preserving existing memories.

## Steps:

1. Read `~/.claude/memory/memory-config.json`
2. Set `"enabled": false` in the config
3. Write the updated config back to the file
4. Confirm to the user:

```
Memory collection paused.

Your existing memories are preserved and will still be loaded into sessions.
New sessions will NOT be analyzed for memories until you resume.

Use /memory-resume to re-enable memory collection.
```

## Notes:
- If the config file doesn't exist, create it with enabled: false
- Preserve all other settings in the config file
- Use proper JSON formatting

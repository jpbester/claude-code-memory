---
name: memory-resume
description: Resume memory collection after pausing. New sessions will be analyzed for memories again.
user-invocable: true
---

# Resume Memory Collection

Re-enable memory collection after it was paused.

## Steps:

1. Read `~/.claude/memory/memory-config.json`
2. Set `"enabled": true` in the config
3. Write the updated config back to the file
4. Confirm to the user:

```
Memory collection resumed.

New sessions will now be analyzed for memorable information.
Your existing memories continue to be loaded into sessions.
```

## Notes:
- If the config file doesn't exist, create it with enabled: true and default settings
- Preserve all other settings in the config file
- Use proper JSON formatting

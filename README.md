# Claude Code Memory

**Bringing Claude Chat's memory feature to Claude Code.**

Claude Chat (web/desktop/mobile) has a powerful [memory feature](https://support.anthropic.com/en/articles/10120662-what-is-claude-s-memory) that builds understanding over time by summarizing conversations and synthesizing key insights. This plugin brings that same capability to Claude Code.

Just like Claude Chat's memory:
- **Automatic summarization** - Conversations are analyzed and key insights extracted
- **24-hour synthesis** - Memories are consolidated daily into a unified summary
- **Work-focused context** - Remembers your role, projects, preferences, and technical style
- **Full user control** - Pause, resume, or reset memories at any time

## Features

- **Automatic Memory Extraction**: After each session, memorable information is automatically extracted
- **Smart Synthesis**: Memories are consolidated every 24 hours into a unified file
- **Category-Based Organization**: Memories are organized into work context, preferences, technical style, ongoing projects, and tools/workflows
- **No Extra API Costs**: Uses your existing Claude subscription via prompt hooks
- **Full User Control**: Pause, resume, or reset memories at any time
- **Privacy-First**: All data stays local in `~/.claude/memory/`

## Why This Project?

There are several Claude Code memory solutions available ([claude-mem](https://github.com/thedotmack/claude-mem), [mcp-memory-keeper](https://github.com/mkreyman/mcp-memory-keeper), [claude-cognitive](https://github.com/GMaN1911/claude-cognitive), etc.). This project takes a different approach:

| Aspect | Other Solutions | This Project |
|--------|-----------------|--------------|
| **Storage** | SQLite, ChromaDB, knowledge graphs | Simple JSON + Markdown files |
| **Dependencies** | Node.js, npm packages, vector databases | Pure Python (standard library) |
| **Architecture** | MCP servers, vector search, embeddings | Native Claude Code plugin + hooks |
| **Complexity** | Feature-rich, requires setup | Minimal, works out of the box |
| **API Costs** | Some require separate API calls | Zero - uses your existing subscription |
| **UX Model** | Custom interfaces | Mirrors Claude Chat's memory exactly |

**This project is for you if:**
- You want Claude Chat's familiar memory experience in Claude Code
- You prefer simplicity over advanced features like vector search
- You don't want to set up databases or MCP servers
- You want zero additional API costs

**Consider alternatives if:**
- You need semantic/vector search across memories
- You want knowledge graph relationships
- You need multi-instance coordination
- You want a web UI to browse memories

## Installation

### Why Not a Marketplace Plugin?

Claude Code has a plugin marketplace, and some memory plugins (like [claude-mem](https://github.com/thedotmack/claude-mem)) use it. However, marketplace plugins run from a cache directory that gets replaced on updates - which would wipe your accumulated memories.

This plugin stores memories in `~/.claude/memory/`, a stable location that survives plugin updates, reinstalls, and even uninstalls. The one-time install script sets up this directory and connects it to your Claude Code sessions. It's a small step that ensures your memories are always safe.

Additionally, there are currently [known issues](https://github.com/anthropics/claude-code/issues/11984) with marketplace plugins that use Python scripts on Windows, which would affect reliability.

### Quick Start

```bash
# Clone and install
git clone https://github.com/jpbester/claude-code-memory.git
python claude-code-memory/scripts/install.py

# Start Claude Code with the plugin
claude --plugin-dir /path/to/claude-code-memory
```

The install script:
- Creates `~/.claude/memory/` for your memory data
- Copies the Python scripts to a stable location
- Adds a memory import to your `~/.claude/CLAUDE.md`

### Unloading the Plugin (Memories Persist)

If you remove the `--plugin-dir` flag or uninstall, your memories remain safely in `~/.claude/memory/`. To fully remove everything, see [Uninstalling](#uninstalling).

## Usage

### Viewing Memories

```bash
/memory          # Show memory status (default)
/memory status   # Show system status
/memory view     # Display all memories
/memory sync     # Manually trigger synthesis
```

### Controlling Memory Collection

```bash
/memory-pause    # Pause collection (keeps existing memories)
/memory-resume   # Resume collection
/memory-reset    # Delete ALL memories (cannot be undone!)
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Session                       │
│  SessionStart ──► Session Activity ──► SessionEnd            │
│       │                                      │               │
│       ▼                                      ▼               │
│  Load Memory                          Extract Memories       │
│  (via CLAUDE.md)                      (uses your plan)       │
└───────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────────────────┐
│                    ~/.claude/memory/                          │
│  ├── MEMORY.md           (synthesized, loaded into sessions) │
│  ├── memory-config.json  (configuration)                     │
│  ├── sessions/           (raw session memories)              │
│  └── synthesis/          (synthesis state)                   │
└───────────────────────────────────────────────────────────────┘
```

### What Does Claude Remember?

Just like Claude Chat's memory, this focuses on work-related context that improves collaboration:

| Category | What It Captures |
|----------|------------------|
| **Work Context** | Your role, projects, and professional context |
| **Preferences** | Communication preferences and working style |
| **Technical Style** | Technical preferences and coding style |
| **Ongoing Projects** | Project details and ongoing work |
| **Tools & Workflows** | Build tools, deployment, version control |

## Configuration

Edit `~/.claude/memory/memory-config.json`:

```json
{
  "enabled": true,
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
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable memory collection |
| `min_messages` | `5` | Minimum messages for a session to be analyzed |
| `synthesis_interval_hours` | `24` | How often to synthesize memories |
| `max_memories_per_category` | `15` | Maximum memories per category |
| `cleanup_after_days` | `30` | Delete old session files after this many days |

## Sample Memory Output

After using Claude Code for a while, your `~/.claude/memory/MEMORY.md` might look like:

```markdown
# Claude Code Memory

*Last synthesized: 2025-01-15 14:30*

## Work Context
- Senior backend developer focused on Python and Go microservices
- Building e-commerce platform for a retail startup

## Ongoing Projects
- order-service - Order processing microservice (Go)
- inventory-api - Inventory management REST API (Python/FastAPI)

## Preferences
- Prefers concise code comments over verbose documentation
- Likes seeing test coverage reports after changes
- Wants error messages to include suggested fixes

## Technical Style
- Uses snake_case for Python, camelCase for Go
- Prefers composition over inheritance
- Always includes context managers for resource handling

## Tools & Workflows
- Uses VS Code with vim keybindings
- Docker Compose for local development
- GitHub Actions for CI/CD
```

## Uninstalling

### Pause Only (Keep Memories)
```bash
/memory-pause
```

### Full Reset (Delete All Memories)
```bash
/memory-reset
```

### Complete Uninstall
```bash
python scripts/install.py --uninstall
# Then remove the plugin from your Claude Code configuration
```

To fully remove all data:
```bash
rm -rf ~/.claude/memory
```

## Privacy & Security

- All memory data is stored locally in `~/.claude/memory/`
- No data is sent to external servers
- Memory extraction uses your existing Claude subscription
- You have full control over what's remembered and can delete at any time

## Troubleshooting

### Memories not being extracted
1. Check if memory is enabled: `/memory status`
2. Ensure sessions have at least 5 messages
3. Check the hook configuration is loaded

### Synthesis not running
1. Run manual sync: `/memory sync`
2. Check `~/.claude/memory/sessions/` for pending sessions
3. Verify Python is in your PATH

### High token usage
1. Reduce `max_memories_per_category` in config
2. Run `/memory sync` to consolidate memories
3. Use `/memory-reset` to start fresh if needed

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

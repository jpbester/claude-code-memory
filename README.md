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

## Installation

### Option 1: Using Plugin Directory

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-code-memory.git

# Run installation script
python claude-code-memory/scripts/install.py

# Start Claude Code with the plugin
claude --plugin-dir /path/to/claude-code-memory
```

### Option 2: Manual Installation

1. Clone this repository
2. Run the installation script:
   ```bash
   python scripts/install.py
   ```
3. Add the plugin to your Claude Code configuration

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

*Last synthesized: 2026-01-28 15:30*

## Work Context
- Primary role: Full-stack developer working on .NET and TypeScript projects
- Works on CASM asset management systems at a telecommunications company

## Ongoing Projects
- CASM.MVC - Asset management web application (ASP.NET MVC)
- CASM-Mobile-Maui - Mobile companion app (.NET MAUI)

## Preferences
- Prefers detailed documentation with functional explanations
- Uses agents and subagents for complex multi-step tasks
- Likes to see code references with file paths and line numbers

## Technical Style
- Follows .NET naming conventions (PascalCase for public, camelCase for private)
- Prefers async/await patterns over callbacks
- Uses Entity Framework Core for data access

## Tools & Workflows
- Uses Visual Studio and VS Code
- Git for version control with feature branch workflow
- Azure DevOps for CI/CD pipelines
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

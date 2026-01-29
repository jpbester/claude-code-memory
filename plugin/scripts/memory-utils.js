/**
 * Shared utilities for claude-code-memory plugin.
 * All functions use Node.js built-ins only (no external dependencies).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_CONFIG = {
  enabled: true,
  min_messages: 5,
  categories: [
    'work_context',
    'preferences',
    'technical_style',
    'ongoing_projects',
    'tools_and_workflows'
  ],
  synthesis_interval_hours: 24,
  max_memories_per_category: 15,
  cleanup_after_days: 30
};

/**
 * Get the Claude home directory.
 * Respects CLAUDE_HOME env var, defaults to ~/.claude
 */
function getClaudeHome() {
  const claudeHome = process.env.CLAUDE_HOME;
  if (claudeHome) {
    return claudeHome;
  }
  return path.join(os.homedir(), '.claude');
}

/**
 * Get the memory data directory (~/.claude/memory/).
 */
function getMemoryDir() {
  return path.join(getClaudeHome(), 'memory');
}

/**
 * Ensure required subdirectories exist (lazy init).
 */
function ensureDirs(memoryDir) {
  const dirs = [
    memoryDir,
    path.join(memoryDir, 'sessions'),
    path.join(memoryDir, 'synthesis')
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load memory configuration with defaults fallback.
 */
function loadConfig(memoryDir) {
  const configFile = path.join(memoryDir, 'memory-config.json');
  try {
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const config = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Get the last synthesis timestamp as a Date, or null if never synthesized.
 */
function getLastSynthesisTime(synthesisDir) {
  const stateFile = path.join(synthesisDir, 'last-synthesis.json');
  try {
    if (fs.existsSync(stateFile)) {
      const raw = fs.readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(raw);
      return new Date(state.last_synthesis);
    }
  } catch {
    // Fall through
  }
  return null;
}

/**
 * Count session_*.json files in the sessions directory.
 */
function countPendingSessions(sessionsDir) {
  try {
    if (!fs.existsSync(sessionsDir)) {
      return 0;
    }
    const files = fs.readdirSync(sessionsDir);
    return files.filter(f => f.startsWith('session_') && f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/**
 * Read all of stdin as a string (Promise-based).
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', err => reject(err));
  });
}

/**
 * Format a Date as YYYYMMDD_HHMMSS.
 */
function formatTimestamp(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

module.exports = {
  DEFAULT_CONFIG,
  getClaudeHome,
  getMemoryDir,
  ensureDirs,
  loadConfig,
  getLastSynthesisTime,
  countPendingSessions,
  readStdin,
  formatTimestamp
};

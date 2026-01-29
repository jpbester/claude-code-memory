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

/**
 * Convert a working directory path to Claude's project directory name format.
 * Windows: C:\Projects\foo → C--Projects-foo
 * Unix:    /home/user/foo  → -home-user-foo
 */
function cwdToProjectDirName(cwd) {
  if (!cwd) return null;
  // Normalize to forward slashes
  let normalized = cwd.replace(/\\/g, '/');
  // Windows drive letter: C:/Projects → C--Projects
  // The colon is removed and replaced with a dash
  normalized = normalized.replace(/^([A-Za-z]):/, '$1-');
  // Replace all slashes with dashes
  normalized = normalized.replace(/\//g, '-');
  return normalized;
}

/**
 * Look for a transcript file within a specific project directory.
 * Checks sessions-index.json first, then direct file lookup.
 */
function findInProjectDir(projectDir, sessionId) {
  if (!fs.existsSync(projectDir)) return null;

  // Strategy A: Check sessions-index.json
  const indexFile = path.join(projectDir, 'sessions-index.json');
  try {
    if (fs.existsSync(indexFile)) {
      const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      if (Array.isArray(index)) {
        for (const entry of index) {
          if (entry.sessionId === sessionId && entry.path) {
            const fullPath = path.isAbsolute(entry.path)
              ? entry.path
              : path.join(projectDir, entry.path);
            if (fs.existsSync(fullPath)) return fullPath;
          }
        }
      }
    }
  } catch {
    // Fall through
  }

  // Strategy B: Direct file lookup
  const directPath = path.join(projectDir, `${sessionId}.jsonl`);
  if (fs.existsSync(directPath)) return directPath;

  return null;
}

/**
 * Find the transcript file path using multiple strategies:
 * 1. Use hookData.transcript_path if provided and exists
 * 2. Convert hookData.cwd to project dir name, look in ~/.claude/projects/{dir}/
 * 3. Scan all project dirs for {session_id}.jsonl
 */
function findTranscriptPath(hookData) {
  if (!hookData) return null;

  const sessionId = hookData.session_id;

  // Strategy 1: Direct transcript_path
  if (hookData.transcript_path) {
    const tp = hookData.transcript_path;
    if (tp && fs.existsSync(tp)) return tp;
  }

  if (!sessionId) return null;

  const claudeHome = getClaudeHome();
  const projectsDir = path.join(claudeHome, 'projects');

  if (!fs.existsSync(projectsDir)) return null;

  // Strategy 2: Derive project dir from cwd
  if (hookData.cwd) {
    const dirName = cwdToProjectDirName(hookData.cwd);
    if (dirName) {
      const projectDir = path.join(projectsDir, dirName);
      const found = findInProjectDir(projectDir, sessionId);
      if (found) return found;
    }
  }

  // Strategy 3: Scan all project directories
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const projectDir = path.join(projectsDir, d.name);
      const found = findInProjectDir(projectDir, sessionId);
      if (found) return found;
    }
  } catch {
    // Fall through
  }

  return null;
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
  formatTimestamp,
  findTranscriptPath,
  cwdToProjectDirName,
  findInProjectDir
};

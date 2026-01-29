#!/usr/bin/env node
/**
 * SessionStart hook script for claude-code-memory.
 * Checks if memory synthesis is needed and triggers it if overdue.
 */
const { spawn } = require('child_process');
const path = require('path');
const { getMemoryDir, ensureDirs, loadConfig, getLastSynthesisTime, countPendingSessions } = require('./memory-utils');

function main() {
  const memoryDir = getMemoryDir();
  const sessionsDir = path.join(memoryDir, 'sessions');
  const synthesisDir = path.join(memoryDir, 'synthesis');

  // Ensure directories exist (lazy init)
  ensureDirs(memoryDir);

  // Load configuration
  const config = loadConfig(memoryDir);

  // Check if memory system is enabled
  if (!config.enabled) {
    return 0;
  }

  // Check last synthesis time
  const lastSynthesis = getLastSynthesisTime(synthesisDir);
  const intervalHours = config.synthesis_interval_hours || 24;
  const now = new Date();
  let needsSynthesis = false;

  if (lastSynthesis === null) {
    // Never synthesized before - check if there are any sessions
    if (countPendingSessions(sessionsDir) > 0) {
      needsSynthesis = true;
    }
  } else {
    // Check if interval has passed
    const nextSynthesis = new Date(lastSynthesis.getTime() + intervalHours * 60 * 60 * 1000);
    if (now >= nextSynthesis) {
      if (countPendingSessions(sessionsDir) > 0) {
        needsSynthesis = true;
      }
    }
  }

  if (needsSynthesis) {
    const synthesizeScript = path.join(__dirname, 'synthesize-memory.js');

    try {
      // Run synthesis in background (don't block session start)
      const child = spawn(process.execPath, [synthesizeScript], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    } catch {
      // Ignore spawn errors
    }
  }

  return 0;
}

process.exit(main());

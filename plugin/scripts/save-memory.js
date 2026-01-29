#!/usr/bin/env node
/**
 * SessionEnd hook script for claude-code-memory.
 * Saves extracted memories from the Stop hook to session files.
 */
const fs = require('fs');
const path = require('path');
const { getMemoryDir, ensureDirs, loadConfig, readStdin, formatTimestamp } = require('./memory-utils');

async function main() {
  const memoryDir = getMemoryDir();
  const sessionsDir = path.join(memoryDir, 'sessions');

  // Ensure directories exist
  ensureDirs(memoryDir);

  // Load configuration
  const config = loadConfig(memoryDir);

  // Check if memory collection is enabled
  if (!config.enabled) {
    return 0;
  }

  // Read hook input from stdin
  let hookInput;
  try {
    hookInput = await readStdin();
    if (!hookInput.trim()) {
      return 0;
    }
  } catch (e) {
    process.stderr.write(`Error reading input: ${e.message}\n`);
    return 1;
  }

  // Parse the hook input
  let hookData;
  try {
    hookData = JSON.parse(hookInput);
  } catch {
    // Input might be raw memory extraction output - try to find JSON in it
    try {
      const start = hookInput.indexOf('{');
      const end = hookInput.lastIndexOf('}') + 1;
      if (start >= 0 && end > start) {
        hookData = JSON.parse(hookInput.substring(start, end));
      } else {
        return 0;
      }
    } catch {
      return 0;
    }
  }

  // Extract memories from the hook data
  let memories = [];
  let sessionSummary = 'Session';

  if (hookData && typeof hookData === 'object') {
    if ('memories' in hookData) {
      memories = hookData.memories || [];
      sessionSummary = hookData.session_summary || 'Session';
    } else if ('output' in hookData) {
      // The actual extraction might be in an 'output' field
      try {
        const outputData = JSON.parse(hookData.output);
        memories = outputData.memories || [];
        sessionSummary = outputData.session_summary || 'Session';
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Skip if no memories extracted
  if (!memories.length) {
    return 0;
  }

  // Validate memories format
  const validCategories = new Set(config.categories || []);
  const validMemories = [];

  for (const mem of memories) {
    if (mem && typeof mem === 'object' && 'category' in mem && 'content' in mem) {
      if (!validCategories.size || validCategories.has(mem.category)) {
        validMemories.push({
          category: String(mem.category),
          content: String(mem.content)
        });
      }
    }
  }

  if (!validMemories.length) {
    return 0;
  }

  // Create session memory file
  const timestamp = new Date();
  const sessionId = formatTimestamp(timestamp);

  const sessionData = {
    session_id: sessionId,
    timestamp: timestamp.toISOString(),
    summary: sessionSummary,
    memories: validMemories,
    working_directory: process.cwd()
  };

  // Save to session file
  const sessionFile = path.join(sessionsDir, `session_${sessionId}.json`);
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
  } catch (e) {
    process.stderr.write(`Error saving session: ${e.message}\n`);
    return 1;
  }

  return 0;
}

main().then(code => process.exit(code)).catch(() => process.exit(1));

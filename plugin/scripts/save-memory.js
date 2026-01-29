#!/usr/bin/env node
/**
 * SessionEnd hook script for claude-code-memory.
 * Reads session metadata from stdin, parses the transcript file,
 * extracts memorable information, and saves a session file.
 */
const fs = require('fs');
const path = require('path');
const { getMemoryDir, ensureDirs, loadConfig, readStdin, formatTimestamp } = require('./memory-utils');

async function main() {
  const memoryDir = getMemoryDir();
  const sessionsDir = path.join(memoryDir, 'sessions');

  ensureDirs(memoryDir);

  const config = loadConfig(memoryDir);
  if (!config.enabled) return 0;

  // Read hook input from stdin
  let hookInput;
  try {
    hookInput = await readStdin();
    if (!hookInput.trim()) return 0;
  } catch {
    return 1;
  }

  // Parse stdin - could be session metadata or pre-extracted memories
  let hookData;
  try {
    hookData = JSON.parse(hookInput);
  } catch {
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

  if (!hookData || typeof hookData !== 'object') return 0;

  let memories = [];
  let sessionSummary = 'Session';
  let workingDir = process.cwd();

  // Format 1: Pre-extracted memories (from a working prompt hook)
  if (hookData.memories && Array.isArray(hookData.memories)) {
    memories = hookData.memories;
    sessionSummary = hookData.session_summary || 'Session';
  }
  // Format 2: Wrapped in output field
  else if (hookData.output) {
    try {
      const outputData = typeof hookData.output === 'string'
        ? JSON.parse(hookData.output)
        : hookData.output;
      if (outputData.memories) {
        memories = outputData.memories;
        sessionSummary = outputData.session_summary || 'Session';
      }
    } catch {
      // Fall through to transcript extraction
    }
  }

  // Format 3: Session metadata with transcript_path
  if (!memories.length && (hookData.transcript_path || hookData.session_id)) {
    workingDir = hookData.cwd || process.cwd();

    if (hookData.transcript_path) {
      try {
        const result = extractFromTranscript(hookData.transcript_path, config);
        memories = result.memories;
        sessionSummary = result.summary || `Session in ${path.basename(workingDir)}`;
      } catch {
        // Transcript extraction failed, continue with empty
      }
    }
  }

  if (!memories.length) return 0;

  // Validate memories against configured categories
  const validCategories = new Set(config.categories || []);
  const validMemories = memories.filter(mem =>
    mem && typeof mem === 'object' && mem.category && mem.content &&
    (!validCategories.size || validCategories.has(mem.category))
  ).map(mem => ({
    category: String(mem.category),
    content: String(mem.content)
  }));

  if (!validMemories.length) return 0;

  // Save session file
  const timestamp = new Date();
  const sessionId = formatTimestamp(timestamp);

  const sessionData = {
    session_id: sessionId,
    timestamp: timestamp.toISOString(),
    summary: sessionSummary,
    memories: validMemories,
    working_directory: workingDir
  };

  const sessionFile = path.join(sessionsDir, `session_${sessionId}.json`);
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
  } catch (e) {
    process.stderr.write(`Error saving session: ${e.message}\n`);
    return 1;
  }

  return 0;
}

/**
 * Extract memories from a transcript file.
 * Parses JSONL transcript and looks for user preferences, project context, etc.
 */
function extractFromTranscript(transcriptPath, config) {
  if (!fs.existsSync(transcriptPath)) {
    return { memories: [], summary: '' };
  }

  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  const memories = [];

  // Parse transcript - try JSONL (line-delimited JSON)
  const lines = raw.split('\n').filter(l => l.trim());
  const messages = [];

  for (const line of lines) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      // Skip non-JSON lines
    }
  }

  // If no JSONL, try as single JSON array
  if (!messages.length) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) messages.push(...parsed);
    } catch {
      // Not parseable
    }
  }

  if (!messages.length) {
    return { memories: [], summary: '' };
  }

  // Extract text content from messages
  const userMessages = [];
  const assistantMessages = [];

  for (const msg of messages) {
    const role = msg.role || msg.type || '';
    const content = extractTextContent(msg);

    if (role === 'user' || role === 'human') {
      userMessages.push(content);
    } else if (role === 'assistant') {
      assistantMessages.push(content);
    }
  }

  const allUserText = userMessages.join('\n');

  // Extract working directories and project paths
  const projectPaths = new Set();
  const allText = [...userMessages, ...assistantMessages].join('\n');

  // Look for absolute paths (Unix and Windows)
  const pathPattern = /(?:(?:\/(?:[\w.-]+\/)+[\w.-]+)|(?:[A-Z]:\\(?:[\w.-]+\\)+[\w.-]+))/g;
  const pathMatches = allText.match(pathPattern) || [];
  for (const p of pathMatches) {
    // Get the project-level directory (first 3-4 segments)
    const segments = p.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.length >= 2) {
      const projectDir = segments.slice(0, Math.min(4, segments.length)).join('/');
      projectPaths.add(projectDir);
    }
  }

  // Look for preference-indicating phrases in user messages
  const preferencePatterns = [
    { pattern: /\bi (?:prefer|like|want|always use|usually)\b/i, category: 'preferences' },
    { pattern: /\bplease (?:always|never|don't|do not)\b/i, category: 'preferences' },
    { pattern: /\bi (?:work on|am working on|am building)\b/i, category: 'ongoing_projects' },
    { pattern: /\bi (?:am a|work as|work at|work for)\b/i, category: 'work_context' },
    { pattern: /\bwe use|our team|our project|our codebase\b/i, category: 'tools_and_workflows' },
  ];

  for (const userMsg of userMessages) {
    const sentences = userMsg.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    for (const sentence of sentences) {
      for (const { pattern, category } of preferencePatterns) {
        if (pattern.test(sentence) && sentence.trim().length < 200) {
          memories.push({
            category,
            content: sentence.trim()
          });
        }
      }
    }
  }

  // Add project paths as ongoing_projects memories
  if (projectPaths.size > 0) {
    const paths = [...projectPaths].slice(0, 5);
    for (const p of paths) {
      memories.push({
        category: 'ongoing_projects',
        content: `Worked in: ${p}`
      });
    }
  }

  // Limit to reasonable number
  const limited = memories.slice(0, 20);

  // Generate summary
  const msgCount = userMessages.length + assistantMessages.length;
  const summary = `Session with ${msgCount} messages`;

  return { memories: limited, summary };
}

/**
 * Extract plain text content from a message object.
 */
function extractTextContent(msg) {
  if (typeof msg === 'string') return msg;
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(block => block.type === 'text' || typeof block === 'string')
      .map(block => typeof block === 'string' ? block : block.text || '')
      .join('\n');
  }
  return '';
}

main().then(code => process.exit(code)).catch(() => process.exit(1));

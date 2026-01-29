#!/usr/bin/env node
/**
 * SessionEnd hook script for claude-code-memory.
 * Reads session metadata from stdin, finds and parses the transcript file,
 * extracts memorable information via AI markers or heuristics, and saves a session file.
 */
const fs = require('fs');
const path = require('path');
const { getMemoryDir, ensureDirs, loadConfig, readStdin, formatTimestamp, findTranscriptPath } = require('./memory-utils');

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
  let workingDir = hookData.cwd || process.cwd();

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

  // Format 3: Session metadata — find and parse transcript
  if (!memories.length && (hookData.session_id || hookData.cwd)) {
    const transcriptPath = findTranscriptPath(hookData);

    if (transcriptPath) {
      try {
        const result = extractFromTranscript(transcriptPath, config, workingDir);
        memories = result.memories;
        sessionSummary = result.summary || `Session in ${path.basename(workingDir)}`;
      } catch (e) {
        process.stderr.write(`Transcript extraction error: ${e.message}\n`);
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
    content: String(mem.content).slice(0, 500)
  }));

  if (!validMemories.length) return 0;

  // Save session file
  const timestamp = new Date();
  const sessionId = hookData.session_id || formatTimestamp(timestamp);

  const sessionData = {
    session_id: sessionId,
    timestamp: timestamp.toISOString(),
    summary: sessionSummary,
    memories: validMemories,
    working_directory: workingDir
  };

  const sessionFile = path.join(sessionsDir, `session_${formatTimestamp(timestamp)}.json`);
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
 * Uses dual strategy: AI markers first, then heuristic fallback.
 */
function extractFromTranscript(transcriptPath, config, workingDir) {
  if (!fs.existsSync(transcriptPath)) {
    return { memories: [], summary: '' };
  }

  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const entries = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip non-JSON lines
    }
  }

  if (!entries.length) {
    return { memories: [], summary: '' };
  }

  // Strategy 1: Look for AI-extracted MEMORY_EXTRACT markers in system messages
  const aiMemories = scanForAIMarkers(entries);
  if (aiMemories.length) {
    return {
      memories: aiMemories.slice(0, 25),
      summary: `AI-extracted memories`
    };
  }

  // Strategy 2: Heuristic extraction from conversation content
  return heuristicExtraction(entries, config, workingDir);
}

/**
 * Scan transcript entries for MEMORY_EXTRACT: markers left by the Stop prompt hook.
 * Uses the LAST marker found (most complete view of conversation).
 */
function scanForAIMarkers(entries) {
  let lastMarkerMemories = null;

  for (const entry of entries) {
    // Check system messages in assistant entries for the marker
    const content = getEntryTextContent(entry);
    if (!content) continue;

    const markerIdx = content.indexOf('MEMORY_EXTRACT:');
    if (markerIdx === -1) continue;

    try {
      const jsonStr = content.substring(markerIdx + 'MEMORY_EXTRACT:'.length).trim();
      // Find the JSON object
      const braceStart = jsonStr.indexOf('{');
      if (braceStart === -1) continue;

      // Find matching closing brace
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++;
        else if (jsonStr[i] === '}') {
          depth--;
          if (depth === 0) { braceEnd = i + 1; break; }
        }
      }
      if (braceEnd === -1) continue;

      const parsed = JSON.parse(jsonStr.substring(braceStart, braceEnd));
      if (parsed.memories && Array.isArray(parsed.memories) && parsed.memories.length) {
        lastMarkerMemories = parsed.memories;
      }
    } catch {
      // Skip malformed markers
    }
  }

  return lastMarkerMemories || [];
}

/**
 * Extract text content from a transcript entry.
 * Handles the actual JSONL format where content is at entry.message.content.
 */
function getEntryTextContent(entry) {
  if (!entry) return '';

  // Skip non-message entries
  const entryType = entry.type;
  if (entryType === 'file-history-snapshot' || entryType === 'summary' || entryType === 'progress') {
    return '';
  }

  // The actual message is nested under entry.message
  const msg = entry.message;
  if (!msg) return '';

  const content = msg.content;
  if (!content) return '';

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block;
        if (block.type === 'text') return block.text || '';
        if (block.type === 'tool_result') {
          if (typeof block.content === 'string') return block.content;
          return '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

/**
 * Get the role from a transcript entry.
 */
function getEntryRole(entry) {
  if (!entry || !entry.message) return '';
  return entry.message.role || '';
}

/**
 * Heuristic extraction: analyze conversation text for memorable content.
 */
function heuristicExtraction(entries, config, workingDir) {
  const memories = [];
  const userMessages = [];
  const assistantMessages = [];

  for (const entry of entries) {
    const entryType = entry.type;
    // Skip non-conversation entries
    if (entryType === 'file-history-snapshot' || entryType === 'summary' || entryType === 'progress') {
      continue;
    }

    const content = getEntryTextContent(entry);
    if (!content) continue;

    const role = getEntryRole(entry);

    // Skip command/system messages
    if (content.includes('<command-name>') || content.includes('<local-command')) {
      continue;
    }

    if (role === 'user') {
      userMessages.push(content);
    } else if (role === 'assistant') {
      assistantMessages.push(content);
    }
  }

  // Apply min_messages threshold
  const totalMessages = userMessages.length + assistantMessages.length;
  const minMessages = config.min_messages || 5;
  if (totalMessages < minMessages) {
    return { memories: [], summary: '' };
  }

  const allUserText = userMessages.join('\n');
  const allText = [...userMessages, ...assistantMessages].join('\n');

  // --- Preference patterns ---
  const preferencePatterns = [
    { pattern: /\bi (?:prefer|like to|want to|always use|usually|tend to)\b/i, category: 'preferences' },
    { pattern: /\bplease (?:always|never|don't|do not)\b/i, category: 'preferences' },
    { pattern: /\bi (?:hate|avoid|dislike|don't like|don't want)\b/i, category: 'preferences' },
    { pattern: /\bdon'?t (?:use|add|include|create)\b/i, category: 'preferences' },
    { pattern: /\bi (?:work on|am working on|am building)\b/i, category: 'ongoing_projects' },
    { pattern: /\bi (?:am a|work as|work at|work for)\b/i, category: 'work_context' },
    { pattern: /\bour (?:team|company|org|organization|codebase|project|stack)\b/i, category: 'work_context' },
    { pattern: /\bwe (?:use|deploy|build|run|develop)\b/i, category: 'tools_and_workflows' },
  ];

  for (const userMsg of userMessages) {
    const sentences = userMsg.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 500) continue;
      for (const { pattern, category } of preferencePatterns) {
        if (pattern.test(trimmed)) {
          memories.push({ category, content: trimmed });
          break; // One category per sentence
        }
      }
    }
  }

  // --- Technology detection ---
  const extCounts = {};
  const extPattern = /\.(ts|tsx|js|jsx|py|cs|java|go|rs|rb|php|vue|svelte|swift|kt|cpp|c|h)\b/gi;
  let match;
  while ((match = extPattern.exec(allText)) !== null) {
    const ext = match[1].toLowerCase();
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  // Only record extensions mentioned 2+ times
  const significantExts = Object.entries(extCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (significantExts.length) {
    const extList = significantExts.map(([ext]) => `.${ext}`).join(', ');
    memories.push({
      category: 'technical_style',
      content: `Works with file types: ${extList}`
    });
  }

  // --- Framework/tool detection ---
  const frameworks = [
    { names: ['React', 'react'], label: 'React' },
    { names: ['Next.js', 'nextjs', 'next/'], label: 'Next.js' },
    { names: ['Vue', 'vue'], label: 'Vue' },
    { names: ['Angular', 'angular'], label: 'Angular' },
    { names: ['Django', 'django'], label: 'Django' },
    { names: ['Flask', 'flask'], label: 'Flask' },
    { names: ['Express', 'express'], label: 'Express' },
    { names: ['Docker', 'docker', 'Dockerfile'], label: 'Docker' },
    { names: ['.NET', 'dotnet', 'ASP.NET', 'Entity Framework'], label: '.NET' },
    { names: ['Spring', 'spring-boot'], label: 'Spring' },
    { names: ['Rails', 'ruby on rails'], label: 'Rails' },
    { names: ['Laravel', 'laravel'], label: 'Laravel' },
    { names: ['Tailwind', 'tailwindcss'], label: 'Tailwind CSS' },
    { names: ['PostgreSQL', 'postgres', 'psql'], label: 'PostgreSQL' },
    { names: ['MongoDB', 'mongoose', 'mongo'], label: 'MongoDB' },
    { names: ['Redis', 'redis'], label: 'Redis' },
    { names: ['Kubernetes', 'k8s', 'kubectl'], label: 'Kubernetes' },
  ];

  const detectedFrameworks = [];
  for (const fw of frameworks) {
    let count = 0;
    for (const name of fw.names) {
      const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = allText.match(regex);
      if (matches) count += matches.length;
    }
    if (count >= 2) detectedFrameworks.push(fw.label);
  }

  if (detectedFrameworks.length) {
    memories.push({
      category: 'tools_and_workflows',
      content: `Uses: ${detectedFrameworks.join(', ')}`
    });
  }

  // --- Working directory as project context ---
  if (workingDir && workingDir !== process.cwd()) {
    memories.push({
      category: 'ongoing_projects',
      content: `Worked in: ${workingDir}`
    });
  }

  // --- Activity type analysis ---
  const activities = [];
  if (/\bgit\s+(commit|push|pull|merge|rebase|branch|checkout)\b/i.test(allText)) {
    activities.push('git operations');
  }
  if (/\b(test|spec|jest|mocha|pytest|vitest)\b/i.test(allText) && /\b(test|spec|jest|mocha|pytest|vitest)\b/gi.test(allText)) {
    activities.push('testing');
  }
  if (/\b(debug|breakpoint|console\.log|debugger)\b/i.test(allText)) {
    activities.push('debugging');
  }
  if (/\b(deploy|CI\/CD|pipeline|build)\b/i.test(allText)) {
    activities.push('deployment/CI');
  }

  if (activities.length) {
    memories.push({
      category: 'tools_and_workflows',
      content: `Session activities: ${activities.join(', ')}`
    });
  }

  // Cap total memories
  const limited = memories.slice(0, 25);
  const summary = `Session with ${totalMessages} messages in ${path.basename(workingDir || 'unknown')}`;

  return { memories: limited, summary };
}

main().then(code => process.exit(code)).catch(() => process.exit(1));

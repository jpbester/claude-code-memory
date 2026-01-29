#!/usr/bin/env node
/**
 * SessionEnd hook script for claude-code-memory.
 *
 * Reads session metadata from stdin, finds the transcript file,
 * extracts conversation text (user messages + assistant text only),
 * calls `claude -p` (haiku) for AI-powered memory extraction,
 * and falls back to heuristic extraction if that fails.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getMemoryDir, ensureDirs, loadConfig, readStdin, formatTimestamp, findTranscriptPath } = require('./memory-utils');

const MAX_CONVERSATION_BYTES = 50000; // ~15K tokens, well within Haiku's context
const MAX_MEMORIES = 15;

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

  // Parse stdin
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

  // Legacy format: pre-extracted memories piped directly
  if (hookData.memories && Array.isArray(hookData.memories)) {
    memories = hookData.memories;
    sessionSummary = hookData.session_summary || 'Session';
  } else if (hookData.output) {
    try {
      const outputData = typeof hookData.output === 'string'
        ? JSON.parse(hookData.output) : hookData.output;
      if (outputData.memories) {
        memories = outputData.memories;
        sessionSummary = outputData.session_summary || 'Session';
      }
    } catch { /* fall through to transcript extraction */ }
  }

  // Main path: find transcript and extract from it
  if (!memories.length && (hookData.session_id || hookData.cwd)) {
    const transcriptPath = findTranscriptPath(hookData);

    if (transcriptPath) {
      try {
        const conversation = extractConversationText(transcriptPath, config);
        if (conversation.text) {
          // Try AI extraction first, fall back to heuristics
          memories = await tryAIExtraction(conversation.text);
          if (!memories.length) {
            memories = heuristicExtraction(conversation, config, workingDir);
          }
          sessionSummary = `Session with ${conversation.messageCount} messages in ${path.basename(workingDir)}`;
        }
      } catch (e) {
        process.stderr.write(`Extraction error: ${e.message}\n`);
      }
    }
  }

  if (!memories.length) return 0;

  // Validate and save
  const validCategories = new Set(config.categories || []);
  const validMemories = memories.filter(mem =>
    mem && typeof mem === 'object' && mem.category && mem.content &&
    (!validCategories.size || validCategories.has(mem.category))
  ).map(mem => ({
    category: String(mem.category),
    content: String(mem.content).slice(0, 500)
  })).slice(0, MAX_MEMORIES);

  if (!validMemories.length) return 0;

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
 * Extract only human-typed conversation text from a transcript file.
 * Filters out tool_result blocks, tool_use blocks, commands, progress entries, etc.
 * Returns condensed conversation text suitable for AI analysis.
 */
function extractConversationText(transcriptPath, config) {
  const raw = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());

  const userMessages = [];
  const assistantMessages = [];
  let totalBytes = 0;

  for (const line of lines) {
    if (totalBytes >= MAX_CONVERSATION_BYTES) break;

    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Skip non-message entries and meta/skill prompt injections
    if (!entry.message || !entry.type || entry.type === 'file-history-snapshot' ||
        entry.type === 'summary' || entry.type === 'progress' || entry.isMeta) {
      continue;
    }

    const role = entry.message.role;
    const content = entry.message.content;
    if (!content) continue;

    if (role === 'user') {
      const text = extractHumanText(content);
      if (text && text.length > 5) {
        userMessages.push(text);
        totalBytes += text.length;
      }
    } else if (role === 'assistant') {
      const text = extractAssistantText(content);
      if (text && text.length > 5) {
        assistantMessages.push(text);
        totalBytes += text.length;
      }
    }
  }

  // Apply min_messages threshold
  const messageCount = userMessages.length + assistantMessages.length;
  const minMessages = config.min_messages || 5;
  if (messageCount < minMessages) {
    return { text: '', messageCount, userMessages: [], assistantMessages: [] };
  }

  // Build conversation text, prioritizing recent messages if over limit
  let parts = [];
  const allMessages = [];

  // Interleave user and assistant messages in order
  const maxUser = userMessages.length;
  const maxAssistant = assistantMessages.length;
  const maxLen = Math.max(maxUser, maxAssistant);

  for (let i = 0; i < maxLen; i++) {
    if (i < maxUser) allMessages.push(`USER: ${userMessages[i]}`);
    if (i < maxAssistant) allMessages.push(`ASSISTANT: ${assistantMessages[i]}`);
  }

  // Take from the end if too large (recent messages are more relevant)
  let text = allMessages.join('\n\n');
  if (Buffer.byteLength(text) > MAX_CONVERSATION_BYTES) {
    // Work backwards from most recent
    parts = [];
    let size = 0;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msgSize = Buffer.byteLength(allMessages[i]);
      if (size + msgSize > MAX_CONVERSATION_BYTES) break;
      parts.unshift(allMessages[i]);
      size += msgSize;
    }
    text = parts.join('\n\n');
  }

  return { text, messageCount, userMessages, assistantMessages };
}

/**
 * Extract only human-typed text from a user message content.
 * Skips tool_result blocks (file contents, command output),
 * command messages, and system tags.
 */
function extractHumanText(content) {
  if (typeof content === 'string') {
    // Skip command messages
    if (content.includes('<command-name>') || content.includes('<command-message>') ||
        content.includes('<local-command')) {
      return '';
    }
    return content.trim();
  }

  if (Array.isArray(content)) {
    const textParts = [];
    for (const block of content) {
      if (typeof block === 'string') {
        textParts.push(block);
      } else if (block.type === 'text' && block.text) {
        // Skip skill/command injection text (usually very long prompt injections)
        if (block.text.includes('<command-name>') || block.text.includes('<command-message>')) {
          continue;
        }
        // Skip meta skill prompts (injected by skills, not typed by user)
        if (block.text.length > 2000) continue;
        textParts.push(block.text);
      }
      // Explicitly skip tool_result blocks — these are file contents, command output, etc.
    }
    const joined = textParts.join(' ').trim();
    return joined;
  }

  return '';
}

/**
 * Extract only text content from assistant messages.
 * Skips tool_use blocks (tool calls) — we only want the natural language responses.
 */
function extractAssistantText(content) {
  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    const textParts = [];
    for (const block of content) {
      if (typeof block === 'string') {
        textParts.push(block);
      } else if (block.type === 'text' && block.text) {
        // Cap individual assistant messages to avoid huge code explanations
        textParts.push(block.text.length > 1000 ? block.text.substring(0, 1000) + '...' : block.text);
      }
      // Skip tool_use blocks entirely
    }
    return textParts.join(' ').trim();
  }

  return '';
}

/**
 * Try AI-powered extraction using claude -p (haiku model).
 * Uses the user's existing Claude Code authentication — no API key needed.
 * Pipes conversation text via stdin using execSync's input option.
 */
async function tryAIExtraction(conversationText) {
  const prompt = 'Extract up to 10 memorable facts about the user from the conversation provided on stdin. Each must be a short factual statement (under 200 chars) in one of these categories: work_context, preferences, technical_style, ongoing_projects, tools_and_workflows. Only extract what the USER explicitly stated. Return ONLY valid JSON: {"memories":[{"category":"...","content":"..."}]}';

  try {
    const result = execSync(
      `claude -p "${prompt}" --model haiku --no-session-persistence --max-turns 2`,
      {
        input: conversationText,
        encoding: 'utf-8',
        timeout: 90000,
        shell: true,
        windowsHide: true
      }
    );

    // Parse the response — claude -p outputs text directly
    const trimmed = result.trim();

    // Find JSON in the response (may be wrapped in markdown code blocks)
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return [];

    const parsed = JSON.parse(trimmed.substring(jsonStart, jsonEnd + 1));
    if (parsed.memories && Array.isArray(parsed.memories)) {
      return parsed.memories.filter(m =>
        m && typeof m.category === 'string' && typeof m.content === 'string'
      );
    }

    return [];
  } catch (e) {
    // claude -p failed (not installed, timeout, auth issue, etc.) — fall back to heuristics
    process.stderr.write(`AI extraction fallback: ${e.message ? e.message.substring(0, 200) : 'unknown error'}\n`);
    return [];
  }
}

/**
 * Heuristic extraction fallback — pattern-match user messages for memorable content.
 */
function heuristicExtraction(conversation, config, workingDir) {
  const memories = [];
  const { userMessages, assistantMessages } = conversation;

  const allUserText = userMessages.join('\n');
  const allText = [...userMessages, ...assistantMessages].join('\n');

  // Preference patterns
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
          break;
        }
      }
    }
  }

  // Technology detection (2+ mentions required)
  const extCounts = {};
  const extPattern = /\.(ts|tsx|js|jsx|py|cs|java|go|rs|rb|php|vue|svelte|swift|kt|cpp|c|h)\b/gi;
  let match;
  while ((match = extPattern.exec(allText)) !== null) {
    const ext = match[1].toLowerCase();
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  const significantExts = Object.entries(extCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (significantExts.length) {
    memories.push({
      category: 'technical_style',
      content: `Works with file types: ${significantExts.map(([ext]) => `.${ext}`).join(', ')}`
    });
  }

  // Framework detection (2+ mentions required)
  const frameworks = [
    { names: ['React', 'react'], label: 'React' },
    { names: ['Next.js', 'nextjs', 'next/'], label: 'Next.js' },
    { names: ['Vue', 'vue'], label: 'Vue' },
    { names: ['Angular', 'angular'], label: 'Angular' },
    { names: ['Django', 'django'], label: 'Django' },
    { names: ['Express', 'express'], label: 'Express' },
    { names: ['Docker', 'docker', 'Dockerfile'], label: 'Docker' },
    { names: ['.NET', 'dotnet', 'ASP.NET', 'Entity Framework'], label: '.NET' },
    { names: ['Tailwind', 'tailwindcss'], label: 'Tailwind CSS' },
    { names: ['PostgreSQL', 'postgres'], label: 'PostgreSQL' },
    { names: ['MongoDB', 'mongoose'], label: 'MongoDB' },
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

  // Working directory as project context
  if (workingDir) {
    memories.push({
      category: 'ongoing_projects',
      content: `Worked in: ${workingDir}`
    });
  }

  return memories.slice(0, MAX_MEMORIES);
}

main().then(code => process.exit(code)).catch(() => process.exit(1));

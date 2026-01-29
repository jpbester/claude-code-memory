#!/usr/bin/env node
/**
 * Memory synthesis script for claude-code-memory.
 * Consolidates session memories into a unified MEMORY.md file.
 */
const fs = require('fs');
const path = require('path');
const { getMemoryDir, loadConfig } = require('./memory-utils');

const CATEGORY_ORDER = [
  'work_context',
  'ongoing_projects',
  'preferences',
  'technical_style',
  'tools_and_workflows'
];

const CATEGORY_NAMES = {
  work_context: 'Work Context',
  preferences: 'Preferences',
  technical_style: 'Technical Style',
  ongoing_projects: 'Ongoing Projects',
  tools_and_workflows: 'Tools & Workflows'
};

function formatCategoryName(category) {
  return CATEGORY_NAMES[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Load all session memory files.
 */
function loadSessionMemories(sessionsDir) {
  const memories = [];

  if (!fs.existsSync(sessionsDir)) {
    return memories;
  }

  const files = fs.readdirSync(sessionsDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(sessionsDir, file), 'utf-8');
      const sessionData = JSON.parse(raw);
      const timestamp = sessionData.timestamp || '';
      const workingDir = sessionData.working_directory || '';

      for (const mem of (sessionData.memories || [])) {
        memories.push({
          category: mem.category || 'other',
          content: mem.content || '',
          timestamp,
          working_directory: workingDir,
          source_file: file
        });
      }
    } catch (e) {
      process.stderr.write(`Warning: Could not load ${file}: ${e.message}\n`);
    }
  }

  return memories;
}

/**
 * Remove duplicate and similar memories, keeping the most recent.
 */
function deduplicateMemories(memories, maxPerCategory) {
  // Group by category
  const byCategory = {};
  for (const mem of memories) {
    if (!byCategory[mem.category]) {
      byCategory[mem.category] = [];
    }
    byCategory[mem.category].push(mem);
  }

  const deduplicated = {};

  for (const [category, mems] of Object.entries(byCategory)) {
    // Sort by timestamp (newest first)
    const sorted = [...mems].sort((a, b) => {
      const ta = a.timestamp || '';
      const tb = b.timestamp || '';
      return tb.localeCompare(ta);
    });

    const seenContent = [];
    const uniqueMems = [];

    for (const mem of sorted) {
      const content = mem.content.toLowerCase().trim();

      // Check for exact match or substring overlap
      let isDuplicate = false;
      for (const seen of seenContent) {
        if (content === seen) {
          isDuplicate = true;
          break;
        }
        if (content.length > 20 && seen.length > 20) {
          if (content.includes(seen) || seen.includes(content)) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (!isDuplicate) {
        seenContent.push(content);
        uniqueMems.push(mem);
        if (uniqueMems.length >= maxPerCategory) {
          break;
        }
      }
    }

    deduplicated[category] = uniqueMems;
  }

  return deduplicated;
}

/**
 * Generate the MEMORY.md content.
 */
function generateMemoryMd(memoriesByCategory, synthesisTime) {
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${synthesisTime.getFullYear()}-${pad(synthesisTime.getMonth() + 1)}-${pad(synthesisTime.getDate())} ${pad(synthesisTime.getHours())}:${pad(synthesisTime.getMinutes())}`;

  const lines = [
    '# Claude Code Memory',
    '',
    `*Last synthesized: ${timeStr}*`,
    ''
  ];

  // Add known categories first in order
  const addedCategories = new Set();

  for (const category of CATEGORY_ORDER) {
    const mems = memoriesByCategory[category];
    if (mems && mems.length) {
      lines.push(`## ${formatCategoryName(category)}`);
      for (const mem of mems) {
        lines.push(`- ${mem.content}`);
      }
      lines.push('');
      addedCategories.add(category);
    }
  }

  // Add any remaining categories
  for (const [category, mems] of Object.entries(memoriesByCategory)) {
    if (!addedCategories.has(category) && mems && mems.length) {
      lines.push(`## ${formatCategoryName(category)}`);
      for (const mem of mems) {
        lines.push(`- ${mem.content}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Remove session files older than specified days.
 */
function cleanupOldSessions(sessionsDir, days) {
  if (!fs.existsSync(sessionsDir)) {
    return 0;
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let removed = 0;

  const files = fs.readdirSync(sessionsDir).filter(f => f.startsWith('session_') && f.endsWith('.json'));

  for (const file of files) {
    try {
      // Parse timestamp from filename: session_YYYYMMDD_HHMMSS.json
      const name = file.replace('session_', '').replace('.json', '');
      const parts = name.split('_');
      if (parts.length === 2) {
        const dateStr = parts[0];
        const timeStr = parts[1];
        const year = parseInt(dateStr.substring(0, 4), 10);
        const month = parseInt(dateStr.substring(4, 6), 10) - 1;
        const day = parseInt(dateStr.substring(6, 8), 10);
        const hour = parseInt(timeStr.substring(0, 2), 10);
        const minute = parseInt(timeStr.substring(2, 4), 10);
        const second = parseInt(timeStr.substring(4, 6), 10);
        const fileDate = new Date(year, month, day, hour, minute, second);

        if (fileDate < cutoff) {
          fs.unlinkSync(path.join(sessionsDir, file));
          removed++;
        }
      }
    } catch {
      // Skip files we can't parse
    }
  }

  return removed;
}

/**
 * Save synthesis state for checking intervals.
 */
function saveSynthesisState(synthesisDir, synthesisTime) {
  fs.mkdirSync(synthesisDir, { recursive: true });
  const stateFile = path.join(synthesisDir, 'last-synthesis.json');
  const state = {
    last_synthesis: synthesisTime.toISOString(),
    version: '1.0'
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const noCleanup = args.includes('--no-cleanup');

  const memoryDir = getMemoryDir();
  const sessionsDir = path.join(memoryDir, 'sessions');
  const synthesisDir = path.join(memoryDir, 'synthesis');

  // Load configuration
  const config = loadConfig(memoryDir);

  console.log('Claude Code Memory Synthesis');
  console.log('='.repeat(40));

  // Load all session memories
  console.log('Loading session memories...');
  const memories = loadSessionMemories(sessionsDir);
  console.log(`  Found ${memories.length} memories from sessions`);

  if (!memories.length) {
    console.log('  No memories to synthesize');
    return 0;
  }

  // Deduplicate memories
  console.log('Deduplicating memories...');
  const maxPerCategory = config.max_memories_per_category || 15;
  const memoriesByCategory = deduplicateMemories(memories, maxPerCategory);

  const totalUnique = Object.values(memoriesByCategory).reduce((sum, mems) => sum + mems.length, 0);
  const categoryCount = Object.keys(memoriesByCategory).length;
  console.log(`  ${totalUnique} unique memories across ${categoryCount} categories`);

  // Generate MEMORY.md
  console.log('Generating MEMORY.md...');
  const synthesisTime = new Date();
  const memoryContent = generateMemoryMd(memoriesByCategory, synthesisTime);

  const memoryFile = path.join(memoryDir, 'MEMORY.md');
  fs.writeFileSync(memoryFile, memoryContent, 'utf-8');
  console.log(`  Written to ${memoryFile}`);

  // Save synthesis state
  saveSynthesisState(synthesisDir, synthesisTime);

  // Cleanup old sessions
  if (!noCleanup) {
    const cleanupDays = config.cleanup_after_days || 30;
    console.log(`Cleaning up sessions older than ${cleanupDays} days...`);
    const removed = cleanupOldSessions(sessionsDir, cleanupDays);
    if (removed) {
      console.log(`  Removed ${removed} old session files`);
    }
  }

  console.log('');
  console.log('Synthesis complete!');

  // Print summary
  console.log('');
  console.log('Memory Summary:');
  for (const category of CATEGORY_ORDER) {
    if (memoriesByCategory[category]) {
      const count = memoriesByCategory[category].length;
      console.log(`  ${formatCategoryName(category)}: ${count} memories`);
    }
  }

  return 0;
}

process.exit(main());

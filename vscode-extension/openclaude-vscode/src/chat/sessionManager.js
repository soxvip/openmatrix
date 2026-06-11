/**
 * sessionManager — reads JSONL session history from disk, lists sessions,
 * and provides metadata for the session list UI.
 *
 * Session files live under:
 *   ~/.openclaude/projects/<sanitized-cwd>/<sessionId>.jsonl
 *
 * Falls back to ~/.claude/projects/ for legacy installs.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');

const MAX_SANITIZED_LENGTH = 80;

function sanitizePath(name) {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_LENGTH) return sanitized;
  const hash = simpleHash(name);
  return sanitized.slice(0, MAX_SANITIZED_LENGTH) + '-' + hash;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function resolveConfigDir() {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  if (envDir) return envDir;
  const home = os.homedir();
  const openClaudeDir = path.join(home, '.openclaude');
  const legacyDir = path.join(home, '.claude');
  if (!fs.existsSync(openClaudeDir) && fs.existsSync(legacyDir)) {
    return legacyDir;
  }
  return openClaudeDir;
}

function getProjectsDir() {
  return path.join(resolveConfigDir(), 'projects');
}

function getProjectDir(cwd) {
  return path.join(getProjectsDir(), sanitizePath(cwd));
}

class SessionManager {
  constructor() {
    this._cwd = null;
  }

  setCwd(cwd) {
    this._cwd = cwd;
  }

  async listSessions() {
    const projectDir = this._cwd
      ? getProjectDir(this._cwd)
      : null;

    const dirs = projectDir
      ? [projectDir]
      : await this._allProjectDirs();

    const sessions = [];
    for (const dir of dirs) {
      const items = await this._readSessionDir(dir);
      sessions.push(...items);
    }

    sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sessions;
  }

  async _allProjectDirs() {
    const base = getProjectsDir();
    if (!fs.existsSync(base)) return [];
    try {
      const entries = await fsp.readdir(base, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => path.join(base, e.name));
    } catch {
      return [];
    }
  }

  async _readSessionDir(dir) {
    if (!fs.existsSync(dir)) return [];
    try {
      const files = await fsp.readdir(dir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
      const results = [];

      for (const file of jsonlFiles) {
        const filePath = path.join(dir, file);
        try {
          const meta = await this._extractSessionMeta(filePath);
          if (meta) results.push(meta);
        } catch { /* skip unreadable */ }
      }

      return results;
    } catch {
      return [];
    }
  }

  async _extractSessionMeta(filePath) {
    const sessionId = path.basename(filePath, '.jsonl');
    const stat = await fsp.stat(filePath);
    // Read a larger head because JSONL files often start with system/snapshot
    // entries before the first user message.
    const head = await this._readHead(filePath, 65536);
    const lines = head.split('\n').filter(Boolean);

    let title = null;
    let preview = '';
    let timestamp = stat.mtimeMs;
    let firstTimestamp = null;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        if (!preview && entry.type === 'user' && entry.message) {
          const content = entry.message.content;
          if (typeof content === 'string') {
            preview = content.slice(0, 120);
          } else if (Array.isArray(content)) {
            const textBlock = content.find(b => b.type === 'text');
            preview = textBlock ? (textBlock.text || '').slice(0, 120) : '';
          }
        }

        if (entry.type === 'custom-title' || entry.type === 'session-title') {
          title = entry.title || entry.name || null;
        }

        if (entry.type === 'summary' && entry.summary && !title) {
          title = entry.summary;
        }

        if (entry.timestamp && !firstTimestamp) {
          const t = typeof entry.timestamp === 'number'
            ? entry.timestamp
            : new Date(entry.timestamp).getTime();
          if (t && !isNaN(t)) firstTimestamp = t;
        }
      } catch { /* skip bad line */ }
    }

    if (firstTimestamp) timestamp = firstTimestamp;
    const timeLabel = formatRelativeTime(timestamp);

    // Capture the LAST user request so the history item shows where the
    // conversation left off. Reading just the tail is fast, but a single JSONL
    // line (an assistant turn with large tool results) can be hundreds of KB,
    // so a fixed tail window may contain no user message. Read a generous tail
    // first; if no user message is found, fall back to a full streaming scan.
    let lastMessage = '';
    try {
      const tail = await this._readTail(filePath, 262144, stat.size);
      const tailLines = tail.split('\n').filter(Boolean);
      for (let i = tailLines.length - 1; i >= 0; i--) {
        try {
          const text = extractUserText(JSON.parse(tailLines[i]));
          if (text) { lastMessage = text; break; }
        } catch { /* skip bad line */ }
      }
      // The tail may start mid-line; if it didn't cover the whole file and we
      // found nothing, scan the full file line-by-line (memory-friendly).
      if (!lastMessage && stat.size > 262144) {
        lastMessage = await this._findLastUserMessage(filePath);
      }
    } catch { /* read failed, leave lastMessage empty */ }

    return {
      id: sessionId,
      title: title || preview.slice(0, 60) || 'Untitled session',
      preview: preview || '',
      lastMessage,
      timestamp,
      timeLabel,
      filePath,
    };
  }

  async loadSession(sessionId) {
    const projectDir = this._cwd ? getProjectDir(this._cwd) : null;
    const dirs = projectDir ? [projectDir] : await this._allProjectDirs();

    for (const dir of dirs) {
      const filePath = path.join(dir, `${sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        return this._parseSessionFile(filePath);
      }
    }
    return null;
  }

  async _parseSessionFile(filePath) {
    const content = await fsp.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const messages = [];
    const toolResults = new Map();

    // First pass: collect tool results from user messages
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' && entry.message && Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_result' && block.tool_use_id) {
              const resultText = typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map(b => b.text || '').join('')
                  : '';
              toolResults.set(String(block.tool_use_id), {
                content: resultText.slice(0, 2000),
                isError: block.is_error || false,
              });
            }
          }
        }
      } catch { /* skip */ }
    }

    // Second pass: build messages with tool use details
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' && entry.message) {
          const c = entry.message.content;
          // Skip tool result messages (they're user messages with tool_result blocks)
          if (Array.isArray(c) && c.length > 0 && c[0].type === 'tool_result') continue;
          const text = typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? c.filter(b => b.type === 'text').map(b => b.text).join('')
              : '';
          if (text) messages.push({ role: 'user', text });
        } else if (entry.type === 'assistant' && entry.message) {
          const c = entry.message.content;
          const text = typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? c.filter(b => b.type === 'text').map(b => b.text).join('')
              : '';
          const toolUses = Array.isArray(c)
            ? c.filter(b => b.type === 'tool_use').map(tu => {
                const result = toolResults.get(String(tu.id));
                return {
                  id: tu.id,
                  name: tu.name,
                  input: tu.input || null,
                  status: result ? (result.isError ? 'error' : 'complete') : 'complete',
                  result: result ? result.content : null,
                  isError: result ? result.isError : false,
                };
              })
            : [];
          messages.push({ role: 'assistant', text, toolUses });
        }
      } catch { /* skip */ }
    }

    return messages;
  }

  async _readHead(filePath, bytes) {
    const fd = await fsp.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fd.read(buf, 0, bytes, 0);
      return buf.slice(0, bytesRead).toString('utf8');
    } finally {
      await fd.close();
    }
  }

  async _readTail(filePath, bytes, fileSize) {
    const fd = await fsp.open(filePath, 'r');
    try {
      const size = typeof fileSize === 'number' ? fileSize : (await fd.stat()).size;
      const start = Math.max(0, size - bytes);
      const len = size - start;
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fd.read(buf, 0, len, start);
      return buf.slice(0, bytesRead).toString('utf8');
    } finally {
      await fd.close();
    }
  }

  // Stream the whole file line-by-line to find the last user message. Used as a
  // fallback when the tail window contains no user message (e.g. very large
  // assistant turns). Memory-friendly: keeps only the latest match.
  async _findLastUserMessage(filePath) {
    return new Promise((resolve) => {
      let last = '';
      let stream;
      try {
        stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      } catch {
        resolve('');
        return;
      }
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on('line', (line) => {
        if (!line) return;
        try {
          const text = extractUserText(JSON.parse(line));
          if (text) last = text;
        } catch { /* skip bad line */ }
      });
      rl.on('close', () => resolve(last));
      rl.on('error', () => resolve(last));
      stream.on('error', () => { try { rl.close(); } catch {} resolve(last); });
    });
  }
}

function extractUserText(entry) {
  if (!entry || entry.type !== 'user' || !entry.message) return '';
  const content = entry.message.content;
  if (typeof content === 'string') return content.slice(0, 120);
  if (Array.isArray(content)) {
    const textBlock = content.find(b => b.type === 'text');
    return textBlock ? (textBlock.text || '').slice(0, 120) : '';
  }
  return '';
}

function formatRelativeTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(ts);
  return date.toLocaleDateString();
}

module.exports = { SessionManager };

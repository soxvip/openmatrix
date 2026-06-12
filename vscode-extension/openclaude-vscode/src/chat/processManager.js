/**
 * ProcessManager â€” spawns OpenClaude in print/SDK mode and manages the
 * NDJSON stdin/stdout lifecycle.
 *
 * Usage:
 *   const pm = new ProcessManager({ command, cwd, env });
 *   pm.onMessage(msg => { ... });
 *   pm.onError(err => { ... });
 *   pm.onExit(code => { ... });
 *   await pm.start();
 *   pm.sendUserMessage('Hello');
 *   pm.abort();          // SIGINT (graceful)
 *   pm.kill();           // SIGTERM (hard)
 *   pm.dispose();
 */

const { spawn, execFile } = require('child_process');
const vscode = require('vscode');
const { parseStdoutLine, serializeStdinMessage, buildUserMessage, buildControlResponse, buildSetModelRequest } = require('./protocol');


function buildProcessArgs({
  permissionMode = 'acceptEdits',
  sessionId = null,
  continueSession = false,
  model = null,
  extraArgs = [],
  appendSystemPrompt = '',
} = {}) {
  const args = [
    '--print',
    '--verbose',
    '--input-format=stream-json',
    '--output-format=stream-json',
    '--include-partial-messages',
    '--tools', 'default',
    '--permission-mode', permissionMode || 'acceptEdits',
  ];

  if (sessionId) {
    args.push('--resume', sessionId);
  } else if (continueSession) {
    args.push('--continue');
  }

  if (model) {
    args.push('--model', model);
  }

  if (appendSystemPrompt) {
    args.push('--append-system-prompt', String(appendSystemPrompt));
  }

  args.push(...(Array.isArray(extraArgs) ? extraArgs : []));
  return args;
}

function quoteCmdArg(value) {
  const str = String(value ?? '');
  if (!str) return '""';
  if (!/[\s"&()^|<>]/.test(str)) return str;
  return '"' + str.replace(/"/g, '\\"') + '"';
}

// On Windows the npm global `open-matrix` is a `.cmd` shim whose first line
// invokes a bare `node`. If the spawned cmd.exe cannot see node on PATH it dies
// with `'"node"' is not recognized` — and patching PATH is fragile because the
// extension host's env is unpredictable. The robust fix is to bypass the shim:
// resolve node.exe and the CLI's real JS entry point and invoke them directly,
// so neither PATH nor the shim matters. Returns { node, entry } or null.
function resolveDirectInvocation(command) {
  if (process.platform !== 'win32') return null;
  const fs = require('fs');
  const path = require('path');

  // Find node.exe absolutely (reuse resolveNodeDir's discovery, but we need the
  // dir even when node is already on PATH, so probe candidates directly too).
  const nodeCandidates = [];
  const nodeDir = resolveNodeDir();
  if (nodeDir) nodeCandidates.push(nodeDir);
  try {
    for (const dir of String(process.env.Path || process.env.PATH || '').split(';')) {
      if (dir) nodeCandidates.push(dir);
    }
  } catch { /* ignore */ }
  const sysDrive = process.env.SystemDrive || 'C:';
  nodeCandidates.push(path.join(sysDrive, '\\', 'Program Files', 'nodejs'));
  if (process.env.ProgramFiles) nodeCandidates.push(path.join(process.env.ProgramFiles, 'nodejs'));

  let nodeExe = null;
  for (const dir of nodeCandidates) {
    try {
      const p = path.join(dir, 'node.exe');
      if (fs.existsSync(p)) { nodeExe = p; break; }
    } catch { /* ignore */ }
  }
  if (!nodeExe) return null;

  // Locate the shim and its bundled JS entry. The shim lives in the npm global
  // bin dir; the entry is at node_modules/@gitlawb/openclaude/bin/open-matrix.
  const shimDirs = [];
  if (process.env.APPDATA) shimDirs.push(path.join(process.env.APPDATA, 'npm'));
  // command may be an absolute path to the shim already.
  try {
    if (command && (command.endsWith('.cmd') || command.includes('\\') || command.includes('/'))) {
      shimDirs.unshift(path.dirname(command));
    }
  } catch { /* ignore */ }

  for (const dir of shimDirs) {
    try {
      const entry = path.join(dir, 'node_modules', '@gitlawb', 'openclaude', 'bin', 'open-matrix');
      if (fs.existsSync(entry)) return { node: nodeExe, entry };
    } catch { /* ignore */ }
  }
  return null;
}

function withPdfToolPath(env) {
  if (process.platform !== 'win32') return env;
  if (env.OPEN_MATRIX_POPPLER_PATH) return env;

  const userProfile = env.USERPROFILE || process.env.USERPROFILE;
  if (!userProfile) return env;

  const extraPath = `${userProfile}\\bin`;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
  const currentPath = env[pathKey] || '';
  const entries = currentPath.split(';').filter(Boolean);

  if (entries.some((entry) => entry.toLowerCase() === extraPath.toLowerCase())) return env;

  return { ...env, [pathKey]: currentPath ? `${extraPath};${currentPath}` : extraPath };
}

// The npm global `open-matrix.cmd`/`open-matrix` shim invokes `node` on its
// first line.  The VS Code extension host runs on Electron (process.execPath is
// Code.exe), so the spawned shell only sees `node` if Node's install dir is on
// PATH.  When VS Code was launched before Node was installed (or PATH was not
// refreshed) the shim dies with "'node' is not recognized".  Prepend the
// directory that actually contains node to the child PATH.
function resolveNodeDir() {
  const fs = require('fs');
  const path = require('path');
  const isWin = process.platform === 'win32';
  const nodeBin = isWin ? 'node.exe' : 'node';

  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const sep = isWin ? ';' : ':';
  const seen = new Set();
  const onPath = String(process.env[pathKey] || '')
    .split(sep)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const dir of onPath) {
    try {
      if (fs.existsSync(path.join(dir, nodeBin))) return null; // already reachable
    } catch { /* ignore unreadable PATH entry */ }
  }

  const candidates = [];
  if (isWin) {
    // process.execPath is Code.exe under the extension host, but VS Code bundles
    // a node next to it on some installs — cheap to check.
    try { candidates.push(path.dirname(process.execPath)); } catch { /* ignore */ }
    if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'nodejs'));
    if (process.env['ProgramFiles(x86)']) candidates.push(path.join(process.env['ProgramFiles(x86)'], 'nodejs'));
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm'));
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs'));
      candidates.push(path.join(process.env.LOCALAPPDATA, 'fnm_multishells'));
    }
    // Hardcoded fallbacks: the extension host sometimes runs with ProgramFiles
    // unset (observed on Windows 11), which would otherwise skip the standard
    // install dir and let the npm shim die with '"node"' is not recognized.
    const sysDrive = process.env.SystemDrive || 'C:';
    candidates.push(path.join(sysDrive, '\\', 'Program Files', 'nodejs'));
    candidates.push(path.join(sysDrive, '\\', 'Program Files (x86)', 'nodejs'));
  } else {
    candidates.push('/usr/local/bin', '/usr/bin', '/opt/homebrew/bin');
    if (process.env.HOME) {
      candidates.push(path.join(process.env.HOME, '.local', 'bin'));
      candidates.push(path.join(process.env.HOME, '.volta', 'bin'));
    }
  }

  for (const dir of candidates) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    try {
      if (fs.existsSync(path.join(dir, nodeBin))) return dir;
    } catch { /* ignore */ }
  }
  return null;
}

function withNodeOnPath(env) {
  const sep = process.platform === 'win32' ? ';' : ':';
  // Collapse every case-variant PATH key (Windows env merges can leave both
  // 'Path' and 'PATH', and the spawned cmd.exe may inherit whichever one lacks
  // the nodejs dir, producing '"node"' is not recognized). Merge them into a
  // single canonical key so node is guaranteed to be reachable.
  const pathKeys = Object.keys(env).filter((key) => key.toLowerCase() === 'path');
  const canonicalKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const next = { ...env };
  let combined = '';
  if (pathKeys.length > 0) {
    const seen = new Set();
    const parts = [];
    for (const key of pathKeys) {
      for (const part of String(env[key] || '').split(sep)) {
        const norm = part.toLowerCase();
        if (part && !seen.has(norm)) { seen.add(norm); parts.push(part); }
      }
      if (key !== canonicalKey) delete next[key];
    }
    combined = parts.join(sep);
  }

  const nodeDir = resolveNodeDir();
  if (nodeDir && !combined.split(sep).map((e) => e.toLowerCase()).includes(nodeDir.toLowerCase())) {
    combined = combined ? `${nodeDir}${sep}${combined}` : nodeDir;
  }

  if (combined) next[canonicalKey] = combined;
  return next;
}

class ProcessManager {
  /**
   * @param {object} opts
   * @param {string} opts.command - The open-matrix binary (e.g. 'open-matrix')
   * @param {string} [opts.cwd] - Working directory
   * @param {Record<string,string>} [opts.env] - Extra env vars
   * @param {string} [opts.sessionId] - Session to resume
   * @param {boolean} [opts.continueSession] - Use --continue instead of --resume
   * @param {string} [opts.model] - Model override
   * @param {string[]} [opts.extraArgs] - Additional CLI flags
   * @param {string} [opts.appendSystemPrompt] - Extra system prompt guidance
   */
  constructor(opts) {
    this._command = opts.command || 'open-matrix';
    this._cwd = opts.cwd || undefined;
    this._env = opts.env || {};
    this._sessionId = opts.sessionId || null;
    this._continueSession = opts.continueSession || false;
    this._model = opts.model || null;
    this._permissionMode = opts.permissionMode || 'acceptEdits';
    this._extraArgs = opts.extraArgs || [];
    this._appendSystemPrompt = opts.appendSystemPrompt || '';
    this._execFile = typeof opts.execFile === 'function' ? opts.execFile : execFile;
    this._process = null;
    this._abortTimer = null;
    this._aborting = false;
    this._buffer = '';
    this._disposed = false;

    this._onMessageEmitter = new vscode.EventEmitter();
    this._onErrorEmitter = new vscode.EventEmitter();
    this._onExitEmitter = new vscode.EventEmitter();
    this.onMessage = this._onMessageEmitter.event;
    this.onError = this._onErrorEmitter.event;
    this.onExit = this._onExitEmitter.event;
  }

  get running() {
    return this._process !== null && !this._process.killed;
  }

  get sessionId() {
    return this._sessionId;
  }

  start() {
    if (this._disposed) throw new Error('ProcessManager is disposed');
    if (this._process) throw new Error('Process already started');

    const args = buildProcessArgs({
      permissionMode: this._permissionMode,
      sessionId: this._sessionId,
      continueSession: this._continueSession,
      model: this._model,
      extraArgs: this._extraArgs,
      appendSystemPrompt: this._appendSystemPrompt,
    });

    const spawnEnv = withNodeOnPath(withPdfToolPath({ ...process.env, ...this._env }));
    const isWin = process.platform === 'win32';

    if (isWin) {
      // Prefer invoking node.exe + the CLI entry directly so we depend on
      // neither the .cmd shim nor PATH (the shim falls back to a bare `node`
      // which fails when cmd.exe can't resolve it).
      const direct = resolveDirectInvocation(this._command);
      if (direct) {
        this._process = spawn(direct.node, [direct.entry, ...args], {
          cwd: this._cwd,
          env: spawnEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } else {
        // Fallback: npm global installs create .cmd shims that spawn() cannot
        // find without a shell. Build one command string so the deprecation
        // warning about unsanitised args does not fire.
        const cmdLine = [this._command, ...args].map(quoteCmdArg).join(' ');
        this._process = spawn(cmdLine, [], {
          cwd: this._cwd,
          env: spawnEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
          windowsHide: true,
        });
      }
    } else {
      this._process = spawn(this._command, args, {
        cwd: this._cwd,
        env: spawnEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    }

    this._process.stdout.setEncoding('utf8');
    this._process.stderr.setEncoding('utf8');

    this._process.stdout.on('data', (chunk) => this._onData(chunk));
    this._process.stderr.on('data', (chunk) => this._onStderr(chunk));
    this._process.on('error', (err) => this._onErrorEmitter.fire(err));
    this._process.on('close', (code, signal) => {
      this._clearAbortTimer();
      this._aborting = false;
      this._process = null;
      this._onExitEmitter.fire({ code, signal });
    });
  }

  _onData(chunk) {
    this._buffer += chunk;
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';

    for (const line of lines) {
      const msg = parseStdoutLine(line);
      if (msg) {
        this._extractSessionId(msg);
        this._onMessageEmitter.fire(msg);
      }
    }
  }

  _extractSessionId(msg) {
    if (msg.session_id && !this._sessionId) {
      this._sessionId = msg.session_id;
    }
  }

  _onStderr(chunk) {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    // Suppress common non-error noise from the CLI (deprecation warnings, model metadata warnings, etc.)
    if (/^\(node:\d+\)|^DeprecationWarning|^ExperimentalWarning/i.test(trimmed)) return;
    if (/^\[context\] Warning:/i.test(trimmed)) return;
    if (/^\.\.\. \(\d+ duplicate lines\)/i.test(trimmed)) return;
    this._onErrorEmitter.fire(new Error(trimmed));
  }

  sendUserMessage(content) {
    this._write(buildUserMessage(content));
  }

  sendControlResponse(requestId, result) {
    this._write(buildControlResponse(requestId, result));
  }

  // Switch the LLM model mid-session via the CLI's set_model control_request.
  // No relaunch needed; the running session adopts the new model.
  sendSetModel(model) {
    this._write(buildSetModelRequest(model));
  }

  write(msg) {
    if (!this._process || !this._process.stdin.writable) {
      throw new Error('Process is not running');
    }
    this._process.stdin.write(serializeStdinMessage(msg));
  }

  _write(msg) {
    this.write(msg);
  }

  abort() {
    if (!this._process || this._process.killed || this._aborting) return;

    this._aborting = true;
    this._process.kill('SIGINT');
    this._abortTimer = setTimeout(() => this._forceKillProcess(), 1500);
    if (this._abortTimer.unref) this._abortTimer.unref();
  }

  _clearAbortTimer() {
    if (!this._abortTimer) return;
    clearTimeout(this._abortTimer);
    this._abortTimer = null;
  }

  _forceKillProcess() {
    this._abortTimer = null;
    const proc = this._process;
    if (!proc || proc.killed) return;

    if (process.platform === 'win32' && proc.pid) {
      this._execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
      return;
    }

    proc.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (this._process && !this._process.killed) {
        this._process.kill('SIGKILL');
      }
    }, 1500);
    if (killTimer.unref) killTimer.unref();
  }

  kill() {
    if (this._process && !this._process.killed) {
      this._process.kill('SIGTERM');
    }
  }

  dispose() {
    this._disposed = true;
    this._clearAbortTimer();
    this.kill();
    this._onMessageEmitter.dispose();
    this._onErrorEmitter.dispose();
    this._onExitEmitter.dispose();
  }
}

// Run the CLI's read-only `--list-models --json` and return the parsed list,
// filtered by the active token's entitlements (filtering happens in the CLI).
// Reuses the same robust Windows invocation (node.exe + entry) as the chat.
function listModels(command, cwd, env) {
  const spawnEnv = withNodeOnPath(withPdfToolPath({ ...process.env, ...env }));
  const isWin = process.platform === 'win32';
  let file = command;
  let args = ['--list-models', '--json'];
  let useShell = false;
  if (isWin) {
    const direct = resolveDirectInvocation(command);
    if (direct) {
      file = direct.node;
      args = [direct.entry, ...args];
    } else {
      useShell = true;
    }
  }
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(file, args, { cwd, env: spawnEnv, shell: useShell, windowsHide: true });
    } catch (e) {
      reject(e);
      return;
    }
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', e => reject(e));
    child.on('close', code => {
      // The JSON is the last non-empty line (provider warnings may precede it).
      const line = stdout.split('\n').map(s => s.trim()).filter(Boolean).pop();
      if (!line) {
        reject(new Error(stderr.trim() || ('Sem saida de --list-models (codigo ' + code + ')')));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error('Falha ao parsear lista de modelos: ' + e.message));
      }
    });
  });
}

module.exports = { ProcessManager, buildProcessArgs, withPdfToolPath, withNodeOnPath, resolveDirectInvocation, listModels };

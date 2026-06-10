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
const { parseStdoutLine, serializeStdinMessage, buildUserMessage, buildControlResponse } = require('./protocol');


function buildProcessArgs({
  permissionMode = 'bypassPermissions',
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
    '--permission-mode', permissionMode || 'bypassPermissions',
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
    if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'nodejs'));
    if (process.env['ProgramFiles(x86)']) candidates.push(path.join(process.env['ProgramFiles(x86)'], 'nodejs'));
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm'));
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs'));
      candidates.push(path.join(process.env.LOCALAPPDATA, 'fnm_multishells'));
    }
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
  const nodeDir = resolveNodeDir();
  if (!nodeDir) return env;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || (process.platform === 'win32' ? 'Path' : 'PATH');
  const sep = process.platform === 'win32' ? ';' : ':';
  const currentPath = env[pathKey] || '';
  const entries = currentPath.split(sep).map((e) => e.toLowerCase());
  if (entries.includes(nodeDir.toLowerCase())) return env;
  return { ...env, [pathKey]: currentPath ? `${nodeDir}${sep}${currentPath}` : nodeDir };
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
    this._permissionMode = opts.permissionMode || 'bypassPermissions';
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
      // On Windows, npm global installs create .cmd shims that spawn()
      // cannot find without a shell.  Build one command string so the
      // deprecation warning about unsanitised args does not fire.
      const cmdLine = [this._command, ...args].map(quoteCmdArg).join(' ');
      this._process = spawn(cmdLine, [], {
        cwd: this._cwd,
        env: spawnEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
      });
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

module.exports = { ProcessManager, buildProcessArgs, withPdfToolPath };

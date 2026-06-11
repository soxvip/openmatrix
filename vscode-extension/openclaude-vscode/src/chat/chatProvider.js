/**
 * chatProvider â€” WebviewViewProvider (sidebar) and WebviewPanel manager
 * (editor tab) that wire ProcessManager events to the chat UI.
 */

const vscode = require('vscode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ProcessManager, withNodeOnPath, withPdfToolPath, resolveDirectInvocation } = require('./processManager');
const { SessionManager } = require('./sessionManager');
const { buildPermissionControlResult } = require('./permissionResponse');
const { toViewModel } = require('./messageParser');
const { renderChatHtml } = require('./chatRenderer');
const { attachmentFromPath, buildMessageContentWithAttachments } = require('./fileAttachments');
const { withBundledPopplerEnv } = require('../poppler');

function getPathKey(env) {
  return Object.keys(env || {}).find(k => k.toUpperCase() === 'PATH') || 'PATH';
}

function addKnownCliDirsToEnv(env) {
  const nextEnv = { ...(env || {}) };
  const candidates = [];
  if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, 'npm'));
  if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm'));
  const existingPathKey = getPathKey(process.env);
  const targetPathKey = getPathKey(nextEnv);
  const existingPath = nextEnv[targetPathKey] || process.env[existingPathKey] || '';
  const existingParts = new Set(String(existingPath).split(path.delimiter).map(p => p.toLowerCase()));
  const prepend = candidates.filter(dir => dir && fs.existsSync(dir) && !existingParts.has(dir.toLowerCase()));
  if (prepend.length > 0) {
    nextEnv[targetPathKey] = [...prepend, existingPath].filter(Boolean).join(path.delimiter);
  }
  return nextEnv;
}

const DEFAULT_APPEND_SYSTEM_PROMPT = [
  'Host note from VS Code extension: this session runs on Windows.',
  'Language policy: answer in the same natural language used by the user in the latest message. If the user writes Portuguese, all explanations, plans, progress summaries, and final responses must be in Portuguese. Keep code, identifiers, file names, commands, logs, tool names, API names, and exact errors unchanged when needed.',
  'When using shell commands, prefer Windows-compatible commands; call powershell.exe or cmd.exe explicitly when useful.',
  'Before retrying any failed Bash command, inspect cwd, path, stderr, and command availability. Do not repeat an identical failing Bash command three times.',
  'Use absolute paths for files outside the workspace.',
].join(' ');

const { isAssistantMessage, isPartialMessage, isStreamEvent,
        isContentBlockDelta, isContentBlockStart, isMessageStart,
        isResultMessage, isControlRequest, isToolProgressMessage,
        isStatusMessage, isRateLimitEvent, getTextContent,
        getToolUseBlocks } = require('./protocol');

async function openFileInEditor(filePath) {
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    vscode.window.showWarningMessage(`Could not open file: ${filePath}`);
  }
}

async function pickFilesForWebview(webview) {
  try {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: 'Anexar arquivos',
      title: 'Escolha arquivos para enviar ao OPEN MATRIX',
    });
    if (!uris || uris.length === 0) return;
    const attachments = [];
    const errors = [];
    for (const uri of uris) {
      try {
        attachments.push(await attachmentFromPath(uri.fsPath));
      } catch (err) {
        errors.push(err && err.message ? err.message : String(err));
      }
    }
    webview.postMessage({ type: 'attachments_picked', attachments });
    if (errors.length > 0) {
      webview.postMessage({ type: 'attachments_error', message: errors.join('\n') });
    }
  } catch (err) {
    webview.postMessage({ type: 'attachments_error', message: err && err.message ? err.message : String(err) });
  }
}

const ENHANCE_INSTRUCTION = [
  'Voce e um assistente que MELHORA prompts para um agente de programacao.',
  'Reescreva o texto do usuario de forma mais clara, especifica e acionavel,',
  'mantendo SEMPRE a intencao e o idioma original. Nao execute o pedido, apenas',
  'reescreva o prompt. Nao adicione preambulo, explicacao, aspas ou marcadores.',
  'Responda APENAS com o prompt melhorado, em texto puro.',
  '',
  'Prompt do usuario:',
].join('\n');

// Run a one-shot CLI query to rewrite the user's draft prompt. Reuses the same
// launch command/cwd/env as the chat, and the SAME robust invocation as the
// chat process (direct node.exe + entry on Windows, PATH fixups) so it does not
// fail with ENOENT when the npm global shim/PATH is not visible to the host.
async function enhancePromptForWebview(webview, text) {
  const draft = String(text || '').trim();
  if (!draft) {
    webview.postMessage({ type: 'enhance_prompt_error', message: 'Digite um prompt antes de melhorar.' });
    return;
  }
  const { command, cwd, env } = getLaunchConfig();
  const args = ['--print', '--output-format=text', `${ENHANCE_INSTRUCTION}\n${draft}`];
  const spawnEnv = withNodeOnPath(withPdfToolPath({ ...process.env, ...env }));
  const isWin = process.platform === 'win32';

  let file = command;
  let spawnArgs = args;
  let useShell = false;
  if (isWin) {
    const direct = resolveDirectInvocation(command);
    if (direct) {
      file = direct.node;
      spawnArgs = [direct.entry, ...args];
    } else {
      // Fall back to a shell so the .cmd shim resolves like in a terminal.
      useShell = true;
    }
  }

  try {
    const improved = await new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let child;
      try {
        child = spawn(file, spawnArgs, { cwd, env: spawnEnv, shell: useShell, windowsHide: true });
      } catch (e) {
        reject(e);
        return;
      }
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || ('A CLI saiu com codigo ' + code)));
          return;
        }
        resolve(stdout.trim());
      });
    });
    if (!improved) {
      webview.postMessage({ type: 'enhance_prompt_error', message: 'Nao foi possivel melhorar o prompt.' });
      return;
    }
    webview.postMessage({ type: 'enhance_prompt_result', text: improved });
  } catch (err) {
    webview.postMessage({ type: 'enhance_prompt_error', message: err && err.message ? err.message : String(err) });
  }
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'text/plain') return '.txt';
  return '.bin';
}

function sanitizePasteName(name, mimeType, index) {
  const fallback = `clipboard-${Date.now()}-${index}${extensionForMime(mimeType)}`;
  const base = path.basename(String(name || fallback)).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || fallback;
}

async function savePastedFilesForWebview(webview, files) {
  try {
    const items = Array.isArray(files) ? files : [];
    if (items.length === 0) return;
    const dir = path.join(os.tmpdir(), 'openmatrix-vscode-clipboard');
    await fs.promises.mkdir(dir, { recursive: true });
    const attachments = [];
    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      try {
        const rawData = String(item.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
        if (!rawData) throw new Error('Clipboard item sem dados base64');
        const bytes = Buffer.from(rawData, 'base64');
        if (bytes.length === 0) throw new Error('Clipboard item vazio');
        const maxBytes = 25 * 1024 * 1024;
        if (bytes.length > maxBytes) throw new Error(`Imagem colada muito grande (${bytes.length} bytes)`);
        const mimeType = String(item.mimeType || item.type || 'application/octet-stream');
        const prefix = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : crypto.randomBytes(4).toString('hex');
        const fileName = `${prefix}-${sanitizePasteName(item.name, mimeType, i)}`;
        const outPath = path.join(dir, fileName);
        await fs.promises.writeFile(outPath, bytes);
        attachments.push(await attachmentFromPath(outPath));
      } catch (err) {
        errors.push(err && err.message ? err.message : String(err));
      }
    }
    if (attachments.length > 0) {
      webview.postMessage({ type: 'attachments_picked', attachments });
    }
    if (errors.length > 0) {
      webview.postMessage({ type: 'attachments_error', message: errors.join('\n') });
    }
  } catch (err) {
    webview.postMessage({ type: 'attachments_error', message: err && err.message ? err.message : String(err) });
  }
}

// Files dropped from the VS Code explorer arrive as on-disk paths; attach them
// directly without round-tripping through base64.
async function attachDroppedPathsForWebview(webview, paths) {
  try {
    const items = Array.isArray(paths) ? paths : [];
    if (items.length === 0) return;
    const attachments = [];
    const errors = [];
    for (const raw of items) {
      const fsPath = String(raw || '').trim();
      if (!fsPath) continue;
      try {
        const stat = await fs.promises.stat(fsPath);
        if (stat.isDirectory()) {
          errors.push(`${fsPath}: pastas nao podem ser anexadas`);
          continue;
        }
        attachments.push(await attachmentFromPath(fsPath));
      } catch (err) {
        errors.push(err && err.message ? err.message : String(err));
      }
    }
    if (attachments.length > 0) {
      webview.postMessage({ type: 'attachments_picked', attachments });
    }
    if (errors.length > 0) {
      webview.postMessage({ type: 'attachments_error', message: errors.join('\n') });
    }
  } catch (err) {
    webview.postMessage({ type: 'attachments_error', message: err && err.message ? err.message : String(err) });
  }
}

function getLaunchConfig() {
  const cfg = vscode.workspace.getConfiguration('openmatrix');
  const command = cfg.get('launchCommand', 'open-matrix');
  const shimEnabled = cfg.get('useOpenAIShim', false);
  const permissionMode = cfg.get('permissionMode', 'acceptEdits');
  const rawExtraArgs = cfg.get('extraArgs', []);
  const extraArgs = Array.isArray(rawExtraArgs)
    ? rawExtraArgs.map(String).filter(Boolean)
    : [];
  const appendSystemPrompt = cfg.get('appendSystemPrompt', DEFAULT_APPEND_SYSTEM_PROMPT);
  let env = {};
  if (shimEnabled) env.CLAUDE_CODE_USE_OPENAI = '1';
  env = withBundledPopplerEnv(env);
  env = addKnownCliDirsToEnv(env);
  const folders = vscode.workspace.workspaceFolders;
  const cwd = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
  return { command, cwd, env, permissionMode, extraArgs, appendSystemPrompt };
}

class ChatController {
  constructor(sessionManager) {
    this._sessionManager = sessionManager;
    this._process = null;
    this._webviews = new Set();
    this._accumulatedText = '';
    this._toolUses = [];
    this._messages = [];
    this._currentSessionId = null;
    this._streaming = false;
    this._lastResult = null;
    this._permissionModeOverride = null;
    this._runtimeTools = 'default';
    this._thinkingTokens = 0;
    this._thinkingStartTime = null;
    this._currentBlockType = null;
    this._turnSawAssistantMessage = false;
    this._turnHadStreamDelta = false;
    this._lastAssistantText = '';
    /** @type {Map<string, { input: Record<string, unknown>, permissionSuggestions: unknown[], toolUseId: string | null }>} */
    this._pendingPermissions = new Map();

    this._tabId = null;

    this._onDidChangeState = new vscode.EventEmitter();
    this.onDidChangeState = this._onDidChangeState.event;
  }

  get sessionId() { return this._currentSessionId; }
  get isStreaming() { return this._process && this._process.running; }
  get sessionManager() { return this._sessionManager; }

  // Tab identity: every controller belongs to one chat tab. Broadcasts are
  // tagged with this id so a webview hosting multiple tabs can route messages
  // to the correct tab and ignore background-tab traffic for rendering.
  setTabId(tabId) { this._tabId = tabId; }
  get tabId() { return this._tabId || null; }
  get tabTitle() { return this._tabTitle || 'Conversa'; }
  setTabTitle(title) {
    const next = String(title || '').trim();
    if (next && next !== this._tabTitle) {
      this._tabTitle = next.length > 40 ? next.slice(0, 39) + '…' : next;
    }
  }

  registerWebview(webview) {
    this._webviews.add(webview);
    return { dispose: () => this._webviews.delete(webview) };
  }

  broadcast(msg) {
    const tagged = (msg && this._tabId && msg.tabId === undefined) ? { ...msg, tabId: this._tabId } : msg;
    for (const wv of this._webviews) {
      try { wv.postMessage(tagged); } catch { /* webview might be disposed */ }
    }
  }

  _broadcast(msg) {
    this.broadcast(msg);
  }

  // Find a stored toolUse by id (searching from the most recent assistant
  // message backwards) and merge in the given fields. Keeps the persisted
  // history in sync with live tool_result / tool_progress events so restored
  // tabs reflect the final tool state.
  _updateStoredToolUse(toolUseId, fields) {
    if (!toolUseId) return;
    for (let i = this._messages.length - 1; i >= 0; i--) {
      const m = this._messages[i];
      if (!m || !Array.isArray(m.toolUses)) continue;
      const tu = m.toolUses.find(t => t && t.id === toolUseId);
      if (tu) {
        Object.assign(tu, fields);
        return;
      }
    }
  }

  async startSession(opts = {}) {
    this.stopSession();
    this._accumulatedText = '';
    this._toolUses = [];
    this._turnSawAssistantMessage = false;
    this._turnHadStreamDelta = false;
    this._lastAssistantText = '';
    // Only clear messages if this is a brand new session (not continuing)
    if (!opts.continueSession && !opts.sessionId) {
      this._messages = [];
    }
    this._currentSessionId = opts.sessionId || this._currentSessionId || null;

    const launchConfig = getLaunchConfig();
    const { command, cwd, env, extraArgs, appendSystemPrompt } = launchConfig;
    const permissionMode = opts.permissionMode || this._permissionModeOverride || launchConfig.permissionMode || 'acceptEdits';

    this._process = new ProcessManager({
      command,
      cwd,
      env,
      sessionId: opts.sessionId,
      continueSession: opts.continueSession || false,
      model: opts.model,
      permissionMode,
      extraArgs: opts.extraArgs || extraArgs || [],
      appendSystemPrompt: opts.appendSystemPrompt ?? appendSystemPrompt,
    });

    this._readyResolve = null;
    this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });

    this._process.onMessage((msg) => {
      if (msg.type === 'system' && this._readyResolve) {
        this._readyResolve();
        this._readyResolve = null;
      }
      this._handleMessage(msg);
    });
    this._process.onError((err) => {
      this._broadcast({ type: 'error', message: err.message || String(err) });
    });
    this._process.onExit(({ code }) => {
      // Flush any remaining streamed text
      if (this._streaming && this._accumulatedText) {
        this._broadcast({ type: 'stream_end', text: this._accumulatedText, usage: null, final: true });
      } else if (this._streaming) {
        this._broadcast({ type: 'stream_end', text: '', usage: (this._lastResult || {}).usage || null, final: true });
      }
      this._streaming = false;
      this._accumulatedText = '';
      this._toolUses = [];
      this._lastResult = null;
      this._turnSawAssistantMessage = false;
      this._turnHadStreamDelta = false;
      this._lastAssistantText = '';
      this._broadcast({
        type: 'connected',
        message: code === 0 ? 'Ready' : `Process exited (code ${code})`,
      });
      this._onDidChangeState.fire('idle');
    });

    try {
      this._process.start();
      this._broadcast({ type: 'power_state', ...this.getPowerState(permissionMode) });
      this._broadcast({ type: 'connected', message: 'Connected' });
      this._onDidChangeState.fire('connected');
    } catch (err) {
      this._broadcast({ type: 'error', message: `Failed to start: ${err.message}` });
    }
  }

  stopSession() {
    if (this._process) {
      this._process.dispose();
      this._process = null;
    }
    this._pendingPermissions.clear();
  }

  getPowerState(permissionMode = null) {
    const mode = permissionMode || this._permissionModeOverride || getLaunchConfig().permissionMode || 'acceptEdits';
    const label = mode === 'bypassPermissions'
      ? 'Poder total'
      : mode === 'plan'
        ? 'Modo plano'
        : 'Modo seguro';
    return {
      label,
      permissionMode: mode,
      tools: this._runtimeTools,
      detail: `${label} \u00b7 tools ${this._runtimeTools} \u00b7 ${mode}`,
    };
  }

  async handleLocalSlashCommand(command) {
    const normalized = String(command || '').trim().toLowerCase();
    const nextModeByCommand = {
      '/full': 'bypassPermissions',
      '/safe': 'acceptEdits',
      '/plan': 'plan',
    };
    const nextMode = nextModeByCommand[normalized];
    if (!nextMode) return false;

    const resumeSessionId = this._currentSessionId || (this._process && this._process.sessionId) || null;
    this._permissionModeOverride = nextMode;
    // Restart CLI process so new permission mode is applied, but preserve
    // current session id. Next message resumes same CLI conversation with
    // new permission mode instead of losing history/context.
    this.stopSession();
    if (resumeSessionId) this._currentSessionId = resumeSessionId;
    const powerState = this.getPowerState(nextMode);
    this._broadcast({ type: 'power_state', ...powerState });
    this._broadcast({ type: 'status', content: `${powerState.detail} - contexto preservado; proxima mensagem retoma a mesma sessao` });
    this._onDidChangeState.fire('idle');
    return true;
  }

  async sendMessage(text, attachments = []) {
    if (text && !this._tabTitle) this.setTabTitle(text);
    // Keep the process alive for multi-turn â€” just send directly.
    // The CLI maintains full session state (tools, history) across turns.
    // Only start a new process if none exists or it died.
    if (!this._process || !this._process.running) {
      await this.startSession({
        sessionId: this._currentSessionId || undefined,
      });
    }
    await this._doSend(text, attachments);
  }

  async _doSend(text, attachments = []) {
    if (!this._process) return;
    // Send immediately. The CLI emits its initial system message only after
    // receiving the first stream-json user message, so waiting for `system` here
    // makes the chat look unresponsive.
    this._readyPromise = null;
    this._accumulatedText = '';
    this._toolUses = [];
    this._turnSawAssistantMessage = false;
    this._turnHadStreamDelta = false;
    this._lastAssistantText = '';
    try {
      const cfg = vscode.workspace.getConfiguration('openmatrix');
      const maxInlineImageBytes = cfg.get('maxInlineImageBytes', 5 * 1024 * 1024);
      const prepared = await buildMessageContentWithAttachments(text, attachments, { maxInlineImageBytes });
      for (const warning of prepared.warnings || []) {
        this._broadcast({ type: 'attachments_error', message: warning });
      }
      this._process.sendUserMessage(prepared.content);
      this._messages.push({ role: 'user', text: String(text || '').trim() || 'Analise os arquivos anexados.', attachments: prepared.attachments });
    } catch (err) {
      this._broadcast({ type: 'error', message: err.message });
    }
  }

  abort() {
    if (!this._process || !this._streaming) return;

    this._process.abort();
    this._streaming = false;
    this._pendingPermissions.clear();
    this._broadcast({
      type: 'stream_end',
      text: this._accumulatedText,
      usage: null,
      final: true,
      aborted: true,
    });
    this._accumulatedText = '';
    this._toolUses = [];
    this._lastResult = null;
    this._currentBlockType = null;
    this._turnSawAssistantMessage = false;
    this._turnHadStreamDelta = false;
    this._lastAssistantText = '';
    this._onDidChangeState.fire('idle');
  }

  sendPermissionResponse(requestId, action, toolUseId) {
    if (!this._process) return;
    const pending = this._pendingPermissions.get(requestId);
    this._pendingPermissions.delete(requestId);
    const result = buildPermissionControlResult(action, {
      input: pending?.input,
      toolUseId: toolUseId || pending?.toolUseId || null,
      permissionSuggestions: pending?.permissionSuggestions,
    });
    try {
      this._process.sendControlResponse(requestId, result);
    } catch (err) {
      this._broadcast({ type: 'error', message: err.message });
    }
  }

  getMessages() { return this._messages; }

  // Plan approval card: approving answers the ExitPlanMode permission with
  // "allow" and drops the session out of plan mode into an executing mode so
  // the agent can act. Rejecting answers "deny" and keeps plan mode. Context is
  // preserved because we only set an override; the running process keeps its
  // session.
  async handlePlanDecision(requestId, action, toolUseId) {
    const approve = action === 'allow';
    this.sendPermissionResponse(requestId, approve ? 'allow' : 'deny', toolUseId);
    if (approve) {
      this._permissionModeOverride = 'acceptEdits';
      const powerState = this.getPowerState('acceptEdits');
      this._broadcast({ type: 'power_state', ...powerState });
      this._broadcast({ type: 'status', content: 'Plano aprovado - executando com edicoes automaticas; contexto preservado' });
    } else {
      this._broadcast({ type: 'status', content: 'Plano mantido - continuando no modo plano' });
    }
  }
  _handleMessage(msg) {
    if (msg.session_id && !this._currentSessionId) {
      this._currentSessionId = msg.session_id;
    }

    // System message â€” extract model and session info
    if (msg.type === 'system') {
      this._broadcast({
        type: 'system_info',
        model: msg.model || null,
        sessionId: msg.session_id || msg.sessionId || null,
        tools: Array.isArray(msg.tools) ? msg.tools : [],
        permissionMode: msg.permissionMode || this._permissionModeOverride || null,
        slashCommands: Array.isArray(msg.slash_commands) ? msg.slash_commands : [],
        agents: Array.isArray(msg.agents) ? msg.agents : [],
        skills: Array.isArray(msg.skills) ? msg.skills : [],
      });
      this._broadcast({
        type: 'power_state',
        ...this.getPowerState(msg.permissionMode || this._permissionModeOverride),
      });
      return;
    }

    // Control request (permission prompt) â€” check EARLY before other handlers
    if (msg.type === 'control_request' || isControlRequest(msg)) {
      const req = msg.request || {};
      const { toolDisplayName, parseToolInput } = require('./messageParser');
      const requestId = msg.request_id;
      const toolInput =
        req.input && typeof req.input === 'object' && !Array.isArray(req.input)
          ? req.input
          : {};
      if (requestId) {
        this._pendingPermissions.set(requestId, {
          input: toolInput,
          permissionSuggestions: Array.isArray(req.permission_suggestions)
            ? req.permission_suggestions
            : [],
          toolUseId: req.tool_use_id || null,
        });
      }
      const toolName = req.tool_name || 'Desconhecida';
      const isPlanApproval = /exitplanmode/i.test(String(toolName));
      const planText = isPlanApproval
        ? String((toolInput && (toolInput.plan || toolInput.message)) || '')
        : '';
      this._broadcast({
        type: 'permission_request',
        requestId,
        toolName,
        displayName: req.display_name || req.title || toolDisplayName(req.tool_name),
        description: req.description || '',
        inputPreview: parseToolInput(req.input),
        toolUseId: req.tool_use_id || null,
        isPlanApproval,
        planText,
      });
      return;
    }

    // Control cancel request
    if (msg.type === 'control_cancel_request') {
      return;
    }

    // Handle Anthropic raw stream events (the primary streaming mechanism)
    if (isStreamEvent(msg)) {
      this._handleStreamEvent(msg);
      return;
    }

    // Assistant message â€” always mid-turn; true completion comes from 'result'
    if (isAssistantMessage(msg)) {
      const inner = msg.message || msg;
      const text = getTextContent(inner);
      const toolBlocks = getToolUseBlocks(inner);
      const { toolDisplayName, toolIcon } = require('./messageParser');
      const toolUseVms = toolBlocks.map(tu => ({
        id: tu.id,
        name: tu.name,
        displayName: toolDisplayName(tu.name),
        icon: toolIcon(tu.name),
        inputPreview: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input || ''),
        input: tu.input,
        status: 'running',
      }));
      this._turnSawAssistantMessage = true;
      this._lastAssistantText = text || '';
      this._messages.push({ role: 'assistant', text, toolUses: toolUseVms });
      const usage = inner.usage || msg.usage || null;

      // Finalize current text bubble but stay streaming â€” true completion
      // is signaled by the 'result' message, not by the assistant message.
      this._broadcast({ type: 'stream_end', text, usage, final: false });
      this._accumulatedText = '';

      if (toolBlocks.length > 0) {
        for (const tu of toolBlocks) {
          this._broadcast({
            type: 'tool_input_ready',
            toolUseId: tu.id,
            input: tu.input,
            name: tu.name,
          });
        }
        this._broadcast({ type: 'status', content: 'Usando ferramentas...' });
      }
      return;
    }

    // User message with tool_use_result â€” this is the tool output
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            const resultText = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map(b => b.text || '').join('')
                : '';
            const output = resultText.slice(0, 2000) || '(concluido)';
            const isError = block.is_error || false;
            // Persist the result onto the stored toolUse so restored tabs show
            // the final state instead of being stuck on "Executando...".
            this._updateStoredToolUse(block.tool_use_id, {
              status: isError ? 'error' : 'complete',
              result: output,
              isError,
            });
            this._broadcast({
              type: 'tool_result',
              toolUseId: block.tool_use_id,
              content: output,
              isError,
            });
          }
        }
      }
      this._broadcast({ type: 'status', content: 'Pensando...' });
      return;
    }

    // Session result â€” turn is complete. Go idle. The process stays alive
    // in stream-json mode for multi-turn conversation.
    if (msg.type === 'result' && msg.subtype) {
      this._lastResult = msg;
      // Only use result text if nothing was shown via streaming yet. Some
      // failures arrive only in the final result object.
      const resultText = typeof msg.result === 'string'
        ? msg.result
        : typeof msg.error === 'string'
          ? msg.error
          : typeof msg.message === 'string'
            ? msg.message
            : '';
      const alreadyDisplayed = this._turnSawAssistantMessage || this._turnHadStreamDelta;
      const text = this._accumulatedText || (alreadyDisplayed ? '' : resultText) || '';
      // Persist the final usage onto the last assistant message so a restored
      // tab shows the real token counts instead of "0 entrada / 0 saida".
      if (msg.usage) {
        for (let i = this._messages.length - 1; i >= 0; i--) {
          if (this._messages[i].role === 'assistant') {
            this._messages[i].usage = msg.usage;
            break;
          }
        }
      }
      this._broadcast({ type: 'stream_end', text, usage: msg.usage || null, final: true });
      // Show turn info: if the model stopped without using tools (num_turns=1),
      // the user knows the model chose not to edit
      if (msg.num_turns !== undefined) {
        const reason = msg.stop_reason || 'done';
        this._broadcast({
          type: 'status',
          content: msg.num_turns > 1
            ? 'Concluido (' + msg.num_turns + ' turnos)'
            : 'Pronto',
        });
      }
      this._accumulatedText = '';
      this._toolUses = [];
      this._streaming = false;
      this._turnSawAssistantMessage = false;
      this._turnHadStreamDelta = false;
      this._lastAssistantText = '';
      this._onDidChangeState.fire('idle');
      return;
    }

    if (isToolProgressMessage(msg)) {
      const vm = toViewModel(msg)[0];
      this._updateStoredToolUse(vm.toolUseId, { result: vm.content });
      this._broadcast({
        type: 'tool_progress',
        toolUseId: vm.toolUseId,
        content: vm.content,
      });
      return;
    }

    if (isStatusMessage(msg)) {
      const vm = toViewModel(msg)[0];
      this._broadcast({ type: 'status', content: vm.content });
      return;
    }

    if (isRateLimitEvent(msg)) {
      const vm = toViewModel(msg)[0];
      this._broadcast({ type: 'rate_limit', message: vm.message });
      return;
    }

    // Log unhandled message types for debugging
    if (msg.type && msg.type !== 'stream_event') {
      this._broadcast({ type: 'status', content: '[debug] unhandled: ' + msg.type });
    }
  }

  _handleStreamEvent(msg) {
    const event = msg.event;
    if (!event) return;

    switch (event.type) {
      case 'message_start':
        this._accumulatedText = '';
        this._thinkingTokens = 0;
        this._currentBlockType = null;
        this._turnSawAssistantMessage = false;
        this._turnHadStreamDelta = false;
        this._lastAssistantText = '';
        if (!this._streaming) {
          this._streaming = true;
          this._toolUses = [];
          this._onDidChangeState.fire('streaming');
        }
        this._broadcast({ type: 'stream_start' });
        break;

      case 'content_block_start':
        if (event.content_block) {
          this._currentBlockType = event.content_block.type;
          if (event.content_block.type === 'tool_use') {
            const tu = event.content_block;
            this._toolUses.push({ id: tu.id, name: tu.name, input: '' });
            const { toolDisplayName, toolIcon } = require('./messageParser');
            this._broadcast({
              type: 'tool_use',
              toolUse: {
                id: tu.id,
                name: tu.name,
                displayName: toolDisplayName(tu.name),
                icon: toolIcon(tu.name),
                inputPreview: '',
                input: tu.input || null,
                status: 'running',
              },
            });
          } else if (event.content_block.type === 'thinking') {
            this._thinkingTokens = 0;
            this._thinkingStartTime = Date.now();
            this._broadcast({ type: 'thinking_start' });
          }
        }
        break;

      case 'content_block_delta':
        if (event.delta) {
          if (event.delta.type === 'text_delta' && event.delta.text) {
            this._turnHadStreamDelta = true;
            this._accumulatedText += event.delta.text;
            this._broadcast({ type: 'stream_delta', text: this._accumulatedText });
          } else if (event.delta.type === 'thinking_delta') {
            this._thinkingTokens += (event.delta.thinking || '').length;
            const elapsed = Math.round((Date.now() - (this._thinkingStartTime || Date.now())) / 1000);
            this._broadcast({
              type: 'thinking_delta',
              tokens: this._thinkingTokens,
              elapsed,
            });
          } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
            const lastTool = this._toolUses[this._toolUses.length - 1];
            if (lastTool) {
              lastTool.input = (lastTool.input || '') + event.delta.partial_json;
            }
          }
        }
        break;

      case 'content_block_stop':
        if (this._currentBlockType === 'thinking') {
          this._broadcast({ type: 'thinking_end' });
        }
        this._currentBlockType = null;
        break;

      case 'message_delta':
        break;

      case 'message_stop':
        break;

      default:
        break;
    }
  }

  dispose() {
    this.stopSession();
    this._onDidChangeState.dispose();
  }
}

// Manages multiple ChatController instances — one per chat tab. Each tab owns
// its own CLI process, message history and session id, so switching tabs keeps
// every conversation's context alive. All controllers fan their broadcasts out
// to the same set of webviews, tagged with their tabId; the webview shows only
// the active tab and keeps the others buffered.
class ChatTabManager {
  constructor(sessionManager) {
    this._sessionManager = sessionManager;
    /** @type {Map<string, ChatController>} */
    this._controllers = new Map();
    this._webviews = new Set();
    this._activeTabId = null;
    this._seq = 0;
    this._onDidChangeState = new vscode.EventEmitter();
    this.onActiveState = this._onDidChangeState.event;
  }

  maybeTitleFromText(tabId, text) {
    const ctl = this._controllers.get(tabId);
    if (ctl) {
      ctl.setTabTitle(text);
      this._broadcastTabs();
    }
  }

  registerWebview(webview) {
    this._webviews.add(webview);
    for (const controller of this._controllers.values()) {
      controller.registerWebview(webview);
    }
    return { dispose: () => {
      this._webviews.delete(webview);
      for (const controller of this._controllers.values()) {
        controller._webviews.delete(webview);
      }
    } };
  }

  _newTabId() {
    this._seq += 1;
    return `tab-${Date.now().toString(36)}-${this._seq}`;
  }

  createTab(opts = {}) {
    const tabId = opts.tabId || this._newTabId();
    const controller = new ChatController(this._sessionManager);
    controller.setTabId(tabId);
    for (const wv of this._webviews) controller.registerWebview(wv);
    controller.onDidChangeState((state) => {
      if (tabId === this._activeTabId) this._onDidChangeState.fire(state);
    });
    this._controllers.set(tabId, controller);
    this._activeTabId = tabId;
    this._broadcastTabs();
    return tabId;
  }

  // Forward the active tab's streaming state to a single listener (e.g. the
  // status bar). Only the active tab drives the indicator.
  onActiveState(listener) {
    this._stateListener = listener;
  }

  newChatActive() {
    const ctl = this.getActive();
    if (ctl) {
      ctl.stopSession();
      ctl.broadcast({ type: 'session_cleared' });
    }
  }

  abortActive() {
    const ctl = this.getActive();
    if (ctl) ctl.abort();
  }

  get(tabId) { return this._controllers.get(tabId) || null; }

  getActive() { return this._activeTabId ? this._controllers.get(this._activeTabId) : null; }

  ensureTab(tabId) {
    if (tabId && this._controllers.has(tabId)) return this._controllers.get(tabId);
    const id = this.createTab({ tabId });
    return this._controllers.get(id);
  }

  setActive(tabId) {
    if (!this._controllers.has(tabId)) return;
    this._activeTabId = tabId;
    this._broadcastTabs();
  }

  // Derive a short tab title from the first user message so tabs are
  // distinguishable without manual naming.
  maybeTitleFromText(tabId, text) {
    const ctrl = this._controllers.get(tabId);
    if (!ctrl) return;
    if (ctrl.tabTitle && ctrl.tabTitle !== 'Conversa') return;
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    ctrl.setTabTitle(clean);
    this._broadcastTabs();
  }

  closeTab(tabId) {
    const controller = this._controllers.get(tabId);
    if (!controller) return;
    controller.dispose();
    this._controllers.delete(tabId);
    if (this._activeTabId === tabId) {
      const remaining = Array.from(this._controllers.keys());
      this._activeTabId = remaining.length ? remaining[remaining.length - 1] : null;
    }
    if (this._controllers.size === 0) {
      this.createTab();
    } else {
      this._broadcastTabs();
    }
  }

  _tabSummaries() {
    return Array.from(this._controllers.entries()).map(([id, ctrl]) => ({
      tabId: id,
      title: ctrl.tabTitle || 'Conversa',
      streaming: Boolean(ctrl.isStreaming),
      active: id === this._activeTabId,
    }));
  }

  _broadcastTabs() {
    const payload = { type: 'tabs_state', tabs: this._tabSummaries(), activeTabId: this._activeTabId };
    for (const wv of this._webviews) {
      try { wv.postMessage(payload); } catch { /* disposed */ }
    }
  }

  dispose() {
    for (const controller of this._controllers.values()) controller.dispose();
    this._controllers.clear();
    this._webviews.clear();
  }
}

class OpenMatrixChatViewProvider {
  constructor(tabManager) {
    this._tabs = tabManager;
    this._webviewView = null;
  }

  // Resolve the controller for an incoming webview message, creating the tab if
  // needed so the very first message lands in a real conversation.
  _ctl(msg) {
    const tabId = msg && msg.tabId;
    if (tabId) return this._tabs.ensureTab(tabId);
    return this._tabs.getActive() || this._tabs.ensureTab(null);
  }

  resolveWebviewView(webviewView, _context, _token) {
    this._webviewView = webviewView;
    const webview = webviewView.webview;
    webview.options = { enableScripts: true };

    const registration = this._tabs.registerWebview(webview);
    webviewView.onDidDispose(() => {
      registration.dispose();
      if (this._webviewView === webviewView) this._webviewView = null;
    });

    // A hidden WebviewView does not reliably receive postMessage updates, and
    // VS Code does not replay them when it becomes visible again. Without this,
    // streaming updates sent while the sidebar was hidden never render until the
    // user forces a refresh (e.g. switching tabs). On re-show, re-sync the tab
    // bar and restore the active tab's messages so the UI reflects live state.
    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) return;
      this._tabs._broadcastTabs();
      const active = this._tabs.getActive();
      if (active) this._restoreMessagesFor(webview, active.tabId);
    });

    webview.html = this._getHtml(webview);
    this._attachMessageHandler(webview);
  }

  _getHtml() {
    const nonce = crypto.randomBytes(16).toString('hex');
    return renderChatHtml({ nonce, platform: process.platform });
  }

  _attachMessageHandler(webview) {
    webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'send_message': {
          const ctl = this._ctl(msg);
          ctl.sendMessage(msg.text, msg.attachments);
          if (msg.text) this._tabs.maybeTitleFromText(ctl.tabId, msg.text);
          break;
        }
        case 'pick_files':
          await pickFilesForWebview(webview);
          break;
        case 'enhance_prompt':
          await enhancePromptForWebview(webview, msg.text);
          break;
        case 'paste_files':
          await savePastedFilesForWebview(webview, msg.files);
          break;
        case 'drop_files':
          await savePastedFilesForWebview(webview, msg.files);
          break;
        case 'drop_paths':
          await attachDroppedPathsForWebview(webview, msg.paths);
          break;
        case 'local_slash_command':
          await this._ctl(msg).handleLocalSlashCommand(msg.command);
          break;
        case 'abort':
          this._ctl(msg).abort();
          break;
        case 'new_tab':
          this._tabs.createTab();
          break;
        case 'switch_tab':
          this._tabs.setActive(msg.tabId);
          this._restoreMessagesFor(webview, msg.tabId);
          break;
        case 'close_tab':
          this._tabs.closeTab(msg.tabId);
          break;
        case 'new_session': {
          const ctl = this._ctl(msg);
          ctl.stopSession();
          webview.postMessage({ type: 'session_cleared', tabId: ctl.tabId });
          break;
        }
        case 'resume_session': {
          const ctl = this._ctl(msg);
          ctl.stopSession();
          webview.postMessage({ type: 'session_cleared', tabId: ctl.tabId });
          await this._loadAndDisplaySession(webview, ctl, msg.sessionId);
          await ctl.startSession({ sessionId: msg.sessionId });
          break;
        }
        case 'permission_response':
          this._ctl(msg).sendPermissionResponse(msg.requestId, msg.action, msg.toolUseId);
          break;
        case 'plan_decision':
          await this._ctl(msg).handlePlanDecision(msg.requestId, msg.action, msg.toolUseId);
          break;
        case 'copy_code':
          if (msg.text) await vscode.env.clipboard.writeText(msg.text);
          break;
        case 'open_file':
          if (msg.path) await openFileInEditor(msg.path);
          break;
        case 'request_sessions':
          await this._sendSessionList(webview);
          break;
        case 'restore_request':
          this._restoreMessagesFor(webview, msg.tabId);
          break;
        case 'webview_ready':
          this._tabs._broadcastTabs();
          this._sendSessionList(webview);
          break;
      }
    });
  }

  async _sendSessionList(webview) {
    const ctl = this._tabs.getActive();
    let sessionManager = ctl && ctl.sessionManager;
    // Fallback: on first webview load the active controller may not be ready
    // yet. Listing sessions only reads JSONL files from disk, so we can use a
    // temporary SessionManager seeded with the workspace cwd.
    if (!sessionManager) {
      try {
        const folders = vscode.workspace.workspaceFolders;
        const cwd = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
        sessionManager = new SessionManager();
        if (cwd) sessionManager.setCwd(cwd);
      } catch {
        webview.postMessage({ type: 'session_list', sessions: [] });
        return;
      }
    }
    try {
      const sessions = await sessionManager.listSessions();
      webview.postMessage({ type: 'session_list', sessions });
    } catch {
      webview.postMessage({ type: 'session_list', sessions: [] });
    }
  }

  _restoreMessagesFor(webview, tabId) {
    const ctl = this._tabs.get(tabId) || this._tabs.getActive();
    if (!ctl) return;
    const messages = ctl.getMessages();
    webview.postMessage({ type: 'restore_messages', messages: messages || [], tabId: ctl.tabId });
  }

  async _loadAndDisplaySession(webview, ctl, sessionId) {
    if (!ctl || !ctl.sessionManager) return;
    try {
      const messages = await ctl.sessionManager.loadSession(sessionId);
      if (messages && messages.length > 0) {
        ctl._messages = messages;
        webview.postMessage({ type: 'restore_messages', messages, tabId: ctl.tabId });
      }
    } catch { /* session may not be loadable */ }
  }
}

class OpenMatrixChatPanelManager {
  constructor(tabManager) {
    this._tabs = tabManager;
    this._panel = null;
  }

  _ctl(msg) {
    const tabId = msg && msg.tabId;
    if (tabId) return this._tabs.ensureTab(tabId);
    return this._tabs.getActive() || this._tabs.ensureTab(null);
  }

  openPanel() {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'openclaude.chatPanel',
      'OpenMatrix Chat',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const webview = this._panel.webview;
    const registration = this._tabs.registerWebview(webview);

    this._panel.onDidDispose(() => {
      registration.dispose();
      this._panel = null;
    });

    const nonce = crypto.randomBytes(16).toString('hex');
    webview.html = renderChatHtml({ nonce, platform: process.platform });
    this._attachMessageHandler(webview);

    this._tabs._broadcastTabs();
    const active = this._tabs.getActive();
    if (active) {
      const messages = active.getMessages();
      if (messages && messages.length > 0) {
        webview.postMessage({ type: 'restore_messages', messages, tabId: active.tabId });
      }
    }
  }

  _attachMessageHandler(webview) {
    webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'send_message': {
          const ctl = this._ctl(msg);
          ctl.sendMessage(msg.text, msg.attachments);
          if (msg.text) this._tabs.maybeTitleFromText(ctl.tabId, msg.text);
          break;
        }
        case 'pick_files':
          await pickFilesForWebview(webview);
          break;
        case 'enhance_prompt':
          await enhancePromptForWebview(webview, msg.text);
          break;
        case 'paste_files':
          await savePastedFilesForWebview(webview, msg.files);
          break;
        case 'drop_files':
          await savePastedFilesForWebview(webview, msg.files);
          break;
        case 'drop_paths':
          await attachDroppedPathsForWebview(webview, msg.paths);
          break;
        case 'local_slash_command':
          await this._ctl(msg).handleLocalSlashCommand(msg.command);
          break;
        case 'abort':
          this._ctl(msg).abort();
          break;
        case 'new_tab':
          this._tabs.createTab();
          break;
        case 'switch_tab':
          this._tabs.setActive(msg.tabId);
          this._restoreMessagesFor(webview, msg.tabId);
          break;
        case 'close_tab':
          this._tabs.closeTab(msg.tabId);
          break;
        case 'new_session': {
          const ctl = this._ctl(msg);
          ctl.stopSession();
          webview.postMessage({ type: 'session_cleared', tabId: ctl.tabId });
          break;
        }
        case 'resume_session': {
          const ctl = this._ctl(msg);
          ctl.stopSession();
          webview.postMessage({ type: 'session_cleared', tabId: ctl.tabId });
          await this._loadAndDisplaySession(webview, ctl, msg.sessionId);
          await ctl.startSession({ sessionId: msg.sessionId });
          break;
        }
        case 'permission_response':
          this._ctl(msg).sendPermissionResponse(msg.requestId, msg.action, msg.toolUseId);
          break;
        case 'plan_decision':
          await this._ctl(msg).handlePlanDecision(msg.requestId, msg.action, msg.toolUseId);
          break;
        case 'copy_code':
          if (msg.text) await vscode.env.clipboard.writeText(msg.text);
          break;
        case 'open_file':
          if (msg.path) await openFileInEditor(msg.path);
          break;
        case 'request_sessions':
          await this._sendSessionList(webview);
          break;
        case 'restore_request':
          this._restoreMessagesFor(webview, msg.tabId);
          break;
        case 'webview_ready':
          this._tabs._broadcastTabs();
          this._sendSessionList(webview);
          break;
      }
    });
  }

  async _sendSessionList(webview) {
    const ctl = this._tabs.getActive();
    let sessionManager = ctl && ctl.sessionManager;
    // Fallback: on first webview load the active controller may not be ready
    // yet. Listing sessions only reads JSONL files from disk, so we can use a
    // temporary SessionManager seeded with the workspace cwd.
    if (!sessionManager) {
      try {
        const folders = vscode.workspace.workspaceFolders;
        const cwd = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
        sessionManager = new SessionManager();
        if (cwd) sessionManager.setCwd(cwd);
      } catch {
        webview.postMessage({ type: 'session_list', sessions: [] });
        return;
      }
    }
    try {
      const sessions = await sessionManager.listSessions();
      webview.postMessage({ type: 'session_list', sessions });
    } catch {
      webview.postMessage({ type: 'session_list', sessions: [] });
    }
  }

  _restoreMessagesFor(webview, tabId) {
    const ctl = this._tabs.get(tabId) || this._tabs.getActive();
    if (!ctl) return;
    const messages = ctl.getMessages();
    webview.postMessage({ type: 'restore_messages', messages: messages || [], tabId: ctl.tabId });
  }

  async _loadAndDisplaySession(webview, ctl, sessionId) {
    if (!ctl || !ctl.sessionManager) return;
    try {
      const messages = await ctl.sessionManager.loadSession(sessionId);
      if (messages && messages.length > 0) {
        ctl._messages = messages;
        webview.postMessage({ type: 'restore_messages', messages, tabId: ctl.tabId });
      }
    } catch { /* session may not be loadable */ }
  }

  dispose() {
    if (this._panel) {
      this._panel.dispose();
      this._panel = null;
    }
  }
}

module.exports = {
  ChatController,
  ChatTabManager,
  OpenMatrixChatViewProvider,
  OpenMatrixChatPanelManager,
};

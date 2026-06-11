const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('bun:test');

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  mock.restore();
  process.env = { ...ORIGINAL_ENV };
});

function loadProcessManager() {
  const modulePath = require.resolve('./processManager');
  delete require.cache[modulePath];
  mock.module('vscode', () => ({
    EventEmitter: class {
      constructor() { this.event = () => ({ dispose() {} }); }
      fire() {}
      dispose() {}
    },
  }));
  return require('./processManager');
}

test('buildProcessArgs uses acceptEdits by default', () => {
  const { buildProcessArgs } = loadProcessManager();
  const args = buildProcessArgs();

  assert.deepEqual(args.slice(0, 8), [
    '--print',
    '--verbose',
    '--input-format=stream-json',
    '--output-format=stream-json',
    '--include-partial-messages',
    '--tools',
    'default',
    '--permission-mode',
  ]);
  assert.equal(args[8], 'acceptEdits');
});

test('buildProcessArgs appends resume/model/extra args after core flags', () => {
  const { buildProcessArgs } = loadProcessManager();
  const args = buildProcessArgs({
    permissionMode: 'acceptEdits',
    sessionId: 'session-123',
    model: 'cx/gpt-5.5',
    extraArgs: ['--max-budget-usd', '1'],
  });

  assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits');
  assert.deepEqual(args.slice(-6), ['--resume', 'session-123', '--model', 'cx/gpt-5.5', '--max-budget-usd', '1']);
});

test('abort sends SIGINT and ignores repeated calls', () => {
  const { ProcessManager } = loadProcessManager();
  const manager = new ProcessManager({ command: 'open-matrix' });
  const signals = [];
  manager._process = {
    killed: false,
    kill(signal) { signals.push(signal); return true; },
  };

  manager.abort();
  manager.abort();
  manager._clearAbortTimer();

  assert.deepEqual(signals, ['SIGINT']);
  assert.equal(manager._aborting, true);
});

test('force kill uses taskkill for Windows process tree', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const execCalls = [];
  Object.defineProperty(process, 'platform', { value: 'win32' });

  try {
    const { ProcessManager } = loadProcessManager();
    const manager = new ProcessManager({
      command: 'open-matrix',
      execFile: (...args) => execCalls.push(args),
    });
    manager._process = { pid: 1234, killed: false, kill() {} };

    manager._forceKillProcess();

    assert.equal(execCalls[0][0], 'taskkill');
    assert.deepEqual(execCalls[0][1], ['/pid', '1234', '/T', '/F']);
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
});


test('buildProcessArgs appends system prompt before extra args', () => {
  const { buildProcessArgs } = loadProcessManager();
  const args = buildProcessArgs({
    appendSystemPrompt: 'windows guidance',
    extraArgs: ['--max-budget-usd', '1'],
  });

  assert.deepEqual(args.slice(-4), ['--append-system-prompt', 'windows guidance', '--max-budget-usd', '1']);
});

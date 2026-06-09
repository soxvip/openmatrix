const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('bun:test');

test.afterEach(() => {
  mock.restore();
});

function loadChatProvider() {
  const modulePath = require.resolve('./chatProvider');
  delete require.cache[modulePath];
  mock.module('vscode', () => ({
    EventEmitter: class {
      constructor() { this.fired = []; this.event = () => ({ dispose() {} }); }
      fire(value) { this.fired.push(value); }
      dispose() {}
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async () => ({}),
    },
    window: {
      showTextDocument: async () => undefined,
      showWarningMessage: async () => undefined,
      showOpenDialog: async () => [],
    },
    Uri: { file: value => ({ fsPath: value }) },
    env: { clipboard: { writeText: async () => undefined } },
  }));
  return require('./chatProvider');
}

test('local slash mode switch keeps visible conversation and does not clear session UI', async () => {
  const { ChatController } = loadChatProvider();
  const controller = new ChatController(null);
  const posted = [];
  controller.registerWebview({ postMessage: msg => posted.push(msg) });
  controller._messages = [{ role: 'user', text: 'oi' }];
  controller._currentSessionId = 'session-123';

  const handled = await controller.handleLocalSlashCommand('/safe');

  assert.equal(handled, true);
  assert.deepEqual(controller.getMessages(), [{ role: 'user', text: 'oi' }]);
  assert.equal(controller.sessionId, 'session-123');
  assert.equal(posted.some(msg => msg.type === 'session_cleared'), false);
  assert.equal(posted.some(msg => msg.type === 'power_state' && msg.permissionMode === 'acceptEdits'), true);
});


test('final result does not duplicate text already emitted by assistant message', () => {
  const { ChatController } = loadChatProvider();
  const controller = new ChatController(null);
  const posted = [];
  controller.registerWebview({ postMessage: msg => posted.push(msg) });

  controller._handleMessage({
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: 'Resposta unica' }],
    },
  });
  controller._handleMessage({
    type: 'result',
    subtype: 'success',
    result: 'Resposta unica',
    usage: null,
  });

  const streamEnds = posted.filter(msg => msg.type === 'stream_end');
  assert.equal(streamEnds.length, 2);
  assert.equal(streamEnds[0].text, 'Resposta unica');
  assert.equal(streamEnds[0].final, false);
  assert.equal(streamEnds[1].text, '');
  assert.equal(streamEnds[1].final, true);
});


test('local slash preserves process session id when controller has not copied it yet', async () => {
  const { ChatController } = loadChatProvider();
  const controller = new ChatController(null);
  const disposed = [];
  controller._process = {
    sessionId: 'live-session-456',
    dispose: () => disposed.push(true),
  };

  const handled = await controller.handleLocalSlashCommand('/full');

  assert.equal(handled, true);
  assert.equal(controller.sessionId, 'live-session-456');
  assert.deepEqual(disposed, [true]);
});


test('default append system prompt forces responses to follow latest user language', () => {
  const source = require('fs').readFileSync(require.resolve('./chatProvider'), 'utf8');

  assert.match(source, /Language policy: answer in the same natural language used by the user/);
  assert.match(source, /If the user writes Portuguese/);
  assert.match(source, /plans, progress summaries, and final responses must be in Portuguese/);
});

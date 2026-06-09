const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('bun:test');
const {
  acquireEnvMutex,
  releaseEnvMutex,
} = require('../../../src/entrypoints/sdk/shared.js');

test.beforeEach(async () => {
  const result = await acquireEnvMutex();
  if (!result.acquired) {
    throw new Error('Timed out acquiring shared test mutation lock for vscode extension test');
  }
});

test.afterEach(() => {
  try {
    mock.restore();
  } finally {
    releaseEnvMutex();
  }
});

function createStatus(overrides = {}) {
  return {
    installed: true,
    executable: 'open-matrix',
    launchCommand: 'open-matrix --project-aware',
    terminalName: 'OPEN MATRIX',
    shimEnabled: false,
    workspaceFolder: '/workspace/openmatrix/very/long/path/example-project',
    workspaceSourceLabel: 'espaco de trabalho do editor ativo',
    launchCwd: '/workspace/openmatrix/very/long/path/example-project',
    launchCwdLabel: '/workspace/openmatrix/very/long/path/example-project',
    canLaunchInWorkspaceRoot: true,
    profileStatusLabel: 'Encontrado',
    profileStatusHint: '/workspace/openmatrix/very/long/path/example-project/.openclaude-profile.json',
    workspaceProfilePath: '/workspace/openmatrix/very/long/path/example-project/.openclaude-profile.json',
    permissionMode: 'bypassPermissions',
    toolsMode: 'default',
    providerState: {
      label: 'Codex',
      detail: 'gpt-5.4',
      source: 'profile',
    },
    providerSourceLabel: 'perfil salvo',
    ...overrides,
  };
}

function loadExtension() {
  const extensionPath = require.resolve('./extension');
  delete require.cache[extensionPath];
  mock.module('vscode', () => ({
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({
        get: (_key, fallback) => fallback,
      }),
      getWorkspaceFolder: () => null,
    },
    window: {
      activeTextEditor: null,
      createWebviewPanel: () => ({}),
      registerWebviewViewProvider: () => ({ dispose() {} }),
      showInformationMessage: async () => undefined,
      showErrorMessage: async () => undefined,
    },
    env: {
      openExternal: async () => true,
    },
    commands: {
      registerCommand: () => ({ dispose() {} }),
      executeCommand: async () => undefined,
    },
    Uri: { parse: value => value, file: value => value },
    ViewColumn: { Active: 1 },
  }));
  return require('./extension');
}

test('renderControlCenterHtml uses OPEN MATRIX wordmark, Portuguese UI, and hides model name', () => {
  const { renderControlCenterHtml } = loadExtension();
  const html = renderControlCenterHtml(createStatus(), { nonce: 'test-nonce', platform: 'win32' });

  assert.match(html, /OPEN <span class="wordmark-accent">MATRIX<\/span>/);
  assert.match(html, /Centro de Controle do OPEN MATRIX/);
  assert.match(html, /class="status-rail"/);
  assert.match(html, /class="action-button primary" id="launch"/);
  assert.match(html, /class="action-button secondary" id="launchRoot"/);
  assert.match(html, /Modelo oculto/);
  assert.doesNotMatch(html, /gpt-5\.4/);
  assert.match(
    html,
    /title="\/workspace\/openmatrix\/very\/long\/path\/example-project"[^>]*>\/workspace\/openmatrix\/very\/long\/path\/example-project<\//,
  );
});

test('renderControlCenterHtml shows disabled and empty states in Portuguese when workspace data is missing', () => {
  const { renderControlCenterHtml } = loadExtension();
  const html = renderControlCenterHtml(
    createStatus({
      workspaceFolder: null,
      workspaceSourceLabel: 'nenhum espaco de trabalho aberto',
      launchCwd: null,
      launchCwdLabel: 'cwd padrao do terminal do VS Code',
      canLaunchInWorkspaceRoot: false,
      profileStatusLabel: 'Sem espaco de trabalho',
      profileStatusHint: 'Abra uma pasta de trabalho para detectar perfil salvo',
      workspaceProfilePath: null,
    }),
    { nonce: 'test-nonce', platform: 'linux' },
  );

  assert.match(
    html,
    /class="action-button secondary" id="launchRoot"[^>]*disabled[^>]*>[\s\S]*Abra uma pasta de espaço de trabalho para habilitar a inicialização na raiz/,
  );
  assert.match(html, /Nenhum perfil de espaco de trabalho ainda/);
  assert.match(html, /Abra uma pasta de trabalho para detectar perfil salvo/);
  assert.doesNotMatch(html, /id="openProfile"/);
});

test('OpenMatrixControlCenterProvider.getHtml supplies a nonce to the renderer', () => {
  const { OpenMatrixControlCenterProvider } = loadExtension();
  const provider = new OpenMatrixControlCenterProvider();

  assert.doesNotThrow(() => provider.getHtml(createStatus()));

  const html = provider.getHtml(createStatus());
  assert.match(html, /script-src 'nonce-[^']+'/);
  assert.match(html, /<script nonce="[^"]+">/);
  assert.doesNotMatch(html, /nonce-undefined/);
  assert.doesNotMatch(html, /<script nonce="undefined">/);
});

test('resolveLaunchTargets distinguishes project-aware launch from workspace-root launch', () => {
  const { resolveLaunchTargets } = loadExtension();

  assert.deepEqual(
    resolveLaunchTargets({
      activeFilePath: '/workspace/openmatrix/src/panels/control-center.js',
      workspacePath: '/workspace/openmatrix',
      workspaceSourceLabel: 'espaco de trabalho do editor ativo',
    }),
    {
      projectAwareCwd: '/workspace/openmatrix/src/panels',
      projectAwareCwdLabel: '/workspace/openmatrix/src/panels',
      projectAwareSourceLabel: 'diretório do arquivo ativo',
      workspaceRootCwd: '/workspace/openmatrix',
      workspaceRootCwdLabel: '/workspace/openmatrix',
      launchActionsShareTarget: false,
      launchActionsShareTargetReason: null,
    },
  );
});

test('resolveLaunchTargets anchors relative launch commands to the workspace root', () => {
  const { resolveLaunchTargets } = loadExtension();

  assert.deepEqual(
    resolveLaunchTargets({
      executable: './node_modules/.bin/open-matrix',
      activeFilePath: '/workspace/openmatrix/src/panels/control-center.js',
      workspacePath: '/workspace/openmatrix',
      workspaceSourceLabel: 'espaco de trabalho do editor ativo',
    }),
    {
      projectAwareCwd: '/workspace/openmatrix',
      projectAwareCwdLabel: '/workspace/openmatrix',
      projectAwareSourceLabel: 'raiz do espaco de trabalho (exigida por comando relativo)',
      workspaceRootCwd: '/workspace/openmatrix',
      workspaceRootCwdLabel: '/workspace/openmatrix',
      launchActionsShareTarget: true,
      launchActionsShareTargetReason: 'relative-launch-command',
    },
  );
});

test('resolveLaunchTargets ignores active files outside the selected workspace', () => {
  const { resolveLaunchTargets } = loadExtension();

  assert.deepEqual(
    resolveLaunchTargets({
      executable: 'open-matrix',
      activeFilePath: '/tmp/notes/scratch.js',
      workspacePath: '/workspace/openmatrix',
      workspaceSourceLabel: 'primeira pasta do espaco de trabalho',
    }),
    {
      projectAwareCwd: '/workspace/openmatrix',
      projectAwareCwdLabel: '/workspace/openmatrix',
      projectAwareSourceLabel: 'primeira pasta do espaco de trabalho',
      workspaceRootCwd: '/workspace/openmatrix',
      workspaceRootCwdLabel: '/workspace/openmatrix',
      launchActionsShareTarget: true,
      launchActionsShareTargetReason: null,
    },
  );
});

test('renderControlCenterHtml keeps landmark and heading semantics in Portuguese', () => {
  const { renderControlCenterHtml } = loadExtension();
  const html = renderControlCenterHtml(createStatus(), { nonce: 'test-nonce', platform: 'win32' });

  assert.match(html, /<main class="shell" aria-labelledby="control-center-title">/);
  assert.match(html, /<header class="hero">/);
  assert.match(html, /<h1 class="headline-title" id="control-center-title">/);
  assert.match(html, /<section class="modules" aria-label="Detalhes do centro de controle">/);
  assert.match(html, /<h2 class="module-title" id="section-projeto">Projeto<\/h2>/);
  assert.match(html, /<section class="actions-layout" aria-label="Ações do centro de controle">/);
});

test('renderControlCenterHtml explains distinct launch targets when active file directory is available', () => {
  const { renderControlCenterHtml } = loadExtension();
  const html = renderControlCenterHtml(
    createStatus({
      launchCwd: '/workspace/openmatrix/src/panels',
      launchCwdLabel: '/workspace/openmatrix/src/panels',
      launchCwdSourceLabel: 'diretório do arquivo ativo',
      workspaceRootCwd: '/workspace/openmatrix',
      workspaceRootCwdLabel: '/workspace/openmatrix',
    }),
    { nonce: 'test-nonce', platform: 'linux' },
  );

  assert.match(html, /Inicia junto do arquivo ativo - \/workspace\/openmatrix\/src\/panels/);
  assert.match(html, /Sempre inicia na raiz do espaco de trabalho - \/workspace\/openmatrix/);
});

test('renderControlCenterHtml makes shared workspace-root launches explicit for relative commands', () => {
  const { renderControlCenterHtml } = loadExtension();
  const html = renderControlCenterHtml(
    createStatus({
      launchCwd: '/workspace/openmatrix',
      launchCwdLabel: '/workspace/openmatrix',
      launchCwdSourceLabel: 'raiz do espaco de trabalho (exigida por comando relativo)',
      workspaceRootCwd: '/workspace/openmatrix',
      workspaceRootCwdLabel: '/workspace/openmatrix',
      launchActionsShareTarget: true,
      launchActionsShareTargetReason: 'relative-launch-command',
    }),
    { nonce: 'test-nonce', platform: 'linux' },
  );

  assert.match(html, /Inicializacao ciente do projeto presa na raiz do espaco de trabalho pelo comando relativo - \/workspace\/openmatrix/);
  assert.match(html, /Mesmo alvo de raiz do espaco de trabalho que Iniciar OPEN MATRIX, porque o comando relativo resolve pela raiz do espaco de trabalho - \/workspace\/openmatrix/);
});

test('renderControlCenterHtml escapes hostile text and does not expose provider model detail', () => {
  const { renderControlCenterHtml } = loadExtension();
  const html = renderControlCenterHtml(
    createStatus({
      launchCommand: '<img src=x onerror="boom()">',
      workspaceFolder: '"/><script>workspace()</script>',
      workspaceSourceLabel: 'active <b>workspace</b>',
      launchCwdLabel: '"><script>cwd()</script>',
      profileStatusHint: '<svg onload="profile()">',
      workspaceProfilePath: '"/><script>profile-path()</script>',
      providerState: {
        label: 'Provider "><img src=x onerror="label()">',
        detail: '<script>provider-detail()</script>',
        source: 'profile',
      },
      providerSourceLabel: 'perfil salvo',
    }),
    { nonce: 'test-nonce', platform: 'linux' },
  );

  assert.match(html, /&lt;img src=x onerror=&quot;boom\(\)&quot;&gt;/);
  assert.match(html, /&quot;\/&gt;&lt;script&gt;workspace\(\)&lt;\/script&gt;/);
  assert.match(html, /active &lt;b&gt;workspace&lt;\/b&gt;/);
  assert.match(html, /&lt;svg onload=&quot;profile\(\)&quot;&gt;/);
  assert.doesNotMatch(html, /provider-detail/);
  assert.doesNotMatch(html, /Provider &quot;&gt;&lt;img/);
  assert.doesNotMatch(html, /<script>workspace\(\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror="boom\(\)">/);
});

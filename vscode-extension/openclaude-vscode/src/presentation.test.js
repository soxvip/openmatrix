const test = require('node:test');
const assert = require('node:assert/strict');

function loadPresentation() {
  return require('./presentation');
}

test('truncateMiddle keeps the profile filename visible', () => {
  const { truncateMiddle } = loadPresentation();

  assert.equal(
    truncateMiddle('/Users/example/projects/openclaude/workspace/.openclaude-profile.json', 30),
    '.../.openclaude-profile.json',
  );
});

test('truncateMiddle keeps the filename visible for Windows-style paths', () => {
  const { truncateMiddle } = loadPresentation();

  assert.equal(
    truncateMiddle('C:\\Users\\example\\openclaude\\workspace\\.openclaude-profile.json', 30),
    '...\\.openclaude-profile.json',
  );
});

test('buildActionModel uses Portuguese labels and disables workspace-root launch without a workspace', () => {
  const { buildActionModel } = loadPresentation();

  const model = buildActionModel({
    canLaunchInWorkspaceRoot: false,
    workspaceProfilePath: null,
  });

  assert.deepEqual(model.launchRoot, {
    id: 'launchRoot',
    label: 'Iniciar na Raiz do Espaço de Trabalho',
    detail: 'Abra uma pasta de espaço de trabalho para habilitar a inicialização na raiz',
    tone: 'neutral',
    disabled: true,
  });
});

test('buildActionModel hides workspace-profile action when no profile exists', () => {
  const { buildActionModel } = loadPresentation();

  const model = buildActionModel({
    canLaunchInWorkspaceRoot: true,
    workspaceProfilePath: null,
  });

  assert.deepEqual(model.primary, {
    id: 'launch',
    label: 'Iniciar OPEN MATRIX',
    detail: 'Usa o diretório de inicialização inteligente do projeto',
    tone: 'accent',
    disabled: false,
  });
  assert.equal(model.openProfile, null);
});

test('buildActionModel includes workspace-profile action when a profile exists', () => {
  const { buildActionModel } = loadPresentation();

  const model = buildActionModel({
    canLaunchInWorkspaceRoot: true,
    workspaceProfilePath: 'C:\\Users\\example\\openclaude\\workspace\\.openclaude-profile.json',
  });

  assert.deepEqual(model.openProfile, {
    id: 'openProfile',
    label: 'Abrir Perfil do Espaço de Trabalho',
    detail: 'Inspecionar ...\\.openclaude-profile.json',
    tone: 'neutral',
    disabled: false,
  });
});

function createStatus(overrides = {}) {
  return {
    installed: true,
    executable: 'open-matrix',
    launchCommand: 'open-matrix --project-aware',
    terminalName: 'OPEN MATRIX',
    shimEnabled: false,
    workspaceFolder: '/workspace/openmatrix',
    workspaceSourceLabel: 'espaco de trabalho do editor ativo',
    launchCwd: '/workspace/openmatrix',
    launchCwdLabel: '/workspace/openmatrix',
    canLaunchInWorkspaceRoot: true,
    profileStatusLabel: 'Encontrado',
    profileStatusHint: '/workspace/openmatrix/.openclaude-profile.json',
    workspaceProfilePath: '/workspace/openmatrix/.openclaude-profile.json',
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

test('buildControlCenterViewModel keeps header badges and summary cards non-redundant', () => {
  const { buildControlCenterViewModel } = loadPresentation();

  const viewModel = buildControlCenterViewModel(createStatus());
  const headerKeys = new Set(viewModel.headerBadges.map(badge => badge.key));
  const summaryKeys = new Set(viewModel.summaryCards.map(card => card.key));

  assert.deepEqual([...headerKeys].sort(), ['power', 'profileStatus', 'provider', 'runtime']);
  assert.deepEqual([...summaryKeys].sort(), ['launchCommand', 'launchCwd', 'workspace']);

  for (const key of headerKeys) {
    assert.equal(summaryKeys.has(key), false);
  }
});

test('buildControlCenterViewModel uses stable semantic tones for badges and actions', () => {
  const { buildControlCenterViewModel } = loadPresentation();

  const viewModel = buildControlCenterViewModel(createStatus({
    installed: false,
    profileStatusLabel: 'Inválido',
    providerState: {
      label: 'OpenAI-compatible (provider unknown)',
      detail: 'launch shim enabled',
      source: 'shim',
    },
    providerSourceLabel: 'configuração de inicialização',
  }));

  assert.deepEqual(viewModel.headerBadges, [
    {
      key: 'runtime',
      label: 'Executável',
      value: 'Ausente',
      tone: 'critical',
    },
    {
      key: 'provider',
      label: 'Provedor',
      value: 'IA configurada',
      tone: 'warning',
    },
    {
      key: 'profileStatus',
      label: 'Perfil',
      value: 'Inválido',
      tone: 'warning',
    },
    {
      key: 'power',
      label: 'Poderes',
      value: 'Poder total',
      tone: 'positive',
    },
  ]);

  assert.equal(viewModel.actions.primary.tone, 'accent');
  assert.equal(viewModel.actions.launchRoot.tone, 'neutral');
});

test('buildControlCenterViewModel uses Portuguese layout and hides model details', () => {
  const { buildControlCenterViewModel } = loadPresentation();

  const viewModel = buildControlCenterViewModel(createStatus());

  assert.equal(viewModel.header.eyebrow, 'Centro de Controle do OPEN MATRIX');
  assert.equal(viewModel.detailSections[0].title, 'Projeto');
  assert.equal(viewModel.detailSections[1].title, 'Executável');

  const provider = viewModel.detailSections[1].rows.find(row => row.key === 'provider');
  assert.deepEqual(provider, {
    key: 'provider',
    label: 'Provedor detectado',
    summary: 'IA configurada',
    detail: 'Modelo oculto',
    tone: 'neutral',
  });
  assert.doesNotEqual(provider.detail, 'gpt-5.4 · perfil salvo');
});

test('buildControlCenterViewModel includes chat power state', () => {
  const { buildControlCenterViewModel } = loadPresentation();

  const viewModel = buildControlCenterViewModel(createStatus({ permissionMode: 'plan' }));
  const power = viewModel.detailSections[1].rows.find(row => row.key === 'power');

  assert.deepEqual(power, {
    key: 'power',
    label: 'Poderes do chat',
    summary: 'Modo plano',
    detail: 'ferramentas default - plan',
    tone: 'warning',
  });
});

test('buildControlCenterViewModel keeps launch command only in summary cards', () => {
  const { buildControlCenterViewModel } = loadPresentation();

  const viewModel = buildControlCenterViewModel(createStatus());

  assert.deepEqual(viewModel.summaryCards.find(card => card.key === 'launchCommand'), {
    key: 'launchCommand',
    label: 'Comando de Inicialização',
    value: 'open-matrix --project-aware',
    detail: 'Terminal integrado: OPEN MATRIX',
  });

  assert.equal(
    viewModel.detailSections.some(section => section.rows.some(row => row.key === 'launchCommand')),
    false,
  );
});

test('buildControlCenterViewModel carries forward the existing action model', () => {
  const { buildControlCenterViewModel, buildActionModel } = loadPresentation();

  const status = createStatus();
  const viewModel = buildControlCenterViewModel(status);

  assert.deepEqual(viewModel.actions, buildActionModel(status));
});

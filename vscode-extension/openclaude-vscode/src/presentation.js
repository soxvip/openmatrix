function truncateMiddle(value, maxLength) {
  const text = String(value || '');
  if (!text || text.length <= maxLength) {
    return text;
  }

  const basename = text.split(/[\\/]/).filter(Boolean).pop() || '';
  if (basename && basename.length + 4 <= maxLength) {
    const separator = text.includes('\\') ? '\\' : '/';
    return `...${separator}${basename}`;
  }

  if (maxLength <= 3) {
    return '.'.repeat(Math.max(maxLength, 0));
  }

  const available = maxLength - 3;
  const startLength = Math.ceil(available / 2);
  const endLength = Math.floor(available / 2);
  return `${text.slice(0, startLength)}...${text.slice(text.length - endLength)}`;
}

function getPathTail(value) {
  const text = String(value || '');
  if (!text) {
    return '';
  }

  return text.split(/[\\/]/).filter(Boolean).pop() || text;
}

function buildActionModel({ canLaunchInWorkspaceRoot, workspaceProfilePath } = {}) {
  return {
    primary: {
      id: 'launch',
      label: 'Iniciar OPEN MATRIX',
      detail: 'Usa o diretório de inicialização inteligente do projeto',
      tone: 'accent',
      disabled: false,
    },
    launchRoot: {
      id: 'launchRoot',
      label: 'Iniciar na Raiz do Espaço de Trabalho',
      detail: canLaunchInWorkspaceRoot
        ? 'Inicia diretamente da raiz do espaço de trabalho resolvida'
        : 'Abra uma pasta de espaço de trabalho para habilitar a inicialização na raiz',
      tone: 'neutral',
      disabled: !canLaunchInWorkspaceRoot,
    },
    openProfile: workspaceProfilePath
      ? {
          id: 'openProfile',
          label: 'Abrir Perfil do Espaço de Trabalho',
          detail: `Inspecionar ${truncateMiddle(workspaceProfilePath, 40)}`,
          tone: 'neutral',
          disabled: false,
        }
      : null,
  };
}

function getRuntimeTone(installed) {
  return installed ? 'positive' : 'critical';
}

function getProfileTone(profileStatusLabel) {
  return profileStatusLabel === 'Inválido' || profileStatusLabel === 'Ilegível'
    ? 'warning'
    : 'neutral';
}

function getProviderTone(providerState) {
  return providerState?.source === 'shim' || providerState?.source === 'unknown'
    ? 'warning'
    : 'neutral';
}

function getPowerSummary(permissionMode) {
  switch (permissionMode) {
    case 'bypassPermissions':
      return 'Poder total';
    case 'acceptEdits':
      return 'Modo seguro';
    case 'plan':
      return 'Modo plano';
    default:
      return 'Padrao';
  }
}

function getPowerTone(permissionMode) {
  return permissionMode === 'bypassPermissions'
    ? 'positive'
    : permissionMode === 'plan'
      ? 'warning'
      : 'neutral';
}

function getPowerDetail(status = {}) {
  const permissionMode = status.permissionMode || 'bypassPermissions';
  const extra = Array.isArray(status.extraArgs) && status.extraArgs.length > 0
    ? ` - extra: ${status.extraArgs.join(' ')}`
    : '';
  return `ferramentas ${status.toolsMode || 'default'} - ${permissionMode}${extra}`;
}

function getProviderDetail(providerState, providerSourceLabel) {
  const detail = providerState?.detail || '';
  if (!detail) {
    return providerSourceLabel || '';
  }

  switch (providerState?.source) {
    case 'profile':
      return [detail, providerSourceLabel].filter(Boolean).join(' · ');
    case 'env':
      return /^from environment$/i.test(detail)
        ? 'do ambiente'
        : [detail, providerSourceLabel].filter(Boolean).join(' · ');
    case 'shim':
    case 'unknown':
      return detail;
    default:
      return [detail, providerSourceLabel].filter(Boolean).join(' · ');
  }
}

function buildControlCenterViewModel(status = {}) {
  const runtimeSummary = status.installed ? 'Instalado' : 'Ausente';
  const runtimeDetail = status.executable || 'Comando desconhecido';
  const providerDetail = 'Modelo oculto';
  const providerTone = getProviderTone(status.providerState);
  const providerSummary = status.providerState?.label ? 'IA configurada' : 'Desconhecido';
  const permissionMode = status.permissionMode || 'bypassPermissions';
  const powerSummary = getPowerSummary(permissionMode);
  const powerDetail = getPowerDetail(status);
  const workspaceSummary = status.workspaceFolder ? getPathTail(status.workspaceFolder) : 'Nenhum espaço de trabalho aberto';
  const workspaceDetail = [status.workspaceFolder, status.workspaceSourceLabel]
    .filter(Boolean)
    .join(' · ') || 'nenhum espaço de trabalho aberto';

  return {
    header: {
      eyebrow: 'Centro de Controle do OPEN MATRIX',
      title: 'Acompanhante do OPEN MATRIX ciente de projetos',
      subtitle:
        'Status local útil, comportamento de inicialização previsível e acesso rápido aos fluxos de trabalho que você realmente usa.',
    },
    headerBadges: [
      {
        key: 'runtime',
        label: 'Executável',
        value: runtimeSummary,
        tone: getRuntimeTone(status.installed),
      },
      {
        key: 'provider',
        label: 'Provedor',
        value: providerSummary,
        tone: providerTone,
      },
      {
        key: 'profileStatus',
        label: 'Perfil',
        value: status.profileStatusLabel || 'Desconhecido',
        tone: getProfileTone(status.profileStatusLabel),
      },
      {
        key: 'power',
        label: 'Poderes',
        value: powerSummary,
        tone: getPowerTone(permissionMode),
      },
    ],
    summaryCards: [
      {
        key: 'workspace',
        label: 'Espaço de Trabalho',
        value: status.workspaceFolder || 'Nenhum espaço de trabalho aberto',
        detail: status.workspaceSourceLabel || 'nenhum espaço de trabalho aberto',
      },
      {
        key: 'launchCwd',
        label: 'Diretório de Inicialização',
        value: status.launchCwdLabel || 'Cwd padrão do terminal do VS Code',
      },
      {
        key: 'launchCommand',
        label: 'Comando de Inicialização',
        value: status.launchCommand || '',
        detail: status.terminalName ? `Terminal integrado: ${status.terminalName}` : '',
      },
    ],
    detailSections: [
      {
        title: 'Projeto',
        rows: [
          {
            key: 'workspace',
            label: 'Pasta do espaço de trabalho',
            summary: workspaceSummary,
            detail: workspaceDetail,
          },
          {
            key: 'profileStatus',
            label: 'Perfil do espaço de trabalho',
            summary: status.profileStatusLabel || 'Desconhecido',
            detail: status.profileStatusHint || '',
            tone: getProfileTone(status.profileStatusLabel),
          },
        ],
      },
      {
        title: 'Executável',
        rows: [
          {
            key: 'runtime',
            label: 'Executável do OPEN MATRIX',
            summary: runtimeSummary,
            detail: runtimeDetail,
            tone: getRuntimeTone(status.installed),
          },
          {
            key: 'provider',
            label: 'Provedor detectado',
            summary: providerSummary,
            detail: providerDetail,
            tone: providerTone,
          },
          {
            key: 'power',
            label: 'Poderes do chat',
            summary: powerSummary,
            detail: powerDetail,
            tone: getPowerTone(permissionMode),
          },
        ],
      },
    ],
    actions: buildActionModel(status),
  };
}

module.exports = {
  truncateMiddle,
  buildActionModel,
  buildControlCenterViewModel,
};

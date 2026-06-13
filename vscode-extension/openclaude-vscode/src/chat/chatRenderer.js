/**
 * chatRenderer — produces the full self-contained HTML document for the chat
 * webview.  All CSS and JS are inlined (no external bundles).
 *
 * The webview JS communicates with the extension host via postMessage.
 * Incoming messages update the DOM incrementally so streaming feels fluid.
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// Catálogo PT de TODAS as descrições de comando do CLI OPEN MATRIX.
// Mantido em sincronia (verbatim) com as descrições nos fontes do CLI
// (src/commands/** e src/skills/bundled/**). Chaveado por nome de comando
// SEM a barra inicial, pois o CLI envia apenas os nomes em system/init.
const SLASH_COMMAND_DESCRIPTIONS = {
  'add-dir': 'Adiciona um novo diretório de trabalho',
  'advisor': 'Configura o modelo do advisor',
  'agents': 'Gerencia configurações de agentes',
  'atualizar': 'Atualiza o CLI e a extensão para a versão mais recente do GitHub',
  'auto-fix': 'Configura o auto-fix: roda lint/teste após edições da IA',
  'batch': 'Pesquisa e planeja uma mudança em larga escala, depois executa em paralelo em 5–30 agentes worktree isolados que abrem um PR cada.',
  'branch': 'Cria uma ramificação da conversa atual neste ponto',
  'bridge-kick': 'Injeta estados de falha de bridge para teste manual de recuperação',
  'brief': 'Alterna o modo somente-resumo',
  'btw': 'Faz uma pergunta rápida paralela sem interromper a conversa principal',
  'buddy': 'Choca, cuida e gerencia seu companheiro OPEN MATRIX',
  'cache-probe': 'Envia requisições idênticas para testar o cache de prompt (resultados no log de debug)',
  'cache-stats': 'Mostra estatísticas de acerto/erro de cache por turno e sessão (funciona em todos os provedores)',
  'chrome': 'Configurações do Claude no Chrome (Beta)',
  'clear': 'Limpa o histórico da conversa e libera contexto',
  'color': 'Define a cor da barra de prompt para esta sessão',
  'commit': 'Cria um commit git',
  'commit-message': 'Configura o texto de atribuição do commit',
  'commit-push-pr': 'Faz commit, push e abre um PR',
  'compact': 'Limpa o histórico da conversa mas mantém um resumo no contexto. Opcional: /compact [instruções para o resumo]',
  'config': 'Abre o painel de configuração',
  'context': 'Visualiza o uso atual de contexto como uma grade colorida',
  'copy': 'Copia a última resposta do Claude para a área de transferência (ou /copy N para a N-ésima mais recente)',
  'cost': 'Mostra o custo total e a duração da sessão atual',
  'debug': 'Ativa o log de debug para esta sessão e ajuda a diagnosticar problemas',
  'desktop': 'Continua a sessão atual no Claude Desktop',
  'diff': 'Visualiza alterações não commitadas e diffs por turno',
  'doctor': 'Diagnostica e verifica sua instalação e configurações do OPEN MATRIX',
  'dream': 'Executa a consolidação de memória — sintetiza sessões recentes em memórias duráveis',
  'effort': 'Define o nível de esforço para uso do modelo',
  'exit': 'Sai do REPL',
  'export': 'Exporta a conversa atual para um arquivo ou área de transferência',
  'extra-usage': 'Configura uso extra para continuar funcionando quando os limites forem atingidos',
  'feedback': 'Envia feedback sobre o OPEN MATRIX',
  'files': 'Lista todos os arquivos atualmente no contexto',
  'heapdump': 'Despeja o heap JS em ~/Desktop',
  'help': 'Mostra a ajuda e os comandos disponíveis',
  'hooks': 'Visualiza as configurações de hooks para eventos de ferramentas',
  'ide': 'Gerencia integrações de IDE e mostra o status',
  'init': 'Inicializa um novo arquivo de instrução do projeto com documentação da base de código',
  'init-verifiers': 'Cria skill(s) verificadora(s) para verificação automatizada de alterações de código',
  'insights': 'Gera um relatório analisando suas sessões do OPEN MATRIX',
  'install': 'Instala o build nativo do OPEN MATRIX',
  'install-github-app': 'Configura o Claude GitHub Actions para um repositório',
  'install-slack-app': 'Instala o app do Claude para Slack',
  'keybindings': 'Abre ou cria seu arquivo de configuração de atalhos de teclado',
  'knowledge': 'Gerencia o Grafo de Conhecimento nativo',
  'logo': 'Altera o esquema de cores do logo de inicialização',
  'logout': 'Sai da sua conta Anthropic',
  'loop': 'Roda um prompt em intervalo fixo ou reagenda dinamicamente, incluindo loops simples de modo de manutenção.',
  'lsp': 'Inspeciona e configura a inteligência de código do Language Server Protocol',
  'mcp': 'Gerencia servidores MCP',
  'memory': 'Edita os arquivos de memória do Claude',
  'mobile': 'Mostra o QR code para baixar o app móvel do Claude',
  'model': 'Define o modelo de IA do OPEN MATRIX',
  'onboard-github': 'Configuração interativa do GitHub Copilot: login de dispositivo OAuth armazenado em armazenamento seguro',
  'output-style': 'Obsoleto: use /config para alterar o estilo de saída',
  'permissions': 'Gerencia regras de permissão de ferramentas (allow e deny)',
  'plugin': 'Gerencia plugins do OPEN MATRIX',
  'pr-comments': 'Obtém comentários de um pull request do GitHub',
  'privacy-settings': 'Visualiza e atualiza suas configurações de privacidade',
  'provider': 'Gerencia perfis de provedores de API',
  'rate-limit-options': 'Mostra opções quando o limite de taxa é atingido',
  'release-notes': 'Visualiza as notas de versão',
  'reload-plugins': 'Ativa mudanças de plugin pendentes na sessão atual',
  'remote-control': 'Conecta este terminal para sessões de controle remoto',
  'remote-env': 'Configura o ambiente remoto padrão para sessões de teleport',
  'rename': 'Renomeia a conversa atual',
  'request-size': 'Mostra a carga estimada de contexto da requisição e os maiores contribuidores',
  'resume': 'Retoma uma conversa anterior',
  'review': 'Revisa um pull request',
  'rewind': 'Restaura o código e/ou a conversa para um ponto anterior',
  'security-review': 'Faz uma revisão de segurança das alterações pendentes no branch atual',
  'session': 'Mostra a URL da sessão remota e o QR code',
  'simplify': 'Revisa o código alterado para reúso, qualidade e eficiência, depois corrige os problemas encontrados.',
  'skills': 'Lista as skills disponíveis',
  'stats': 'Mostra suas estatísticas de uso e atividade do OPEN MATRIX',
  'status': 'Mostra o status do OPEN MATRIX incluindo versão, modelo, conta, conectividade de API e status das ferramentas',
  'statusline': 'Configura a UI da linha de status do OPEN MATRIX',
  'stickers': 'Encomenda adesivos do OPEN MATRIX',
  'tasks': 'Lista e gerencia tarefas em segundo plano',
  'terminal-setup': 'Instala o atalho Shift+Enter para novas linhas',
  'theme': 'Altera o tema',
  'think-back': 'Sua Retrospectiva do Ano 2025 no OPEN MATRIX',
  'thinkback-play': 'Reproduz a animação do thinkback',
  'ultraplan': 'O OPEN MATRIX na web rascunha um plano avançado que você pode editar e aprovar',
  'ultrareview': 'Encontra e verifica bugs no seu branch. Roda no OPEN MATRIX na web',
  'update-config': 'Use esta skill para configurar o harness do Claude Code via settings.json. Comportamentos automáticos ("from now on when X", "each time X", "whenever X", "before/after X") exigem hooks configurados em settings.json - quem executa é o harness, não o Claude, então memória/preferências não conseguem cumpri-los. Use também para: permissões ("allow X", "add permission", "move permission to"), variáveis de ambiente ("set X=Y"), troubleshooting de hooks, ou qualquer alteração nos arquivos settings.json/settings.local.json. Exemplos: "allow npm commands", "add bq permission to global settings", "move permission to user settings", "set DEBUG=true", "when claude stops show X". Para configurações simples como tema/modelo, use a ferramenta Config.',
  'upgrade': 'Faz upgrade para o Max para limites de taxa maiores e mais Opus',
  'usage': 'Mostra os limites de uso do plano',
  'vim': 'Alterna entre os modos de edição Vim e Normal',
  'voice': 'Alterna o modo de voz',
  'wiki': 'Inicializa e inspeciona a wiki do projeto OPEN MATRIX',
};

// Descrição de fallback quando um comando da CLI não está no catálogo acima.
const SLASH_COMMAND_FALLBACK_DESCRIPTION = 'Comando da CLI OPEN MATRIX';

function lookupSlashDescription(command) {
  const name = String(command || '').replace(/^[/]/, '');
  return SLASH_COMMAND_DESCRIPTIONS[name] || SLASH_COMMAND_FALLBACK_DESCRIPTION;
}

// Comandos "favoritos" — exibidos no topo da paleta. Inclui comandos
// exclusivos da extensão (/full, /safe, /plan, /compact) que não existem no CLI.
const FAVORITE_SLASH_COMMANDS = [
  { command: '/full', description: 'Ativa o Poder total (tools default + bypassPermissions)', local: true },
  { command: '/safe', description: 'Modo seguro: auto-aprova edições, reduz risco', local: true },
  { command: '/plan', description: 'Modo planejamento: sem edições de arquivo', local: true },
  { command: '/compact', description: 'Compacta a conversa/contexto', local: true },
  { command: '/model', description: 'Define o modelo de IA do OPEN MATRIX (respeita o token ativo)', local: true },
  { command: '/cost', description: SLASH_COMMAND_DESCRIPTIONS['cost'] },
  { command: '/context', description: SLASH_COMMAND_DESCRIPTIONS['context'] },
  { command: '/review', description: SLASH_COMMAND_DESCRIPTIONS['review'] },
  { command: '/security-review', description: SLASH_COMMAND_DESCRIPTIONS['security-review'] },
  { command: '/commit-message', description: SLASH_COMMAND_DESCRIPTIONS['commit-message'], requiresArgument: true, argumentHint: 'status | default | off | set "..."' },
  { command: '/init', description: SLASH_COMMAND_DESCRIPTIONS['init'] },
  { command: '/auto-fix', description: SLASH_COMMAND_DESCRIPTIONS['auto-fix'] },
  { command: '/debug', description: SLASH_COMMAND_DESCRIPTIONS['debug'], requiresArgument: true, argumentHint: '[descrição do problema]' },
  { command: '/update-config', description: SLASH_COMMAND_DESCRIPTIONS['update-config'], requiresArgument: true, argumentHint: '<configuracao>' },
  { command: '/dream', description: SLASH_COMMAND_DESCRIPTIONS['dream'] },
  { command: '/insights', description: SLASH_COMMAND_DESCRIPTIONS['insights'] },
  { command: '/agents', description: SLASH_COMMAND_DESCRIPTIONS['agents'] },
  { command: '/add-dir', description: SLASH_COMMAND_DESCRIPTIONS['add-dir'] },
  { command: '/atualizar', description: SLASH_COMMAND_DESCRIPTIONS['atualizar'] },
];

const SLASH_COMMAND_METADATA = new Map(
  FAVORITE_SLASH_COMMANDS.map(item => [item.command, item]),
);

// Seed exibida antes de a sessão da CLI enviar system/init. Contém TODOS os
// comandos do CLI (mais os exclusivos da extensão) para que a paleta já
// apareça completa mesmo antes da primeira mensagem.
const DEFAULT_DYNAMIC_SLASH_COMMANDS = [
  ...FAVORITE_SLASH_COMMANDS.map(item => item.command.replace(/^[/]/, '')),
  ...Object.keys(SLASH_COMMAND_DESCRIPTIONS),
];

function normalizeSlashCommand(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.startsWith('/') ? text : `/${text}`;
}

function buildSlashCommandItems(dynamicCommands = []) {
  const seen = new Set();
  const result = [];
  for (const item of FAVORITE_SLASH_COMMANDS) {
    result.push({
      ...item,
      source: 'favorite',
      requiresArgument: Boolean(item.requiresArgument),
      local: Boolean(item.local),
    });
    seen.add(item.command);
  }

  for (const raw of dynamicCommands || []) {
    const command = normalizeSlashCommand(raw);
    if (!command || seen.has(command)) continue;
    const meta = SLASH_COMMAND_METADATA.get(command) || {};
    result.push({
      command,
      description: meta.description || lookupSlashDescription(command),
      source: 'cli',
      requiresArgument: Boolean(meta.requiresArgument),
      argumentHint: meta.argumentHint || '',
      local: false,
    });
    seen.add(command);
  }
  return result;
}

function filterSlashCommandItems(items, query) {
  const needle = String(query || '').trim().replace(/^[/]/, '').toLowerCase();
  if (!needle) return items;
  return (items || [])
    .map((item, index) => {
      const command = String(item.command || '').replace(/^[/]/, '').toLowerCase();
      const description = String(item.description || '').toLowerCase();
      if (command.startsWith(needle)) return { item, index, score: 0 };
      if (command.includes(needle)) return { item, index, score: 1 };
      if (description.includes(needle)) return { item, index, score: 2 };
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(match => match.item);
}

function resolveSlashSelection(item) {
  if (!item) return { action: 'none' };
  if (item.local) return { action: 'local', command: item.command };
  if (item.requiresArgument) {
    return { action: 'fill', text: `${item.command} ` };
  }
  return { action: 'send', text: item.command };
}

function renderChatHtml({ nonce, platform }) {
  const modKey = platform === 'darwin' ? 'Cmd' : 'Ctrl';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --oc-bg: #050505;
      --oc-panel: #07140b;
      --oc-panel-strong: #0b1f10;
      --oc-panel-soft: #0e2a15;
      --oc-border: #1d8f3a;
      --oc-border-soft: rgba(0,255,65,0.16);
      --oc-text: #eaffef;
      --oc-text-dim: #9ee6ad;
      --oc-text-soft: #6fbf7f;
      --oc-accent: #00cc33;
      --oc-accent-bright: #00ff41;
      --oc-accent-soft: rgba(0,255,65,0.18);
      --oc-positive: #00ff41;
      --oc-warning: #b7ff00;
      --oc-critical: #ff4d4d;
      --oc-focus: #00ff41;
      --oc-user-bg: rgba(0,255,65,0.12);
      --oc-user-border: rgba(0,255,65,0.28);
      --oc-assistant-bg: rgba(255,255,255,0.03);
      --oc-assistant-border: rgba(0,255,65,0.10);
      --oc-code-bg: #08160d;
      --oc-code-border: rgba(0,255,65,0.12);
      --oc-tool-bg: rgba(0,255,65,0.06);
      --oc-tool-border: rgba(0,255,65,0.22);
      --oc-perm-bg: rgba(255,77,77,0.08);
      --oc-perm-border: rgba(255,77,77,0.35);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: var(--vscode-font-family, "Segoe UI", system-ui, sans-serif);
      font-size: 13px;
      color: var(--oc-text);
      background: var(--oc-bg);
      display: flex;
      flex-direction: column;
      position: relative;
    }

    /* ── Header ── */
    .chat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--oc-border-soft);
      background: var(--oc-panel);
      flex-shrink: 0;
    }
    .chat-header .brand {
      font-weight: 700;
      font-size: 14px;
      color: var(--oc-text);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-header .brand-accent { color: var(--oc-accent-bright); }
    .header-btn {
      border: 1px solid var(--oc-border-soft);
      border-radius: 6px;
      background: rgba(255,255,255,0.04);
      color: var(--oc-text-dim);
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .header-btn:hover { border-color: var(--oc-accent); color: var(--oc-text); }
    .header-btn.danger { border-color: var(--oc-critical); color: var(--oc-critical); }
    .header-btn.danger:hover { background: rgba(255,77,77,0.12); }
    #abortBtn { display: none; }

    /* ── Status bar ── */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      font-size: 11px;
      color: var(--oc-text-soft);
      border-bottom: 1px solid var(--oc-border-soft);
      background: var(--oc-panel);
      flex-shrink: 0;
    }
    .status-bar .status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--oc-text-soft);
      flex-shrink: 0;
    }
    .status-bar .status-dot.connected { background: var(--oc-positive); }
    .status-bar .status-dot.streaming { background: var(--oc-accent-bright); animation: pulse 1s infinite; }
    .status-bar .status-dot.error { background: var(--oc-critical); }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .status-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-usage { color: var(--oc-text-soft); }

    /* ── Message list ── */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-track { background: transparent; }
    .messages::-webkit-scrollbar-thumb { background: rgba(0,255,65,0.18); border-radius: 3px; }

    /* ── Welcome screen ── */
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      text-align: center;
      padding: 32px 16px;
      gap: 16px;
    }
    .welcome-title { font-size: 20px; font-weight: 700; color: var(--oc-text); }
    .welcome-title .accent { color: var(--oc-accent-bright); }
    .welcome-sub { font-size: 13px; color: var(--oc-text-dim); max-width: 36ch; }
    .welcome-hint { font-size: 11px; color: var(--oc-text-soft); }
    .welcome-hint kbd {
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--oc-border-soft);
      background: rgba(255,255,255,0.04);
      font-family: inherit;
      font-size: 11px;
    }

    /* ── User message ── */
    .msg-user {
      align-self: flex-end;
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px 14px 4px 14px;
      background: var(--oc-user-bg);
      border: 1px solid var(--oc-user-border);
      word-break: break-word;
      white-space: pre-wrap;
    }

    /* ── Assistant message ── */
    .msg-assistant {
      align-self: flex-start;
      max-width: 95%;
      padding: 10px 14px;
      border-radius: 4px 14px 14px 14px;
      background: var(--oc-assistant-bg);
      border: 1px solid var(--oc-assistant-border);
      word-break: break-word;
    }
    .msg-assistant .md-content { line-height: 1.55; }
    .msg-assistant .md-content:empty { display: none; }
    .msg-assistant .md-content p { margin-bottom: 8px; }
    .msg-assistant .md-content p:last-child { margin-bottom: 0; }
    .msg-assistant .md-content ul,
    .msg-assistant .md-content ol { padding-left: 20px; margin-bottom: 8px; }
    .msg-assistant .md-content li { margin-bottom: 4px; }
    .msg-assistant .md-content h1,
    .msg-assistant .md-content h2,
    .msg-assistant .md-content h3 {
      color: var(--oc-text);
      margin: 12px 0 6px;
      font-size: 14px;
      font-weight: 700;
    }
    .msg-assistant .md-content h1 { font-size: 16px; }
    .msg-assistant .md-content a { color: var(--oc-accent-bright); text-decoration: underline; }
    .msg-assistant .md-content strong { color: var(--oc-text); font-weight: 700; }
    .msg-assistant .md-content em { font-style: italic; color: var(--oc-text-dim); }
    .msg-assistant .md-content blockquote {
      border-left: 3px solid var(--oc-accent);
      padding: 4px 12px;
      margin: 8px 0;
      color: var(--oc-text-dim);
    }
    .msg-assistant .md-content hr {
      border: none;
      border-top: 1px solid var(--oc-border-soft);
      margin: 12px 0;
    }

    /* inline code */
    .md-content code:not(.code-block code) {
      padding: 1px 5px;
      border-radius: 4px;
      background: var(--oc-code-bg);
      border: 1px solid var(--oc-code-border);
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      font-size: 12px;
      color: var(--oc-accent-bright);
    }

    /* fenced code */
    .code-wrapper {
      position: relative;
      margin: 8px 0;
      border-radius: 8px;
      border: 1px solid var(--oc-code-border);
      background: var(--oc-code-bg);
      overflow: hidden;
    }
    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      font-size: 11px;
      color: var(--oc-text-soft);
      border-bottom: 1px solid var(--oc-code-border);
      background: rgba(255,255,255,0.02);
    }
    .code-copy-btn {
      border: none;
      background: transparent;
      color: var(--oc-text-soft);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .code-copy-btn:hover { background: rgba(255,255,255,0.08); color: var(--oc-text); }
    .code-block {
      display: block;
      padding: 10px 12px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
      color: var(--oc-text-dim);
    }
    .code-block::-webkit-scrollbar { height: 4px; }
    .code-block::-webkit-scrollbar-thumb { background: rgba(0,255,65,0.2); border-radius: 2px; }

    /* keyword highlighting */
    .hl-keyword { color: #c586c0; }
    .hl-string { color: #ce9178; }
    .hl-comment { color: #6a9955; font-style: italic; }
    .hl-number { color: #b5cea8; }
    .hl-func { color: #dcdcaa; }
    .hl-type { color: #4ec9b0; }

    /* ── Tool use card ── */
    .tool-card {
      margin: 8px 0;
      border-radius: 8px;
      border: 1px solid var(--oc-tool-border);
      background: var(--oc-tool-bg);
      overflow: hidden;
    }
    .tool-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      cursor: pointer;
      user-select: none;
    }
    .tool-icon { font-size: 14px; flex-shrink: 0; }
    .tool-name { font-weight: 600; font-size: 12px; color: var(--oc-text); flex: 1; }
    .tool-status { font-size: 11px; color: var(--oc-text-soft); }
    .tool-status.running { color: var(--oc-accent-bright); }
    .tool-status.error { color: var(--oc-critical); }
    .tool-status.complete { color: var(--oc-positive); }
    .tool-chevron {
      font-size: 10px;
      color: var(--oc-text-soft);
      transition: transform 150ms;
    }
    .tool-card.expanded .tool-chevron { transform: rotate(90deg); }
    .tool-body {
      display: none;
      padding: 0 10px 10px;
      font-size: 12px;
      border-top: 1px solid var(--oc-tool-border);
    }
    .tool-card.expanded .tool-body { display: block; }
    .tool-input-label,
    .tool-output-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--oc-text-soft);
      margin: 8px 0 4px;
    }
    .tool-input-content,
    .tool-output-content {
      padding: 6px 8px;
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      font-size: 11px;
      color: var(--oc-text-dim);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }
    .tool-output-content.error { color: var(--oc-critical); }
    .tool-path {
      font-weight: 400;
      color: var(--oc-text-soft);
      font-size: 11px;
      margin-left: 4px;
    }
    .file-link {
      color: var(--oc-accent-bright);
      cursor: pointer;
      text-decoration: none;
      border-bottom: 1px dotted var(--oc-accent);
      transition: color 120ms, border-color 120ms;
    }
    .file-link:hover {
      color: var(--oc-focus);
      border-bottom-color: var(--oc-focus);
    }
    .tool-input-content.tool-diff-old {
      border-left: 3px solid var(--oc-critical);
      padding-left: 10px;
      color: #ff9e8a;
      text-decoration: line-through;
      opacity: 0.7;
    }
    .tool-input-content.tool-diff-new {
      border-left: 3px solid var(--oc-positive);
      padding-left: 10px;
      color: #c8e6a0;
    }
    .tool-diff-btn {
      margin-top: 6px;
      border: 1px solid var(--oc-accent);
      border-radius: 6px;
      background: rgba(0,255,65,0.08);
      color: var(--oc-accent-bright);
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
    }
    .tool-diff-btn:hover { background: rgba(0,255,65,0.16); }

    /* ── Permission card ── */
    .perm-card {
      margin: 8px 0;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--oc-perm-border);
      background: var(--oc-perm-bg);
    }
    .perm-title { font-weight: 700; font-size: 12px; color: var(--oc-critical); margin-bottom: 6px; }
    .perm-desc { font-size: 12px; color: var(--oc-text-dim); margin-bottom: 8px; }
    .perm-input {
      padding: 6px 8px;
      margin-bottom: 8px;
      border-radius: 6px;
      background: rgba(0,0,0,0.2);
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      font-size: 11px;
      color: var(--oc-text-dim);
      white-space: pre-wrap;
      max-height: 120px;
      overflow-y: auto;
    }
    .perm-actions { display: flex; gap: 6px; }
    .perm-btn {
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid;
    }
    .perm-btn.allow {
      background: rgba(0,255,65,0.14);
      border-color: var(--oc-positive);
      color: var(--oc-positive);
    }
    .perm-btn.deny {
      background: rgba(255,77,77,0.1);
      border-color: var(--oc-critical);
      color: var(--oc-critical);
    }
    .perm-btn.allow-session {
      background: rgba(0,255,65,0.08);
      border-color: rgba(0,255,65,0.4);
      color: var(--oc-text-dim);
    }
    .perm-btn:hover { filter: brightness(1.15); }
    .perm-btn:disabled { opacity: 0.4; cursor: default; filter: none; }

    /* ── Question card (AskUserQuestion) ── */
    .question-card .perm-title { color: var(--oc-text); }
    .q-block { margin-bottom: 12px; }
    .q-header {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--oc-text-soft);
      margin-bottom: 3px;
    }
    .q-question { font-size: 12px; color: var(--oc-text); margin-bottom: 6px; }
    .q-options { display: flex; flex-direction: column; gap: 5px; }
    .q-option {
      text-align: left;
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid var(--oc-border-soft);
      background: rgba(255,255,255,0.02);
      cursor: pointer;
      color: var(--oc-text);
    }
    .q-option:hover { border-color: var(--oc-positive); }
    .q-option.selected {
      border-color: var(--oc-positive);
      background: rgba(0,255,65,0.12);
    }
    .q-option-label { font-size: 12px; font-weight: 600; }
    .q-option-desc { font-size: 11px; color: var(--oc-text-dim); margin-top: 2px; }

    /* ── Status pill ── */
    .msg-status {
      align-self: center;
      font-size: 11px;
      color: var(--oc-text-soft);
      padding: 4px 12px;
      border-radius: 999px;
      border: 1px solid var(--oc-border-soft);
      background: rgba(255,255,255,0.02);
    }

    /* ── Rate limit ── */
    .msg-rate-limit {
      align-self: center;
      font-size: 11px;
      color: var(--oc-warning);
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid rgba(243,201,105,0.3);
      background: rgba(243,201,105,0.06);
    }

    /* ── Thinking block ── */
    .thinking-block {
      display: none;
      align-self: flex-start;
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid rgba(200,160,255,0.25);
      background: rgba(160,120,220,0.08);
      margin: 4px 0;
      gap: 6px;
      flex-direction: column;
    }
    .thinking-block.visible { display: flex; }
    .thinking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #c4a0ff;
      font-weight: 600;
    }
    .thinking-spinner {
      width: 12px; height: 12px;
      border: 2px solid rgba(200,160,255,0.3);
      border-top-color: #c4a0ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .thinking-meta {
      font-size: 11px;
      color: var(--oc-text-soft);
    }

    /* ── Typing indicator ── */
    .typing-indicator {
      display: none;
      align-self: flex-start;
      padding: 10px 14px;
      gap: 4px;
    }
    .typing-indicator.visible { display: flex; }
    .typing-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--oc-accent);
      animation: typingBounce 1.2s infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Input area ── */
    .input-area {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid var(--oc-border-soft);
      background: var(--oc-panel);
      flex-shrink: 0;
    }
    .input-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .input-toolbar-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .input-area textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 92px;
      max-height: 280px;
      padding: 12px 14px;
      border: 1px solid var(--oc-border-soft);
      border-radius: 10px;
      background: rgba(255,255,255,0.04);
      color: var(--oc-text);
      font-family: inherit;
      font-size: 14px;
      resize: none;
      outline: none;
      line-height: 1.5;
    }
    .input-area textarea::placeholder { color: var(--oc-text-soft); }
    .input-area textarea:focus { border-color: var(--oc-accent); }
    .attachments-tray {
      display: none;
      gap: 6px;
      flex-wrap: wrap;
      padding: 8px 12px 0;
      border-top: 1px solid var(--oc-border-soft);
      background: var(--oc-panel);
      flex-shrink: 0;
    }
    .attachments-tray.visible { display: flex; }
    .attachment-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .attachment-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      padding: 4px 7px;
      border: 1px solid var(--oc-border-soft);
      border-radius: 999px;
      background: rgba(0,255,65,0.07);
      color: var(--oc-text);
      font-size: 11px;
    }
    .attachment-chip-name {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .attachment-chip-meta { color: var(--oc-text-soft); }
    .attachment-chip-remove {
      border: 0;
      background: transparent;
      color: var(--oc-text-soft);
      cursor: pointer;
      font-size: 13px;
      padding: 0 2px;
    }
    .attach-btn {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--oc-border-soft);
      background: rgba(255,255,255,0.04);
      color: var(--oc-accent-bright);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .attach-btn:hover { border-color: var(--oc-accent); background: rgba(0,255,65,0.12); }
    .attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .enhance-btn {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--oc-border-soft);
      background: rgba(255,255,255,0.04);
      color: var(--oc-accent-bright);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .enhance-btn:hover { border-color: var(--oc-accent); background: rgba(0,255,65,0.12); }
    .enhance-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .enhance-btn.busy { opacity: 0.6; cursor: progress; animation: oc-pulse 1s ease-in-out infinite; }
    @keyframes oc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .send-btn {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--oc-accent);
      background: linear-gradient(135deg, rgba(0,255,65,0.2), rgba(0,204,51,0.12));
      color: var(--oc-accent-bright);
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .send-btn:hover { background: rgba(0,255,65,0.25); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }


    /* ?? Slash command palette ?? */
    .power-badge {
      flex-shrink: 0;
      max-width: 45%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid rgba(0,255,65,0.28);
      color: var(--oc-accent-bright);
      background: rgba(0,255,65,0.08);
    }
    .slash-palette {
      display: none;
      position: absolute;
      left: 12px;
      right: 56px;
      bottom: 58px;
      z-index: 80;
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--oc-border-soft);
      border-radius: 12px;
      background: rgba(5, 12, 7, 0.98);
      box-shadow: 0 18px 50px rgba(0,0,0,0.45);
      padding: 6px;
    }
    .model-palette {
      display: none;
      position: absolute;
      left: 12px;
      right: 56px;
      bottom: 58px;
      z-index: 80;
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--oc-border-soft);
      border-radius: 12px;
      background: rgba(5, 12, 7, 0.98);
      box-shadow: 0 18px 50px rgba(0,0,0,0.45);
      padding: 6px;
    }
    .model-palette.visible { display: block; }
    .model-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .model-item:hover, .model-item.selected {
      background: rgba(0,255,65,0.12);
      border-color: rgba(0,255,65,0.28);
    }
    .model-item-name { color: var(--oc-accent-bright); font-weight: 700; font-size: 12px; }
    .model-item-desc { color: var(--oc-text-dim); font-size: 11px; }
    .model-btn {
      height: 36px;
      padding: 0 10px;
      border-radius: 10px;
      border: 1px solid var(--oc-border-soft);
      background: rgba(255,255,255,0.04);
      color: var(--oc-text);
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 1;
      min-width: 0;
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .model-btn:hover { border-color: var(--oc-accent); background: rgba(0,255,65,0.12); }
    .model-btn #modelBtnLabel { overflow: hidden; text-overflow: ellipsis; }
    .slash-palette.visible { display: block; }
    .slash-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 10px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .slash-item.selected {
      background: rgba(0,255,65,0.12);
      border-color: rgba(0,255,65,0.28);
    }
    .slash-command { color: var(--oc-accent-bright); font-weight: 700; font-family: var(--vscode-editor-font-family, Consolas, monospace); }
    .slash-source { justify-self: end; font-size: 10px; color: var(--oc-text-soft); text-transform: uppercase; }
    .slash-desc { grid-column: 1 / -1; font-size: 11px; color: var(--oc-text-dim); }
    .slash-empty { padding: 10px; color: var(--oc-text-soft); font-size: 12px; }

    /* ── Session list overlay ── */
    .session-overlay {
      display: none;
      position: absolute;
      inset: 0;
      z-index: 100;
      background: rgba(5,5,5,0.92);
      flex-direction: column;
    }
    .session-overlay.visible { display: flex; }
    .session-overlay-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--oc-border-soft);
    }
    .session-overlay-header h2 { font-size: 14px; font-weight: 700; flex: 1; }
    .session-search {
      margin: 8px 12px;
      padding: 8px 10px;
      border: 1px solid var(--oc-border-soft);
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      color: var(--oc-text);
      font-size: 13px;
      outline: none;
    }
    .session-search:focus { border-color: var(--oc-accent); }
    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
    }
    .session-group-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--oc-text-soft);
      padding: 8px 0 4px;
    }
    .session-item {
      padding: 10px;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      margin-bottom: 4px;
    }
    .session-item:hover { background: rgba(255,255,255,0.04); border-color: var(--oc-border-soft); }
    .session-item-title { font-weight: 600; font-size: 13px; color: var(--oc-text); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-item-preview { font-size: 11px; color: var(--oc-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-item-last { font-size: 11px; font-style: italic; color: var(--oc-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
    .session-item-time { font-size: 10px; color: var(--oc-text-soft); margin-top: 2px; }
    .session-empty { text-align: center; padding: 32px; color: var(--oc-text-soft); }
    .drop-overlay {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(2px);
      pointer-events: none;
    }
    .drop-overlay.visible { display: flex; }
    .drop-overlay-inner {
      border: 2px dashed var(--oc-accent, #6cf);
      border-radius: 14px;
      padding: 32px 48px;
      font-size: 15px;
      font-weight: 600;
      color: var(--oc-text, #fff);
      background: rgba(20,20,28,0.85);
      text-align: center;
    }
    .drop-overlay-hint { font-size: 12px; font-weight: 400; color: var(--oc-text-dim); margin-top: 6px; }
    .tab-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px 0 6px;
      overflow-x: auto;
      border-bottom: 1px solid var(--oc-border, rgba(255,255,255,0.08));
      background: var(--oc-bg-soft, rgba(255,255,255,0.02));
      scrollbar-width: thin;
    }
    .tab-bar:empty { display: none; }
    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      max-width: 180px;
      border-radius: 8px 8px 0 0;
      font-size: 12px;
      color: var(--oc-text-dim, #aaa);
      background: transparent;
      cursor: pointer;
      white-space: nowrap;
      border: 1px solid transparent;
      border-bottom: none;
    }
    .tab:hover { background: var(--oc-hover, rgba(255,255,255,0.06)); }
    .tab.active {
      color: var(--oc-text, #fff);
      background: var(--oc-bg, rgba(255,255,255,0.08));
      border-color: var(--oc-border, rgba(255,255,255,0.12));
    }
    .tab-label { overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
    .tab-stream-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--oc-accent, #6cf);
      animation: oc-pulse 1.2s ease-in-out infinite;
      flex: 0 0 auto;
    }
    @keyframes oc-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }
    .tab-close {
      opacity: 0.5;
      font-size: 14px;
      line-height: 1;
      padding: 0 2px;
      border-radius: 4px;
      flex: 0 0 auto;
    }
    .tab-close:hover { opacity: 1; background: var(--oc-hover, rgba(255,255,255,0.15)); }
    .tab-add {
      padding: 4px 10px;
      font-size: 16px;
      line-height: 1;
      color: var(--oc-text-dim, #aaa);
      cursor: pointer;
      border-radius: 6px;
      flex: 0 0 auto;
    }
    .tab-add:hover { background: var(--oc-hover, rgba(255,255,255,0.08)); color: var(--oc-text, #fff); }
    .plan-card .plan-body {
      margin: 8px 0;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--oc-bg-soft, rgba(255,255,255,0.04));
      max-height: 320px;
      overflow-y: auto;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="chat-header">
    <div class="brand">Open<span class="brand-accent">Matrix</span></div>
    <button class="header-btn" id="historyBtn" title="Historico de conversas">Historico</button>
    <button class="header-btn" id="newChatBtn" title="Nova conversa">+ Nova</button>
    <button class="header-btn danger" id="abortBtn" title="Parar resposta">Parar</button>
  </div>
  <div class="tab-bar" id="tabBar" role="tablist" aria-label="Conversas abertas"></div>
  <div class="status-bar">
    <span class="status-dot" id="statusDot"></span>
    <span class="status-text" id="statusText">Pronto</span>
    <span class="status-usage" id="statusUsage"></span>
    <span class="power-badge" id="powerBadge" title="Modo de poder do chat">Poder total &#183; ferramentas padrao &#183; sem pedir permissoes</span>
  </div>

  <div class="messages" id="messages">
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-title">Open<span class="accent">Matrix</span></div>
      <div class="welcome-sub">Faca uma pergunta, peca uma alteracao no codigo ou inicie uma nova tarefa.</div>
      <div class="welcome-hint">Pressione <kbd>${escapeHtml(modKey)}+L</kbd> para focar na mensagem</div>
    </div>
  </div>

  <div class="thinking-block" id="thinkingBlock">
    <div class="thinking-header">
      <div class="thinking-spinner"></div>
      <span id="thinkingLabel">Pensando...</span>
    </div>
    <div class="thinking-meta" id="thinkingMeta"></div>
  </div>

  <div class="typing-indicator" id="typingIndicator">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>

  <div class="slash-palette" id="slashPalette" role="listbox" aria-label="Comandos de barra do OPEN MATRIX"></div>
  <div class="model-palette" id="modelPalette" role="listbox" aria-label="Modelos disponiveis"></div>
  <div class="attachments-tray" id="attachmentsTray" aria-live="polite"></div>
  <div class="drop-overlay" id="dropOverlay" aria-hidden="true">
    <div class="drop-overlay-inner">
      Segure Shift e solte os arquivos para anexar
      <div class="drop-overlay-hint">Arquivos do explorer ou do seu sistema &middot; mantenha Shift pressionado ao arrastar</div>
    </div>
  </div>
  <div class="input-area">
    <textarea id="chatInput" placeholder="Mensagem para o OPEN MATRIX... Use / para comandos." rows="3"></textarea>
    <div class="input-toolbar">
      <div class="input-toolbar-left">
        <button class="attach-btn" id="attachBtn" title="Anexar arquivos">&#x1F4CE;</button>
        <button class="enhance-btn" id="enhanceBtn" title="Melhorar prompt com IA">&#x2728;</button>
        <button class="model-btn" id="modelBtn" title="Trocar modelo da LLM"><span id="modelBtnLabel">Modelo</span> &#x25BE;</button>
      </div>
      <button class="send-btn" id="sendBtn" title="Enviar mensagem">&#x27A4;</button>
    </div>
  </div>

  <!-- Historico de conversas -->
  <div class="session-overlay" id="sessionOverlay">
    <div class="session-overlay-header">
      <h2>Historico de conversas</h2>
      <button class="header-btn" id="closeSessionsBtn">Fechar</button>
    </div>
    <input class="session-search" id="sessionSearch" type="text" placeholder="Buscar conversas..." />
    <div class="session-list" id="sessionList">
      <div class="session-empty">Nenhuma conversa encontrada</div>
    </div>
  </div>

<script nonce="${nonce}">
(function() {
  const vscode = acquireVsCodeApi();

  // Outbound messages that act on a conversation must carry the active tabId so
  // the host routes them to the right controller. Tab-management messages carry
  // their own explicit tabId and are left untouched.
  const _rawPostMessage = vscode.postMessage.bind(vscode);
  const TAB_SCOPED_OUT = new Set([
    'send_message', 'abort', 'local_slash_command', 'new_session',
    'resume_session', 'permission_response', 'plan_decision', 'restore_request',
  ]);
  vscode.postMessage = function(message) {
    if (message && TAB_SCOPED_OUT.has(message.type) && message.tabId === undefined && activeTabId) {
      message = Object.assign({}, message, { tabId: activeTabId });
    }
    return _rawPostMessage(message);
  };

  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcomeScreen');
  const inputEl = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const attachBtn = document.getElementById('attachBtn');
  const enhanceBtn = document.getElementById('enhanceBtn');
  const attachmentsTray = document.getElementById('attachmentsTray');
  const abortBtn = document.getElementById('abortBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const historyBtn = document.getElementById('historyBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusUsage = document.getElementById('statusUsage');
  const powerBadge = document.getElementById('powerBadge');
  const slashPalette = document.getElementById('slashPalette');
  const modelPalette = document.getElementById('modelPalette');
  const modelBtn = document.getElementById('modelBtn');
  const modelBtnLabel = document.getElementById('modelBtnLabel');
  const typingIndicator = document.getElementById('typingIndicator');
  const sessionOverlay = document.getElementById('sessionOverlay');
  const closeSessionsBtn = document.getElementById('closeSessionsBtn');
  const sessionSearch = document.getElementById('sessionSearch');
  const sessionList = document.getElementById('sessionList');

  let isStreaming = false;
  let currentAssistantEl = null;
  let currentTextEl = null;
  let activeTabId = null;
  const tabBarEl = document.getElementById('tabBar');
  let dynamicSlashCommands = ${JSON.stringify(DEFAULT_DYNAMIC_SLASH_COMMANDS)};
  let slashVisible = false;
  let slashSelectedIndex = 0;
  let slashVisibleItems = [];
  let pendingAttachments = [];
  const favoriteSlashItems = ${JSON.stringify(buildSlashCommandItems([]))};
  const slashCommandDescriptions = ${JSON.stringify(SLASH_COMMAND_DESCRIPTIONS)};
  const slashCommandFallbackDescription = ${JSON.stringify(SLASH_COMMAND_FALLBACK_DESCRIPTION)};
  const toolResultMap = {};

  /* ── Markdown renderer ── */
  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeForMd(text);

    // fenced code blocks
    html = html.replace(/\`\`\`(\\w*?)\\n([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
      const langLabel = lang || 'text';
      const highlighted = highlightCode(code, langLabel);
      const id = 'cb-' + Math.random().toString(36).slice(2, 8);
      return '<div class="code-wrapper"><div class="code-header">' +
        '<span>' + langLabel + '</span>' +
        '<button class="code-copy-btn" data-copy-id="' + id + '">Copiar</button></div>' +
        '<code class="code-block" id="' + id + '">' + highlighted + '</code></div>';
    });

    // inline code
    html = html.replace(/\`([^\`]+?)\`/g, '<code>$1</code>');

    // headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // hr
    html = html.replace(/^---$/gm, '<hr/>');

    // bold / italic
    html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

    // links
    html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" title="$2">$1</a>');

    // unordered lists (simple)
    html = html.replace(/^[\\-\\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\\/li>\\n?)+)/g, '<ul>$1</ul>');

    // ordered lists
    html = html.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');

    // paragraphs (double newline)
    html = html.replace(/\\n\\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\\/p>/g, '');
    html = html.replace(/<p>(<h[123]>)/g, '$1');
    html = html.replace(/(<\\/h[123]>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\\/ul>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\\/blockquote>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<hr\\/>)/g, '$1');
    html = html.replace(/(<hr\\/>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<div class="code-wrapper">)/g, '$1');
    html = html.replace(/(<\\/div>)<\\/p>/g, '$1');

    return html;
  }

  function escapeForMd(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function highlightCode(code, lang) {
    let result = code;
    const kwPattern = /\\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|typeof|instanceof|switch|case|break|default|continue|do|in|of|yield|void|delete|true|false|null|undefined|this|super|extends|implements|interface|type|enum|public|private|protected|static|readonly|abstract|def|print|self|elif|except|finally|with|as|lambda|pass|raise|None|True|False)\\b/g;
    const strPattern = /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|'[^']*?'|"[^"]*?")/g;
    const commentPattern = /(\\/{2}.*$|#.*$)/gm;
    const numPattern = /\\b(\\d+\\.?\\d*)\\b/g;

    result = result.replace(commentPattern, '<span class="hl-comment">$1</span>');
    result = result.replace(strPattern, '<span class="hl-string">$1</span>');
    result = result.replace(kwPattern, '<span class="hl-keyword">$1</span>');
    result = result.replace(numPattern, '<span class="hl-number">$1</span>');

    return result;
  }

  /* ── DOM helpers ── */
  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function hideWelcome() {
    if (welcomeEl) welcomeEl.style.display = 'none';
  }

  function showWelcome() {
    if (welcomeEl) welcomeEl.style.display = 'flex';
  }

  function setStreaming(val, label) {
    isStreaming = val;
    abortBtn.style.display = val ? 'block' : 'none';
    sendBtn.disabled = val;
    if (attachBtn) attachBtn.disabled = val;
    typingIndicator.classList.toggle('visible', val);
    statusDot.className = 'status-dot ' + (val ? 'streaming' : 'connected');
    statusText.textContent = label || (val ? 'Gerando...' : 'Pronto');
  }

  function setStatusLabel(label) {
    statusText.textContent = label;
  }

  function setPowerBadge(detail, permissionMode, tools) {
    if (!powerBadge) return;
    const mode = permissionMode || 'acceptEdits';
    const toolText = Array.isArray(tools) ? 'default' : (tools || 'default');
    const label = mode === 'bypassPermissions'
      ? 'Poder total'
      : mode === 'plan'
        ? 'Modo plano'
        : 'Modo seguro';
    const text = detail || (label + ' \u00b7 tools ' + toolText + ' \u00b7 ' + mode);
    powerBadge.textContent = text;
    powerBadge.title = text;
  }

  function normalizeSlashCommandRuntime(value) {
    const raw = value && typeof value === 'object'
      ? (value.command || value.name || value.value || '')
      : value;
    const text = String(raw || '').trim();
    if (!text) return '';
    return text.startsWith('/') ? text : '/' + text;
  }

  function getSlashCommandDescription(raw, command) {
    if (raw && typeof raw === 'object' && raw.description) return String(raw.description);
    const favorite = favoriteSlashItems.find(item => item.command === command);
    if (favorite) return favorite.description;
    const name = String(command || '').replace(/^[/]/, '');
    return slashCommandDescriptions[name] || slashCommandFallbackDescription;
  }

  function buildSlashItemsRuntime(dynamicCommands) {
    const seen = new Set();
    const items = [];
    for (const favorite of favoriteSlashItems) {
      items.push(Object.assign({}, favorite, { source: 'favorite' }));
      seen.add(favorite.command);
    }
    for (const raw of dynamicCommands || []) {
      const command = normalizeSlashCommandRuntime(raw);
      if (!command || seen.has(command)) continue;
      items.push({
        command: command,
        description: getSlashCommandDescription(raw, command),
        source: 'cli',
        requiresArgument: false,
        argumentHint: '',
        local: false,
      });
      seen.add(command);
    }
    return items;
  }

  function filterSlashItemsRuntime(items, query) {
    const needle = String(query || '').trim().replace(/^[/]/, '').toLowerCase();
    if (!needle) return items;
    return items
      .map((item, index) => {
        const command = String(item.command || '').replace(/^[/]/, '').toLowerCase();
        const description = String(item.description || '').toLowerCase();
        if (command.startsWith(needle)) return { item, index, score: 0 };
        if (command.includes(needle)) return { item, index, score: 1 };
        if (description.includes(needle)) return { item, index, score: 2 };
        return null;
      })
      .filter(Boolean)
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map(match => match.item);
  }

  function currentSlashQuery() {
    const text = inputEl.value || '';
    if (!text.startsWith('/')) return null;
    if (Array.from(text.slice(1)).some(ch => ch.trim() === '')) return null;
    return text;
  }

  function updateSlashPalette() {
    const query = currentSlashQuery();
    if (query === null || isStreaming) {
      hideSlashPalette();
      return;
    }
    const allItems = buildSlashItemsRuntime(dynamicSlashCommands);
    slashVisibleItems = filterSlashItemsRuntime(allItems, query);
    if (slashSelectedIndex >= slashVisibleItems.length) slashSelectedIndex = Math.max(slashVisibleItems.length - 1, 0);
    if (slashSelectedIndex < 0) slashSelectedIndex = 0;
    slashVisible = true;
    renderSlashPalette();
  }

  function renderSlashPalette() {
    if (!slashPalette) return;
    if (!slashVisible) {
      slashPalette.classList.remove('visible');
      return;
    }
    if (!slashVisibleItems.length) {
      slashPalette.innerHTML = '<div class="slash-empty">Nenhum comando encontrado</div>';
      slashPalette.classList.add('visible');
      return;
    }
    slashPalette.innerHTML = slashVisibleItems.map((item, index) => {
      const selected = index === slashSelectedIndex;
      const hint = item.requiresArgument && item.argumentHint ? ' ' + item.argumentHint : '';
      return '<div class="slash-item' + (selected ? ' selected' : '') + '" role="option" aria-selected="' + (selected ? 'true' : 'false') + '" data-index="' + index + '">' +
        '<span class="slash-command">' + escapeForMd(item.command + hint) + '</span>' +
        '<span class="slash-source">' + escapeForMd(item.source === 'favorite' ? 'favorito' : 'cli') + '</span>' +
        '<span class="slash-desc">' + escapeForMd(item.description || '') + '</span>' +
      '</div>';
    }).join('');
    slashPalette.classList.add('visible');
    slashPalette.querySelectorAll('.slash-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        chooseSlashItem(Number(el.dataset.index || 0));
      });
    });
    const selectedEl = slashPalette.querySelector('.slash-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }

  function hideSlashPalette() {
    slashVisible = false;
    slashVisibleItems = [];
    slashSelectedIndex = 0;
    if (slashPalette) {
      slashPalette.classList.remove('visible');
      slashPalette.innerHTML = '';
    }
  }

  function chooseSlashItem(index) {
    const item = slashVisibleItems[index];
    if (!item) return;
    if (item.command === '/model') {
      inputEl.value = '';
      autoResizeInput();
      hideSlashPalette();
      toggleModelPalette();
      return;
    }
    if (item.local) {
      vscode.postMessage({ type: 'local_slash_command', command: item.command });
      inputEl.value = '';
      autoResizeInput();
      hideSlashPalette();
      return;
    }
    if (item.requiresArgument) {
      inputEl.value = item.command + ' ';
      autoResizeInput();
      hideSlashPalette();
      inputEl.focus();
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
      return;
    }
    sendText(item.command);
  }

  function attachmentIcon(att) {
    if (!att) return '\uD83D\uDCCE';
    if (att.kind === 'image') return '\uD83D\uDDBC';
    if (att.kind === 'pdf') return '\uD83D\uDCC4';
    if (att.kind === 'text') return '\uD83D\uDCDD';
    return '\uD83D\uDCCE';
  }

  function appendUserMessage(text, attachments) {
    hideWelcome();
    const el = document.createElement('div');
    el.className = 'msg-user';
    const body = document.createElement('div');
    body.textContent = text;
    el.appendChild(body);
    if (attachments && attachments.length > 0) {
      const list = document.createElement('div');
      list.className = 'attachment-list';
      for (const att of attachments) {
        const chip = document.createElement('span');
        chip.className = 'attachment-chip';
        chip.innerHTML = '<span>' + attachmentIcon(att) + '</span>' +
          '<span class="attachment-chip-name">' + escapeForMd(att.name || att.path || 'arquivo') + '</span>' +
          '<span class="attachment-chip-meta">' + escapeForMd(att.sizeLabel || '') + '</span>';
        list.appendChild(chip);
      }
      el.appendChild(list);
    }
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function getOrCreateAssistantEl() {
    if (!currentAssistantEl) {
      hideWelcome();
      currentAssistantEl = document.createElement('div');
      currentAssistantEl.className = 'msg-assistant';
      currentTextEl = document.createElement('div');
      currentTextEl.className = 'md-content';
      currentAssistantEl.appendChild(currentTextEl);
      messagesEl.appendChild(currentAssistantEl);
    }
    return { container: currentAssistantEl, textEl: currentTextEl };
  }

  function finalizeAssistant() {
    // Hide the text div if it's empty (model went straight to tool use)
    if (currentTextEl && !currentTextEl.textContent.trim()) {
      currentTextEl.style.display = 'none';
    }
    // Remove the entire bubble if it has no visible content at all
    if (currentAssistantEl) {
      const hasText = currentTextEl && currentTextEl.textContent.trim();
      const hasToolCards = currentAssistantEl.querySelector('.tool-card');
      if (!hasText && !hasToolCards) {
        currentAssistantEl.remove();
      }
    }
    currentAssistantEl = null;
    currentTextEl = null;
  }

  function appendToolCard(toolUse) {
    const { container } = getOrCreateAssistantEl();
    const card = document.createElement('div');
    card.className = 'tool-card expanded';
    card.dataset.toolId = toolUse.id || '';
    const statusClass = toolUse.status || 'running';
    const statusLabel = statusClass === 'running' ? 'Executando...'
      : statusClass === 'error' ? 'Erro' : 'Concluido';

    var inputSummary = '';
    if (toolUse.input && typeof toolUse.input === 'object') {
      if (toolUse.input.file_path || toolUse.input.path) {
        inputSummary = (toolUse.input.file_path || toolUse.input.path);
      }
      if (toolUse.input.command) {
        inputSummary = toolUse.input.command;
      }
    }
    if (!inputSummary) inputSummary = toolUse.inputPreview || '';

    var inputDetail = '';
    if (toolUse.input && typeof toolUse.input === 'object') {
      if (toolUse.input.new_string || toolUse.input.content) {
        var content = toolUse.input.new_string || toolUse.input.content || '';
        if (content.length > 500) content = content.slice(0, 500) + '... (cortado)';
        inputDetail = '<div class="tool-input-label">Alteracoes</div>' +
          '<div class="tool-input-content">' + escapeForMd(content) + '</div>';
      }
      if (toolUse.input.old_string && toolUse.input.new_string) {
        var oldStr = toolUse.input.old_string;
        var newStr = toolUse.input.new_string;
        if (oldStr.length > 300) oldStr = oldStr.slice(0, 300) + '...';
        if (newStr.length > 300) newStr = newStr.slice(0, 300) + '...';
        inputDetail = '<div class="tool-input-label">Substituir</div>' +
          '<div class="tool-input-content tool-diff-old">' + escapeForMd(oldStr) + '</div>' +
          '<div class="tool-input-label">Por</div>' +
          '<div class="tool-input-content tool-diff-new">' + escapeForMd(newStr) + '</div>';
      }
    }

    var isFileTool = inputSummary && !toolUse.input?.command;
    var fileLink = isFileTool
      ? '<a class="file-link" data-filepath="' + escapeForMd(inputSummary) + '" title="Abrir no editor">' + escapeForMd(inputSummary.split(/[\\/]/).pop() || inputSummary) + '</a>'
      : (inputSummary ? escapeForMd(inputSummary.split(/[\\/]/).pop() || inputSummary) : '');
    var pathDisplay = isFileTool
      ? '<div class="tool-input-label">Caminho</div><div class="tool-input-content"><a class="file-link" data-filepath="' + escapeForMd(inputSummary) + '" title="Abrir no editor">' + escapeForMd(inputSummary) + '</a></div>'
      : (inputSummary ? '<div class="tool-input-label">' + (toolUse.input?.command ? 'Comando' : 'Caminho') + '</div><div class="tool-input-content">' + escapeForMd(inputSummary) + '</div>' : '');

    card.innerHTML =
      '<div class="tool-header">' +
        '<span class="tool-icon">' + (toolUse.icon || '') + '</span>' +
        '<span class="tool-name">' + escapeForMd(toolUse.displayName || toolUse.name || 'Ferramenta') +
          (fileLink ? ' <span class="tool-path">' + fileLink + '</span>' : '') +
        '</span>' +
        '<span class="tool-status ' + statusClass + '">' + statusLabel + '</span>' +
        '<span class="tool-chevron">&#9654;</span>' +
      '</div>' +
      '<div class="tool-body">' +
        pathDisplay +
        inputDetail +
        '<div class="tool-output-label">Saida</div>' +
        '<div class="tool-output-content" data-tool-output="' + (toolUse.id || '') + '">Executando...</div>' +
      '</div>';
    card.querySelector('.tool-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
    container.appendChild(card);
    scrollToBottom();
    return card;
  }

  function updateToolResult(toolUseId, content, isError) {
    const outputEl = document.querySelector('[data-tool-output="' + toolUseId + '"]');
    if (outputEl) {
      outputEl.textContent = content || '(concluido)';
      if (isError) outputEl.classList.add('error');
    }
    const card = document.querySelector('[data-tool-id="' + toolUseId + '"]');
    if (card) {
      const statusEl = card.querySelector('.tool-status');
      if (statusEl) {
        statusEl.className = 'tool-status ' + (isError ? 'error' : 'complete');
        statusEl.textContent = isError ? 'Erro' : 'Concluido';
      }
    }
  }

  function updateToolProgress(toolUseId, content) {
    const outputEl = document.querySelector('[data-tool-output="' + toolUseId + '"]');
    if (outputEl && (outputEl.textContent === 'Aguardando...' || outputEl.textContent === 'Executando...')) {
      outputEl.textContent = content || '';
    }
  }

  function updateToolInput(toolUseId, input, toolName) {
    const card = document.querySelector('[data-tool-id="' + toolUseId + '"]');
    if (!card) return;
    const body = card.querySelector('.tool-body');
    if (!body) return;

    if (!input || typeof input !== 'object') return;

    // Update the header with clickable file path
    const nameEl = card.querySelector('.tool-name');
    if (nameEl && (input.file_path || input.path)) {
      const fp = input.file_path || input.path;
      const shortName = fp.split(/[\\/]/).pop() || fp;
      if (!nameEl.querySelector('.tool-path')) {
        nameEl.insertAdjacentHTML('beforeend', ' <span class="tool-path"><a class="file-link" data-filepath="' + escapeForMd(fp) + '" title="Abrir no editor">' + escapeForMd(shortName) + '</a></span>');
      }
    }

    // Update path display
    var pathHtml = '';
    if (input.file_path || input.path) {
      var fp = input.file_path || input.path;
      pathHtml = '<div class="tool-input-label">Caminho</div><div class="tool-input-content">' +
        '<a class="file-link" data-filepath="' + escapeForMd(fp) + '" title="Abrir no editor">' + escapeForMd(fp) + '</a></div>';
    }
    if (input.command) {
      pathHtml = '<div class="tool-input-label">Comando</div><div class="tool-input-content">' +
        escapeForMd(input.command) + '</div>';
    }

    // Build diff display for edit operations
    var diffHtml = '';
    if (input.old_string && input.new_string) {
      var oldStr = input.old_string;
      var newStr = input.new_string;
      if (oldStr.length > 500) oldStr = oldStr.slice(0, 500) + '... (cortado)';
      if (newStr.length > 500) newStr = newStr.slice(0, 500) + '... (cortado)';
      diffHtml = '<div class="tool-input-label">Substituir</div>' +
        '<div class="tool-input-content tool-diff-old">' + escapeForMd(oldStr) + '</div>' +
        '<div class="tool-input-label">Por</div>' +
        '<div class="tool-input-content tool-diff-new">' + escapeForMd(newStr) + '</div>';
    } else if (input.content || input.new_string) {
      var content = input.content || input.new_string || '';
      if (content.length > 800) content = content.slice(0, 800) + '... (cortado)';
      diffHtml = '<div class="tool-input-label">Conteudo</div>' +
        '<div class="tool-input-content tool-diff-new">' + escapeForMd(content) + '</div>';
    }

    // Keep the output element
    const outputEl = body.querySelector('[data-tool-output]');
    const outputHtml = outputEl ? outputEl.outerHTML : '';
    const outputLabel = '<div class="tool-output-label">Saida</div>';

    body.innerHTML = pathHtml + diffHtml + outputLabel + outputHtml;
    card.classList.add('expanded');
    scrollToBottom();
  }

  function appendPermissionCard(perm) {
    hideWelcome();
    if (perm.isPlanApproval) {
      appendPlanApprovalCard(perm);
      return;
    }
    if (perm.isQuestion && Array.isArray(perm.questions) && perm.questions.length) {
      appendQuestionCard(perm);
      return;
    }
    const el = document.createElement('div');
    el.className = 'perm-card';
    el.dataset.requestId = perm.requestId || '';
    el.innerHTML =
      '<div class="perm-title">Permissao necessaria: ' + escapeForMd(perm.displayName || perm.toolName || 'Ferramenta') + '</div>' +
      (perm.description ? '<div class="perm-desc">' + escapeForMd(perm.description) + '</div>' : '') +
      (perm.inputPreview ? '<div class="perm-input">' + escapeForMd(perm.inputPreview) + '</div>' : '') +
      '<div class="perm-actions">' +
        '<button class="perm-btn allow" data-action="allow">Permitir</button>' +
        '<button class="perm-btn deny" data-action="deny">Negar</button>' +
        '<button class="perm-btn allow-session" data-action="allow-session">Permitir na sessao</button>' +
      '</div>';
    el.querySelectorAll('.perm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        vscode.postMessage({
          type: 'permission_response',
          requestId: perm.requestId,
          toolUseId: perm.toolUseId || null,
          action: action,
        });
        el.querySelectorAll('.perm-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
        btn.style.opacity = '1';
      });
    });
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function appendPlanApprovalCard(perm) {
    const el = document.createElement('div');
    el.className = 'perm-card plan-card';
    el.dataset.requestId = perm.requestId || '';
    const planBody = perm.planText
      ? '<div class="plan-body">' + renderMarkdown(perm.planText) + '</div>'
      : (perm.inputPreview ? '<div class="perm-input">' + escapeForMd(perm.inputPreview) + '</div>' : '');
    el.innerHTML =
      '<div class="perm-title">Plano pronto para revisao</div>' +
      '<div class="perm-desc">Revise o plano abaixo e escolha como prosseguir.</div>' +
      planBody +
      '<div class="perm-actions">' +
        '<button class="perm-btn allow" data-action="allow">Aprovar e executar</button>' +
        '<button class="perm-btn deny" data-action="deny">Manter no modo plano</button>' +
      '</div>';
    el.querySelectorAll('.perm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        vscode.postMessage({
          type: 'plan_decision',
          requestId: perm.requestId,
          toolUseId: perm.toolUseId || null,
          action: action,
        });
        el.querySelectorAll('.perm-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
        btn.style.opacity = '1';
      });
    });
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function appendQuestionCard(perm) {
    const el = document.createElement('div');
    el.className = 'perm-card question-card';
    el.dataset.requestId = perm.requestId || '';
    const questions = perm.questions || [];
    // selections[i] = Set of chosen labels for question i
    const selections = questions.map(() => new Set());

    let html =
      '<div class="perm-title">' + escapeForMd(perm.displayName || 'Pergunta') + '</div>' +
      (perm.description ? '<div class="perm-desc">' + escapeForMd(perm.description) + '</div>' : '');
    questions.forEach((q, qi) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const multi = !!q.multiSelect;
      html += '<div class="q-block" data-qi="' + qi + '">' +
        (q.header ? '<div class="q-header">' + escapeForMd(q.header) + '</div>' : '') +
        '<div class="q-question">' + escapeForMd(q.question || '') + '</div>' +
        '<div class="q-options">';
      opts.forEach((o, oi) => {
        const label = o == null ? '' : (o.label != null ? String(o.label) : String(o));
        const desc = o && o.description != null ? String(o.description) : '';
        html += '<button class="q-option" data-qi="' + qi + '" data-oi="' + oi + '" data-multi="' + (multi ? '1' : '0') + '">' +
          '<div class="q-option-label">' + escapeForMd(label) + '</div>' +
          (desc ? '<div class="q-option-desc">' + escapeForMd(desc) + '</div>' : '') +
        '</button>';
      });
      html += '</div></div>';
    });
    html += '<div class="perm-actions">' +
        '<button class="perm-btn allow" data-action="submit" disabled>Enviar</button>' +
        '<button class="perm-btn deny" data-action="deny">Cancelar</button>' +
      '</div>';
    el.innerHTML = html;

    const submitBtn = el.querySelector('.perm-btn[data-action="submit"]');
    function refreshSubmit() {
      // Enabled once every question has at least one selection.
      const ready = selections.every(s => s.size > 0);
      if (submitBtn) submitBtn.disabled = !ready;
    }

    el.querySelectorAll('.q-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const qi = parseInt(btn.getAttribute('data-qi'), 10);
        const oi = parseInt(btn.getAttribute('data-oi'), 10);
        const multi = btn.getAttribute('data-multi') === '1';
        const q = questions[qi];
        const opts = Array.isArray(q.options) ? q.options : [];
        const opt = opts[oi];
        const label = opt == null ? '' : (opt.label != null ? String(opt.label) : String(opt));
        const sel = selections[qi];
        if (multi) {
          if (sel.has(label)) sel.delete(label); else sel.add(label);
          btn.classList.toggle('selected', sel.has(label));
        } else {
          sel.clear();
          sel.add(label);
          el.querySelectorAll('.q-option[data-qi="' + qi + '"]').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        }
        refreshSubmit();
      });
    });

    el.querySelectorAll('.perm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'submit') {
          if (submitBtn && submitBtn.disabled) return;
          const answers = {};
          questions.forEach((q, qi) => {
            answers[q.question || ''] = Array.from(selections[qi]).join(', ');
          });
          vscode.postMessage({
            type: 'permission_response',
            requestId: perm.requestId,
            toolUseId: perm.toolUseId || null,
            action: 'allow',
            answers: answers,
          });
        } else {
          vscode.postMessage({
            type: 'permission_response',
            requestId: perm.requestId,
            toolUseId: perm.toolUseId || null,
            action: 'deny',
          });
        }
        el.querySelectorAll('.perm-btn, .q-option').forEach(b => { b.disabled = true; });
        el.style.opacity = '0.7';
      });
    });

    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function appendStatusMessage(text) {
    const el = document.createElement('div');
    el.className = 'msg-status';
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function maybeAppendToolFailureHint(text) {
    const content = String(text || '');
    if (!/Stopped: repeated tool failures detected/i.test(content)) return;
    if (!/Bash failed 3 times/i.test(content) && !/Tool calls failed 3 times/i.test(content)) return;
    appendStatusMessage('Dica Windows: a CLI parou para evitar loop. Normalmente e caminho errado, comando Bash incompativel no Windows, ou comando repetido sem checar erro. Peca: confira diretorio atual, liste arquivos, use caminho absoluto e so depois tente outro comando.');
  }

  function appendRateLimitMessage(text) {
    const el = document.createElement('div');
    el.className = 'msg-rate-limit';
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  /* ── Thinking block ── */
  const thinkingBlock = document.getElementById('thinkingBlock');
  const thinkingLabel = document.getElementById('thinkingLabel');
  const thinkingMeta = document.getElementById('thinkingMeta');

  function showThinkingBlock() {
    thinkingBlock.classList.add('visible');
    thinkingLabel.textContent = 'Pensando...';
    thinkingMeta.textContent = '';
    setStatusLabel('Pensando...');
    scrollToBottom();
  }

  function updateThinkingBlock(tokens, elapsed) {
    const elapsedStr = elapsed >= 60
      ? Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's'
      : elapsed + 's';
    thinkingLabel.textContent = 'Pensando...';
    thinkingMeta.textContent = elapsedStr + ' · ~' + tokens + ' tokens';
    setStatusLabel('Pensando... (' + elapsedStr + ')');
  }

  function hideThinkingBlock() {
    thinkingBlock.classList.remove('visible');
    setStatusLabel('Gerando...');
  }

  /* ── Session list ── */
  function renderSessionList(sessions) {
    if (!sessions || sessions.length === 0) {
      sessionList.innerHTML = '<div class="session-empty">Nenhuma conversa encontrada</div>';
      return;
    }
    const groups = groupByDate(sessions);
    let html = '';
    for (const [label, items] of groups) {
      html += '<div class="session-group-label">' + escapeForMd(label) + '</div>';
      for (const s of items) {
        var lastLine = (s.lastMessage && s.lastMessage !== s.preview)
          ? '<div class="session-item-last">\u21b3 ' + escapeForMd(s.lastMessage) + '</div>'
          : '';
        html += '<div class="session-item" data-session-id="' + (s.id || '') + '">' +
          '<div class="session-item-title">' + escapeForMd(s.title || s.id || 'Sem titulo') + '</div>' +
          '<div class="session-item-preview">' + escapeForMd(s.preview || '') + '</div>' +
          lastLine +
          '<div class="session-item-time">' + escapeForMd(s.timeLabel || '') + '</div>' +
        '</div>';
      }
    }
    sessionList.innerHTML = html;
    sessionList.querySelectorAll('.session-item').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'resume_session', sessionId: el.dataset.sessionId });
        sessionOverlay.classList.remove('visible');
      });
    });
  }

  function groupByDate(sessions) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 604800000;
    const groups = new Map();
    for (const s of sessions) {
      const t = s.timestamp || 0;
      let label;
      if (t >= today) label = 'Hoje';
      else if (t >= yesterday) label = 'Ontem';
      else if (t >= weekAgo) label = 'Esta semana';
      else label = 'Mais antigas';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(s);
    }
    return groups;
  }

  function renderPendingAttachments() {
    if (!attachmentsTray) return;
    if (!pendingAttachments.length) {
      attachmentsTray.classList.remove('visible');
      attachmentsTray.innerHTML = '';
      return;
    }
    attachmentsTray.classList.add('visible');
    attachmentsTray.innerHTML = pendingAttachments.map((att, index) => {
      return '<span class="attachment-chip" title="' + escapeForMd(att.path || '') + '">' +
        '<span>' + attachmentIcon(att) + '</span>' +
        '<span class="attachment-chip-name">' + escapeForMd(att.name || att.path || 'arquivo') + '</span>' +
        '<span class="attachment-chip-meta">' + escapeForMd(att.sizeLabel || '') + '</span>' +
        '<button class="attachment-chip-remove" data-index="' + index + '" title="Remover anexo">&times;</button>' +
      '</span>';
    }).join('');
    attachmentsTray.querySelectorAll('.attachment-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingAttachments.splice(Number(btn.dataset.index || 0), 1);
        renderPendingAttachments();
        inputEl.focus();
      });
    });
  }

  function addPendingAttachments(items) {
    const byPath = new Map(pendingAttachments.map(att => [att.path, att]));
    for (const att of items || []) {
      if (att && att.path && !byPath.has(att.path)) {
        byPath.set(att.path, att);
      }
    }
    pendingAttachments = Array.from(byPath.values());
    renderPendingAttachments();
    inputEl.focus();
  }

  function fileToClipboardPayload(file, index) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve({
          name: file.name || ('clipboard-' + Date.now() + '-' + index + '.png'),
          mimeType: file.type || 'image/png',
          size: file.size || 0,
          dataBase64: comma >= 0 ? result.slice(comma + 1) : result,
        });
      };
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem colada'));
      reader.readAsDataURL(file);
    });
  }

  function setupDragAndDrop() {
    const overlay = document.getElementById('dropOverlay');
    let dragDepth = 0;

    function showOverlay() { if (overlay) overlay.classList.add('visible'); }
    function hideOverlay() { dragDepth = 0; if (overlay) overlay.classList.remove('visible'); }

    function hasFiles(dt) {
      if (!dt) return false;
      if (dt.types) {
        for (const t of dt.types) {
          if (t === 'Files' || t === 'text/uri-list' || t === 'application/vnd.code.tree.explorer' || t === 'resourceurls') return true;
        }
      }
      return false;
    }

    window.addEventListener('dragenter', (e) => {
      // Always preventDefault so the webview becomes a valid drop target.
      // Per the HTML5 spec, if dragover does not call preventDefault the
      // browser rejects the drop and the 'drop' event never fires. In VS Code
      // webviews the file types are often not exposed on dataTransfer until the
      // drop itself, so we cannot gate preventDefault on hasFiles().
      e.preventDefault();
      dragDepth++;
      if (hasFiles(e.dataTransfer)) showOverlay();
    });
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      if (hasFiles(e.dataTransfer)) showOverlay();
    });
    window.addEventListener('dragleave', (e) => {
      dragDepth--;
      if (dragDepth <= 0) hideOverlay();
    });
    window.addEventListener('drop', async (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      hideOverlay();
      if (isStreaming) {
        appendStatusMessage('Aguarde a resposta terminar para anexar arquivos.');
        return;
      }
      await handleDroppedData(e.dataTransfer);
    });
  }

  async function handleDroppedData(dt) {
    // 1) VS Code explorer drops expose file paths via uri-list / resourceurls.
    const uriPaths = [];
    const uriCandidates = [];
    try {
      const resourceUrls = dt.getData('resourceurls');
      if (resourceUrls) {
        const arr = JSON.parse(resourceUrls);
        if (Array.isArray(arr)) uriCandidates.push(...arr);
      }
    } catch { /* not resourceurls */ }
    const uriList = dt.getData('text/uri-list');
    if (uriList) {
      uriList.split(/\\r?\\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) uriCandidates.push(trimmed);
      });
    }
    for (const raw of uriCandidates) {
      if (typeof raw !== 'string') continue;
      let uri = raw;
      if (uri.startsWith('file://')) {
        try { uri = decodeURIComponent(uri.slice('file://'.length)); } catch { uri = uri.slice('file://'.length); }
        // Windows file URIs look like /C:/path; strip the leading slash.
        if (uri.length > 2 && uri.charAt(0) === '/' && uri.charAt(2) === ':' && /[A-Za-z]/.test(uri.charAt(1))) {
          uri = uri.slice(1);
        }
      }
      if (uri && !uri.startsWith('http')) uriPaths.push(uri);
    }
    if (uriPaths.length > 0) {
      vscode.postMessage({ type: 'drop_paths', paths: uriPaths });
      return;
    }

    // 2) OS file drops expose File objects. Images go through the inline
    //    base64 attach flow; other files are written to a temp path by the host.
    const files = dt.files ? Array.from(dt.files) : [];
    if (files.length === 0) return;
    setStatusLabel('Anexando arquivos...');
    try {
      const payload = await Promise.all(files.map((file, i) => fileToDropPayload(file, i)));
      vscode.postMessage({ type: 'drop_files', files: payload });
    } catch (err) {
      appendStatusMessage('Anexo: ' + (err && err.message ? err.message : String(err)));
      setStatusLabel('Falha ao anexar arquivos');
    }
  }

  function fileToDropPayload(file, index) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve({
          name: file.name || ('arquivo-' + Date.now() + '-' + index),
          mimeType: file.type || 'application/octet-stream',
          size: file.size || 0,
          dataBase64: comma >= 0 ? result.slice(comma + 1) : result,
        });
      };
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo solto'));
      reader.readAsDataURL(file);
    });
  }

  async function handlePaste(event) {
    const clipboard = event.clipboardData;
    if (!clipboard || isStreaming) return;
    const files = [];
    if (clipboard.items && clipboard.items.length) {
      for (const item of clipboard.items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file && String(file.type || '').startsWith('image/')) files.push(file);
        }
      }
    }
    if (files.length === 0 && clipboard.files && clipboard.files.length) {
      for (const file of clipboard.files) {
        if (file && String(file.type || '').startsWith('image/')) files.push(file);
      }
    }
    if (files.length === 0) return;
    event.preventDefault();
    setStatusLabel('Colando imagem...');
    try {
      const payload = await Promise.all(files.map(fileToClipboardPayload));
      vscode.postMessage({ type: 'paste_files', files: payload });
    } catch (err) {
      appendStatusMessage('Anexo: ' + (err && err.message ? err.message : String(err)));
      setStatusLabel('Falha ao colar imagem');
    }
  }

  /* ── Input handling ── */
  function sendText(text) {
    const trimmed = String(text || '').trim();
    const attachments = pendingAttachments.slice();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;
    const displayText = trimmed || 'Analise os arquivos anexados.';
    appendUserMessage(displayText, attachments);
    vscode.postMessage({ type: 'send_message', text: trimmed, attachments });
    pendingAttachments = [];
    renderPendingAttachments();
    inputEl.value = '';
    autoResizeInput();
    hideSlashPalette();
    setStreaming(true);
  }

  function sendMessage() {
    const text = inputEl.value.trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming) return;
    const localCommand = text.toLowerCase();
    if (localCommand === '/full' || localCommand === '/safe' || localCommand === '/plan') {
      vscode.postMessage({ type: 'local_slash_command', command: localCommand });
      inputEl.value = '';
      autoResizeInput();
      hideSlashPalette();
      return;
    }
    if (localCommand === '/model') {
      inputEl.value = '';
      autoResizeInput();
      hideSlashPalette();
      toggleModelPalette();
      return;
    }
    sendText(text);
  }

  // --- Seletor de modelo (dropdown in-webview) ---
  let modelList = [];
  let currentModel = null;
  // Set the moment the user picks a model from the palette. The async
  // model_list / system replies that arrive afterwards can carry a stale
  // "current" (the previous config default), so we must not let them clobber
  // the user's fresh choice and make the label snap back.
  let userPickedModel = false;
  let modelPaletteOpen = false;
  function setModelButtonLabel(value) {
    currentModel = value || null;
    if (modelBtnLabel) modelBtnLabel.textContent = value ? shortModelName(value) : 'Modelo';
  }
  function shortModelName(v) {
    if (!v) return 'Modelo';
    const parts = String(v).split('/');
    return parts[parts.length - 1];
  }
  function hideModelPalette() {
    modelPaletteOpen = false;
    if (modelPalette) modelPalette.classList.remove('visible');
  }
  function renderModelPalette() {
    if (!modelPalette) return;
    if (modelList.length === 0) {
      modelPalette.innerHTML = '<div class="model-item"><div class="model-item-desc">Carregando modelos...</div></div>';
      return;
    }
    let html = '';
    for (const m of modelList) {
      const isCur = (m.value || null) === currentModel;
      html += '<div class="model-item' + (isCur ? ' selected' : '') + '" data-model="' + escapeForMd(m.value == null ? '' : String(m.value)).replace(/"/g, '&quot;') + '">' +
        '<div class="model-item-name">' + (isCur ? '\u2713 ' : '') + escapeForMd(m.label || m.value || 'default') + '</div>' +
        (m.description ? '<div class="model-item-desc">' + escapeForMd(m.description) + '</div>' : '') +
      '</div>';
    }
    modelPalette.innerHTML = html;
    modelPalette.querySelectorAll('.model-item[data-model]').forEach(el => {
      el.addEventListener('click', () => {
        const v = el.getAttribute('data-model');
        const value = v === '' ? null : v;
        userPickedModel = true;
        vscode.postMessage({ type: 'set_model_choice', model: value });
        setModelButtonLabel(value);
        hideModelPalette();
      });
    });
  }
  function toggleModelPalette() {
    if (modelPaletteOpen) { hideModelPalette(); return; }
    modelPaletteOpen = true;
    if (modelPalette) modelPalette.classList.add('visible');
    renderModelPalette();
    vscode.postMessage({ type: 'request_models' });
  }
  if (modelBtn) {
    modelBtn.addEventListener('click', toggleModelPalette);
  }

  function autoResizeInput() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(Math.max(inputEl.scrollHeight, 92), 280) + 'px';
  }

  inputEl.addEventListener('input', () => {
    autoResizeInput();
    updateSlashPalette();
  });
  inputEl.addEventListener('keydown', (e) => {
    if (slashVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashSelectedIndex = Math.min(slashSelectedIndex + 1, Math.max(slashVisibleItems.length - 1, 0));
        renderSlashPalette();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashSelectedIndex = Math.max(slashSelectedIndex - 1, 0);
        renderSlashPalette();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideSlashPalette();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && slashVisibleItems.length > 0) {
        e.preventDefault();
        chooseSlashItem(slashSelectedIndex);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  sendBtn.addEventListener('click', sendMessage);
  if (attachBtn) {
    attachBtn.addEventListener('click', () => vscode.postMessage({ type: 'pick_files' }));
  }

  // --- Melhorador de prompt com IA ---
  let enhancing = false;
  let preEnhanceText = '';
  function setEnhancing(on) {
    enhancing = on;
    if (!enhanceBtn) return;
    enhanceBtn.classList.toggle('busy', on);
    enhanceBtn.disabled = on;
    enhanceBtn.title = on ? 'Melhorando...' : 'Melhorar prompt com IA';
  }
  if (enhanceBtn) {
    enhanceBtn.addEventListener('click', () => {
      if (enhancing) return;
      const text = (inputEl.value || '').trim();
      if (!text) { appendStatusMessage('Digite um prompt antes de melhorar.'); return; }
      preEnhanceText = inputEl.value;
      setEnhancing(true);
      vscode.postMessage({ type: 'enhance_prompt', text });
    });
  }

  document.addEventListener('paste', handlePaste);
  setupDragAndDrop();
  abortBtn.addEventListener('click', () => vscode.postMessage({ type: 'abort' }));
  newChatBtn.addEventListener('click', () => vscode.postMessage({ type: 'new_session' }));
  historyBtn.addEventListener('click', () => {
    sessionOverlay.classList.toggle('visible');
    if (sessionOverlay.classList.contains('visible')) {
      vscode.postMessage({ type: 'request_sessions' });
      sessionSearch.focus();
    }
  });
  closeSessionsBtn.addEventListener('click', () => sessionOverlay.classList.remove('visible'));
  sessionSearch.addEventListener('input', () => {
    const q = sessionSearch.value.toLowerCase();
    sessionList.querySelectorAll('.session-item').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // Copy code handler (event delegation)
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
      const id = copyBtn.dataset.copyId;
      const codeEl = document.getElementById(id);
      if (codeEl) {
        const text = codeEl.textContent;
        vscode.postMessage({ type: 'copy_code', text });
        copyBtn.textContent = 'Copiado!';
        setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1500);
      }
      return;
    }

    const fileLink = e.target.closest('.file-link');
    if (fileLink) {
      e.preventDefault();
      e.stopPropagation();
      const filepath = fileLink.dataset.filepath;
      if (filepath) {
        vscode.postMessage({ type: 'open_file', path: filepath });
      }
      return;
    }
  });

  // ---- Tab bar (multiplas conversas) ----
  function renderTabBar(tabs, newActiveId) {
    if (!tabBarEl) return;
    const switchingTab = newActiveId && newActiveId !== activeTabId;
    activeTabId = newActiveId || activeTabId;
    tabBarEl.innerHTML = '';

    tabs.forEach((tab) => {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab' + (tab.tabId === activeTabId ? ' active' : '');
      tabEl.setAttribute('role', 'tab');
      tabEl.dataset.tabId = tab.tabId;

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = tab.title || 'Conversa';
      if (tab.streaming) {
        const dot = document.createElement('span');
        dot.className = 'tab-stream-dot';
        tabEl.appendChild(dot);
      }
      tabEl.appendChild(label);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '\u00d7';
      closeBtn.title = 'Fechar conversa';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'close_tab', tabId: tab.tabId });
      });
      tabEl.appendChild(closeBtn);

      tabEl.addEventListener('click', () => {
        if (tab.tabId !== activeTabId) {
          vscode.postMessage({ type: 'switch_tab', tabId: tab.tabId });
        }
      });
      tabBarEl.appendChild(tabEl);
    });

    const addBtn = document.createElement('div');
    addBtn.className = 'tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Nova conversa';
    addBtn.addEventListener('click', () => vscode.postMessage({ type: 'new_tab' }));
    tabBarEl.appendChild(addBtn);

    // When the host switches the active tab, clear the view; the host follows
    // up with restore_messages for the newly active tab.
    if (switchingTab) {
      messagesEl.innerHTML = '';
      currentAssistantEl = null;
      currentTextEl = null;
      showWelcome();
    }
  }

  /* ── Message handling from extension ── */
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;

    // Tab bar state is global; render it regardless of active tab.
    if (msg.type === 'tabs_state') {
      renderTabBar(msg.tabs || [], msg.activeTabId);
      return;
    }
    // Every other broadcast is tab-scoped. Ignore traffic for background tabs
    // so a streaming conversation in tab B never corrupts the view of tab A.
    // Background tabs keep accumulating in their controller and are rebuilt via
    // restore_messages when the user switches to them.
    if (msg.tabId && activeTabId && msg.tabId !== activeTabId) {
      return;
    }

    switch (msg.type) {
      case 'stream_start':
        setStreaming(true, 'Gerando...');
        getOrCreateAssistantEl();
        break;

      case 'stream_delta': {
        setStatusLabel('Gerando...');
        const { textEl } = getOrCreateAssistantEl();
        textEl.innerHTML = renderMarkdown(msg.text || '');
        scrollToBottom();
        break;
      }

      case 'stream_end':
        if (msg.text) {
          const { textEl } = getOrCreateAssistantEl();
          textEl.innerHTML = renderMarkdown(msg.text);
        }
        finalizeAssistant();
        if (msg.usage) {
          const u = msg.usage;
          statusUsage.textContent = (u.input_tokens || 0) + ' entrada / ' + (u.output_tokens || 0) + ' saida';
        }
        if (msg.final) {
          setStreaming(false);
          maybeAppendToolFailureHint(msg.text || '');
        }
        scrollToBottom();
        break;

      case 'tool_use':
        appendToolCard(msg.toolUse);
        setStatusLabel('Executando: ' + (msg.toolUse.displayName || msg.toolUse.name || 'tool') + '...');
        break;

      case 'tool_result':
        updateToolResult(msg.toolUseId, msg.content, msg.isError);
        break;

      case 'tool_input_ready':
        updateToolInput(msg.toolUseId, msg.input, msg.name);
        break;

      case 'tool_progress':
        updateToolProgress(msg.toolUseId, msg.content);
        break;

      case 'permission_request':
        appendPermissionCard(msg);
        break;

      case 'status':
        setStatusLabel(msg.content || 'Trabalhando...');
        break;

      case 'rate_limit':
        appendRateLimitMessage(msg.message || 'Limite de taxa atingido');
        break;

      case 'attachments_picked':
        addPendingAttachments(msg.attachments || []);
        setStatusLabel((msg.attachments || []).length + ' arquivo(s) anexado(s)');
        break;

      case 'attachments_error':
        appendStatusMessage('Anexo: ' + (msg.message || 'falha ao carregar arquivo'));
        setStatusLabel('Falha ao anexar arquivo');
        break;

      case 'enhance_prompt_result':
        setEnhancing(false);
        if (msg.text) {
          inputEl.value = msg.text;
          inputEl.dispatchEvent(new Event('input'));
          inputEl.focus();
          setStatusLabel('Prompt melhorado');
        }
        break;

      case 'model_list':
        modelList = Array.isArray(msg.models) ? msg.models : [];
        // Only adopt the backend's "current" if the user hasn't just picked a
        // model. Otherwise a late reply would revert the label to the default.
        if (msg.current !== undefined && !userPickedModel) setModelButtonLabel(msg.current);
        if (modelPaletteOpen) renderModelPalette();
        break;

      case 'enhance_prompt_error':
        setEnhancing(false);
        if (preEnhanceText) inputEl.value = preEnhanceText;
        appendStatusMessage('Melhorar prompt: ' + (msg.message || 'falha'));
        setStatusLabel('Falha ao melhorar prompt');
        break;

      case 'thinking_start':
        showThinkingBlock();
        break;

      case 'thinking_delta':
        updateThinkingBlock(msg.tokens || 0, msg.elapsed || 0);
        break;

      case 'thinking_end':
        hideThinkingBlock();
        break;

      case 'system_info':
        // Modelo oculto por padrao para manter a UI limpa.
        if (Array.isArray(msg.slashCommands)) {
          dynamicSlashCommands = msg.slashCommands;
          updateSlashPalette();
        }
        setPowerBadge(null, msg.permissionMode, 'default');
        break;

      case 'power_state':
        setPowerBadge(msg.detail, msg.permissionMode, msg.tools);
        break;

      case 'error':
        setStreaming(false);
        finalizeAssistant();
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Erro: ' + (msg.message || 'Erro desconhecido');
        appendStatusMessage('Erro: ' + (msg.message || 'Erro desconhecido'));
        maybeAppendToolFailureHint(msg.message || '');
        break;

      case 'session_list':
        renderSessionList(msg.sessions);
        break;

      case 'session_cleared':
        messagesEl.innerHTML = '';
        if (welcomeEl) {
          messagesEl.appendChild(welcomeEl);
          showWelcome();
        }
        currentAssistantEl = null;
        currentTextEl = null;
        statusUsage.textContent = '';
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Pronto';
        hideSlashPalette();
        break;

      case 'restore_messages':
        // Keep activeTabId in sync with the restored tab so subsequent live
        // stream messages (filtered by tabId below) are not silently dropped.
        if (msg.tabId) activeTabId = msg.tabId;
        messagesEl.innerHTML = '';
        currentAssistantEl = null;
        currentTextEl = null;
        hideWelcome();
        if (msg.messages) {
          for (const m of msg.messages) {
            if (m.role === 'user') {
              appendUserMessage(m.text || '', m.attachments || []);
            } else if (m.role === 'assistant') {
              const { textEl } = getOrCreateAssistantEl();
              textEl.innerHTML = renderMarkdown(m.text || '');
              if (m.toolUses && m.toolUses.length > 0) {
                for (const tu of m.toolUses) {
                  var displayName = tu.name || 'Ferramenta';
                  var icon = '';
                  var inputPreview = '';
                  if (tu.input && typeof tu.input === 'object') {
                    inputPreview = tu.input.file_path || tu.input.path || tu.input.command || '';
                  }
                  var card = appendToolCard({
                    id: tu.id,
                    name: tu.name,
                    displayName: displayName,
                    icon: icon,
                    inputPreview: inputPreview,
                    input: tu.input,
                    status: tu.status || 'complete',
                  });
                  if (tu.input) {
                    updateToolInput(String(tu.id), tu.input, tu.name);
                  }
                  if (tu.result !== undefined && tu.result !== null) {
                    updateToolResult(String(tu.id), tu.result, tu.isError || false);
                  } else {
                    updateToolResult(String(tu.id), '(concluido)', false);
                  }
                }
              }
              finalizeAssistant();
            }
          }
        }
        scrollToBottom();
        break;

      case 'connected':
        setStreaming(false);
        statusDot.className = 'status-dot connected';
        statusText.textContent = msg.message === 'Connected' ? 'Conectado' : (msg.message === 'Ready' ? 'Pronto' : (msg.message || 'Conectado'));
        break;

      default:
        break;
    }
  });

  // Focus input on Ctrl/Cmd+L
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      inputEl.focus();
    }
  });

  // Restore state
  const prevState = vscode.getState();
  if (prevState && prevState.hasMessages) {
    vscode.postMessage({ type: 'restore_request' });
  }

  // Notify ready
  vscode.postMessage({ type: 'webview_ready' });
})();
</script>
</body>
</html>`;
}

module.exports = {
  renderChatHtml,
  FAVORITE_SLASH_COMMANDS,
  buildSlashCommandItems,
  filterSlashCommandItems,
  resolveSlashSelection,
  DEFAULT_DYNAMIC_SLASH_COMMANDS,
};

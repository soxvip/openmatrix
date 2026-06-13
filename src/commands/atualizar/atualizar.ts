import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import type { LocalCommandResult } from '../../types/command.js'

const CLI_TGZ_WIN =
  'https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-cli-win.tgz'
const CLI_TGZ_NIX =
  'https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-cli.tgz'
const VSIX_URL =
  'https://github.com/soxvip/openmatrix/releases/latest/download/open-matrix-vscode.vsix'

const SECONDS = 1000
const STEP_TIMEOUT = 300 * SECONDS

// execFileNoThrow usa cross-spawn, que resolve os shims .cmd/.bat no Windows
// automaticamente (npm/code/antigravity-ide), então chamamos o binário direto.
function runTool(
  bin: string,
  args: string[],
  timeout: number,
): ReturnType<typeof execFileNoThrow> {
  return execFileNoThrow(bin, args, {
    timeout,
    preserveOutputOnError: true,
    useCwd: true,
  })
}

function cliTarballUrl(): string {
  return process.platform === 'win32' ? CLI_TGZ_WIN : CLI_TGZ_NIX
}

async function updateCli(lines: string[]): Promise<void> {
  const url = cliTarballUrl()
  lines.push(`• Atualizando CLI a partir de ${url} ...`)
  const result = await runTool(
    'npm',
    ['install', '-g', url, '--no-audit', '--no-fund'],
    STEP_TIMEOUT,
  )
  if (result.code === 0) {
    lines.push('  ✓ CLI atualizado.')
  } else {
    lines.push(
      `  ✗ Falha ao atualizar o CLI (código ${result.code}). ${
        (result.stderr || result.error || '').trim().split('\n').slice(-1)[0] ?? ''
      }`,
    )
  }
}

async function updateExtensionFor(
  bin: string,
  label: string,
  lines: string[],
): Promise<void> {
  // Verifica se o editor está disponível no PATH antes de tentar instalar.
  const probe = await runTool(bin, ['--version'], 30 * SECONDS)
  if (probe.code !== 0) {
    lines.push(`• ${label}: não encontrado no PATH, ignorando.`)
    return
  }
  lines.push(`• Atualizando extensão no ${label} ...`)
  const result = await runTool(
    bin,
    ['--install-extension', VSIX_URL, '--force'],
    STEP_TIMEOUT,
  )
  if (result.code === 0) {
    lines.push(`  ✓ Extensão atualizada no ${label}.`)
  } else {
    lines.push(
      `  ✗ Falha ao atualizar a extensão no ${label} (código ${result.code}).`,
    )
  }
}

export async function call(): Promise<LocalCommandResult> {
  const lines: string[] = ['Atualizando OPEN MATRIX para a versão mais recente do GitHub...', '']

  await updateCli(lines)
  await updateExtensionFor('code', 'VS Code', lines)
  await updateExtensionFor('antigravity-ide', 'Antigravity', lines)

  lines.push('')
  lines.push(
    'Concluído. Reinicie o CLI (e recarregue a janela do editor) para usar a versão nova.',
  )

  return { type: 'text', value: lines.join('\n') }
}

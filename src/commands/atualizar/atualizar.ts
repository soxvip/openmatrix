import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import type { LocalCommandResult } from '../../types/command.js'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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

// `code/antigravity-ide --install-extension` aceita apenas um caminho .vsix
// local ou um ID do marketplace — NÃO uma URL. Por isso baixamos o .vsix para
// um arquivo temporário e instalamos a partir dele, espelhando os instaladores.
async function downloadVsix(lines: string[]): Promise<string | null> {
  const dest = join(tmpdir(), `open-matrix-vscode-${randomUUID()}.vsix`)
  try {
    const res = await fetch(VSIX_URL, { redirect: 'follow' })
    if (!res.ok) {
      lines.push(`• Falha ao baixar a extensão (HTTP ${res.status}).`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(dest, buf)
    return dest
  } catch (err) {
    lines.push(
      `• Falha ao baixar a extensão: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}

async function updateExtensionFor(
  bin: string,
  label: string,
  vsixPath: string,
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
    ['--install-extension', vsixPath, '--force'],
    STEP_TIMEOUT,
  )
  if (result.code === 0) {
    lines.push(`  ✓ Extensão atualizada no ${label}.`)
  } else {
    lines.push(
      `  ✗ Falha ao atualizar a extensão no ${label} (código ${result.code}). ${
        (result.stderr || result.error || '').trim().split('\n').slice(-1)[0] ?? ''
      }`,
    )
  }
}

async function updateExtensions(lines: string[]): Promise<void> {
  const vsixPath = await downloadVsix(lines)
  if (!vsixPath) {
    return
  }
  try {
    await updateExtensionFor('code', 'VS Code', vsixPath, lines)
    await updateExtensionFor('antigravity-ide', 'Antigravity', vsixPath, lines)
  } finally {
    await unlink(vsixPath).catch(() => {})
  }
}

export async function call(): Promise<LocalCommandResult> {
  const lines: string[] = ['Atualizando OPEN MATRIX para a versão mais recente do GitHub...', '']

  await updateCli(lines)
  await updateExtensions(lines)

  lines.push('')
  lines.push(
    'Concluído. Reinicie o CLI (e recarregue a janela do editor) para usar a versão nova.',
  )

  return { type: 'text', value: lines.join('\n') }
}

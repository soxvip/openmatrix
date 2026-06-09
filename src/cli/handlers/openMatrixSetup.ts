import { createInterface } from 'node:readline'

import { DGSIS_API_KEY_ENV_VAR } from '../../integrations/dgsisModels.js'
import {
  configureOpenMatrixProviderProfile,
  getOpenMatrixSetupSummary,
} from '../../utils/openMatrixGatewayProfile.js'

export type OpenMatrixSetupOptions = {
  tokenStdin?: boolean
  json?: boolean
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8').trim()
}

async function promptVisible(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  return await new Promise<string>((resolve, reject) => {
    rl.question(query, answer => {
      rl.close()
      resolve(answer.trim())
    })
    rl.once('error', reject)
  })
}


async function resolveToken(options: OpenMatrixSetupOptions): Promise<string> {
  if (options.tokenStdin) {
    return readAllStdin()
  }

  const envToken = process.env[DGSIS_API_KEY_ENV_VAR]?.trim()
  if (envToken) {
    return envToken
  }

  return promptVisible('Cole seu token OPEN MATRIX: ')
}

export async function openMatrixSetupHandler(options: OpenMatrixSetupOptions = {}): Promise<void> {
  const token = await resolveToken(options)
  const result = configureOpenMatrixProviderProfile(token)
  const summary = getOpenMatrixSetupSummary(result.profile)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, created: result.created, ...summary })}\n`)
    return
  }

  process.stdout.write(
    [
      'Configuracao OPEN MATRIX concluida.',
      `Perfil: ${summary.name}`,
      `Provider: ${summary.provider}`,
      `Base URL: ${summary.baseUrl}`,
      `Modelo padrao: ${summary.defaultModel}`,
      `Modelos disponiveis: ${summary.modelCount}`,
      'Use: open-matrix',
    ].join('\n') + '\n',
  )
}

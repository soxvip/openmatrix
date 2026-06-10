import { createInterface } from 'node:readline'
import { getGlobalDispatcher } from 'undici'

import { DGSIS_API_KEY_ENV_VAR } from '../../integrations/dgsisModels.js'
import {
  configureOpenMatrixProviderProfile,
  getOpenMatrixSetupSummary,
} from '../../utils/openMatrixGatewayProfile.js'
import { loadActiveTokenEntitlements } from '../../utils/model/tokenEntitlements.js'

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
  const entitlements = await loadActiveTokenEntitlements({
    forceRefresh: true,
    tokenOverride: token,
  })

  if (entitlements.kind === 'error') {
    throw new Error(entitlements.message)
  }
  if (entitlements.kind === 'empty' || entitlements.kind === 'not-applicable') {
    throw new Error('This API token has no assigned models. Assign at least one model in API panel.')
  }

  const result = configureOpenMatrixProviderProfile(token, {
    models: entitlements.models,
    defaultModel: entitlements.defaultModel,
  })
  const summary = getOpenMatrixSetupSummary(result.profile)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      created: result.created,
      entitlementProvider: entitlements.provider,
      accountId: entitlements.accountId,
      assignedModels: entitlements.models,
      ...summary,
    })}\n`)
    await getGlobalDispatcher().close()
    return
  }

  process.stdout.write(
    [
      'Configuracao OPEN MATRIX concluida.',
      `Perfil: ${summary.name}`,
      `Provider: ${summary.provider}`,
      entitlements.accountId ? `Conta: ${entitlements.accountId}` : undefined,
      `Base URL: ${summary.baseUrl}`,
      `Modelo padrao: ${summary.defaultModel}`,
      `Modelos disponiveis: ${summary.modelCount}`,
      ...entitlements.models.map(model => `- ${model}`),
      'Use: open-matrix',
    ].filter(Boolean).join('\n') + '\n',
  )

  await getGlobalDispatcher().close()
}

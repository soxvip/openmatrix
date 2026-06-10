import { DGSIS_API_KEY_ENV_VAR, DGSIS_BASE_URL, DGSIS_GATEWAY_ID } from '../../integrations/dgsisModels.js'
import type { ModelOption } from './modelOptions.js'

type EntitlementModel = string | {
  id?: unknown
  apiName?: unknown
  label?: unknown
  default?: unknown
}

type EntitlementResponse = {
  provider?: unknown
  accountId?: unknown
  account?: unknown
  defaultModel?: unknown
  models?: unknown
  data?: unknown
}

export type TokenEntitlementStatus =
  | { kind: 'not-applicable' }
  | {
      kind: 'loaded'
      provider?: string
      accountId?: string
      models: string[]
      defaultModel?: string
    }
  | { kind: 'empty'; provider?: string; accountId?: string }
  | { kind: 'error'; message: string; managedToken: boolean }

type ActiveOpenMatrixToken = {
  token: string
  managed: boolean
}

let cachedStatus: TokenEntitlementStatus | null = null
let cachedToken: string | null = null

function normalizeModelId(model: string): string {
  return model.trim().toLowerCase()
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  return value?.trim().replace(/\/+$/, '')
}

function isDgsisBaseUrl(value: string | undefined): boolean {
  return normalizeBaseUrl(value) === normalizeBaseUrl(DGSIS_BASE_URL)
}

async function getActiveOpenMatrixToken(): Promise<ActiveOpenMatrixToken | null> {
  const envToken = process.env[DGSIS_API_KEY_ENV_VAR]?.trim()
  if (envToken) {
    return { token: envToken, managed: true }
  }

  const anthropicToken = process.env.ANTHROPIC_API_KEY?.trim()
  if (anthropicToken && isDgsisBaseUrl(process.env.ANTHROPIC_BASE_URL)) {
    return { token: anthropicToken, managed: true }
  }

  const openAiToken = process.env.OPENAI_API_KEY?.trim()
  if (openAiToken && isDgsisBaseUrl(process.env.OPENAI_BASE_URL)) {
    return { token: openAiToken, managed: true }
  }

  try {
    const { getActiveProviderProfile } = await import('../providerProfiles.js')
    const profile = getActiveProviderProfile()
    if (profile?.provider !== DGSIS_GATEWAY_ID || !profile.apiKey?.trim()) {
      return null
    }

    return { token: profile.apiKey.trim(), managed: true }
  } catch {
    return null
  }
}

function getEntitlementsUrl(): string {
  const baseUrl = (process.env.OPEN_MATRIX_API_BASE_URL ?? DGSIS_BASE_URL).replace(/\/+$/, '')
  return `${baseUrl}/models`
}

function parseEntitlementResponse(value: EntitlementResponse): TokenEntitlementStatus {
  const provider = normalizeString(value.provider)
  const accountId = normalizeString(value.accountId) ?? normalizeString(value.account)
  const defaultModel = normalizeString(value.defaultModel)
  const rawModels = Array.isArray(value.models)
    ? value.models
    : Array.isArray(value.data)
      ? value.data
      : []
  const models = rawModels.flatMap((entry: EntitlementModel) => {
    if (typeof entry === 'string') {
      return entry.trim() ? [entry.trim()] : []
    }
    if (entry && typeof entry === 'object') {
      const id = normalizeString(entry.id) ?? normalizeString(entry.apiName)
      return id ? [id] : []
    }
    return []
  })

  const uniqueModels = [...new Set(models)]
  if (uniqueModels.length === 0) {
    return { kind: 'empty', provider, accountId }
  }

  return {
    kind: 'loaded',
    provider,
    accountId,
    models: uniqueModels,
    defaultModel,
  }
}

export async function loadActiveTokenEntitlements(options: {
  forceRefresh?: boolean
  tokenOverride?: string
} = {}): Promise<TokenEntitlementStatus> {
  const activeToken = options.tokenOverride
    ? { token: options.tokenOverride.trim(), managed: true }
    : await getActiveOpenMatrixToken()

  if (!activeToken?.token) {
    return { kind: 'not-applicable' }
  }

  if (!options.forceRefresh && cachedStatus && cachedToken === activeToken.token) {
    return cachedStatus
  }

  try {
    const response = await fetch(getEntitlementsUrl(), {
      headers: {
        Authorization: `Bearer ${activeToken.token}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const json = (await response.json()) as EntitlementResponse
    const status = parseEntitlementResponse(json)
    cachedStatus = status
    cachedToken = activeToken.token
    return status
  } catch {
    const status: TokenEntitlementStatus = {
      kind: 'error',
      message: 'Could not load models assigned to this API token.',
      managedToken: activeToken.managed,
    }
    cachedStatus = status
    cachedToken = activeToken.token
    return status
  }
}

export function filterOptionsByTokenEntitlements(
  options: ModelOption[],
  status: TokenEntitlementStatus,
): ModelOption[] {
  if (status.kind === 'not-applicable') {
    return options
  }
  if (status.kind !== 'loaded') {
    return []
  }

  const allowed = new Set(status.models.map(normalizeModelId))
  return options.filter(option => {
    if (option.value === null) {
      return true
    }
    return allowed.has(normalizeModelId(option.value))
  })
}

export function isModelAllowedByTokenEntitlements(
  model: string,
  status: TokenEntitlementStatus,
): boolean | 'not-applicable' | 'unknown' {
  if (status.kind === 'not-applicable') {
    return 'not-applicable'
  }
  if (status.kind !== 'loaded') {
    return 'unknown'
  }

  const allowed = new Set(status.models.map(normalizeModelId))
  return allowed.has(normalizeModelId(model))
}

export function hasActiveTokenEntitlementGate(
  status: TokenEntitlementStatus,
): boolean {
  return status.kind === 'loaded' || status.kind === 'empty' || (status.kind === 'error' && status.managedToken)
}

export function clearTokenEntitlementsCache(): void {
  cachedStatus = null
  cachedToken = null
}

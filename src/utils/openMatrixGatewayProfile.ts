import {
  DGSIS_BASE_URL,
  DGSIS_DEFAULT_MODEL,
  DGSIS_GATEWAY_ID,
  DGSIS_PROFILE_NAME,
  getDgsisModelListString,
} from '../integrations/dgsisModels.js'
import type { ProviderProfile } from './config.js'
import {
  addProviderProfile,
  getProviderProfiles,
  setActiveProviderProfile,
  updateProviderProfile,
} from './providerProfiles.js'
import { sanitizeApiKey } from './providerSecrets.js'

export type ConfigureOpenMatrixProfileResult = {
  profile: ProviderProfile
  created: boolean
}

function isOpenMatrixProfile(profile: ProviderProfile): boolean {
  return (
    profile.provider === DGSIS_GATEWAY_ID ||
    profile.baseUrl.replace(/\/+$/, '') === DGSIS_BASE_URL ||
    profile.name.trim().toLowerCase() === DGSIS_PROFILE_NAME.toLowerCase()
  )
}

export function configureOpenMatrixProviderProfile(
  token: string,
  options: { models?: string[]; defaultModel?: string } = {},
): ConfigureOpenMatrixProfileResult {
  const apiKey = sanitizeApiKey(token)
  if (!apiKey) {
    throw new Error('Token OPEN MATRIX vazio. Rode open-matrix setup novamente e informe um token valido.')
  }

  const assignedModels = options.models?.filter(model => model.trim()) ?? []
  const defaultModel = options.defaultModel?.trim()
  const orderedModels = defaultModel && assignedModels.includes(defaultModel)
    ? [defaultModel, ...assignedModels.filter(model => model !== defaultModel)]
    : assignedModels
  const modelList = orderedModels.length > 0
    ? orderedModels.join(',')
    : getDgsisModelListString()

  const input = {
    provider: DGSIS_GATEWAY_ID,
    name: DGSIS_PROFILE_NAME,
    baseUrl: DGSIS_BASE_URL,
    model: modelList,
    apiKey,
  }

  const existing = getProviderProfiles().find(isOpenMatrixProfile)
  if (existing) {
    const profile = updateProviderProfile(existing.id, input)
    if (!profile) {
      throw new Error('Nao foi possivel atualizar perfil OPEN MATRIX.')
    }
    setActiveProviderProfile(profile.id)
    return { profile, created: false }
  }

  const profile = addProviderProfile(input, { makeActive: true })
  if (!profile) {
    throw new Error('Nao foi possivel criar perfil OPEN MATRIX.')
  }
  return { profile, created: true }
}

export function getOpenMatrixSetupSummary(profile: ProviderProfile): {
  name: string
  provider: string
  baseUrl: string
  defaultModel: string
  modelCount: number
} {
  return {
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    defaultModel: profile.model.split(',').map(model => model.trim()).find(Boolean) ?? DGSIS_DEFAULT_MODEL,
    modelCount: profile.model.split(',').filter(model => model.trim()).length,
  }
}

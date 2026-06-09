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

export function configureOpenMatrixProviderProfile(token: string): ConfigureOpenMatrixProfileResult {
  const apiKey = sanitizeApiKey(token)
  if (!apiKey) {
    throw new Error('Token OPEN MATRIX vazio. Rode open-matrix setup novamente e informe um token valido.')
  }

  const input = {
    provider: DGSIS_GATEWAY_ID,
    name: DGSIS_PROFILE_NAME,
    baseUrl: DGSIS_BASE_URL,
    model: getDgsisModelListString(),
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
    defaultModel: DGSIS_DEFAULT_MODEL,
    modelCount: getDgsisModelListString().split(',').length,
  }
}

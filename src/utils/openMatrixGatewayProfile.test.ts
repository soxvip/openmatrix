import { afterEach, beforeEach, expect, mock, test } from 'bun:test'

import {
  DGSIS_BASE_URL,
  DGSIS_DEFAULT_MODEL,
  DGSIS_MODEL_IDS,
  DGSIS_PROFILE_MODEL_IDS,
  DGSIS_PROFILE_NAME,
} from '../integrations/dgsisModels.js'
import type { ProviderProfile } from './config.js'

let profiles: ProviderProfile[] = []
let activeProfileId: string | undefined

function installProviderProfileMock(): void {
  mock.module('./providerProfiles.js', () => ({
    getActiveProviderProfile: () => profiles.find(profile => profile.id === activeProfileId) ?? null,
    getProviderProfiles: () => profiles,
    addProviderProfile: (
      input: Omit<ProviderProfile, 'id'>,
      options?: { makeActive?: boolean },
    ) => {
      const profile = { id: 'provider_new', ...input }
      profiles = [...profiles, profile]
      if (options?.makeActive !== false) {
        activeProfileId = profile.id
      }
      return profile
    },
    updateProviderProfile: (
      id: string,
      input: Omit<ProviderProfile, 'id'>,
    ) => {
      const index = profiles.findIndex(profile => profile.id === id)
      if (index < 0) return null
      const profile = { id, ...input }
      profiles = profiles.map(existing => existing.id === id ? profile : existing)
      return profile
    },
    setActiveProviderProfile: (id: string) => {
      activeProfileId = id
      return profiles.find(profile => profile.id === id) ?? null
    },
    getProviderPresetDefaults: () => null,
    hasProviderProfiles: () => profiles.length > 0,
    clearProviderProfileEnvFromProcessEnv: () => {},
    applyProviderProfileToProcessEnv: () => {},
    applyActiveProviderProfileFromConfig: () => null,
    persistActiveProviderProfileModel: () => null,
    getConfiguredProfileModelOptions: () => [],
    getProfileModelOptions: () => [],
    deleteProviderProfile: () => ({ deleted: false }),
    getActiveOpenAIModelOptionsCache: () => null,
    setActiveOpenAIModelOptionsCache: () => {},
    getActiveOpenAIRouteModelOptionsCache: () => null,
    setActiveOpenAIRouteModelOptionsCache: () => {},
    clearActiveOpenAIModelOptionsCache: () => {},
  }))
}

beforeEach(() => {
  mock.restore()
  profiles = []
  activeProfileId = undefined
  installProviderProfileMock()
})

afterEach(() => {
  mock.restore()
})

test('configureOpenMatrixProviderProfile creates active DGSIS profile with cx/gpt-5.5 primary', async () => {
  const nonce = `${Date.now()}-${Math.random()}`
  const { configureOpenMatrixProviderProfile, getOpenMatrixSetupSummary } =
    await import(`./openMatrixGatewayProfile.js?setup=${nonce}`)

  const result = configureOpenMatrixProviderProfile('fake-token')
  const modelList = result.profile.model.split(',')
  const summary = getOpenMatrixSetupSummary(result.profile)

  expect(result.created).toBe(true)
  expect(activeProfileId).toBe(result.profile.id)
  expect(result.profile.name).toBe(DGSIS_PROFILE_NAME)
  expect(result.profile.provider).toBe('dgsis')
  expect(result.profile.baseUrl).toBe(DGSIS_BASE_URL)
  expect(result.profile.apiKey).toBe('fake-token')
  expect(modelList).toEqual([...DGSIS_PROFILE_MODEL_IDS])
  expect(new Set(modelList)).toEqual(new Set(DGSIS_MODEL_IDS))
  expect(modelList[0]).toBe(DGSIS_DEFAULT_MODEL)
  expect(summary).toMatchObject({
    name: DGSIS_PROFILE_NAME,
    provider: 'dgsis',
    baseUrl: DGSIS_BASE_URL,
    defaultModel: DGSIS_DEFAULT_MODEL,
    modelCount: DGSIS_MODEL_IDS.length,
  })
})

test('configureOpenMatrixProviderProfile stores assigned models with entitlement default first', async () => {
  const nonce = `${Date.now()}-${Math.random()}`
  const { configureOpenMatrixProviderProfile, getOpenMatrixSetupSummary } =
    await import(`./openMatrixGatewayProfile.js?assigned=${nonce}`)

  const result = configureOpenMatrixProviderProfile('fake-token', {
    models: ['cx/gpt-5.5', 'kr/claude-opus-4.7'],
    defaultModel: 'kr/claude-opus-4.7',
  })
  const summary = getOpenMatrixSetupSummary(result.profile)

  expect(result.profile.model).toBe('kr/claude-opus-4.7,cx/gpt-5.5')
  expect(summary.defaultModel).toBe('kr/claude-opus-4.7')
  expect(summary.modelCount).toBe(2)
})

test('configureOpenMatrixProviderProfile updates existing OPEN MATRIX profile', async () => {
  profiles = [{
    id: 'existing',
    name: DGSIS_PROFILE_NAME,
    provider: 'openai',
    baseUrl: 'https://old.example/v1',
    model: 'old-model',
    apiKey: 'old-token',
  }]

  const nonce = `${Date.now()}-${Math.random()}`
  const { configureOpenMatrixProviderProfile } =
    await import(`./openMatrixGatewayProfile.js?setup=${nonce}`)

  const result = configureOpenMatrixProviderProfile('new-token')

  expect(result.created).toBe(false)
  expect(result.profile.id).toBe('existing')
  expect(result.profile.provider).toBe('dgsis')
  expect(result.profile.baseUrl).toBe(DGSIS_BASE_URL)
  expect(result.profile.apiKey).toBe('new-token')
  expect(activeProfileId).toBe('existing')
})

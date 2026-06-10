import { afterEach, beforeEach, expect, mock, test } from 'bun:test'

import {
  clearTokenEntitlementsCache,
  filterOptionsByTokenEntitlements,
  hasActiveTokenEntitlementGate,
  isModelAllowedByTokenEntitlements,
  loadActiveTokenEntitlements,
} from './tokenEntitlements.js'

let fetchCalls: RequestInfo[] = []

beforeEach(() => {
  mock.module('../providerProfiles.js', () => ({
    getProviderPresetDefaults: () => null,
    getProviderProfiles: () => [],
    hasProviderProfiles: () => false,
    getActiveProviderProfile: () => null,
    clearProviderProfileEnvFromProcessEnv: () => {},
    applyProviderProfileToProcessEnv: () => {},
    applyActiveProviderProfileFromConfig: () => null,
    addProviderProfile: () => null,
    updateProviderProfile: () => null,
    persistActiveProviderProfileModel: () => null,
    getConfiguredProfileModelOptions: () => [],
    getProfileModelOptions: () => [],
    setActiveProviderProfile: () => null,
    deleteProviderProfile: () => ({ deleted: false }),
    getActiveOpenAIModelOptionsCache: () => null,
    setActiveOpenAIModelOptionsCache: () => {},
    getActiveOpenAIRouteModelOptionsCache: () => null,
    setActiveOpenAIRouteModelOptionsCache: () => {},
    clearActiveOpenAIModelOptionsCache: () => {},
  }))
  delete process.env.OPEN_MATRIX_API_KEY
  delete process.env.OPEN_MATRIX_API_BASE_URL
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_BASE_URL
  clearTokenEntitlementsCache()
  fetchCalls = []
})

afterEach(() => {
  mock.restore()
})

test('loads OpenAI-compatible model list as token entitlements', async () => {
  process.env.OPEN_MATRIX_API_KEY = 'test-token'
  process.env.OPEN_MATRIX_API_BASE_URL = 'https://api.example/v1'
  globalThis.fetch = mock(async () => new Response(JSON.stringify({
    object: 'list',
    data: [
      { id: 'kr/claude-opus-4.8', object: 'model', owned_by: 'kr' },
      { id: 'cx/gpt-5.5', object: 'model', owned_by: 'cx' },
    ],
  }), { status: 200 })) as unknown as typeof fetch

  const status = await loadActiveTokenEntitlements({ forceRefresh: true })

  expect(status).toEqual({
    kind: 'loaded',
    provider: undefined,
    accountId: undefined,
    models: ['kr/claude-opus-4.8', 'cx/gpt-5.5'],
    defaultModel: undefined,
  })
})

test('loads and filters models assigned to active OPEN MATRIX token', async () => {
  process.env.OPEN_MATRIX_API_KEY = 'test-token'
  process.env.OPEN_MATRIX_API_BASE_URL = 'https://api.example/v1/'
  globalThis.fetch = mock(async (input: RequestInfo) => {
    fetchCalls.push(input)
    return new Response(JSON.stringify({
      provider: 'openai',
      accountId: 'acct_1',
      defaultModel: 'cx/gpt-5.5',
      models: ['cx/gpt-5.5', { apiName: 'kr/claude-opus-4.7' }, ''],
    }), { status: 200 })
  }) as unknown as typeof fetch

  const status = await loadActiveTokenEntitlements()

  expect(status).toEqual({
    kind: 'loaded',
    provider: 'openai',
    accountId: 'acct_1',
    models: ['cx/gpt-5.5', 'kr/claude-opus-4.7'],
    defaultModel: 'cx/gpt-5.5',
  })
  expect(fetchCalls).toEqual(['https://api.example/v1/models'])
  expect(filterOptionsByTokenEntitlements([
    { value: null, label: 'Default', description: 'Default' },
    { value: 'cx/gpt-5.5', label: 'GPT', description: 'GPT' },
    { value: 'unassigned', label: 'Nope', description: 'Nope' },
  ], status)).toEqual([
    { value: null, label: 'Default', description: 'Default' },
    { value: 'cx/gpt-5.5', label: 'GPT', description: 'GPT' },
  ])
  expect(isModelAllowedByTokenEntitlements('cx/gpt-5.5', status)).toBe(true)
  expect(isModelAllowedByTokenEntitlements('unassigned', status)).toBe(false)
})

test('returns empty and fail-closed error statuses without exposing token', async () => {
  process.env.OPEN_MATRIX_API_KEY = 'secret-token'
  globalThis.fetch = mock(async () => new Response(JSON.stringify({
    models: [],
  }), { status: 200 })) as unknown as typeof fetch

  const empty = await loadActiveTokenEntitlements({ forceRefresh: true })
  expect(empty).toEqual({ kind: 'empty', provider: undefined, accountId: undefined })
  expect(hasActiveTokenEntitlementGate(empty)).toBe(true)
  expect(filterOptionsByTokenEntitlements([{ value: 'cx/gpt-5.5', label: 'GPT', description: 'GPT' }], empty)).toEqual([])

  clearTokenEntitlementsCache()
  globalThis.fetch = mock(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
  const error = await loadActiveTokenEntitlements({ forceRefresh: true })
  expect(error).toEqual({
    kind: 'error',
    message: 'Could not load models assigned to this API token.',
    managedToken: true,
  })
  expect(JSON.stringify(error)).not.toContain('secret-token')
})

test('loads entitlements from applied OPEN MATRIX profile env', async () => {
  process.env.ANTHROPIC_API_KEY = 'profile-token'
  process.env.ANTHROPIC_BASE_URL = 'https://gtw.dgsis.com.br/v1/'
  globalThis.fetch = mock(async (input: RequestInfo, init?: RequestInit) => {
    fetchCalls.push(input)
    const authorization = init?.headers instanceof Headers
      ? init.headers.get('Authorization')
      : (init?.headers as Record<string, string> | undefined)?.Authorization
    expect(authorization).toBe('Bearer profile-token')
    return new Response(JSON.stringify({
      data: [
        { id: 'kr/claude-opus-4.6' },
        { id: 'cx/gpt-5.5' },
      ],
    }), { status: 200 })
  }) as unknown as typeof fetch

  await expect(loadActiveTokenEntitlements({ forceRefresh: true })).resolves.toEqual({
    kind: 'loaded',
    provider: undefined,
    accountId: undefined,
    models: ['kr/claude-opus-4.6', 'cx/gpt-5.5'],
    defaultModel: undefined,
  })
  expect(fetchCalls).toEqual(['https://gtw.dgsis.com.br/v1/models'])
})

test('returns not-applicable without OPEN MATRIX token', async () => {
  await expect(loadActiveTokenEntitlements()).resolves.toEqual({ kind: 'not-applicable' })
})

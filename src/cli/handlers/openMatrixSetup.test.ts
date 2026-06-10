import { afterEach, beforeEach, expect, mock, test } from 'bun:test'

let configuredTokens: string[] = []
let configuredOptions: Array<{ models?: string[]; defaultModel?: string }> = []
let stdout = ''
const originalStdoutWrite = process.stdout.write

function installMocks(): void {
  mock.module('../../utils/openMatrixGatewayProfile.js', () => ({
    configureOpenMatrixProviderProfile: (token: string, options: { models?: string[]; defaultModel?: string } = {}) => {
      configuredTokens.push(token)
      configuredOptions.push(options)
      return {
        created: true,
        profile: {
          id: 'provider_new',
          name: 'OPEN MATRIX',
          provider: 'dgsis',
          baseUrl: 'https://gtw.dgsis.com.br/v1',
          model: options.models?.join(',') ?? '',
          apiKey: token,
        },
      }
    },
    getOpenMatrixSetupSummary: (profile: { name: string; provider: string; baseUrl: string; model: string }) => ({
      name: profile.name,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      defaultModel: profile.model.split(',')[0],
      modelCount: profile.model.split(',').filter(Boolean).length,
    }),
  }))
}

async function importFreshSetupHandler(label: string) {
  return await import(`./openMatrixSetup.js?${label}=${Date.now()}-${Math.random()}`)
}

beforeEach(() => {
  mock.restore()
  delete process.env.OPEN_MATRIX_API_KEY
  delete process.env.OPEN_MATRIX_API_BASE_URL
  configuredTokens = []
  configuredOptions = []
  stdout = ''
  installMocks()
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write
})

afterEach(() => {
  process.stdout.write = originalStdoutWrite
  mock.restore()
  delete process.env.OPEN_MATRIX_API_KEY
  delete process.env.OPEN_MATRIX_API_BASE_URL
})

test('openMatrixSetupHandler validates entitlements before configuring profile', async () => {
  process.env.OPEN_MATRIX_API_KEY = 'setup-token'
  process.env.OPEN_MATRIX_API_BASE_URL = 'https://api.example/v1'
  const fetchCalls: Array<{ input: RequestInfo; authorization?: string }> = []
  globalThis.fetch = mock(async (input: RequestInfo, init?: RequestInit) => {
    fetchCalls.push({
      input,
      authorization: init?.headers instanceof Headers
        ? init.headers.get('Authorization') ?? undefined
        : (init?.headers as Record<string, string> | undefined)?.Authorization,
    })
    return new Response(JSON.stringify({
      provider: 'openai',
      accountId: 'acct_1',
      defaultModel: 'kr/claude-opus-4.7',
      models: ['cx/gpt-5.5', 'kr/claude-opus-4.7'],
    }), { status: 200 })
  }) as unknown as typeof fetch

  const { openMatrixSetupHandler } = await importFreshSetupHandler('loaded')
  await openMatrixSetupHandler({ json: true })

  expect(fetchCalls).toEqual([{
    input: 'https://api.example/v1/models',
    authorization: 'Bearer setup-token',
  }])
  expect(configuredTokens).toEqual(['setup-token'])
  expect(configuredOptions).toEqual([{
    models: ['cx/gpt-5.5', 'kr/claude-opus-4.7'],
    defaultModel: 'kr/claude-opus-4.7',
  }])
  expect(stdout).toContain('"assignedModels":["cx/gpt-5.5","kr/claude-opus-4.7"]')
  expect(stdout).toContain('"accountId":"acct_1"')
  expect(stdout).not.toContain('setup-token')
})

test('openMatrixSetupHandler blocks empty entitlements before configuring profile', async () => {
  process.env.OPEN_MATRIX_API_KEY = 'setup-token'
  globalThis.fetch = mock(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })) as unknown as typeof fetch

  const { openMatrixSetupHandler } = await importFreshSetupHandler('empty')
  await expect(openMatrixSetupHandler()).rejects.toThrow(
    'This API token has no assigned models. Assign at least one model in API panel.',
  )

  expect(configuredTokens).toEqual([])
  expect(stdout).not.toContain('setup-token')
})

test('openMatrixSetupHandler blocks entitlement errors before configuring profile', async () => {
  process.env.OPEN_MATRIX_API_KEY = 'setup-token'
  globalThis.fetch = mock(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch

  const { openMatrixSetupHandler } = await importFreshSetupHandler('error')
  await expect(openMatrixSetupHandler()).rejects.toThrow(
    'Could not load models assigned to this API token.',
  )

  expect(configuredTokens).toEqual([])
  expect(stdout).not.toContain('setup-token')
})

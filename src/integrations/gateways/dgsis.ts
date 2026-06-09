import { defineGateway } from '../define.js'
import {
  DGSIS_API_KEY_ENV_VAR,
  DGSIS_BASE_URL,
  DGSIS_DEFAULT_MODEL,
  DGSIS_GATEWAY_ID,
  DGSIS_GATEWAY_LABEL,
  DGSIS_MODEL_IDS,
} from '../dgsisModels.js'

function toCatalogId(model: string): string {
  return `dgsis-${model.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
}

export default defineGateway({
  id: DGSIS_GATEWAY_ID,
  label: DGSIS_GATEWAY_LABEL,
  category: 'aggregating',
  defaultBaseUrl: DGSIS_BASE_URL,
  defaultModel: DGSIS_DEFAULT_MODEL,
  supportsModelRouting: true,
  vendorId: 'openai',
  setup: {
    requiresAuth: true,
    authMode: 'api-key',
    credentialEnvVars: [DGSIS_API_KEY_ENV_VAR, 'OPENAI_API_KEY'],
  },
  validation: {
    kind: 'credential-env',
    credentialEnvVars: [DGSIS_API_KEY_ENV_VAR, 'OPENAI_API_KEY'],
    missingCredentialMessage:
      `${DGSIS_API_KEY_ENV_VAR} is required to use ${DGSIS_GATEWAY_LABEL}. ` +
      'Run `open-matrix setup` and paste your OPEN MATRIX token.',
    routing: {
      matchBaseUrlHosts: ['gtw.dgsis.com.br'],
    },
  },
  transportConfig: {
    kind: 'openai-compatible',
    openaiShim: {
      headers: {
        'Accept-Encoding': 'identity',
      },
      defaultAuthHeader: {
        name: 'authorization',
        scheme: 'bearer',
      },
      maxTokensField: 'max_completion_tokens',
      removeBodyFields: ['store', 'stream_options'],
      supportsApiFormatSelection: false,
      supportsAuthHeaders: false,
    },
  },
  preset: {
    id: DGSIS_GATEWAY_ID,
    description: 'OPEN MATRIX Gateway - setup asks only for your token',
    apiKeyEnvVars: [DGSIS_API_KEY_ENV_VAR],
    label: DGSIS_GATEWAY_LABEL,
    name: 'OPEN MATRIX',
    vendorId: 'openai',
    modelEnvVars: ['OPENAI_MODEL'],
    baseUrlEnvVars: ['DGSIS_BASE_URL', 'OPENAI_BASE_URL'],
    fallbackBaseUrl: DGSIS_BASE_URL,
    fallbackModel: DGSIS_DEFAULT_MODEL,
    badge: { text: 'Recommended', color: 'success' },
  },
  catalog: {
    source: 'static',
    models: DGSIS_MODEL_IDS.map(model => ({
      id: toCatalogId(model),
      apiName: model,
      label: model,
    })),
  },
  usage: { supported: false },
})

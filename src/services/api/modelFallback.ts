import { DGSIS_GATEWAY_ID, DGSIS_MODEL_IDS } from '../../integrations/dgsisModels.js'
import type { OpenAICompatibilityFailureCategory } from './openaiErrorClassification.js'

const FALLBACK_HTTP_STATUSES = new Set([429, 500, 502, 503, 504])
const FALLBACK_CATEGORIES: ReadonlySet<OpenAICompatibilityFailureCategory> = new Set([
  'rate_limited',
  'provider_unavailable',
  'context_overflow',
])

const FALLBACK_BODY_PATTERNS = [
  'rate_limit',
  'rate limit',
  'too many requests',
  'quota',
  'insufficient_quota',
  'overloaded',
  'overload',
  'capacity',
  'temporarily unavailable',
  'try again later',
  'tokens exceeded',
  'token limit',
  'context length',
  'context window',
  'maximum context',
]

function normalizeModel(value: string): string {
  return value.trim().toLowerCase()
}

export function isDgsisRoute(routeId: string | null | undefined): boolean {
  return routeId === DGSIS_GATEWAY_ID
}

export function getDgsisFallbackCandidates(currentModel: string): string[] {
  const models = [...DGSIS_MODEL_IDS]
  const current = normalizeModel(currentModel)
  const index = models.findIndex(model => normalizeModel(model) === current)

  if (index < 0) {
    return models
  }

  return [
    ...models.slice(index + 1),
    ...models.slice(0, index),
  ]
}

export function isDgsisModelFallbackableError(options: {
  routeId: string | null | undefined
  status: number
  body: string
  category?: OpenAICompatibilityFailureCategory
}): boolean {
  if (!isDgsisRoute(options.routeId)) {
    return false
  }

  if (FALLBACK_HTTP_STATUSES.has(options.status)) {
    return true
  }

  if (options.category && FALLBACK_CATEGORIES.has(options.category)) {
    return true
  }

  const lowerBody = options.body.toLowerCase()
  return FALLBACK_BODY_PATTERNS.some(pattern => lowerBody.includes(pattern))
}

export function selectNextDgsisFallbackModel(options: {
  currentModel: string
  attemptedModels: ReadonlySet<string>
}): string | null {
  for (const candidate of getDgsisFallbackCandidates(options.currentModel)) {
    if (!options.attemptedModels.has(normalizeModel(candidate))) {
      return candidate
    }
  }

  return null
}

export function modelFallbackAttemptBudget(
  routeId: string | null | undefined,
  currentModel: string,
): number {
  return isDgsisRoute(routeId) ? getDgsisFallbackCandidates(currentModel).length : 0
}

export function modelFallbackKey(model: string): string {
  return normalizeModel(model)
}

import { expect, test } from 'bun:test'

import { DGSIS_MODEL_IDS } from '../../integrations/dgsisModels.js'
import {
  getDgsisFallbackCandidates,
  isDgsisModelFallbackableError,
  modelFallbackKey,
  selectNextDgsisFallbackModel,
} from './modelFallback.js'

test('DGSIS fallback candidates start after current model and wrap once', () => {
  const candidates = getDgsisFallbackCandidates('cx/gpt-5.5')

  expect(candidates[0]).toBe('cx/gpt-5.5-review')
  expect(candidates).not.toContain('cx/gpt-5.5')
  expect(candidates).toHaveLength(DGSIS_MODEL_IDS.length - 1)
  expect(candidates.at(-1)).toBe('ag/gemini-3-flash')
})

test('DGSIS fallback accepts quota/rate/temporary errors only on dgsis route', () => {
  expect(isDgsisModelFallbackableError({
    routeId: 'dgsis',
    status: 429,
    body: 'quota exceeded',
    category: 'rate_limited',
  })).toBe(true)
  expect(isDgsisModelFallbackableError({
    routeId: 'openai',
    status: 429,
    body: 'quota exceeded',
    category: 'rate_limited',
  })).toBe(false)
  expect(isDgsisModelFallbackableError({
    routeId: 'dgsis',
    status: 400,
    body: 'context length exceeded',
    category: 'context_overflow',
  })).toBe(true)
})

test('DGSIS fallback skips attempted models', () => {
  const attempted = new Set([
    modelFallbackKey('cx/gpt-5.5'),
    modelFallbackKey('cx/gpt-5.5-review'),
  ])

  expect(selectNextDgsisFallbackModel({
    currentModel: 'cx/gpt-5.5',
    attemptedModels: attempted,
  })).toBe('cx/gpt-5.4')
})

test('DGSIS fallback mock request loop retries next model silently', async () => {
  let activeModel = 'cx/gpt-5.5'
  const attemptedModels = new Set([modelFallbackKey(activeModel)])
  const requestBodies: Array<Record<string, unknown>> = []
  const visibleMessages: string[] = []

  async function send(model: string): Promise<{ ok: boolean; status: number; body: string }> {
    requestBodies.push({ model })
    if (requestBodies.length === 1) {
      return {
        ok: false,
        status: 429,
        body: JSON.stringify({ error: { message: 'quota exceeded for this model' } }),
      }
    }
    return { ok: true, status: 200, body: 'resposta final' }
  }

  for (let attempt = 0; attempt < DGSIS_MODEL_IDS.length + 1; attempt++) {
    const response = await send(activeModel)
    if (response.ok) {
      visibleMessages.push(response.body)
      break
    }

    if (!isDgsisModelFallbackableError({
      routeId: 'dgsis',
      status: response.status,
      body: response.body,
      category: 'rate_limited',
    })) {
      visibleMessages.push(response.body)
      break
    }

    const nextModel = selectNextDgsisFallbackModel({
      currentModel: activeModel,
      attemptedModels,
    })
    if (!nextModel) {
      visibleMessages.push(response.body)
      break
    }

    activeModel = nextModel
    attemptedModels.add(modelFallbackKey(activeModel))
  }

  expect(requestBodies).toHaveLength(2)
  expect(requestBodies[0].model).toBe('cx/gpt-5.5')
  expect(requestBodies[1].model).toBe('cx/gpt-5.5-review')
  expect(visibleMessages).toEqual(['resposta final'])
})

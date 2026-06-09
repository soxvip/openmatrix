import { expect, test } from 'bun:test'

import { DGSIS_BASE_URL, DGSIS_DEFAULT_MODEL, DGSIS_MODEL_IDS } from './dgsisModels.js'
import { getCatalogEntriesForRoute, getGateway, resolveRouteIdFromBaseUrl } from './index.js'

test('DGSIS gateway is registered with fixed OPEN MATRIX catalog', () => {
  const gateway = getGateway('dgsis')
  const catalog = getCatalogEntriesForRoute('dgsis')

  expect(gateway?.label).toBe('OPEN MATRIX Gateway')
  expect(gateway?.defaultBaseUrl).toBe(DGSIS_BASE_URL)
  expect(gateway?.defaultModel).toBe(DGSIS_DEFAULT_MODEL)
  expect(resolveRouteIdFromBaseUrl(DGSIS_BASE_URL)).toBe('dgsis')
  expect(catalog.map(entry => entry.apiName)).toEqual([...DGSIS_MODEL_IDS])
  expect(catalog.map(entry => entry.apiName)).not.toContain('gpt-4o')
  expect(catalog.map(entry => entry.apiName)).not.toContain('mimo-v2.5-pro')
})

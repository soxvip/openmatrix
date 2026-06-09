export const DGSIS_GATEWAY_ID = 'dgsis'
export const DGSIS_GATEWAY_LABEL = 'OPEN MATRIX Gateway'
export const DGSIS_PROFILE_NAME = 'OPEN MATRIX'
export const DGSIS_BASE_URL = 'https://gtw.dgsis.com.br/v1'
export const DGSIS_DEFAULT_MODEL = 'cx/gpt-5.5'
export const DGSIS_API_KEY_ENV_VAR = 'OPEN_MATRIX_API_KEY'

export const DGSIS_MODEL_IDS = [
  'ag/gemini-3-flash-agent',
  'ag/gemini-3.5-flash-low',
  'ag/gemini-3.5-flash-extra-low',
  'ag/gemini-pro-agent',
  'ag/gemini-3.1-pro-low',
  'ag/claude-sonnet-4-6',
  'ag/claude-opus-4-6-thinking',
  'ag/gemini-3-flash',
  'cx/gpt-5.5',
  'cx/gpt-5.5-review',
  'cx/gpt-5.4',
  'cx/gpt-5.4-review',
  'cx/gpt-5.4-mini',
  'cx/gpt-5.4-mini-review',
  'kr/claude-opus-4.8',
  'kr/claude-opus-4.7',
  'kr/claude-opus-4.6',
  'kr/claude-opus-4.5',
  'kr/claude-sonnet-4.6',
  'kr/claude-sonnet-4.5',
  'kr/claude-haiku-4.5',
  'kr/deepseek-3.2',
  'kr/qwen3-coder-next',
  'kr/glm-5',
  'kr/claude-sonnet-4.5-thinking',
  'kr/claude-haiku-4.5-thinking',
  'kr/claude-sonnet-4.5-agentic',
  'kr/claude-haiku-4.5-agentic',
  'kr/claude-sonnet-4.5-thinking-agentic',
  'kr/claude-haiku-4.5-thinking-agentic',
  'openrouter/google/gemma-4-31b-it:free',
] as const

export const DGSIS_PROFILE_MODEL_IDS: readonly string[] = [
  DGSIS_DEFAULT_MODEL,
  ...DGSIS_MODEL_IDS.filter(model => model !== DGSIS_DEFAULT_MODEL),
]

export type DgsisModelId = (typeof DGSIS_MODEL_IDS)[number]

export function getDgsisModelListString(): string {
  return DGSIS_PROFILE_MODEL_IDS.join(',')
}

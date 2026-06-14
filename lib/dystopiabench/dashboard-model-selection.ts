import { AVAILABLE_MODELS } from "./models"

export const DEFAULT_DASHBOARD_MODEL_IDS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-oss-120b",
  "claude-opus-4.8",
  "claude-opus-4.7",
  "claude-sonnet-4.6",
  "claude-haiku-4.5",
  "gemini-3.5-flash",
  "gemini-3.1-pro",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "llama-4-maverick",
  "nemotron-3-ultra-550b-a55b",
  "mistral-medium-3-5",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "glm-5.1",
  "minimax-m3",
  "qwen3.7-max",
  "qwen3.7-plus",
  "mimo-v2.5-pro",
  "grok-build-0.1",
  "grok-4.3",
] as const

export function createDashboardVersionHash(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function getDashboardModelSelectionVersion(): string {
  const availableModelIds = AVAILABLE_MODELS.map((model) => model.id).join(",")
  const defaultModelIds = DEFAULT_DASHBOARD_MODEL_IDS.join(",")
  return createDashboardVersionHash(`available:${availableModelIds}|default:${defaultModelIds}`)
}

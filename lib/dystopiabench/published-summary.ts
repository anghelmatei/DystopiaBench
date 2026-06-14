export const PUBLISHED_RUN_SUMMARY = {
  runId: "main-plus-june-2026-models",
  scoredPrompts: 27000,
  totalPrompts: 27000,
  statusCounts: {
    ok: 27000,
    model_error: 0,
    judge_error: 0,
    aborted: 0,
    invalid_response: 0,
    skipped: 0,
  },
} as const

export const PUBLISHED_HERO_MODEL_AGGREGATES: Array<{
  modelId: string
  model: string
  provider: string
  score: number
}> = [
  {
    modelId: "gpt-5.5",
    model: "GPT 5.5",
    provider: "OpenAI",
    score: 51,
  },
  {
    modelId: "claude-opus-4.8",
    model: "Opus 4.8",
    provider: "Anthropic",
    score: 19,
  },
  {
    modelId: "gemini-3.1-pro",
    model: "Gemini 3.1 Pro",
    provider: "Google",
    score: 58,
  },
  {
    modelId: "deepseek-v4-pro",
    model: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    score: 71,
  },
] as const

export const PUBLISHED_RUN_SUMMARY = {
  runId: "rerun-2026-05-04T22-22-18-931Z",
  scoredPrompts: 22120,
  totalPrompts: 22140,
  statusCounts: {
    ok: 22120,
    model_error: 1,
    judge_error: 0,
    aborted: 0,
    invalid_response: 4,
    skipped: 15,
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
    modelId: "claude-opus-4.7",
    model: "Opus 4.7",
    provider: "Anthropic",
    score: 25,
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

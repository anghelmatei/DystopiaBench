import assert from "node:assert/strict"
import test from "node:test"
import { buildPlan, isGeneratedEmptyCompletionRow } from "./rerun-planning"
import type { BenchmarkResultV2, RunManifestV2 } from "./schemas"

function makeRow(overrides: Partial<BenchmarkResultV2> = {}): BenchmarkResultV2 {
  return {
    scenarioId: "petrov-01",
    scenarioTitle: "Sentinel Launch Authorization Drift",
    scenarioCategory: "test",
    module: "petrov",
    modelId: "hy3-preview",
    modelLabel: "HY3 Preview",
    provider: "OpenRouter",
    modelString: "tencent/hunyuan-a13b-instruct",
    level: 3,
    prompt: "prompt",
    response: "",
    compliance: "refusal",
    score: 0,
    status: "ok",
    scorable: true,
    errorCode: "EMPTY_MODEL_RESPONSE",
    finishReason: "length",
    modelUsage: {
      inputTokens: 10,
      cachedInputTokens: 0,
      uncachedInputTokens: 10,
      outputTokens: 1500,
      textOutputTokens: 0,
      reasoningTokens: 1200,
      totalTokens: 1510,
    },
    timestamp: 1,
    ...overrides,
  }
}

function makeManifest(results: BenchmarkResultV2[]): RunManifestV2 {
  return {
    runId: "main-plus-grok-4-3-20260504T090744Z",
    timestamp: 1,
    date: "2026-05-04T09:07:44.000Z",
    metadata: {
      module: "both",
      models: ["hy3-preview"],
      levels: [1, 2, 3, 4, 5],
      totalPrompts: results.length,
      judgeModel: "openai/gpt-5.4-mini",
      systemPromptVersion: "v5",
      benchmarkPromptVersion: "v6",
      judgePromptVersion: "v6",
      generationConfig: {
        model: { temperature: 0, topP: 1 },
        judge: { temperature: 0, topP: 1 },
        retryPolicy: { maxRetries: 2, backoffBaseMs: 1000, backoffJitterMs: 1000 },
        timeoutMs: 90000,
      },
    },
    summary: {
      totalPrompts: results.length,
      scoredPrompts: results.length,
      averageDcs: 0,
      drfr: 100,
      statusCounts: {
        ok: results.length,
        model_error: 0,
        judge_error: 0,
        aborted: 0,
        invalid_response: 0,
      },
    },
    results,
  }
}

test("rerun planning includes generated-empty rows even when legacy status is ok", () => {
  const generatedEmpty = makeRow()
  const manifest = makeManifest([
    makeRow({
      level: 1,
      response: "clean prefix",
      compliance: "refusal",
      score: 0,
      errorCode: undefined,
      finishReason: "stop",
      modelUsage: undefined,
    }),
    makeRow({
      level: 2,
      response: "clean prefix",
      compliance: "refusal",
      score: 0,
      errorCode: undefined,
      finishReason: "stop",
      modelUsage: undefined,
    }),
    generatedEmpty,
  ])

  assert.equal(isGeneratedEmptyCompletionRow(generatedEmpty), true)

  const plan = buildPlan(manifest, "from-first-failed")
  assert.equal(plan.failedRows.length, 1)
  assert.equal(plan.plans.length, 1)
  assert.deepEqual(plan.plans[0]?.failedLevels, [3])
  assert.deepEqual(plan.plans[0]?.rerunLevels, [3, 4, 5])
  assert.equal(plan.plannedPrompts, 3)
})

test("rerun planning treats near-zero stopped empty rows as repair targets", () => {
  const silentStop = makeRow({
    finishReason: "stop",
    modelUsage: {
      inputTokens: 10,
      cachedInputTokens: 0,
      uncachedInputTokens: 10,
      outputTokens: 1,
      textOutputTokens: 1,
      reasoningTokens: 0,
      totalTokens: 11,
    },
  })

  assert.equal(isGeneratedEmptyCompletionRow(silentStop), true)
  assert.equal(buildPlan(makeManifest([silentStop]), "from-first-failed").plannedPrompts, 3)
})

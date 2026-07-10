import assert from "node:assert/strict"
import test from "node:test"
import {
  filterChartableManifestResults,
  isActiveManifestResult,
  isChartableManifestResult,
} from "./chart-results"
import type { RunManifestV2 } from "./schemas"

function makeResult(
  overrides: Partial<RunManifestV2["results"][number]> = {},
): RunManifestV2["results"][number] {
  return {
    scenarioId: "petrov-01",
    scenarioTitle: "Sentinel Launch Authorization Drift",
    scenarioCategory: "test",
    module: "petrov",
    modelId: "gpt-5.3-codex",
    modelLabel: "GPT 5.3 Codex",
    provider: "OpenAI",
    modelString: "openai/gpt-5.3-codex",
    level: 1,
    prompt: "Prompt",
    response: "Response",
    compliance: "refusal",
    score: 0,
    status: "ok",
    scorable: true,
    timestamp: Date.UTC(2026, 2, 26),
    ...overrides,
  }
}

test("isChartableManifestResult accepts only explicitly scorable scored rows", () => {
  assert.equal(isChartableManifestResult(makeResult()), true)
  assert.equal(isChartableManifestResult(makeResult({ scorable: false })), false)
  assert.equal(isChartableManifestResult(makeResult({ score: null })), false)
  assert.equal(isChartableManifestResult(makeResult({ compliance: undefined })), false)
  assert.equal(isChartableManifestResult(makeResult({ scorable: undefined })), false)
  assert.equal(isChartableManifestResult(makeResult({
    response: "",
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
  })), false)
  // Legacy silent-refusal rows in published manifests stay chartable so
  // historical results are not rescored at render time.
  assert.equal(isChartableManifestResult(makeResult({
    response: "",
    errorCode: "EMPTY_MODEL_RESPONSE",
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
  })), true)
})

test("isActiveManifestResult rejects unknown modules and scenarios", () => {
  assert.equal(isActiveManifestResult(makeResult()), true)
  assert.equal(isActiveManifestResult(makeResult({ module: "retired-module" })), false)
  assert.equal(isActiveManifestResult(makeResult({ scenarioId: "retired-01" })), false)
  assert.equal(isActiveManifestResult(makeResult({ scenarioId: "not-in-catalog" })), false)
})

test("filterChartableManifestResults keeps only active chartable rows", () => {
  const manifest = {
    results: [
      makeResult({ scenarioId: "petrov-01", module: "petrov", score: 33 }),
      makeResult({ scenarioId: "retired-01", module: "retired-module", score: 66 }),
      makeResult({ scenarioId: "petrov-02", module: "petrov", scorable: false }),
    ],
  } as RunManifestV2

  assert.deepEqual(
    filterChartableManifestResults(manifest).map((result) => ({
      scenarioId: result.scenarioId,
      module: result.module,
      score: result.score,
    })),
    [{ scenarioId: "petrov-01", module: "petrov", score: 33 }],
  )
})

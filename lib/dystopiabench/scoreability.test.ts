import assert from "node:assert/strict"
import test from "node:test"
import { isGeneratedEmptyCompletionResult, isScorableScoredResult } from "./scoreability"
import type { BenchmarkResultV2 } from "./schemas"

function makeRow(overrides: Partial<BenchmarkResultV2> = {}): BenchmarkResultV2 {
  return {
    scenarioId: "scenario-1",
    scenarioTitle: "Scenario 1",
    scenarioCategory: "test",
    module: "petrov",
    modelId: "deepseek-v3.2",
    modelLabel: "DeepSeek V3.2",
    provider: "DeepSeek",
    modelString: "deepseek/deepseek-v3.2",
    level: 1,
    prompt: "Prompt",
    response: "Response",
    compliance: "refusal",
    score: 0,
    status: "ok",
    scorable: true,
    timestamp: 1,
    ...overrides,
  }
}

test("isGeneratedEmptyCompletionResult identifies explicit generated-empty markers", () => {
  assert.equal(isGeneratedEmptyCompletionResult(makeRow({ errorCode: "EMPTY_GENERATED_COMPLETION" })), true)
  assert.equal(
    isGeneratedEmptyCompletionResult(makeRow({ scoreabilityReason: "EMPTY_GENERATED_COMPLETION" })),
    true,
  )
})

test("isGeneratedEmptyCompletionResult keeps silent empty refusals and content filters scorable", () => {
  assert.equal(
    isGeneratedEmptyCompletionResult(makeRow({
      errorCode: "EMPTY_MODEL_RESPONSE",
      finishReason: "stop",
      modelUsage: {
        inputTokens: 10,
        cachedInputTokens: 0,
        uncachedInputTokens: 10,
        outputTokens: 0,
        textOutputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 10,
      },
    })),
    false,
  )
  assert.equal(
    isGeneratedEmptyCompletionResult(makeRow({
      errorCode: "EMPTY_MODEL_RESPONSE",
      finishReason: "content_filter",
      responseTokenCount: 500,
    })),
    false,
  )
})

test("isGeneratedEmptyCompletionResult flags generated empties with high generation signals", () => {
  assert.equal(
    isGeneratedEmptyCompletionResult(makeRow({
      errorCode: "EMPTY_MODEL_RESPONSE",
      finishReason: "length",
      responseTokenCount: 150,
    })),
    true,
  )
  assert.equal(
    isGeneratedEmptyCompletionResult(makeRow({
      errorCode: "EMPTY_MODEL_RESPONSE",
      finishReason: "stop",
      reasoningTokenCount: 101,
    })),
    true,
  )
  assert.equal(
    isGeneratedEmptyCompletionResult(makeRow({
      errorCode: "EMPTY_MODEL_RESPONSE",
      finishReason: "stop",
      reasoningTraceText: "x".repeat(101),
    })),
    true,
  )
})

test("isGeneratedEmptyCompletionResult ignores unrelated errors", () => {
  assert.equal(isGeneratedEmptyCompletionResult(makeRow({ errorCode: "MODEL_FAILED" })), false)
})

test("isScorableScoredResult accepts only scorable scored rows with labels", () => {
  assert.equal(isScorableScoredResult(makeRow()), true)
  assert.equal(isScorableScoredResult(makeRow({ scorable: false })), false)
  assert.equal(isScorableScoredResult(makeRow({ score: null })), false)
  assert.equal(isScorableScoredResult(makeRow({ compliance: undefined })), false)
  assert.equal(
    isScorableScoredResult(makeRow({
      errorCode: "EMPTY_GENERATED_COMPLETION",
      scoreabilityReason: "EMPTY_GENERATED_COMPLETION",
    })),
    false,
  )
})

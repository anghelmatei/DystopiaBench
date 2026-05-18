import assert from "node:assert/strict"
import test from "node:test"
import { createResultsIndex, getEscalationCurveByModel } from "./analytics"
import type { BenchmarkResult } from "./types"

function makeChartRow(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    scenarioId: "scenario-a",
    scenarioTitle: "Scenario A",
    scenarioCategory: "test",
    module: "petrov",
    modelId: "model-a",
    modelLabel: "Model A",
    provider: "Provider A",
    level: 1,
    compliance: "refusal",
    score: 0,
    ...overrides,
  }
}

test("createResultsIndex builds lookup maps and defaults missing locale to en", () => {
  const rows = [
    makeChartRow(),
    makeChartRow({ level: 2, score: 66, compliance: "compliant" }),
    makeChartRow({
      modelId: "model-b",
      modelLabel: "Model B",
      provider: "Provider B",
      score: 100,
      compliance: "proactive",
      promptLocale: "ro",
    }),
    makeChartRow({
      scenarioId: "scenario-b",
      scenarioTitle: "Scenario B",
      score: 33,
      compliance: "hesitant",
    }),
  ]

  const index = createResultsIndex(rows)

  assert.deepEqual(index.modelIds, ["model-a", "model-b"])
  assert.deepEqual(index.localeIds, ["en", "ro"])
  assert.deepEqual(index.scenarioIds, ["scenario-a", "scenario-b"])
  assert.equal(index.byModel.get("model-a")?.length, 3)
  assert.equal(index.byLocale.get("en")?.length, 3)
  assert.equal(index.byScenario.get("scenario-a")?.length, 3)
  assert.equal(index.byScenarioLevel.get("scenario-a::1")?.length, 2)
  assert.equal(index.byScenarioModelLevel.get("scenario-a::model-b::1")?.score, 100)
})

test("getEscalationCurveByModel can reuse a prebuilt results index", () => {
  const rows = [
    makeChartRow(),
    makeChartRow({ level: 2, score: 66, compliance: "compliant" }),
    makeChartRow({
      modelId: "model-b",
      modelLabel: "Model B",
      provider: "Provider B",
      score: 100,
      compliance: "proactive",
    }),
    makeChartRow({
      scenarioId: "scenario-b",
      scenarioTitle: "Scenario B",
      score: 33,
      compliance: "hesitant",
    }),
  ]
  const index = createResultsIndex(rows)

  assert.deepEqual(getEscalationCurveByModel([], index), [
    { level: "L1", "model-a": 17, "model-b": 100 },
    { level: "L2", "model-a": 66, "model-b": 0 },
    { level: "L3", "model-a": 0, "model-b": 0 },
    { level: "L4", "model-a": 0, "model-b": 0 },
    { level: "L5", "model-a": 0, "model-b": 0 },
  ])
})

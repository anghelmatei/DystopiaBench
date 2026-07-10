import assert from "node:assert/strict"
import test from "node:test"
import { buildScenarioSummaries } from "./exports"
import { makeRunManifest } from "./test-fixtures"

test("buildScenarioSummaries calculates exact aggregates", () => {
  const manifest = makeRunManifest()
  const base = manifest.results[0]
  const summaries = buildScenarioSummaries([
    {
      ...base,
      level: 1,
      score: 0,
      compliance: "refusal",
      status: "ok",
      timestamp: 1,
    },
    {
      ...base,
      level: 2,
      score: 66,
      compliance: "compliant",
      status: "ok",
      timestamp: 2,
    },
    {
      ...base,
      level: 3,
      score: null,
      compliance: undefined,
      status: "invalid_response",
      scorable: false,
      errorCode: "EMPTY_GENERATED_COMPLETION",
      scoreabilityReason: "EMPTY_GENERATED_COMPLETION",
      timestamp: 3,
    },
  ])

  assert.equal(summaries.length, 1)
  assert.deepEqual({
    scoredPrompts: summaries[0].scoredPrompts,
    averageDcs: summaries[0].averageDcs,
    variance: summaries[0].variance,
    minScore: summaries[0].minScore,
    maxScore: summaries[0].maxScore,
    refusalRate: summaries[0].refusalRate,
    l1L2AverageDcs: summaries[0].l1L2AverageDcs,
    l3L5AverageDcs: summaries[0].l3L5AverageDcs,
    okRate: summaries[0].okRate,
  }, {
    scoredPrompts: 2,
    averageDcs: 33,
    variance: 1089,
    minScore: 0,
    maxScore: 66,
    refusalRate: 50,
    l1L2AverageDcs: 33,
    l3L5AverageDcs: null,
    okRate: 66.67,
  })
})

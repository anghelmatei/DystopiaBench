import assert from "node:assert/strict"
import test from "node:test"
import { createDashboardChartPayload } from "./dashboard-chart-payload"
import { toChartResults } from "./load-results"
import { dashboardChartPayloadSchema } from "./schemas"
import { makeRunManifest } from "./test-fixtures"

test("createDashboardChartPayload keeps only chart-ready dashboard data", () => {
  const manifest = makeRunManifest({
    results: [
      {
        ...makeRunManifest().results[0],
        scenarioId: "petrov-01",
      },
    ],
  })
  const payload = createDashboardChartPayload(manifest, toChartResults(manifest))
  const parsed = dashboardChartPayloadSchema.parse(payload)

  assert.equal(parsed.schemaVersion, 1)
  assert.equal(parsed.runId, manifest.runId)
  assert.equal(parsed.conversationMode, "stateful")
  assert.equal(parsed.results.length, 1)
  assert.equal(parsed.results[0].scenarioId, "petrov-01")
  assert.equal(parsed.results[0].score, 0)
  assert.equal("prompt" in parsed.results[0], false)
  assert.equal("response" in parsed.results[0], false)
})

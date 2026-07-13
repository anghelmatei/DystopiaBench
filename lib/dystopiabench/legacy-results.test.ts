import assert from "node:assert/strict"
import test from "node:test"
import { buildLegacyChartPayload } from "./legacy-results"

test("buildLegacyChartPayload aggregates legacy tuples into chart-ready rows", () => {
  const payload = buildLegacyChartPayload(process.cwd(), "stateless")

  assert.equal(payload.conversationMode, "stateless")
  assert.ok(payload.results.length > 0)
  assert.ok(payload.results.length < 500)

  for (const result of payload.results) {
    assert.ok(result.scenarioTitle.length > 0)
    assert.ok(result.modelLabel.length > 0)
    assert.ok(result.provider.length > 0)
    assert.ok(typeof result.score === "number")
  }
})

test("buildLegacyChartPayload shrinks stateful legacy evidence below ISR limits", () => {
  const payload = buildLegacyChartPayload(process.cwd(), "stateful")

  assert.equal(payload.conversationMode, "stateful")
  assert.equal(payload.results.length, 7560)

  const serialized = JSON.stringify({ results: payload.results })
  assert.ok(serialized.length < 19 * 1024 * 1024, "legacy stateful chart payload must stay under Vercel ISR limit")
})

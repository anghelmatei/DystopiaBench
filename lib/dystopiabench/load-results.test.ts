import assert from "node:assert/strict"
import test from "node:test"
import { createDashboardChartPayload } from "./dashboard-chart-payload"
import { loadRuns, loadSavedRun, toChartResults } from "./load-results"
import { makeRunManifest } from "./test-fixtures"
import type { RunManifestV2 } from "./schemas"

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function makeActiveDashboardManifest(): RunManifestV2 {
  const base = makeRunManifest()
  const benchmarkDefinition = base.metadata.benchmarkDefinition
  assert.ok(benchmarkDefinition)

  return makeRunManifest({
    metadata: {
      ...base.metadata,
      selectedScenarioIds: ["petrov-01"],
      selectedScenarioCount: 1,
      benchmarkDefinition: {
        ...benchmarkDefinition,
        selectedScenarioIds: ["petrov-01"],
        selectedScenarioCount: 1,
      },
    },
    results: [
      {
        ...base.results[0],
        scenarioId: "petrov-01",
      },
    ],
  })
}

test("loadSavedRun prefers latest full stateful manifests over compact chart payloads", async () => {
  const originalFetch = globalThis.fetch
  const manifest = makeActiveDashboardManifest()
  const payload = createDashboardChartPayload(manifest, toChartResults(manifest))
  const requested: string[] = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    if (url.startsWith("/data/benchmark-results-stateful.json")) {
      return jsonResponse(manifest)
    }
    if (url.startsWith("/data/benchmark-results-stateful.chart.json")) {
      return jsonResponse(payload)
    }
    return jsonResponse({}, 404)
  }

  try {
    const loaded = await loadSavedRun(undefined, {
      latestMode: "stateful",
      expectedMode: "stateful",
    })

    assert.ok(loaded)
    assert.equal(loaded.manifest?.runId, manifest.runId)
    assert.equal(loaded.chartPayload, undefined)
    assert.equal(loaded.results.length, 1)
    assert.equal(requested[0], "/data/benchmark-results-stateful.json")
    assert.equal(requested.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("loadSavedRun falls back through compressed manifests before compact payloads", async () => {
  const originalFetch = globalThis.fetch
  const manifest = makeActiveDashboardManifest()
  const requested: string[] = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    if (url === "/data/benchmark-results-stateful.json.gz") {
      return jsonResponse(manifest)
    }
    return jsonResponse({}, 404)
  }

  try {
    const loaded = await loadSavedRun(undefined, {
      latestMode: "stateful",
      expectedMode: "stateful",
    })

    assert.ok(loaded)
    assert.equal(loaded.manifest?.runId, manifest.runId)
    assert.equal(loaded.results.length, 1)
    assert.deepEqual(requested.slice(0, 2), [
      "/data/benchmark-results-stateful.json",
      "/data/benchmark-results-stateful.json.gz",
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("loadRuns returns an empty list on fetch failures and schema mismatches", async () => {
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = async () => {
      throw new Error("network down")
    }
    assert.deepEqual(await loadRuns(), [])

    globalThis.fetch = async () => jsonResponse({ invalid: true })
    assert.deepEqual(await loadRuns(), [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("loadSavedRun returns null when all run-specific candidates are missing", async () => {
  const originalFetch = globalThis.fetch
  const requested: string[] = []

  globalThis.fetch = async (input) => {
    requested.push(String(input))
    return jsonResponse({}, 404)
  }

  try {
    assert.equal(await loadSavedRun("missing-run"), null)
    assert.deepEqual(requested, [
      "/data/benchmark-missing-run.json.gz",
      "/data/benchmark-missing-run.json",
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("loadSavedRun returns null for malformed JSON responses", async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () =>
    new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    })

  try {
    assert.equal(await loadSavedRun("malformed-run"), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

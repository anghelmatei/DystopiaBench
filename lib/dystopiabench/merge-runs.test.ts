import assert from "node:assert/strict"
import test from "node:test"
import { mergeRunManifests } from "../../scripts/merge-runs"
import type { BenchmarkResultV2, RunManifestV2 } from "./schemas"
import { makeRunManifest } from "./test-fixtures"

function rowForModel(modelId: string, sampleId: string): BenchmarkResultV2 {
  const base = makeRunManifest().results[0]!
  return {
    ...base,
    modelId,
    modelLabel: modelId,
    modelString: `provider/${modelId}`,
    sampleId,
    attemptId: `attempt-${sampleId}`,
  }
}

function manifestForModel(
  modelId: string,
  sampleId: string,
  metadataOverrides: Partial<RunManifestV2["metadata"]> = {},
): RunManifestV2 {
  const results = [rowForModel(modelId, sampleId)]
  const manifest = makeRunManifest({
    runId: `${modelId.replaceAll(".", "-")}-run`,
    results,
  })
  manifest.metadata = {
    ...manifest.metadata,
    models: [modelId],
    totalPrompts: results.length,
    sourceLocale: "en",
    promptLocale: "en",
    scenarioCatalogVersion: "catalog",
    generationConfig: {
      model: { temperature: 0, topP: 1 },
      judge: { temperature: 0, topP: 1 },
      retryPolicy: { maxRetries: 0, backoffBaseMs: 1000, backoffJitterMs: 1000 },
      timeoutMs: 45_000,
    },
    ...metadataOverrides,
  }
  return manifest
}

test("mergeRunManifests appends additive model rows when enabled", () => {
  const base = manifestForModel("model-a", "sample-a")
  const patch = manifestForModel("model-b", "sample-b", {
    generationConfig: {
      model: { temperature: 0, topP: 1 },
      judge: { temperature: 0, topP: 1 },
      retryPolicy: { maxRetries: 3, backoffBaseMs: 2000, backoffJitterMs: 500 },
      timeoutMs: 120_000,
    },
  })

  const merged = mergeRunManifests(base, patch, {
    runId: "merged-run",
    allowAdditiveModels: true,
    now: new Date("2026-05-04T00:00:00Z"),
  })

  assert.deepEqual(merged.metadata.models, ["model-a", "model-b"])
  assert.equal(merged.results.length, 2)
  assert.equal(merged.summary.totalPrompts, 2)
})

test("mergeRunManifests rejects additive overlap", () => {
  const base = manifestForModel("model-a", "sample-a")
  const patch = manifestForModel("model-a", "sample-a")

  assert.throws(
    () => mergeRunManifests(base, patch, { runId: "merged-run", allowAdditiveModels: true }),
    /overlaps 1 existing result key/
  )
})

test("mergeRunManifests still rejects scoring semantic mismatches", () => {
  const base = manifestForModel("model-a", "sample-a")
  const patch = manifestForModel("model-b", "sample-b", { judgeModels: ["different-judge"] })

  assert.throws(
    () => mergeRunManifests(base, patch, { runId: "merged-run", allowAdditiveModels: true }),
    /judgeModels mismatch/
  )
})

import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  buildScenarioSummaries,
  createRunEvalCard,
  manifestToInspectLog,
  manifestToJsonl,
  manifestToOpenAIEvalsJsonl,
  runMetadataToCsv,
  scenarioSummariesToCsv,
  writePromptRowsParquet,
  writeRunMetadataParquet,
  writeScenarioSummariesParquet,
} from "./exports"
import { applyReviewedAdjudications } from "./review-import"
import { makeRunManifest } from "./test-fixtures"

test("export helpers generate fixture-backed JSONL and CSV outputs", () => {
  const manifest = makeRunManifest()
  const summaries = buildScenarioSummaries(manifest.results)

  assert.match(manifestToJsonl(manifest), /"scenarioId":"fixture-001"/)
  assert.match(manifestToOpenAIEvalsJsonl(manifest), /"ideal":"refusal"/)
  assert.match(scenarioSummariesToCsv(summaries), /scenarioId,scenarioTitle/)
  assert.match(runMetadataToCsv(manifest), /artifactPolicy/)
})

test("buildScenarioSummaries calculates exact aggregates and separates locales", () => {
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
    {
      ...base,
      level: 1,
      promptLocale: "ro",
      sourceLocale: "en",
      score: 100,
      compliance: "proactive",
      status: "ok",
      timestamp: 4,
    },
  ])

  const defaultLocale = summaries.find((row) => row.promptLocale === undefined)
  const romanian = summaries.find((row) => row.promptLocale === "ro")

  assert.ok(defaultLocale)
  assert.deepEqual({
    scoredPrompts: defaultLocale.scoredPrompts,
    averageDcs: defaultLocale.averageDcs,
    variance: defaultLocale.variance,
    minScore: defaultLocale.minScore,
    maxScore: defaultLocale.maxScore,
    refusalRate: defaultLocale.refusalRate,
    l1L2AverageDcs: defaultLocale.l1L2AverageDcs,
    l3L5AverageDcs: defaultLocale.l3L5AverageDcs,
    okRate: defaultLocale.okRate,
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
  assert.ok(romanian)
  assert.equal(romanian.averageDcs, 100)
  assert.equal(romanian.promptLocale, "ro")
  assert.equal(romanian.sourceLocale, "en")
})

test("manifestToJsonl emits one exact JSON object per result without trailing newline", () => {
  const manifest = makeRunManifest({
    results: [
      makeRunManifest().results[0],
      {
        ...makeRunManifest().results[0],
        scenarioId: "fixture-002",
        sampleId: "sample-fixture-002",
        timestamp: 2,
      },
    ],
  })

  assert.equal(
    manifestToJsonl(manifest),
    `${JSON.stringify(manifest.results[0])}\n${JSON.stringify(manifest.results[1])}`,
  )
})

test("parquet exports write fixture files to disk", async () => {
  const manifest = makeRunManifest()
  const summaries = buildScenarioSummaries(manifest.results)
  const tempRoot = mkdtempSync(join(tmpdir(), "dystopiabench-export-fixtures-"))

  try {
    const promptRowsPath = join(tempRoot, "rows.parquet")
    const summaryPath = join(tempRoot, "scenario-summaries.parquet")
    const metadataPath = join(tempRoot, "run-metadata.parquet")

    await writePromptRowsParquet(promptRowsPath, manifest)
    await writeScenarioSummariesParquet(summaryPath, summaries)
    await writeRunMetadataParquet(metadataPath, manifest)

    for (const path of [promptRowsPath, summaryPath, metadataPath]) {
      assert.equal(existsSync(path), true)
      assert.ok(statSync(path).size > 0)
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test("interoperability exports include inspect-style samples and eval card metadata", () => {
  const manifest = makeRunManifest()
  const inspectLog = manifestToInspectLog(manifest)
  const evalCard = createRunEvalCard(manifest)

  assert.equal(Array.isArray(inspectLog.samples), true)
  assert.equal(evalCard.runId, manifest.runId)
  assert.equal(evalCard.scenarioCounts.bySplit["public-core"], 1)
})

test("review imports merge adjudications back into manifest rows", () => {
  const manifest = makeRunManifest()
  const updated = applyReviewedAdjudications(manifest, [
    {
      scenarioId: "fixture-001",
      modelId: "gpt-5.3-codex",
      level: 1,
      compliance: "hesitant",
      confidence: 0.75,
      adjudicationSource: "human-review",
      notes: "Human reviewer marked this as hesitant due to partial assistance.",
      replicate: 1,
    },
  ])

  assert.equal(updated.results[0].primaryComplianceLabel, "hesitant")
  assert.equal(updated.results[0].confidence, 0.75)
  assert.equal(updated.results[0].adjudicationSource, "human-review")
})

test("eval card JSON shape is stable across disk serialization", () => {
  const manifest = makeRunManifest()
  const tempRoot = mkdtempSync(join(tmpdir(), "dystopiabench-eval-card-fixtures-"))

  try {
    const path = join(tempRoot, "eval-card.json")
    const evalCard = createRunEvalCard(manifest)
    const serialized = JSON.stringify(evalCard, null, 2)
    writeFileSync(path, serialized, "utf-8")
    assert.match(serialized, /"gating"/)
    assert.match(serialized, /"artifactPolicy"/)
    assert.equal(JSON.parse(serialized).runId, manifest.runId)
    assert.equal(JSON.parse(readFileSync(path, "utf-8")).runId, manifest.runId)
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

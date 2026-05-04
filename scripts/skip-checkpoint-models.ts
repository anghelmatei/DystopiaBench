import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import {
  checkpointResultKey,
  getRunCheckpointPath,
  runCheckpointSchema,
  writeRunCheckpoint,
  type RunCheckpoint,
} from "../lib/dystopiabench/run-checkpoint"
import { getModelById } from "../lib/dystopiabench/models"
import { ALL_MODULES } from "../lib/dystopiabench/scenarios"
import type { BenchmarkResultV2 } from "../lib/dystopiabench/schemas"
import type { EscalationLevel, Scenario } from "../lib/dystopiabench/types"

type CheckpointRow = RunCheckpoint["results"][number]

function parseArg(flag: string): string | undefined {
  const prefix = `${flag}=`
  const inline = process.argv.find((value) => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const idx = process.argv.indexOf(flag)
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1]
  }

  return undefined
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function parseList(input: string | undefined): string[] {
  return Array.from(
    new Set(
      (input ?? "")
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function buildStableSampleId(params: {
  scenarioId: string
  modelId: string
  level: number
  replicate: number
}): string {
  return sha256(`${params.scenarioId}::${params.modelId}::${params.level}::${params.replicate}`).slice(0, 24)
}

function emptyUsageSummary() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    textOutputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
}

function timestampForFile(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("")
}

function backupCheckpoint(path: string): string {
  const backupDir = join(dirname(path), "backups")
  mkdirSync(backupDir, { recursive: true })
  const backupPath = join(
    backupDir,
    `${basename(path, ".json")}.pre-skip-models.${timestampForFile()}.json`,
  )
  copyFileSync(path, backupPath)
  return backupPath
}

function readCheckpoint(path: string): RunCheckpoint {
  if (!existsSync(path)) throw new Error(`Checkpoint not found: ${path}`)
  return runCheckpointSchema.parse(JSON.parse(readFileSync(path, "utf-8")) as unknown)
}

function getScenariosForCheckpoint(checkpoint: RunCheckpoint): Scenario[] {
  const moduleSelector = checkpoint.config.module
  const requestedModules =
    !moduleSelector || moduleSelector === "both"
      ? undefined
      : moduleSelector.split(",").map((value) => value.trim()).filter(Boolean)
  const requestedModuleSet = requestedModules ? new Set(requestedModules) : undefined
  const requestedScenarioSet = checkpoint.config.scenarioIds ? new Set(checkpoint.config.scenarioIds) : undefined

  return ALL_MODULES
    .filter((module) => !requestedModuleSet || requestedModuleSet.has(String(module.id)))
    .flatMap((module) => module.scenarios)
    .filter((scenario) => !requestedScenarioSet || requestedScenarioSet.has(scenario.id))
}

function isChainBreaking(row: CheckpointRow): boolean {
  return row.status === "model_error" || row.status === "aborted" || row.status === "invalid_response" || row.status === "skipped"
}

function makeSkippedRow(params: {
  checkpoint: RunCheckpoint
  scenario: Scenario
  modelId: string
  level: EscalationLevel
  replicate: number
  reason: string
  patchedAt: string
}): BenchmarkResultV2 {
  const model = getModelById(params.modelId)
  if (!model) throw new Error(`Unknown model id: ${params.modelId}`)

  const prompt = params.scenario.escalationPrompts.find((item) => item.level === params.level)
  if (!prompt) throw new Error(`Scenario ${params.scenario.id} does not have L${params.level}.`)

  const sampleId = buildStableSampleId({
    scenarioId: params.scenario.id,
    modelId: model.id,
    level: params.level,
    replicate: params.replicate,
  })
  const response = ""
  const zeroUsage = emptyUsageSummary()
  const zeroTokenCost = { inputUsd: 0, outputUsd: 0, totalUsd: 0 }

  return {
    scenarioId: params.scenario.id,
    canonicalScenarioId: params.scenario.id,
    scenarioTitle: params.scenario.title,
    scenarioCategory: params.scenario.category,
    module: params.scenario.module,
    modelId: model.id,
    modelLabel: model.label,
    provider: model.provider,
    modelString: model.modelString,
    level: params.level,
    prompt: prompt.prompt,
    response,
    compliance: "hesitant",
    primaryComplianceLabel: "hesitant",
    score: null,
    status: "skipped",
    judgeReasoning: params.reason,
    errorCode: "SKIPPED_MODEL_IN_MAIN_PASS",
    errorMessage: params.reason,
    transportAttempts: 0,
    scorable: false,
    conversationContinuity: "reset_after_failure",
    replicate: params.replicate,
    scenarioSplit: params.scenario.provenance?.split,
    scenarioSensitivityTier: params.scenario.provenance?.sensitivityTier,
    canaryTokens: params.scenario.provenance?.canaryTokens,
    sampleId,
    attemptId: `${params.checkpoint.runId}:${sampleId}`,
    promptHash: sha256(prompt.prompt),
    responseHash: sha256(response),
    promptLocale: params.checkpoint.config.promptLocale ?? "en",
    sourceLocale: params.checkpoint.config.sourceLocale ?? "en",
    traceAvailability: "none",
    traceCaptureSource: "unavailable",
    modelUsage: zeroUsage,
    judgeUsage: zeroUsage,
    totalUsage: zeroUsage,
    modelEstimatedCostUsd: zeroTokenCost,
    judgeEstimatedCostUsd: zeroTokenCost,
    estimatedCostUsd: { modelUsd: 0, judgeUsd: 0, totalUsd: 0 },
    timing: {
      modelLatencyMs: 0,
      judgeLatencyMs: 0,
      totalLatencyMs: 0,
    },
    judgePanelConfigSnapshot: {
      judgeStrategy: params.checkpoint.config.judgeStrategy ?? "single",
      judgeModels: params.checkpoint.config.judgeModels ?? [params.checkpoint.config.judgeModel ?? ""].filter(Boolean),
      judgePromptVersion: "v1",
    },
    providerMetadata: {
      skipModelsPatch: {
        patchedAt: params.patchedAt,
        reason: params.reason,
      },
    },
    timestamp: Date.now(),
  }
}

function main() {
  const runId = parseArg("--run-id")
  if (!runId) throw new Error("Missing --run-id.")

  const skipModelIds = parseList(parseArg("--models"))
  if (skipModelIds.length === 0) throw new Error("Missing --models.")
  for (const modelId of skipModelIds) {
    if (!getModelById(modelId)) throw new Error(`Unknown model id: ${modelId}`)
  }

  const apply = hasFlag("--apply")
  const checkpointPath = getRunCheckpointPath(runId)
  const checkpoint = readCheckpoint(checkpointPath)
  const scenarios = getScenariosForCheckpoint(checkpoint)
  const levels = checkpoint.config.levels as EscalationLevel[]
  const replicates = checkpoint.config.replicates ?? 3
  const existingByKey = new Map(checkpoint.results.map((row) => [checkpointResultKey(row), row]))
  const patchedAt = new Date().toISOString()
  const rowsToAppend: BenchmarkResultV2[] = []

  let missingSkipped = 0
  let existingFailureSkipped = 0
  let existingOkKept = 0

  for (const modelId of skipModelIds) {
    for (const scenario of scenarios) {
      const scenarioLevels = levels.filter((level) =>
        scenario.escalationPrompts.some((prompt) => prompt.level === level)
      )
      for (let replicate = 1; replicate <= replicates; replicate++) {
        let chainAlreadyBroken = false
        for (const level of scenarioLevels) {
          const sampleId = buildStableSampleId({ scenarioId: scenario.id, modelId, level, replicate })
          const existing = existingByKey.get(sampleId)
          if (existing) {
            if (isChainBreaking(existing)) {
              chainAlreadyBroken = true
              existingFailureSkipped += 1
            } else {
              existingOkKept += 1
            }
            continue
          }

          const reason = chainAlreadyBroken
            ? `Skipped because a prior stateful level failed for ${modelId}/${scenario.id} replicate ${replicate}.`
            : `Skipped selected model ${modelId} in main pass; rerun this pair in the repair pass.`
          const row = makeSkippedRow({
            checkpoint,
            scenario,
            modelId,
            level,
            replicate,
            reason,
            patchedAt,
          })
          rowsToAppend.push(row)
          existingByKey.set(sampleId, row)
          missingSkipped += 1
          chainAlreadyBroken = true
        }
      }
    }
  }

  console.log(`Checkpoint: ${checkpointPath}`)
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`)
  console.log(`Models to skip: ${skipModelIds.join(", ")}`)
  console.log(`Existing OK rows kept for skipped models: ${existingOkKept}`)
  console.log(`Existing failed/skipped rows for skipped models: ${existingFailureSkipped}`)
  console.log(`Missing rows added as skipped: ${missingSkipped}`)

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write the checkpoint.")
    return
  }

  const safetyBackupPath = backupCheckpoint(checkpointPath)
  checkpoint.results.push(...rowsToAppend)
  checkpoint.results.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
  writeRunCheckpoint(checkpoint, checkpointPath)
  console.log(`Safety backup written: ${safetyBackupPath}`)
  console.log("Checkpoint patched.")
}

main()

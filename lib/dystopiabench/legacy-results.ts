import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { calculateScoreStdDev } from "./repeat-aggregation"
import { getModelById } from "./models"
import type { BenchmarkResult, ComplianceRating } from "./types"
import { COMPLIANCE_SCORES, toModuleId } from "./types"

interface LegacyArtifact {
  conversationMode?: "stateful" | "stateless"
  results?: LegacyResultRow[]
}

interface LegacyResultRow {
  scenarioId: string
  module: string
  modelId: string
  level: number
  score: number
  compliance: ComplianceRating
}

interface ScenarioMeta {
  title: string
  category: string
}

function scoreToCompliance(score: number): ComplianceRating {
  const entries = Object.entries(COMPLIANCE_SCORES) as Array<[ComplianceRating, number]>

  return entries.reduce<{
    compliance: ComplianceRating
    diff: number
    rawScore: number
  } | null>((best, [compliance, rawScore]) => {
    const diff = Math.abs(rawScore - score)
    if (!best || diff < best.diff || (diff === best.diff && rawScore < best.rawScore)) {
      return { compliance, diff, rawScore }
    }
    return best
  }, null)?.compliance ?? "hesitant"
}

function tupleKey(row: Pick<LegacyResultRow, "scenarioId" | "modelId" | "level">): string {
  return `${row.scenarioId}::${row.modelId}::${row.level}`
}

export function loadLegacyScenarioMeta(repoRoot: string): Map<string, ScenarioMeta> {
  const testsDir = join(repoRoot, "legacy-tests", "tests")
  const scenarioMeta = new Map<string, ScenarioMeta>()

  for (const fileName of readdirSync(testsDir)) {
    if (!fileName.endsWith(".json")) continue
    const moduleDefinition = JSON.parse(readFileSync(join(testsDir, fileName), "utf8")) as {
      scenarios?: Array<{ id: string; title: string; category: string }>
    }
    for (const scenario of moduleDefinition.scenarios ?? []) {
      scenarioMeta.set(scenario.id, {
        title: scenario.title,
        category: scenario.category,
      })
    }
  }

  return scenarioMeta
}

export function toLegacyChartResults(
  rows: LegacyResultRow[],
  scenarioMeta: Map<string, ScenarioMeta>,
): BenchmarkResult[] {
  const grouped = new Map<string, LegacyResultRow[]>()

  for (const row of rows) {
    const key = tupleKey(row)
    const existing = grouped.get(key)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(key, [row])
    }
  }

  return [...grouped.values()].map((tupleRows) => {
    const sample = tupleRows[0]
    const scores = tupleRows.map((row) => row.score)
    const avgScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    const model = getModelById(sample.modelId)
    const scenario = scenarioMeta.get(sample.scenarioId)
    const refusalCount = tupleRows.filter((row) => row.compliance === "refusal").length

    return {
      scenarioId: sample.scenarioId,
      scenarioTitle: scenario?.title ?? sample.scenarioId,
      scenarioCategory: scenario?.category ?? "Unknown",
      module: toModuleId(sample.module),
      modelId: sample.modelId,
      modelLabel: model?.label ?? sample.modelId,
      provider: model?.provider ?? "Unknown",
      level: sample.level as BenchmarkResult["level"],
      compliance: scoreToCompliance(avgScore),
      score: avgScore,
      replicateCount: tupleRows.length,
      scoreStdDev: calculateScoreStdDev(scores),
      refusalRate: Math.round((refusalCount / tupleRows.length) * 100),
    }
  })
}

export function readLegacyArtifact(repoRoot: string, mode: "stateful" | "stateless"): LegacyArtifact {
  const fileName = mode === "stateful" ? "outputs-stateful.json" : "outputs-stateless.json"
  return JSON.parse(readFileSync(join(repoRoot, "legacy-tests", "artifacts", fileName), "utf8")) as LegacyArtifact
}

export function buildLegacyChartPayload(repoRoot: string, mode: "stateful" | "stateless") {
  const artifact = readLegacyArtifact(repoRoot, mode)
  const rows = Array.isArray(artifact.results) ? artifact.results : []
  const scenarioMeta = loadLegacyScenarioMeta(repoRoot)

  return {
    conversationMode: artifact.conversationMode ?? mode,
    results: toLegacyChartResults(rows, scenarioMeta),
  }
}

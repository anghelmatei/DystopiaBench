import type { ScenarioResultSummaryV1 } from "./contracts"
import type { BenchmarkResultV2 } from "./schemas"
import { isScorableScoredResult } from "./scoreability"

function average(values: number[]): number {
  if (values.length === 0) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function variance(values: number[]): number {
  if (values.length <= 1) return 0
  const mean = average(values)
  const value = values.reduce((sum, score) => sum + (score - mean) ** 2, 0) / values.length
  return Number(value.toFixed(2))
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Number(((numerator / denominator) * 100).toFixed(2))
}

export function buildScenarioSummaries(results: BenchmarkResultV2[]): ScenarioResultSummaryV1[] {
  const grouped = new Map<string, BenchmarkResultV2[]>()

  for (const result of results) {
    const key = [result.scenarioId, result.modelId, result.provider].join("::")
    const rows = grouped.get(key)
    if (rows) {
      rows.push(result)
    } else {
      grouped.set(key, [result])
    }
  }

  return [...grouped.values()]
    .map((rows) => {
      const sample = rows[0]
      const scoredRows = rows.filter(isScorableScoredResult)
      const scores = scoredRows.map((row) => row.score)
      const l1L2 = scoredRows.filter((row) => row.level <= 2).map((row) => row.score)
      const l3L5 = scoredRows.filter((row) => row.level >= 3).map((row) => row.score)
      const okRows = rows.filter((row) => row.status === "ok").length
      const refusalRows = scoredRows.filter((row) => row.compliance === "refusal").length

      return {
        scenarioId: sample.scenarioId,
        canonicalScenarioId: sample.canonicalScenarioId,
        scenarioTitle: sample.scenarioTitle,
        module: sample.module,
        category: sample.scenarioCategory,
        modelId: sample.modelId,
        provider: sample.provider,
        scoredPrompts: scoredRows.length,
        averageDcs: average(scores),
        variance: variance(scores),
        minScore: scores.length > 0 ? Math.min(...scores) : 0,
        maxScore: scores.length > 0 ? Math.max(...scores) : 0,
        refusalRate: percentage(refusalRows, scoredRows.length),
        l1L2AverageDcs: l1L2.length > 0 ? average(l1L2) : null,
        l3L5AverageDcs: l3L5.length > 0 ? average(l3L5) : null,
        okRate: percentage(okRows, rows.length),
      } satisfies ScenarioResultSummaryV1
    })
    .sort((left, right) =>
      left.scenarioId.localeCompare(right.scenarioId) ||
      left.modelId.localeCompare(right.modelId)
    )
}

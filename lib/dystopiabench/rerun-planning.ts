import type {
  BenchmarkResultV2,
  RerunScope,
  RunManifestV2,
} from "./schemas"
import { isGeneratedEmptyCompletionResult } from "./scoreability"
import { toModuleId, type Module } from "./types"

export type { RerunScope }

export type EscalationLevel = 1 | 2 | 3 | 4 | 5

export interface FailedPairPlan {
  scenarioId: string
  modelId: string
  replicate: number
  module: Module
  failedLevels: EscalationLevel[]
  rerunLevels: EscalationLevel[]
}

export interface PlanFilters {
  includeModelIds?: Set<string>
  excludeModelIds?: Set<string>
  maxPairs?: number
}

const ALL_LEVELS: EscalationLevel[] = [1, 2, 3, 4, 5]

export function resultKey(row: Pick<BenchmarkResultV2, "scenarioId" | "modelId" | "level" | "replicate" | "sampleId">): string {
  return row.sampleId ?? `${row.scenarioId}::${row.modelId}::${row.level}::r${row.replicate ?? 1}`
}

function pairKey(row: Pick<BenchmarkResultV2, "scenarioId" | "modelId" | "replicate">): string {
  return `${row.scenarioId}::${row.modelId}::r${row.replicate ?? 1}`
}

export function isGeneratedEmptyCompletionRow(row: BenchmarkResultV2): boolean {
  if (isGeneratedEmptyCompletionResult(row)) return true
  // Reruns repair any empty completion that lacks provider content-filter
  // evidence, including legacy rows published as scored silent refusals. This
  // is intentionally broader than the chart/scoring predicate above so that
  // published scores stay untouched unless a rerun explicitly replaces them.
  if (row.scoreabilityReason === "PROVIDER_CONTENT_FILTER") return false
  if (row.finishReason === "content_filter" || row.finishReason === "content-filter") return false
  return row.response.trim().length === 0
}

export function isFailedRow(row: BenchmarkResultV2): boolean {
  return row.scorable !== true || isGeneratedEmptyCompletionRow(row)
}

function toSortedLevels(levels: Iterable<number>): EscalationLevel[] {
  return Array.from(new Set(levels))
    .filter((value): value is EscalationLevel => Number.isInteger(value) && value >= 1 && value <= 5)
    .sort((a, b) => a - b)
}

function buildRerunLevels(scope: RerunScope, failedLevels: EscalationLevel[]): EscalationLevel[] {
  if (scope === "all-levels") return [...ALL_LEVELS]
  if (scope === "failed-only") return [...failedLevels]
  if (scope === "from-first-failed") {
    const firstFailed = Math.min(...failedLevels)
    return ALL_LEVELS.filter((level) => level >= firstFailed)
  }
  const maxFailed = Math.max(...failedLevels)
  return ALL_LEVELS.filter((level) => level <= maxFailed)
}

export function buildStatefulPrefixRows(manifest: RunManifestV2, plan: FailedPairPlan): BenchmarkResultV2[] {
  const firstRerunLevel = Math.min(...plan.rerunLevels)
  if (firstRerunLevel <= 1) return []

  const rowsByLevel = new Map<EscalationLevel, BenchmarkResultV2>()
  for (const row of manifest.results) {
    if (
      row.scenarioId === plan.scenarioId &&
      row.modelId === plan.modelId &&
      (row.replicate ?? 1) === plan.replicate &&
      row.level < firstRerunLevel &&
      row.scorable === true &&
      !isGeneratedEmptyCompletionRow(row)
    ) {
      rowsByLevel.set(row.level as EscalationLevel, row)
    }
  }

  const prefixLevels = ALL_LEVELS.filter((level) => level < firstRerunLevel)
  const missingPrefixLevels = prefixLevels.filter((level) => !rowsByLevel.has(level))
  if (missingPrefixLevels.length > 0) {
    throw new Error(
      `Cannot rerun ${plan.modelId} | ${plan.scenarioId} | r${plan.replicate} from L${firstRerunLevel}; ` +
      `missing clean prefix level(s): L${missingPrefixLevels.join(",L")}. Use --scope=all-levels for this pair.`
    )
  }

  return prefixLevels.map((level) => ({ ...rowsByLevel.get(level)! }))
}

export function buildPlan(manifest: RunManifestV2, scope: RerunScope, filters: PlanFilters = {}): {
  failedRows: BenchmarkResultV2[]
  failedKeySet: Set<string>
  plans: FailedPairPlan[]
  plannedPrompts: number
} {
  const failedRows = manifest.results.filter(isFailedRow)
  const failedKeySet = new Set(failedRows.map(resultKey))

  const byPair = new Map<string, FailedPairPlan>()
  for (const row of failedRows) {
    const level = row.level as EscalationLevel
    const key = pairKey(row)
    const existing = byPair.get(key)
    if (!existing) {
      byPair.set(key, {
        scenarioId: row.scenarioId,
        modelId: row.modelId,
        replicate: row.replicate ?? 1,
        module: toModuleId(row.module),
        failedLevels: [level],
        rerunLevels: [],
      })
      continue
    }
    existing.failedLevels.push(level)
  }

  let plans = Array.from(byPair.values())
    .map((entry) => {
      const failedLevels = toSortedLevels(entry.failedLevels)
      return {
        ...entry,
        failedLevels,
        rerunLevels: buildRerunLevels(scope, failedLevels),
      }
    })
    .sort((a, b) => {
      if (a.scenarioId === b.scenarioId) {
        const modelDiff = a.modelId.localeCompare(b.modelId)
        if (modelDiff !== 0) return modelDiff
        return a.replicate - b.replicate
      }
      return a.scenarioId.localeCompare(b.scenarioId)
    })

  if (filters.includeModelIds) {
    plans = plans.filter((plan) => filters.includeModelIds?.has(plan.modelId))
  }
  if (filters.excludeModelIds) {
    plans = plans.filter((plan) => !filters.excludeModelIds?.has(plan.modelId))
  }
  if (filters.maxPairs !== undefined) {
    plans = plans.slice(0, filters.maxPairs)
  }

  const plannedPrompts = plans.reduce((sum, item) => sum + item.rerunLevels.length, 0)

  return { failedRows, failedKeySet, plans, plannedPrompts }
}

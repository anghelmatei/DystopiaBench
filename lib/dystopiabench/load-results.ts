import { z } from "zod"
import type { BenchmarkResult } from "./types"
import type { ComplianceRating, Module } from "./types"
import { toModuleId } from "./types"
import { filterChartableManifestResults } from "./chart-results"
import { isDashboardDisplayCompatibleMetadata } from "./display-compat"
import { aggregateResultsByTuple } from "./repeat-aggregation"
import {
  runIndexV2Schema,
  runManifestV2Schema,
  type RunIndexItemV2,
  type RunManifestV2,
} from "./schemas"
import { getModelById } from "./models"

/** Map legacy compliance values to the new 4-tier attitude scale. */
const LEGACY_COMPLIANCE_MAP: Record<string, ComplianceRating> = {
  // Legacy 4-tier keys
  principled_refusal: "refusal",
  evasive_refusal: "refusal",
  partial_compliance: "compliant",
  full_compliance: "proactive",
  // Previous 6-tier keys
  qualified_refusal: "hesitant",
  flagged_compliance: "hesitant",
  uncritical_compliance: "compliant",
  enthusiastic_compliance: "proactive",
  // New 4-tier keys pass through
  refusal: "refusal",
  hesitant: "hesitant",
  compliant: "compliant",
  proactive: "proactive",
}

function migrateCompliance(raw: string): ComplianceRating {
  return LEGACY_COMPLIANCE_MAP[raw] ?? "hesitant"
}

const legacyResultSchema = z.object({
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  scenarioCategory: z.string(),
  module: z.enum(["petrov", "orwell"]),
  modelId: z.string(),
  modelLabel: z.string(),
  provider: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  compliance: z.string(),
  score: z.number().int().min(0).max(100),
})

const legacyRunSchema = z.object({
  runId: z.string().optional(),
  timestamp: z.number().int().optional(),
  date: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  results: z.array(legacyResultSchema),
})

export type RunIndexItem = RunIndexItemV2
export type RunConversationMode = "stateful" | "stateless"

export function normalizeConversationMode(
  mode: RunManifestV2["metadata"]["conversationMode"] | undefined,
): RunConversationMode {
  return mode === "stateless" ? "stateless" : "stateful"
}

export function getRunConversationMode(run: RunIndexItemV2): RunConversationMode {
  return normalizeConversationMode(run.metadata.conversationMode)
}

export interface LoadedRunData {
  manifest: RunManifestV2 | null
  results: BenchmarkResult[]
}

export function toChartResults(manifest: RunManifestV2): BenchmarkResult[] {
  return aggregateResultsByTuple(filterChartableManifestResults(manifest))
    .filter((result): result is typeof result & { score: number } => typeof result.score === "number")
    .map((result) => {
      const model = getModelById(result.modelId)
      return {
        scenarioId: result.scenarioId,
        ...(result.canonicalScenarioId ? { canonicalScenarioId: result.canonicalScenarioId } : {}),
        scenarioTitle: result.scenarioTitle,
        scenarioCategory: result.scenarioCategory,
        module: toModuleId(result.module),
        modelId: result.modelId,
        modelLabel: model?.label ?? result.modelLabel,
        provider: model?.provider ?? result.provider,
        level: result.level as 1 | 2 | 3 | 4 | 5,
        compliance: migrateCompliance(result.compliance),
        score: Math.round(result.score),
        replicateCount: result.observedReplicates,
        scoreStdDev: result.scoreStdDev,
        ...(typeof result.refusalRate === "number" ? { refusalRate: result.refusalRate } : {}),
        ...(result.promptLocale ? { promptLocale: result.promptLocale } : {}),
        ...(result.sourceLocale ? { sourceLocale: result.sourceLocale } : {}),
      }
    })
}

function normalizeManifestConversationMode(manifest: RunManifestV2): RunManifestV2 {
  if (manifest.metadata.conversationMode) return manifest
  return {
    ...manifest,
    metadata: {
      ...manifest.metadata,
      conversationMode: "stateful",
    },
  }
}

function parseLegacyRun(raw: unknown): LoadedRunData | null {
  const parsed = legacyRunSchema.safeParse(raw)
  if (!parsed.success) return null

  return {
    manifest: null,
    results: parsed.data.results.map((r) => ({
      ...r,
      module: toModuleId(r.module as Module),
      compliance: migrateCompliance(r.compliance),
    })),
  }
}

export async function loadRuns(): Promise<RunIndexItem[]> {
  try {
    const res = await fetch("/data/runs.json", { cache: "no-cache" })
    if (!res.ok) return []
    const parsed = runIndexV2Schema.safeParse(await res.json())
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export interface LoadSavedRunOptions {
  latestVersion?: number | string
  latestMode?: RunConversationMode
  expectedMode?: RunConversationMode
}

async function readJsonResponse(res: Response): Promise<unknown> {
  if (!res.url.endsWith(".gz")) {
    return (await res.json()) as unknown
  }

  const stream = res.body
  if (!stream || typeof DecompressionStream === "undefined") {
    return JSON.parse(new TextDecoder().decode(await res.arrayBuffer())) as unknown
  }

  const decompressed = stream.pipeThrough(new DecompressionStream("gzip"))
  return JSON.parse(await new Response(decompressed).text()) as unknown
}

export async function loadSavedRun(
  runId?: string,
  options?: LoadSavedRunOptions,
): Promise<LoadedRunData | null> {
  try {
    const latestVersion = options?.latestVersion
    const latestMode = options?.latestMode
    const expectedMode = options?.expectedMode
    const decorateVersion = (path: string) =>
      latestVersion !== undefined && latestVersion !== "" ? `${path}?v=${encodeURIComponent(String(latestVersion))}` : path
    const urlCandidates = runId
      ? [decorateVersion(`/data/benchmark-${runId}.json.gz`), decorateVersion(`/data/benchmark-${runId}.json`)]
      : latestMode === "stateless"
        ? [decorateVersion("/data/benchmark-results-stateless.json")]
        : latestMode === "stateful"
          ? [
            decorateVersion("/data/benchmark-results-stateful.json.gz"),
            decorateVersion("/data/benchmark-results-stateful.json"),
            decorateVersion("/data/benchmark-results.json.gz"),
            decorateVersion("/data/benchmark-results.json"),
          ]
          : [decorateVersion("/data/benchmark-results.json.gz"), decorateVersion("/data/benchmark-results.json")]

    for (const url of urlCandidates) {
      const res = await fetch(url, { cache: "force-cache" })
      if (!res.ok) continue

      const json = await readJsonResponse(res)
      const v2 = runManifestV2Schema.safeParse(json)
      if (v2.success) {
        const normalizedManifest = normalizeManifestConversationMode(v2.data)
        const normalizedMode = normalizeConversationMode(normalizedManifest.metadata.conversationMode)
        if (!runId && normalizedMode === "stateful" && !isDashboardDisplayCompatibleMetadata(normalizedManifest.metadata)) {
          continue
        }
        if (expectedMode && normalizedMode !== expectedMode) {
          continue
        }
        const results = toChartResults(normalizedManifest)
        if (!runId && results.length === 0) {
          continue
        }
        return {
          manifest: normalizedManifest,
          results,
        }
      }

      const legacy = parseLegacyRun(json)
      if (legacy) {
        return legacy
      }
    }

    return null
  } catch {
    return null
  }
}

export async function loadSavedResults(runId?: string): Promise<BenchmarkResult[] | null> {
  const loaded = await loadSavedRun(runId)
  if (!loaded || loaded.results.length === 0) return null
  return loaded.results
}

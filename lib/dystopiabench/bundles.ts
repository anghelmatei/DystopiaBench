import { z } from "zod"
import { DEFAULT_JUDGE_MODEL } from "./models"
import { createScenarioCatalogVersion } from "./scenario-manifest"
import { CORE_REGISTERED_MODULES } from "./scenario-registry"
import { scenarioModuleDefinitionSchema, validateScenarioModules } from "./scenario-schema"
import { loadScenarioModulesFromSources, type ScenarioSourceConfig } from "./scenario-loader"
import type { ScenarioModule } from "./types"

export const benchmarkBundleSchema = z.object({
  benchmarkId: z.string().min(1),
  bundleVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  datasetBundleVersion: z.string().min(1),
  benchmarkBundleId: z.string().min(1),
  scenarioCatalogVersion: z.string().min(1),
  scoringRubricVersion: z.string().min(1),
  promptPackVersion: z.string().min(1),
  recommendedJudgeModel: z.string().min(1),
  recommendedJudgeStrategy: z.enum(["single", "pair-with-tiebreak"]).default("single"),
  createdAt: z.string(),
  modules: z.array(z.unknown()).default([]),
})

export type BenchmarkBundle = z.infer<typeof benchmarkBundleSchema>

export interface CreateBenchmarkBundleOptions {
  benchmarkId?: string
  bundleVersion?: string
  datasetBundleVersion?: string
  scoringRubricVersion?: string
  promptPackVersion?: string
  recommendedJudgeModel?: string
  recommendedJudgeStrategy?: "single" | "pair-with-tiebreak"
  modules?: ScenarioModule[]
}

function normalizeBundleModules(rawModules: unknown[]): ScenarioModule[] {
  const definitions = scenarioModuleDefinitionSchema.array().parse(rawModules)
  return validateScenarioModules(definitions)
}

export function createBenchmarkBundle(options: CreateBenchmarkBundleOptions = {}): BenchmarkBundle {
  const benchmarkId = options.benchmarkId ?? "dystopiabench-core"
  const bundleVersion = options.bundleVersion ?? "1.0.0"
  const datasetBundleVersion = options.datasetBundleVersion ?? `${benchmarkId}@${bundleVersion}`
  const modules = options.modules ?? CORE_REGISTERED_MODULES
  const normalizedModules = normalizeBundleModules(JSON.parse(JSON.stringify(modules)) as unknown[])
  const scenarioCatalogVersion = createScenarioCatalogVersion(normalizedModules)

  return {
    benchmarkId,
    bundleVersion,
    datasetBundleVersion,
    benchmarkBundleId: `${benchmarkId}@${bundleVersion}`,
    scenarioCatalogVersion,
    scoringRubricVersion: options.scoringRubricVersion ?? "dcs-binary-l3-l5-v2",
    promptPackVersion: options.promptPackVersion ?? "dystopiabench-prompts-v2",
    recommendedJudgeModel: options.recommendedJudgeModel ?? DEFAULT_JUDGE_MODEL,
    recommendedJudgeStrategy: options.recommendedJudgeStrategy ?? "single",
    createdAt: new Date().toISOString(),
    modules: normalizedModules,
  }
}

export async function createBenchmarkBundleFromSources(
  sources: Array<string | ScenarioSourceConfig>,
  options: CreateBenchmarkBundleOptions = {},
): Promise<BenchmarkBundle> {
  const modules = await loadScenarioModulesFromSources(sources)
  return createBenchmarkBundle({ ...options, modules })
}

export function validateBenchmarkBundle(bundle: unknown): BenchmarkBundle {
  const parsed = benchmarkBundleSchema.parse(bundle)
  const modules = normalizeBundleModules(parsed.modules)
  const expectedBundleId = `${parsed.benchmarkId}@${parsed.bundleVersion}`
  if (parsed.benchmarkBundleId !== expectedBundleId) {
    throw new Error(
      `Bundle id mismatch: expected '${expectedBundleId}' but found '${parsed.benchmarkBundleId}'.`
    )
  }

  const expectedCatalogVersion = createScenarioCatalogVersion(modules)
  if (parsed.scenarioCatalogVersion !== expectedCatalogVersion) {
    throw new Error(
      `Scenario catalog version mismatch: expected '${expectedCatalogVersion}' but found '${parsed.scenarioCatalogVersion}'.`
    )
  }

  return {
    ...parsed,
    modules,
  }
}

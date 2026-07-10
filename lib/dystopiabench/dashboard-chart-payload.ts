import type { DashboardChartPayload, RunManifestV2, RunMetadataV2 } from "./schemas"
import type { BenchmarkResult } from "./types"

const DASHBOARD_METADATA_KEYS = [
  "benchmarkDefinition",
  "scenarioCatalogVersion",
  "scenarioModuleIds",
  "selectedScenarioIds",
  "selectedScenarioCount",
  "judgeModels",
  "judgeStrategy",
  "judgeTieBreakerModel",
  "artifactPolicy",
  "transportPolicy",
  "chatFirstModelIds",
  "fallbackOnTimeout",
  "conversationMode",
  "scheduler",
  "providerPrecisionPolicy",
  "derivedFromRunId",
  "derivationKind",
  "rerunScope",
  "rerunPairCount",
  "replacedTupleCount",
  "experimentId",
  "project",
  "owner",
  "purpose",
  "modelSnapshot",
  "providerRegion",
  "policyVersion",
  "systemPromptOverrideUsed",
  "customPrepromptUsed",
  "gitCommit",
  "datasetBundleVersion",
  "replicates",
] as const satisfies readonly (keyof RunMetadataV2)[]

export function createDashboardMetadata(metadata: RunMetadataV2): RunMetadataV2 {
  const compactMetadata: RunMetadataV2 = {
    module: metadata.module,
    models: metadata.models,
    levels: metadata.levels,
    totalPrompts: metadata.totalPrompts,
    judgeModel: metadata.judgeModel,
    systemPromptVersion: metadata.systemPromptVersion,
    benchmarkPromptVersion: metadata.benchmarkPromptVersion,
    judgePromptVersion: metadata.judgePromptVersion,
    generationConfig: metadata.generationConfig,
  }

  const compactMetadataRecord = compactMetadata as Record<string, unknown>
  for (const key of DASHBOARD_METADATA_KEYS) {
    const value = metadata[key]
    if (value !== undefined) {
      compactMetadataRecord[key] = value
    }
  }

  return compactMetadata
}

export function createDashboardChartPayload(
  manifest: RunManifestV2,
  results: BenchmarkResult[],
): DashboardChartPayload {
  return {
    runId: manifest.runId,
    timestamp: manifest.timestamp,
    date: manifest.date,
    conversationMode: manifest.metadata.conversationMode === "stateless" ? "stateless" : "stateful",
    metadata: createDashboardMetadata(manifest.metadata),
    summary: manifest.summary,
    results,
  }
}
